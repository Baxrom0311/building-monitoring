"""Add first-class `sensors` table + nullable sensor_id FK on readings & hourly stats.

Phase 3 (EXPAND, additive). A bridge Device forwards several RS-485 leaf sensors, each
with its own source_id (MAC) and one utility_type. This introduces a first-class Sensor
keyed by UNIQUE(sensor_uid, utility_type) where sensor_uid = coalesce(source_id, device_id).
The MQ135 board becomes its own 'air' sensor. Reading & HourlyUtilityStats gain a nullable
sensor_id FK.

SAFETY (reviewed): this revision is FULLY TRANSACTIONAL and only metadata-only DDL —
nullable no-default columns (no table rewrite) and the readings FK is added NOT VALID (no
scan). A short lock_timeout makes any blocked DDL fail fast instead of stalling live ingest,
and because everything is one transaction a failure rolls back cleanly and the revision is
re-runnable. The two slow/lock-sensitive steps that CANNOT run inside a transaction —
CREATE INDEX CONCURRENTLY on sensor_id and VALIDATE CONSTRAINT — are deliberately NOT here;
they run via plain psql in scripts/backfill_0030_sensors.sql (avoids the asyncpg autocommit
pitfall and keeps this revision atomic). Backfill of sensor rows/sensor_id is in that script.

Revision ID: 0030_add_sensors_table
Revises: 0029_hourly_heating_temps
Create Date: 2026-08-12
"""

from alembic import op
import sqlalchemy as sa


revision = "0030_add_sensors_table"
down_revision = "0029_hourly_heating_temps"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Bloklangan DDL cheksiz kutib jonli ingest'ni to'xtatmasin — tez yiqilsin, keyin qayta.
    op.execute("SET lock_timeout = '4s'")

    op.create_table(
        "sensors",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("sensor_uid", sa.String(length=128), nullable=False),
        sa.Column("utility_type", sa.String(length=32), nullable=False),
        sa.Column("sensor_type", sa.String(length=64), nullable=True),
        sa.Column("transport_device_id", sa.String(length=128), nullable=False),
        sa.Column("is_bridged", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("building_id", sa.Integer(), nullable=True),
        sa.Column("point_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=True),
        sa.Column("meter_serial", sa.String(length=128), nullable=True),
        sa.Column("calibration_offset", sa.Float(), nullable=True),
        sa.Column("calibration_scale", sa.Float(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_test", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("first_seen", sa.Integer(), nullable=True),
        sa.Column("last_seen", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.Integer(), nullable=True),
        sa.Column("updated_at", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["transport_device_id"], ["devices.id"]),
        sa.ForeignKeyConstraint(["building_id"], ["buildings.id"]),
        sa.ForeignKeyConstraint(["point_id"], ["measurement_points.id"]),
        sa.UniqueConstraint("sensor_uid", "utility_type", name="uq_sensor_uid_utility"),
    )
    op.create_index("idx_sensors_transport_active", "sensors", ["transport_device_id", "is_active"])
    op.create_index("idx_sensors_building_utility_active", "sensors", ["building_id", "utility_type", "is_active"])
    op.create_index("idx_sensors_uid", "sensors", ["sensor_uid"])

    # Nullable, no-default FK columns — metadata-only on Postgres (no table rewrite).
    op.add_column("readings", sa.Column("sensor_id", sa.Integer(), nullable=True))
    op.add_column("hourly_utility_stats", sa.Column("sensor_id", sa.Integer(), nullable=True))

    # readings FK: NOT VALID = instant, no scan. VALIDATE happens later in the psql script.
    op.execute(
        "ALTER TABLE readings ADD CONSTRAINT fk_readings_sensor "
        "FOREIGN KEY (sensor_id) REFERENCES sensors(id) NOT VALID"
    )
    # hourly is tiny (~700 rows) -> validate inline is trivial.
    op.create_foreign_key("fk_hourly_sensor", "hourly_utility_stats", "sensors", ["sensor_id"], ["id"])
    # sensor_id indexlari CONCURRENTLY — bu revisionда EMAS (tranzaksiya ichida ishlamaydi),
    # scripts/backfill_0030_sensors.sql da psql orqali quriladi.


def downgrade() -> None:
    op.execute("SET lock_timeout = '4s'")
    # Ustunlarni tashlash ular ustidagi indekslarni (psql qurgan) avtomatik tashlaydi.
    op.execute("ALTER TABLE hourly_utility_stats DROP CONSTRAINT IF EXISTS fk_hourly_sensor")
    op.execute("ALTER TABLE hourly_utility_stats DROP COLUMN IF EXISTS sensor_id")
    op.execute("ALTER TABLE readings DROP CONSTRAINT IF EXISTS fk_readings_sensor")
    op.execute("ALTER TABLE readings DROP COLUMN IF EXISTS sensor_id")
    op.drop_table("sensors")
