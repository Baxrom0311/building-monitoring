import json
import logging
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import SessionLocal
from core.time import now_ts
from models.entities import Device, Reading, Sensor
from models.schemas import MeterReading, MeterReadingBatch
from repositories.base import model_to_dict
from repositories.buildings import MeasurementPointRepository
from repositories.devices import CommandRepository, DeviceRepository
from repositories.readings import ReadingRepository
from services import alerts as alert_service
from services.devices import is_test_meter_serial, mark_test_device
from services.websocket import ws_manager

logger = logging.getLogger("readings")


def _validate_range(name: str, value: float | None, minimum: float | None = None, maximum: float | None = None) -> None:
    if value is None:
        return
    if minimum is not None and value < minimum:
        raise HTTPException(422, f"{name} minimal qiymatdan kichik: {value}")
    if maximum is not None and value > maximum:
        raise HTTPException(422, f"{name} maksimal qiymatdan katta: {value}")


def _validate_reading(body: MeterReading) -> None:
    if not body.device_id.strip():
        raise HTTPException(422, "device_id kerak")

    for name in ("voltage_l1", "voltage_l2", "voltage_l3"):
        _validate_range(name, getattr(body, name), 0, settings.max_voltage)
    for name in ("current_l1", "current_l2", "current_l3"):
        _validate_range(name, getattr(body, name), 0, settings.max_current)
    _validate_range("frequency", body.frequency, 0, 60)
    _validate_range("pf", body.pf, -1, 1)
    for name in ("energy_kwh", "energy_t1", "energy_t2", "energy_t3", "energy_t4"):
        _validate_range(name, getattr(body, name), 0, None)
    for name in ("pressure_bar", "pressure_bottom_bar", "pressure_top_bar"):
        _validate_range(name, getattr(body, name), 0, settings.max_pressure_bar)
    for name in ("flow_rate", "volume_m3"):
        _validate_range(name, getattr(body, name), 0, None)
    _validate_range("temperature_c", body.temperature_c, settings.min_temperature_c, settings.max_temperature_c)
    _validate_range("humidity", body.humidity, 0, 100)
    _validate_range("level", body.level, 0, 100)


def _clamp_air(v: float | None) -> float | None:
    """Havo sifati (MQ135) — 0..100 oralig'iga qisamiz.

    Reject emas, clamp: chegaradan chiqqan bitta xato qiymat butun reading'ni
    tushirmasligi kerak. Xom semantika (firmware yuborgan qiymat) saqlanadi —
    inversiya/normalizatsiya displey qatlamida (tarixiy ma'lumot bilan mos)."""
    if v is None:
        return None
    try:
        return max(0.0, min(100.0, float(v)))
    except (TypeError, ValueError):
        return None


def _effective_reading_ts(body: MeterReading, server_ts: int) -> int:
    """Firmware NTP timestamp (ISO-8601 yoki epoch) — offline buferdan kelgan
    readinglar to'g'ri vaqt bilan saqlanadi. Noto'g'ri/uzoq qiymatda server vaqti."""
    raw = body.timestamp
    if raw is None:
        return server_ts
    try:
        if isinstance(raw, (int, float)):
            ts = int(raw)
        else:
            ts = int(datetime.fromisoformat(str(raw).replace("Z", "+00:00")).timestamp())
    except (ValueError, OSError):
        return server_ts
    # 30 kun o'tmish .. 5 daqiqa kelajak oralig'ida bo'lsa ishonamiz
    if server_ts - 30 * 86400 <= ts <= server_ts + 300:
        return ts
    return server_ts


