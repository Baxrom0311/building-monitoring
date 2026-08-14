from typing import Optional

from fastapi import APIRouter

from core.database import SessionLocal
from repositories.buildings import BuildingRepository
from repositories.readings import ReadingRepository
from services import analytics as analytics_service

router = APIRouter(prefix="/api/public")


@router.get("/display")
async def public_display(building_id: Optional[int] = None):
    """Ko'rgazma uchun ochiq endpoint — auth talab qilinmaydi.

    building_id berilsa faqat shu bino statistikasi qaytadi
    (kiosk ekranini bitta domga bog'lash uchun: /display?building_id=3).
    """
    async def stats(utility: str) -> list:
        # 15-daqiqalik jonli bucket — soatlik jadval elektr uchun 24 soatda atigi
        # ~6 ustun berardi; mayda bucket sparkline'ni ancha zichlashtiradi. Bucket
        # bo'yicha o'rtacha — bir binodagi bir nechta ovoz sensori avtomatik birlashadi.
        return await analytics_service.list_bucketed_stats(
            building_id=building_id, utility_type=utility, hours=24, bucket_sec=900, limit=500
        )

    building_info = None
    latest: dict = {}
    async with SessionLocal() as session:
        repo = BuildingRepository(session)
        if building_id is not None:
            building = await repo.get(building_id)
            if building:
                building_info = {"id": building.id, "name": building.name, "address": building.address}
        # Displey ekranida bino tanlash uchun aktiv binolar ro'yxati (id + nom)
        all_buildings = await repo.list_active()

        # Real-vaqt qiymati — har utility uchun eng oxirgi xom o'qish
        reading_repo = ReadingRepository(session)
        for r in await reading_repo.latest_per_utility(building_id=building_id):
            if r.utility_type == "electricity":
                latest["electricity"] = {"value": r.voltage_l1, "ts": r.ts}
            elif r.utility_type == "water":
                latest["water"] = {"value": r.pressure_bottom_bar, "ts": r.ts}
            elif r.utility_type == "gas":
                latest["gas"] = {"value": r.pressure_bar, "ts": r.ts}
            elif r.utility_type == "soil":
                latest["soil"] = {
                    "value": r.humidity,
                    "air_quality": r.air_quality,
                    "ts": r.ts,
                }
            elif r.utility_type == "sound":
                latest["sound"] = {"value": r.level, "ts": r.ts}
            elif r.utility_type == "heating":
                latest["heating"] = {
                    "value": r.temperature_in_c,
                    "value_out": r.temperature_out_c,
                    "ts": r.ts,
                }

        # Agar binoda 1 ta dan ko'p ovoz datchigi (masalan 3 ta ovoz sensori) bo'lsa, ularning o'rtachasini olish
        sound_avg = await reading_repo.latest_sound_average(building_id=building_id)
        if sound_avg:
            latest["sound"] = sound_avg

        # Soil: namlik (0-emas) va havo sifatini alohida barqaror hal qilamiz —
        # ikki to'ldiruvchi soil qurilma orasida "latest" sakrab qolmasligi uchun.
        soil_resolved = await reading_repo.latest_soil_resolved(building_id=building_id)
        if soil_resolved:
            latest["soil"] = soil_resolved

        # Bir turdagi sensordan bir nechtasi bo'lsa (masalan bir binoda 2 ta suv
        # bosimi datchigi), tasodifiy "eng oxirgisi" o'rniga barchasining
        # O'RTACHASINI ko'rsatamiz — sound/soil bilan bir xil naqsh.
        water_avg = await reading_repo.latest_water_average(building_id=building_id)
        if water_avg:
            latest["water"] = water_avg
        gas_avg = await reading_repo.latest_gas_average(building_id=building_id)
        if gas_avg:
            latest["gas"] = gas_avg
        elec_avg = await reading_repo.latest_electricity_average(building_id=building_id)
        if elec_avg:
            latest["electricity"] = elec_avg
        heating_avg = await reading_repo.latest_heating_average(building_id=building_id)
        if heating_avg:
            latest["heating"] = heating_avg
    buildings = [{"id": b.id, "name": b.name} for b in all_buildings]

    return {
        "building": building_info,
        "buildings": buildings,
        "latest": latest,
        "electricity": await stats("electricity"),
        "water": await stats("water"),
        "gas": await stats("gas"),
        "soil": await stats("soil"),
        "sound": await stats("sound"),
        "heating": await stats("heating"),
    }


@router.get("/display/kpi")
async def display_kpi():
    """ESP32 ekran qurilmasi uchun kompakt KPI — kichik JSON, auth yo'q.

    Har bir utility_type uchun oxirgi soatdagi eng so'nggi qiymatni qaytaradi.
    Javob hajmi ~300 bayt — ESP32 xotirasi uchun qulay.
    """
    def _latest(stats: list[dict]) -> dict:
        """Ro'yxatdan eng oxirgi bo'sh bo'lmagan qiymatlarni ajratib olish.

        stats desc(bucket_ts) tartibida keladi — birinchi elementlar eng yangi,
        shuning uchun to'g'ridan-to'g'ri iteratsiya qilamiz (reversed emas)."""
        result: dict = {}
        for row in stats:
            for key, val in row.items():
                if key not in result and val is not None and key != "id":
                    result[key] = val
            if len(result) > 3:
                break
        return result

    elec  = await analytics_service.list_hourly_stats(utility_type="electricity", hours=2, limit=10)
    water = await analytics_service.list_hourly_stats(utility_type="water",       hours=2, limit=10)
    gas   = await analytics_service.list_hourly_stats(utility_type="gas",         hours=2, limit=10)
    soil  = await analytics_service.list_hourly_stats(utility_type="soil",        hours=2, limit=10)
    sound = await analytics_service.list_hourly_stats(utility_type="sound",       hours=2, limit=10)

    e = _latest(elec["stats"])
    w = _latest(water["stats"])
    g = _latest(gas["stats"])
    s = _latest(soil["stats"])
    sn = _latest(sound["stats"])

    return {
        "electricity": {
            "power_w":    e.get("avg_power_w"),
            "energy_kwh": e.get("max_energy_kwh"),
        },
        "water": {
            "pressure_bottom_bar": w.get("avg_pressure_bottom_bar"),
            "pressure_top_bar":    w.get("avg_pressure_top_bar"),
            "flow_rate":           w.get("avg_flow_rate"),
        },
        "gas": {
            "pressure_bar": g.get("avg_pressure_bar"),
            "flow_rate":    g.get("avg_flow_rate"),
        },
        "soil": {
            "humidity": s.get("avg_humidity"),
        },
        "sound": {
            "level": sn.get("avg_level"),
        },
    }
