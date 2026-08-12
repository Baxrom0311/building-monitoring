from sqlalchemy import Integer, Numeric, and_, case, cast, delete, desc, func, select

from models.entities import Alert, Device, HourlyUtilityStats, Reading
from repositories.base import BaseRepository


def rnd(expr, digits):
    """PostgreSQL round() faqat numeric tipni qabul qiladi."""
    return func.round(cast(expr, Numeric), digits)


class AnalyticsRepository(BaseRepository[HourlyUtilityStats]):
    model = HourlyUtilityStats

    async def reading_stats(self, device_id: str, cutoff: int) -> list[dict]:
        # ts % 3600 — PG da int/int bo'lish NUMERIC ga aylanib ROUND qiladi, shuning uchun modulo
        hour_ts = Reading.ts - (Reading.ts % 3600)
        stmt = (
            select(
                hour_ts.label("hour_ts"),
                rnd(func.avg(Reading.voltage_l1), 1).label("avg_v1"),
                rnd(func.min(Reading.voltage_l1), 1).label("min_v1"),
                rnd(func.max(Reading.voltage_l1), 1).label("max_v1"),
                rnd(func.avg(Reading.current_l1), 3).label("avg_i1"),
                rnd(func.avg(Reading.power_w), 0).label("avg_pw"),
                rnd(func.max(Reading.power_w), 0).label("max_pw"),
                rnd(func.avg(Reading.frequency), 2).label("avg_freq"),
                rnd(func.max(Reading.energy_kwh), 3).label("energy_kwh"),
                rnd(func.avg(Reading.pressure_bar), 3).label("avg_pressure_bar"),
                rnd(func.avg(Reading.pressure_bottom_bar), 3).label("avg_pressure_bottom_bar"),
                rnd(func.avg(Reading.pressure_top_bar), 3).label("avg_pressure_top_bar"),
                rnd(func.avg(Reading.flow_rate), 3).label("avg_flow_rate"),
                rnd(func.max(Reading.volume_m3), 3).label("volume_m3"),
                # Soil/havo/ovoz/issiqlik — ilgari bu metrikalar yo'q edi, shuning uchun
                # /devices/{id}/stats grafigi soil/sound/heating qurilmalar uchun bo'sh chiqardi.
                rnd(func.avg(Reading.humidity), 1).label("avg_humidity"),
                rnd(func.avg(Reading.air_quality), 1).label("avg_air_quality"),
                rnd(func.avg(Reading.level), 1).label("avg_level"),
                rnd(func.avg(Reading.temperature_in_c), 1).label("avg_temperature_in_c"),
                rnd(func.avg(Reading.temperature_out_c), 1).label("avg_temperature_out_c"),
                func.count().label("samples"),
            )
            .where(and_(Reading.device_id == device_id, Reading.ts > cutoff))
            .group_by(hour_ts)
            .order_by(hour_ts)
        )
        return [dict(row) for row in (await self.session.execute(stmt)).mappings().all()]

    async def building_utility_analytics(self, building_id: int, cutoff: int) -> dict:
        electricity = (
            await self.session.execute(
                select(
                    func.count().label("samples"),
                    rnd(func.max(Reading.energy_kwh), 3).label("energy_kwh"),
                    rnd(func.avg(Reading.power_w), 2).label("avg_power_w"),
                    rnd(func.max(Reading.power_w), 2).label("max_power_w"),
                    rnd(func.avg(Reading.voltage_l1), 2).label("avg_voltage_l1"),
                ).where(
                    and_(
                        Reading.building_id == building_id,
                        Reading.utility_type == "electricity",
                        Reading.ts > cutoff,
                    )
                )
            )
        ).mappings().one()
        water = (
            await self.session.execute(
                select(
                    func.count().label("samples"),
                    rnd(func.avg(Reading.pressure_bottom_bar), 3).label("avg_pressure_bottom_bar"),
                    rnd(func.avg(Reading.pressure_top_bar), 3).label("avg_pressure_top_bar"),
                    rnd(func.avg(Reading.pressure_bottom_bar - Reading.pressure_top_bar), 3).label(
                        "avg_pressure_delta_bar"
                    ),
                    func.sum(
                        ((Reading.pressure_bottom_bar > 1.0) & (Reading.pressure_top_bar < 0.5)).cast(Integer)
                    ).label("top_pressure_problem_count"),
                ).where(
                    and_(Reading.building_id == building_id, Reading.utility_type == "water", Reading.ts > cutoff)
                )
            )
        ).mappings().one()
        gas = (
            await self.session.execute(
                select(
                    func.count().label("samples"),
                    rnd(func.avg(Reading.pressure_bar), 4).label("avg_pressure_bar"),
                    rnd(func.min(Reading.pressure_bar), 4).label("min_pressure_bar"),
                    rnd(func.max(Reading.pressure_bar), 4).label("max_pressure_bar"),
                ).where(
                    and_(Reading.building_id == building_id, Reading.utility_type == "gas", Reading.ts > cutoff)
                )
            )
        ).mappings().one()
        soil = (
            await self.session.execute(
                select(
                    func.count().label("samples"),
                    rnd(func.avg(Reading.humidity), 1).label("avg_humidity"),
                    rnd(func.min(Reading.humidity), 1).label("min_humidity"),
                    rnd(func.max(Reading.humidity), 1).label("max_humidity"),
                ).where(
                    and_(Reading.building_id == building_id, Reading.utility_type == "soil", Reading.ts > cutoff)
                )
            )
        ).mappings().one()
        sound = (
            await self.session.execute(
                select(
                    func.count().label("samples"),
                    rnd(func.avg(Reading.level), 1).label("avg_level"),
                    rnd(func.min(Reading.level), 1).label("min_level"),
                    rnd(func.max(Reading.level), 1).label("max_level"),
                ).where(
                    and_(Reading.building_id == building_id, Reading.utility_type == "sound", Reading.ts > cutoff)
                )
            )
        ).mappings().one()
        active_alerts = await self.session.scalar(
            select(func.count()).select_from(Alert).where(
                and_(Alert.building_id == building_id, Alert.cleared.is_(False), Alert.ts > cutoff)
            )
        ) or 0
        return {
            "active_alerts": active_alerts,
            "electricity": dict(electricity),
            "water": dict(water),
            "gas": dict(gas),
            "soil": dict(soil),
            "sound": dict(sound),
        }

    async def aggregate_hourly_rows(self, cutoff: int) -> list[dict]:
        hour_ts = Reading.ts - (Reading.ts % 3600)
        # building_id/point_id GROUP BY da emas — uq_hourly_stats_device_utility
        # (bucket_ts, device_id, utility_type) bo'yicha unique, device ko'chsa duplicate bo'lardi
        stmt = (
            select(
                hour_ts.label("bucket_ts"),
                func.max(Reading.building_id).label("building_id"),
                func.max(Reading.point_id).label("point_id"),
                Reading.device_id,
                Reading.utility_type,
                func.count().label("samples"),
                func.avg(Reading.voltage_l1).label("avg_voltage_l1"),
                func.avg(Reading.power_w).label("avg_power_w"),
                func.max(Reading.energy_kwh).label("max_energy_kwh"),
                func.avg(Reading.pressure_bar).label("avg_pressure_bar"),
                func.avg(Reading.pressure_bottom_bar).label("avg_pressure_bottom_bar"),
                func.avg(Reading.pressure_top_bar).label("avg_pressure_top_bar"),
                func.avg(Reading.flow_rate).label("avg_flow_rate"),
                func.max(Reading.volume_m3).label("max_volume_m3"),
                func.avg(Reading.humidity).label("avg_humidity"),
                func.avg(Reading.level).label("avg_level"),
                func.min(Reading.level).label("min_level"),
                func.max(Reading.level).label("max_level"),
                func.avg(Reading.temperature_in_c).label("avg_temperature_in_c"),
                func.avg(Reading.temperature_out_c).label("avg_temperature_out_c"),
                func.avg(Reading.air_quality).label("avg_air_quality"),
            )
            .join(Device, Device.id == Reading.device_id)
            .where(and_(Reading.ts >= cutoff, Device.is_test_device.is_(False)))
            .group_by(hour_ts, Reading.device_id, Reading.utility_type)
        )
        return [dict(row) for row in (await self.session.execute(stmt)).mappings().all()]

    async def replace_hourly_stats_since(self, cutoff: int, rows: list[dict], ts: int) -> None:
        await self.session.execute(delete(HourlyUtilityStats).where(HourlyUtilityStats.bucket_ts >= cutoff))
        for row in rows:
            self.add(
                HourlyUtilityStats(
                    bucket_ts=row["bucket_ts"],
                    building_id=row["building_id"],
                    point_id=row["point_id"],
                    device_id=row["device_id"],
                    utility_type=row["utility_type"],
                    samples=row["samples"],
                    avg_voltage_l1=row["avg_voltage_l1"],
                    avg_power_w=row["avg_power_w"],
                    max_energy_kwh=row["max_energy_kwh"],
                    avg_pressure_bar=row["avg_pressure_bar"],
                    avg_pressure_bottom_bar=row["avg_pressure_bottom_bar"],
                    avg_pressure_top_bar=row["avg_pressure_top_bar"],
                    avg_flow_rate=row["avg_flow_rate"],
                    max_volume_m3=row["max_volume_m3"],
                    avg_humidity=row["avg_humidity"],
                    avg_level=row["avg_level"],
                    min_level=row["min_level"],
                    max_level=row["max_level"],
                    avg_temperature_in_c=row["avg_temperature_in_c"],
                    avg_temperature_out_c=row["avg_temperature_out_c"],
                    avg_air_quality=row["avg_air_quality"],
                    created_at=ts,
                    updated_at=ts,
                )
            )

    async def list_hourly_stats(
        self,
        cutoff: int,
        building_id: int | None = None,
        utility_type: str | None = None,
        device_id: str | None = None,
        limit: int = 500,
    ) -> list[HourlyUtilityStats]:
        stmt = select(HourlyUtilityStats).where(HourlyUtilityStats.bucket_ts >= cutoff)
        if building_id:
            stmt = stmt.where(HourlyUtilityStats.building_id == building_id)
        if utility_type:
            stmt = stmt.where(HourlyUtilityStats.utility_type == utility_type)
        if device_id:
            stmt = stmt.where(HourlyUtilityStats.device_id == device_id)
        return list((await self.session.scalars(stmt.order_by(desc(HourlyUtilityStats.bucket_ts)).limit(limit))).all())

    # Utility → (natija ustuni, Reading ustuni, yaxlitlash) — display sparkline uchun
    _BUCKET_FIELDS = {
        "electricity": [("avg_voltage_l1", Reading.voltage_l1, 1)],
        "water": [
            ("avg_pressure_bottom_bar", Reading.pressure_bottom_bar, 3),
            ("avg_pressure_top_bar", Reading.pressure_top_bar, 3),
        ],
        "gas": [("avg_pressure_bar", Reading.pressure_bar, 4)],
        "soil": [
            ("avg_humidity", Reading.humidity, 1),
            ("avg_air_quality", Reading.air_quality, 1),
        ],
        "sound": [("avg_level", Reading.level, 1)],
        "heating": [
            ("avg_temperature_in_c", Reading.temperature_in_c, 1),
            ("avg_temperature_out_c", Reading.temperature_out_c, 1),
        ],
    }

    async def bucketed_utility_stats(
        self,
        cutoff: int,
        utility_type: str,
        bucket_sec: int = 900,
        building_id: int | None = None,
        limit: int = 500,
    ) -> list[dict]:
        """Xom o'qishlardan JONLI mayda-bucket statistikasi (display sparkline uchun).

        hourly_utility_stats jadvali faqat soatlik — elektr kabi klasterlangan
        ma'lumot 24 soatda atigi 6 ustun berardi. bucket_sec=900 (15 daqiqa) bilan
        ancha zichroq grafik chiqadi. Bucket bo'yicha guruhlaydi (qurilmalararo
        o'rtacha) — shu bilan bir binodagi bir nechta sensor avtomatik birlashadi.
        """
        bucket_ts = Reading.ts - (Reading.ts % bucket_sec)
        cols = [bucket_ts.label("bucket_ts"), func.count().label("samples")]
        for label, col, digits in self._BUCKET_FIELDS.get(utility_type, []):
            cols.append(rnd(func.avg(col), digits).label(label))
        stmt = (
            select(*cols)
            .join(Device, Device.id == Reading.device_id)
            .where(
                and_(
                    Reading.ts >= cutoff,
                    Reading.utility_type == utility_type,
                    Device.is_test_device.is_(False),
                )
            )
        )
        if building_id:
            stmt = stmt.where(Reading.building_id == building_id)
        stmt = stmt.group_by(bucket_ts).order_by(desc(bucket_ts)).limit(limit)
        return [dict(row) for row in (await self.session.execute(stmt)).mappings().all()]

    async def energy_by_building_rows(
        self,
        from_ts: int,
        to_ts: int,
        bucket_sec: int,
        building_id: int | None = None,
    ) -> list[dict]:
        bucket_ts = Reading.ts - (Reading.ts % bucket_sec)
        # Reset-aware iste'mol: max-min emas, ketma-ket MUSBAT deltalar yig'indisi.
        # Hisoblagich reset/almashsa (energy tushsa) o'sha manfiy sakrash e'tiborsiz
        # qoldiriladi — aks holda delta butun absolyut qiymatga sakrardi (audit).
        _lag = func.lag(Reading.energy_kwh).over(
            partition_by=[bucket_ts, Reading.device_id],
            order_by=Reading.ts,
        )
        _delta = Reading.energy_kwh - _lag
        _pos = case((and_(_lag.isnot(None), _delta > 0), _delta), else_=0.0)
        deltas = (
            select(
                bucket_ts.label("bucket_ts"),
                Reading.building_id.label("building_id"),
                Reading.device_id.label("device_id"),
                _pos.label("pos_delta"),
                Reading.energy_kwh.label("e"),
                Reading.power_w.label("p"),
            )
            .where(
                and_(
                    Reading.ts >= from_ts,
                    Reading.ts <= to_ts,
                    Reading.utility_type == "electricity",
                    Reading.energy_kwh.isnot(None),
                    Device.is_test_device.is_(False),
                )
            )
            .join(Device, Device.id == Reading.device_id)
        )
        if building_id:
            deltas = deltas.where(Reading.building_id == building_id)
        deltas_subq = deltas.subquery()
        per_device_subq = (
            select(
                deltas_subq.c.bucket_ts,
                deltas_subq.c.building_id,
                deltas_subq.c.device_id,
                func.sum(deltas_subq.c.pos_delta).label("energy_kwh_delta"),
                func.max(deltas_subq.c.e).label("energy_kwh_max"),
                func.avg(deltas_subq.c.p).label("avg_power_w"),
                func.count().label("samples"),
            )
            .group_by(deltas_subq.c.bucket_ts, deltas_subq.c.building_id, deltas_subq.c.device_id)
            .subquery()
        )
        stmt = (
            select(
                per_device_subq.c.bucket_ts,
                per_device_subq.c.building_id,
                rnd(func.sum(per_device_subq.c.energy_kwh_delta), 3).label("energy_kwh_delta"),
                rnd(func.sum(per_device_subq.c.energy_kwh_max), 3).label("energy_kwh_max"),
                rnd(func.avg(per_device_subq.c.avg_power_w), 1).label("avg_power_w"),
                func.sum(per_device_subq.c.samples).label("samples"),
            )
            .group_by(per_device_subq.c.bucket_ts, per_device_subq.c.building_id)
            .order_by(per_device_subq.c.bucket_ts)
        )
        return [dict(row) for row in (await self.session.execute(stmt)).mappings().all()]

    async def buildings_energy_summary_rows(self, from_ts: int) -> list[dict]:
        # Reset-aware (max-min emas, musbat deltalar yig'indisi) — audit
        _lag = func.lag(Reading.energy_kwh).over(
            partition_by=[Reading.building_id, Reading.device_id],
            order_by=Reading.ts,
        )
        _delta = Reading.energy_kwh - _lag
        _pos = case((and_(_lag.isnot(None), _delta > 0), _delta), else_=0.0)
        deltas = (
            select(
                Reading.building_id.label("building_id"),
                Reading.device_id.label("device_id"),
                _pos.label("pos_delta"),
                Reading.power_w.label("p"),
            )
            .where(
                and_(
                    Reading.ts >= from_ts,
                    Reading.utility_type == "electricity",
                    Reading.energy_kwh.isnot(None),
                    Device.is_test_device.is_(False),
                )
            )
            .join(Device, Device.id == Reading.device_id)
            .subquery()
        )
        per_device = (
            select(
                deltas.c.building_id.label("building_id"),
                deltas.c.device_id.label("device_id"),
                func.sum(deltas.c.pos_delta).label("energy_kwh_delta"),
                func.avg(deltas.c.p).label("avg_power_w"),
                func.count().label("readings"),
            )
            .group_by(deltas.c.building_id, deltas.c.device_id)
            .subquery()
        )
        stmt = (
            select(
                per_device.c.building_id,
                rnd(func.sum(per_device.c.energy_kwh_delta), 3).label("total_energy_kwh"),
                rnd(func.avg(per_device.c.avg_power_w), 1).label("avg_power_w"),
                func.sum(per_device.c.readings).label("readings"),
            )
            .group_by(per_device.c.building_id)
        )
        return [dict(row) for row in (await self.session.execute(stmt)).mappings().all()]