async def _resolve_sensor_id(session: AsyncSession, body: MeterReading, device: Device, ts: int) -> int | None:
    """Reading uchun birinchi-darajali Sensor'ni topadi/yaratadi (best-effort upsert).

    sensor_uid = source_id (leaf MAC) yoki device_id. MQ135-only soil (namlik 0/None
    + havo bor) ALOHIDA 'air' sensor bo'ladi (soil ichida yashiringan emas).
    Xatolik bo'lsa None qaytaradi va reading yozilishi HECH QACHON to'xtamaydi —
    registry nosozligi ma'lumot yo'qotmasligi kerak."""
    try:
        sensor_uid = (body.source_id or body.device_id or "").strip()
        if not sensor_uid:
            return None
        sensor_utility = body.utility_type or "electricity"
        if (
            sensor_utility == "soil"
            and (body.air_quality is not None or body.air_pct is not None)
            and (body.humidity is None or body.humidity == 0)
        ):
            sensor_utility = "air"
        is_bridged = bool(body.source_id)
        building_id = None if device.is_test_device else (body.building_id or device.building_id)
        point_id = None if device.is_test_device else (body.point_id or device.point_id)
        stmt = pg_insert(Sensor).values(
            sensor_uid=sensor_uid,
            utility_type=sensor_utility,
            sensor_type=body.sensor_type,
            transport_device_id=device.id,
            is_bridged=is_bridged,
            building_id=building_id,
            point_id=point_id,
            is_test=device.is_test_device,
            first_seen=ts,
            last_seen=ts,
            created_at=ts,
            updated_at=ts,
        )
        stmt = stmt.on_conflict_do_update(
            constraint="uq_sensor_uid_utility",
            set_={
                # building_id/point_id faqat INSERT'da o'rnatiladi — keyin ustidan
                # yozilmaydi (qo'lda biriktirilgan bino saqlansin). Faqat transport
                # va last_seen yangilanadi; sensor_type bo'sh bo'lsa to'ldiriladi.
                "transport_device_id": device.id,
                "is_bridged": is_bridged,
                "last_seen": ts,
                "updated_at": ts,
                "sensor_type": func.coalesce(Sensor.sensor_type, stmt.excluded.sensor_type),
            },
        ).returning(Sensor.id)
        # SAVEPOINT ichida — upsert DB xatosi (deadlock, lock_timeout, FK) tashqi
        # tranzaksiyani "aborted" holatiga tushirmasin; aks holda reading INSERT ham
        # yiqilib, o'qish YO'QOLARDI. begin_nested faqat savepoint'ni qaytaradi.
        async with session.begin_nested():
            res = await session.execute(stmt)
            row = res.first()
        return int(row[0]) if row and row[0] is not None else None
    except Exception as exc:  # noqa: BLE001 — registry nosozligi reading'ni to'xtatmasin
        logger.warning("sensor resolve failed for %s/%s: %s", body.device_id, body.source_id, exc)
        return None


