-- Phase 4 backfill + concurrent-index/validate for migration 0030_add_sensors_table.
-- Run via PLAIN psql (NOT single-transaction) AFTER alembic applies 0030:
--
--   ssh -i ~/docean root@67.205.171.93 \
--     "sudo -u postgres psql -d meter_monitor -v ON_ERROR_STOP=1 -f -" < backfill_0030_sensors.sql
--
-- Idempotent & re-runnable: sensors upserted ON CONFLICT DO NOTHING; sensor_id set only
-- WHERE NULL; VALIDATE/CREATE INDEX guarded. Do NOT wrap in a transaction (CREATE INDEX
-- CONCURRENTLY forbids it; psql autocommits each statement by default).
--
-- Air routing MUST match ingest (_resolve_sensor_id) EXACTLY: only a base-utility 'soil'
-- row with air present and no live humidity (0/NULL) becomes an 'air' sensor.
-- NOTE: this script does NOT touch devices.device_role (that column is OTA firmware
-- targeting; bridge/direct classification is deferred to a dedicated column later).

-- 1) One Sensor per (sensor_uid, effective_utility). sensor_uid = coalesce(source_id, device_id).
--    LEFT JOIN devices so an orphan reading (device_id missing from devices) still yields a sensor.
INSERT INTO sensors (sensor_uid, utility_type, sensor_type, transport_device_id,
                     is_bridged, building_id, point_id, is_test,
                     first_seen, last_seen, created_at, updated_at)
SELECT
    uid,
    util,
    (array_agg(sensor_type ORDER BY ts DESC) FILTER (WHERE sensor_type IS NOT NULL))[1],
    (array_agg(device_id  ORDER BY ts DESC))[1]                                        AS transport_device_id,
    bool_or(source_id IS NOT NULL)                                                     AS is_bridged,
    (array_agg(building_id ORDER BY ts DESC) FILTER (WHERE building_id IS NOT NULL))[1],
    (array_agg(point_id    ORDER BY ts DESC) FILTER (WHERE point_id IS NOT NULL))[1],
    bool_or(is_test_device)                                                            AS is_test,
    MIN(ts), MAX(ts),
    extract(epoch FROM now())::bigint, extract(epoch FROM now())::bigint
FROM (
    SELECT r.device_id, r.source_id, r.sensor_type, r.building_id, r.point_id, r.ts,
           coalesce(r.source_id, r.device_id) AS uid,
           CASE WHEN r.utility_type = 'soil' AND r.air_quality IS NOT NULL AND coalesce(r.humidity, 0) = 0
                THEN 'air' ELSE r.utility_type END AS util,
           coalesce(d.is_test_device, false) AS is_test_device
    FROM readings r
    LEFT JOIN devices d ON d.id = r.device_id
) x
GROUP BY uid, util
ON CONFLICT (sensor_uid, utility_type) DO NOTHING;

-- 2) Point every existing reading at exactly one sensor (only untouched rows). Same air CASE.
UPDATE readings r
SET sensor_id = s.id
FROM sensors s
WHERE r.sensor_id IS NULL
  AND s.sensor_uid = coalesce(r.source_id, r.device_id)
  AND s.utility_type = CASE WHEN r.utility_type = 'soil' AND r.air_quality IS NOT NULL AND coalesce(r.humidity, 0) = 0
                            THEN 'air' ELSE r.utility_type END;

-- 3) Hourly stats (keyed by device_id, no source_id) — best-effort match for direct sensors.
--    Bridged-leaf hourly rows stay NULL (the live sparkline no longer depends on this table).
UPDATE hourly_utility_stats h
SET sensor_id = s.id
FROM sensors s
WHERE h.sensor_id IS NULL
  AND s.sensor_uid = h.device_id
  AND s.utility_type = h.utility_type;

-- 4) Now that backfill is done, VALIDATE the readings FK (weak ShareUpdateExclusive lock,
--    does not block writes) and build the sensor_id indexes CONCURRENTLY. Drop any INVALID
--    leftover of the same name first so a prior failed CONCURRENTLY build heals instead of
--    being silently skipped by IF NOT EXISTS.
ALTER TABLE readings VALIDATE CONSTRAINT fk_readings_sensor;

DROP INDEX CONCURRENTLY IF EXISTS idx_readings_sensor_ts;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_readings_sensor_ts ON readings (sensor_id, ts);

DROP INDEX CONCURRENTLY IF EXISTS idx_hourly_stats_sensor_bucket;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_hourly_stats_sensor_bucket ON hourly_utility_stats (sensor_id, bucket_ts);

-- Verify:
--   SELECT count(*) FROM readings WHERE sensor_id IS NULL;   -- expect ~0 (only rows arriving mid-run)
--   SELECT sensor_uid, utility_type, is_bridged, transport_device_id FROM sensors ORDER BY 1,2;
--   SELECT indexrelid::regclass, indisvalid FROM pg_index
--     WHERE indexrelid::regclass::text IN ('idx_readings_sensor_ts','idx_hourly_stats_sensor_bucket');
