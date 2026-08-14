from sqlalchemy import and_, desc, func, select
from sqlalchemy.orm import aliased

from models.entities import Device, Reading, Sensor
from repositories.base import BaseRepository


class ReadingRepository(BaseRepository[Reading]):
    model = Reading

    async def sensors_with_latest(self, device_id: str) -> list[tuple[Sensor, Reading | None]]:
        """Qurilma (bridge yoki o'zi) uzatayotgan barcha sensorlar + har birining
        oxirgi o'qishi. sensors jadvalidan o'qiydi — shu bilan MQ135 'air' sensori
        soil'dan alohida to'g'ri ko'rinadi (birinchi-darajali sensor modeli)."""
        sensors = list(
            (
                await self.session.scalars(
                    select(Sensor)
                    .where(Sensor.transport_device_id == device_id, Sensor.is_active.is_(True))
                    .order_by(Sensor.utility_type, Sensor.sensor_uid)
                )
            ).all()
        )
        out: list[tuple[Sensor, Reading | None]] = []
        for s in sensors:
            latest = await self.session.scalar(
                select(Reading).where(Reading.sensor_id == s.id).order_by(desc(Reading.ts)).limit(1)
            )
            out.append((s, latest))
        return out

    async def latest_for_device(self, device_id: str) -> Reading | None:
        return await self.session.scalar(
            select(Reading).where(Reading.device_id == device_id).order_by(desc(Reading.ts)).limit(1)
        )

    async def latest_per_sensor(self, device_id: str) -> list[Reading]:
        """Bitta qurilma ichidagi har sensor (source_id + utility_type) uchun
        oxirgi o'qish — RS-485 bridge ostidagi leaf sensorlarni ko'rsatish uchun."""
        stmt = (
            select(Reading)
            .where(Reading.device_id == device_id)
            .distinct(Reading.source_id, Reading.utility_type)
            .order_by(Reading.source_id, Reading.utility_type, desc(Reading.ts))
        )
        return list((await self.session.scalars(stmt)).all())

    async def latest_per_utility(self, building_id: int | None = None) -> list[Reading]:
        """Har bir utility_type uchun eng oxirgi xom o'qish (real-vaqt qiymati).

        building_id berilsa faqat shu bino; aks holda butun tizim bo'yicha.
        Displey ekranida joriy qiymatni (soatlik o'rtacha emas) ko'rsatish uchun."""
        # Test qurilmalarни chiqarib tashlaymiz — ular soatlik agregatsiyada
        # filtrlanadi, lekin bu real-vaqt so'rovда ham filtrlanishi kerak, aks
        # holda public displeyда simulyatsiya "jonli" ko'rinadi (audit).
        stmt = select(Reading).join(Device, Device.id == Reading.device_id).where(
            Device.is_test_device.is_(False)
        )
        if building_id is not None:
            stmt = stmt.where(Reading.building_id == building_id)
        stmt = stmt.distinct(Reading.utility_type).order_by(Reading.utility_type, desc(Reading.ts))
        return list((await self.session.scalars(stmt)).all())

    async def latest_soil_resolved(self, building_id: int | None = None) -> dict | None:
        """Soil (yerto'la) uchun namlik va havo sifatini ALOHIDA hal qiladi.

        Ikki xil soil qurilma bir-birini to'ldiradi: biri faqat namlik (MQ135'siz),
        biri faqat MQ135 havo (namlik zondi o'lik = 0.0). Bitta "eng oxirgi qator"
        olinsa, har poll'da bittasi yo'qoladi (sakraydi). Shuning uchun:
          - namlik: eng oxirgi NULL-emas VA 0-emas qiymat (0 = o'lik zond, "yo'q" deb qaraladi)
          - havo:   eng oxirgi NULL-emas air_quality
        Har biri mustaqil eng yangi qatordan olinadi — natija barqaror."""
        base = (
            select(Reading)
            .join(Device, Device.id == Reading.device_id)
            .where(Device.is_test_device.is_(False), Reading.utility_type == "soil")
        )
        if building_id is not None:
            base = base.where(Reading.building_id == building_id)

        hum_row = await self.session.scalar(
            base.where(Reading.humidity.isnot(None), Reading.humidity != 0)
            .order_by(desc(Reading.ts))
            .limit(1)
        )
        air_row = await self.session.scalar(
            base.where(Reading.air_quality.isnot(None)).order_by(desc(Reading.ts)).limit(1)
        )
        if hum_row is None and air_row is None:
            return None
        ts_candidates = [r.ts for r in (hum_row, air_row) if r is not None]
        return {
            "value": hum_row.humidity if hum_row is not None else None,
            "air_quality": air_row.air_quality if air_row is not None else None,
            "ts": max(ts_candidates) if ts_candidates else None,
        }

    async def _latest_average(
        self,
        utility_type: str,
        columns: dict[str, object],
        building_id: int | None = None,
        max_age_seconds: int = 7200,
        round_digits: int = 2,
    ) -> dict | None:
        """Umumiy naqsh: bino ichidagi bir turdagi barcha aktiv qurilmalarning
        (masalan bir nechta suv/gaz/elektr/issiqlik sensori) OXIRGI o'qishlari
        bo'yicha berilgan ustunlar (columns) O'RTACHASINI hisoblab qaytaradi.

        `columns` — natija dict kaliti -> Reading ustuni (masalan
        {"value": Reading.pressure_bar}). Har bir qurilmaning faqat eng oxirgi
        o'qishi hisobga olinadi (ichki subquery), keyin shular bo'yicha avg()."""
        from core.time import now_ts
        cutoff = now_ts() - max_age_seconds
        subq_stmt = (
            select(Reading.device_id, func.max(Reading.ts).label("max_ts"))
            .join(Device, Device.id == Reading.device_id)
            .where(and_(Reading.utility_type == utility_type, Reading.ts > cutoff, Device.is_test_device.is_(False)))
        )
        if building_id is not None:
            subq_stmt = subq_stmt.where(Reading.building_id == building_id)
        subq = subq_stmt.group_by(Reading.device_id).subquery()

        avg_cols = [func.avg(col).label(key) for key, col in columns.items()]
        stmt = (
            select(
                *avg_cols,
                func.max(Reading.ts).label("max_ts"),
                func.count().label("sensor_count"),
            )
            .join(subq, and_(Reading.device_id == subq.c.device_id, Reading.ts == subq.c.max_ts))
            .where(Reading.utility_type == utility_type)
        )
        res = (await self.session.execute(stmt)).mappings().one_or_none()
        if not res or not res["sensor_count"]:
            return None
        out: dict = {"ts": res["max_ts"], "sensor_count": res["sensor_count"]}
        has_value = False
        for key in columns:
            v = res[key]
            out[key] = round(float(v), round_digits) if v is not None else None
            has_value = has_value or v is not None
        return out if has_value else None

    async def latest_sound_average(self, building_id: int | None = None, max_age_seconds: int = 7200) -> dict | None:
        """Bino ichidagi barcha aktiv ovoz datchiklarining (masalan 3 ta ovoz sensori)
        oxirgi o'qishlari bo'yicha O'RTACHA qiymatni hisoblab qaytaradi.

        Ba'zi ovoz qurilmalariga MQ135 ham ulangan bo'lishi mumkin (bitta ESP32'da
        ovoz + havo sifati birga) — shu qurilmalarning air_quality ustuni ham shu
        yerda o'rtachalanadi (NULL bo'lgan qatorlar avg() tomonidan avtomatik
        e'tiborga olinmaydi)."""
        return await self._latest_average(
            "sound",
            {"value": Reading.level, "air_quality": Reading.air_quality},
            building_id, max_age_seconds, round_digits=1,
        )

    async def latest_water_average(self, building_id: int | None = None, max_age_seconds: int = 7200) -> dict | None:
        """Bino ichidagi barcha aktiv suv bosimi datchiklarining oxirgi
        o'qishlari bo'yicha O'RTACHA bosimni hisoblab qaytaradi."""
        return await self._latest_average(
            "water", {"value": Reading.pressure_bottom_bar}, building_id, max_age_seconds
        )

    async def latest_gas_average(self, building_id: int | None = None, max_age_seconds: int = 7200) -> dict | None:
        """Bino ichidagi barcha aktiv gaz bosimi datchiklarining oxirgi
        o'qishlari bo'yicha O'RTACHA bosimni hisoblab qaytaradi."""
        return await self._latest_average(
            "gas", {"value": Reading.pressure_bar}, building_id, max_age_seconds
        )

    async def latest_electricity_average(self, building_id: int | None = None, max_age_seconds: int = 7200) -> dict | None:
        """Bino ichida bir nechta elektr hisoblagich/bridge bo'lsa, ularning
        oxirgi o'qishlari bo'yicha O'RTACHA kuchlanishni hisoblab qaytaradi."""
        return await self._latest_average(
            "electricity", {"value": Reading.voltage_l1}, building_id, max_age_seconds, round_digits=1
        )

    async def latest_heating_average(self, building_id: int | None = None, max_age_seconds: int = 7200) -> dict | None:
        """Bino ichidagi barcha aktiv isitish datchiklarining oxirgi o'qishlari
        bo'yicha kirish/chiqish haroratining O'RTACHASINI hisoblab qaytaradi."""
        return await self._latest_average(
            "heating",
            {"value": Reading.temperature_in_c, "value_out": Reading.temperature_out_c},
            building_id, max_age_seconds, round_digits=1,
        )

    async def latest_air_quality_average(self, building_id: int | None = None, max_age_seconds: int = 7200) -> dict | None:
        """Bino ichidagi barcha aktiv havo sifati (MQ135) datchiklarining oxirgi
        o'qishlari bo'yicha O'RTACHA qiymatni hisoblab qaytaradi.

        utility_type="air_quality" qatorlari server tomonida soil/sound
        payload'laridan ajratilib (split) yoziladi (services/readings.py) —
        bu yerda ular mustaqil kommunal tur sifatida o'rtachalanadi."""
        return await self._latest_average(
            "air_quality", {"value": Reading.air_quality}, building_id, max_age_seconds, round_digits=1,
        )

    async def latest_utility_average(
        self, utility_type: str, building_id: int | None = None, max_age_seconds: int = 7200
    ) -> dict | None:
        """utility_type nomiga qarab mos latest_*_average()/soil_resolved()ga
        yo'naltiruvchi umumiy funksiya — tashqi tizimga yuborish (services/
        external_forward.py) kabi "menga faqat utility_type string kerak"
        chaqiruvchilar uchun."""
        if utility_type == "water":
            return await self.latest_water_average(building_id, max_age_seconds)
        if utility_type == "gas":
            return await self.latest_gas_average(building_id, max_age_seconds)
        if utility_type == "electricity":
            return await self.latest_electricity_average(building_id, max_age_seconds)
        if utility_type == "heating":
            return await self.latest_heating_average(building_id, max_age_seconds)
        if utility_type == "sound":
            return await self.latest_sound_average(building_id, max_age_seconds)
        if utility_type == "soil":
            return await self.latest_soil_resolved(building_id)
        if utility_type == "air_quality":
            return await self.latest_air_quality_average(building_id, max_age_seconds)
        return None

    async def exists_external_id(self, device_id: str, reading_id: str) -> bool:
        existing = await self.session.scalar(
            select(Reading.id).where(and_(Reading.device_id == device_id, Reading.reading_id == reading_id))
        )
        return existing is not None

    async def history(
        self, device_id: str, offset: int, limit: int, cutoff: int | None = None, utility_type: str | None = None
    ) -> list[Reading]:
        stmt = select(Reading).where(Reading.device_id == device_id)
        if utility_type:
            stmt = stmt.where(Reading.utility_type == utility_type)
        if cutoff:
            stmt = stmt.where(Reading.ts > cutoff)
        stmt = stmt.order_by(desc(Reading.ts)).limit(limit).offset(offset)
        return list((await self.session.scalars(stmt)).all())

    async def count_history(self, device_id: str, cutoff: int | None = None, utility_type: str | None = None) -> int:
        stmt = select(func.count()).select_from(Reading).where(Reading.device_id == device_id)
        if utility_type:
            stmt = stmt.where(Reading.utility_type == utility_type)
        if cutoff:
            stmt = stmt.where(Reading.ts > cutoff)
        return await self.session.scalar(stmt) or 0

    async def latest_by_point_ids(self, point_ids: list[int]) -> dict[int, Reading]:
        if not point_ids:
            return {}
        r_inner = aliased(Reading)
        latest_subq = (
            select(func.max(r_inner.ts).label("max_ts"), r_inner.point_id)
            .where(r_inner.point_id.in_(point_ids))
            .group_by(r_inner.point_id)
            .subquery()
        )
        stmt = select(Reading).join(
            latest_subq,
            and_(Reading.point_id == latest_subq.c.point_id, Reading.ts == latest_subq.c.max_ts),
        )
        return {row.point_id: row for row in (await self.session.scalars(stmt)).all()}

    async def building_history(
        self,
        building_id: int,
        offset: int,
        limit: int,
        utility_type: str | None = None,
        cutoff: int | None = None,
    ) -> list[Reading]:
        stmt = select(Reading).where(Reading.building_id == building_id)
        if utility_type:
            stmt = stmt.where(Reading.utility_type == utility_type)
        if cutoff:
            stmt = stmt.where(Reading.ts > cutoff)
        return list((await self.session.scalars(stmt.order_by(desc(Reading.ts)).limit(limit).offset(offset))).all())

    async def count_building_history(
        self,
        building_id: int,
        utility_type: str | None = None,
        cutoff: int | None = None,
    ) -> int:
        stmt = select(func.count()).select_from(Reading).where(Reading.building_id == building_id)
        if utility_type:
            stmt = stmt.where(Reading.utility_type == utility_type)
        if cutoff:
            stmt = stmt.where(Reading.ts > cutoff)
        return await self.session.scalar(stmt) or 0

    async def export_for_device(self, device_id: str, cutoff: int) -> list[Reading]:
        return list(
            (
                await self.session.scalars(
                    select(Reading).where(and_(Reading.device_id == device_id, Reading.ts > cutoff)).order_by(Reading.ts)
                )
            ).all()
        )