async def _save_reading_internal(session: AsyncSession, body: MeterReading, ts: int, test_mode: bool = False) -> list[dict]:
    """Bitta session ichida reading saqlash. Alert broadcastlarni qaytaradi."""
    if body.reading_id:
        if await ReadingRepository(session).exists_external_id(body.device_id, body.reading_id):
            return []

    device_repo = DeviceRepository(session)
    device = await device_repo.get(body.device_id)
    requested_test_mode = test_mode or bool(body.is_test_device) or is_test_meter_serial(body.meter_serial)
    if not device:
        device = Device(
            id=body.device_id,
            name=body.device_id,
            utility_type=body.utility_type or "electricity",
            registered=ts,
            created_at=ts,
        )
        device_repo.add(device)
    elif requested_test_mode and not device.is_test_device:
        raise HTTPException(403, "Test rejim production qurilma uchun ishlatilmaydi")

    device.last_seen = ts
    # Device.utility_type FAQAT qurilma birinchi yaratilganда o'rnatiladi (yuqorida).
    # Mavjud qurilmada har o'qishda ustidan YOZMAYMIZ — aks holda ko'p-utility
    # bridge (bitta ESP bir necha leaf'ni uzatadi) yorlig'i oxirgi leaf turiga
    # qarab sakrardi ("Yerto'la namligi" <-> "Elektr"). Identifikator endi barqaror.
    # Downstream (Reading, alert rule matching) uchun body qiymatini hal qilamiz:
    body.utility_type = body.utility_type or device.utility_type or "electricity"
    device.software_version = body.software_version or body.fw_version or device.software_version
    device.hardware_version = body.hardware_version or device.hardware_version
    device.fw_version = body.fw_version or device.fw_version
    if body.meter_serial:
        if device.meter_serial and body.meter_serial != device.meter_serial:
            from services import audit as audit_service
            await audit_service.record(
                {"sub": 0, "username": f"device:{body.device_id}"},
                "device.meter_serial_changed",
                "device",
                body.device_id,
                {"old_serial": device.meter_serial, "new_serial": body.meter_serial, "reason": "reading"}
            )
            device.previous_meter_serial = device.meter_serial
            device.meter_changed_at = ts
            device.needs_rebind = True
            device.building_id = None
            device.point_id = None
            await CommandRepository(session).cancel_active_for_device(body.device_id, "meter_serial_changed")
        device.meter_serial = body.meter_serial
        if requested_test_mode:
            mark_test_device(device, ts)
    elif requested_test_mode:
        mark_test_device(device, ts)
    if not device.is_test_device:
        device.building_id = body.building_id or device.building_id
        device.point_id = body.point_id or device.point_id
        # Qurilma serverda binoga biriktirilgan bo'lsa, alert rule matching va
        # Alert.building_id ham shu qiymatni ishlatsin (ESP32 building_id yubormaydi)
        body.building_id = body.building_id or device.building_id
        body.point_id = body.point_id or device.point_id
    device.updated_at = ts

    await alert_service.clear_offline_alerts_for_device(session, body.device_id)

    # Birinchi-darajali Sensor'ni hal qilamiz (dual-write) — best-effort, reading'ni bloklamaydi.
    sensor_id = await _resolve_sensor_id(session, body, device, ts)

    reading = Reading(
        device_id=body.device_id,
        reading_id=body.reading_id,
        sequence_no=body.sequence_no,
        sensor_id=sensor_id,
        building_id=None if device.is_test_device else body.building_id,
        point_id=None if device.is_test_device else body.point_id,
        utility_type=body.utility_type,
        source_id=body.source_id,
        sensor_type=body.sensor_type,
        meter_serial=body.meter_serial,
        ts=_effective_reading_ts(body, ts),
        voltage_l1=body.voltage_l1,
        voltage_l2=body.voltage_l2,
        voltage_l3=body.voltage_l3,
        current_l1=body.current_l1,
        current_l2=body.current_l2,
        current_l3=body.current_l3,
        power_w=body.power_w,
        power_var=body.power_var,
        frequency=body.frequency,
        pf=body.pf,
        energy_kwh=body.energy_kwh,
        energy_t1=body.energy_t1,
        energy_t2=body.energy_t2,
        energy_t3=body.energy_t3,
        energy_t4=body.energy_t4,
        relay_on=body.relay_on,
        pressure_bar=body.pressure_bar,
        pressure_bottom_bar=body.pressure_bottom_bar,
        pressure_top_bar=body.pressure_top_bar,
        flow_rate=body.flow_rate,
        volume_m3=body.volume_m3,
        temperature_c=body.temperature_c,
        temperature_in_c=body.temperature_in_c,
        temperature_out_c=body.temperature_out_c,
        # O'lik namlik zondi (havoda/uzilgan) aniq 0.0 qaytaradi. Agar shu qatorda
        # havo sifati (MQ135) bo'lsa, bu MQ135-only plata — namlikni NULL saqlaymiz
        # (0 soil o'rtachasini ifloslamasin, "latest" ni o'g'irlamasin).
        humidity=(
            None
            if (body.humidity == 0 and (body.air_quality is not None or body.air_pct is not None))
            else body.humidity
        ),
        air_quality=_clamp_air(body.air_quality if body.air_quality is not None else body.air_pct),
        level=body.level,
        raw_payload=json.dumps(body.model_dump(), ensure_ascii=False, default=str),
        created_at=ts,
    )
    ReadingRepository(session).add(reading)
    if device.is_test_device:
        return []
    return await alert_service.check_alerts(session, body)


async def save_reading(body: MeterReading, test_mode: bool = False) -> int:
    _validate_reading(body)
    ts = now_ts()
    async with SessionLocal() as session:
        alert_broadcasts = await _save_reading_internal(session, body, ts, test_mode)
        try:
            await session.commit()
        except IntegrityError:
            # Parallel kelgan bir xil reading_id — idempotent skip (500 emas)
            await session.rollback()
            return ts
    for msg in alert_broadcasts:
        await ws_manager.broadcast(msg)
    return ts


async def save_reading_batch(body: MeterReadingBatch, test_mode: bool = False) -> dict:
    if not body.readings:
        raise HTTPException(422, "readings bo'sh bo'lmasin")
    expected_device_id = body.device_id or body.readings[0].device_id
    if not expected_device_id:
        raise HTTPException(422, "device_id kerak")
    mismatched = [
        index
        for index, reading in enumerate(body.readings)
        if reading.device_id != expected_device_id
    ]
    if mismatched:
        raise HTTPException(403, "Batch ichida boshqa device_id bor")

    accepted = 0
    skipped = 0
    errors: list[dict] = []
    all_alert_broadcasts: list[dict] = []
    ts = now_ts()

    # Bitta session ichida barcha readinglarni saqlash.
    # Har bir reading SAVEPOINT ichida — bitta xato reading butun batchni
    # (PendingRollbackError bilan) yiqitmasligi uchun.
    async with SessionLocal() as session:
        for index, reading in enumerate(body.readings):
            try:
                _validate_reading(reading)
                if reading.reading_id:
                    if await ReadingRepository(session).exists_external_id(reading.device_id, reading.reading_id):
                        skipped += 1
                        continue
                async with session.begin_nested():
                    broadcasts = await _save_reading_internal(session, reading, ts, test_mode)
                all_alert_broadcasts.extend(broadcasts)
                accepted += 1
            except HTTPException as exc:
                errors.append({"index": index, "error": exc.detail})
            except IntegrityError:
                skipped += 1
            except Exception as exc:
                errors.append({"index": index, "error": str(exc)})
        try:
            await session.commit()
        except IntegrityError:
            await session.rollback()
            errors.append({"index": -1, "error": "duplicate reading (race)"})
            accepted = 0
            all_alert_broadcasts.clear()

    # Alert broadcastlarni session tashqarisida yuborish
    for msg in all_alert_broadcasts:
        await ws_manager.broadcast(msg)

    return {
        "ok": not errors,
        "accepted": accepted,
        "skipped": skipped,
        "errors": errors,
        "last_ts": ts if accepted else None,
    }


async def latest_reading(device_id: str) -> dict:
    async with SessionLocal() as session:
        row = await ReadingRepository(session).latest_for_device(device_id)
    if not row:
        raise HTTPException(404, "Ma'lumot yo'q")
    return model_to_dict(row)


async def device_sensors(device_id: str) -> dict:
    """Qurilma ichidagi sensorlar (RS-485 bridge ostidagi leaf'lar) — har biri
    uchun oxirgi o'qish. Oddiy bitta-sensorli qurilmada bitta yozuv qaytadi."""
    async with SessionLocal() as session:
        rows = await ReadingRepository(session).latest_per_sensor(device_id)
    sensors = [
        {
            "source_id": r.source_id,
            "utility_type": r.utility_type,
            "sensor_type": r.sensor_type,
            "last_reading": model_to_dict(r),
            "ts": r.ts,
        }
        for r in rows
    ]
    return {"device_id": device_id, "sensors": sensors}


async def reading_history(
    device_id: str, page: int, limit: int, hours: int | None, utility_type: str | None = None
) -> dict:
    offset = (page - 1) * limit
    cutoff = now_ts() - hours * 3600 if hours else None
    async with SessionLocal() as session:
        repo = ReadingRepository(session)
        total = await repo.count_history(device_id, cutoff, utility_type=utility_type)
        rows = await repo.history(device_id, offset, limit, cutoff, utility_type=utility_type)
    return {"readings": [model_to_dict(row) for row in rows], "total": total, "page": page, "pages": (total + limit - 1) // limit}


async def building_latest_readings(building_id: int, utility_type: str | None = None) -> dict:
    async with SessionLocal() as session:
        points = await MeasurementPointRepository(session).list_for_building(building_id, utility_type)
        point_ids = [p.id for p in points]
        readings_by_point = await ReadingRepository(session).latest_by_point_ids(point_ids)

        result = []
        for point in points:
            row = model_to_dict(point)
            reading = readings_by_point.get(point.id)
            row["latest_reading"] = model_to_dict(reading) if reading else None
            result.append(row)
    return {"building_id": building_id, "points": result}


async def building_reading_history(
    building_id: int,
    utility_type: str | None,
    page: int,
    limit: int,
    hours: int | None,
) -> dict:
    offset = (page - 1) * limit
    cutoff = now_ts() - hours * 3600 if hours else None
    async with SessionLocal() as session:
        repo = ReadingRepository(session)
        total = await repo.count_building_history(building_id, utility_type, cutoff)
        rows = await repo.building_history(building_id, offset, limit, utility_type, cutoff)
    return {
        "building_id": building_id,
        "readings": [model_to_dict(row) for row in rows],
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit,
    }
