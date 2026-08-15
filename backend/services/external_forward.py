"""Bino o'rtacha o'qishlarini tashqi tizimga (masalan 195.158.8.44:7000)
davriy yuborish. Standart holatda O'CHIRILGAN — core/config.py:
EXTERNAL_FORWARD_ENABLED=true bilan yoqiladi.

Tashqi API shakli (ular bergan hujjat bo'yicha):
    POST {url}
    [{"token": "...", "value": 25.6, "device": "device-001"}, ...]
    -> {"success": true, "message": "..."}
"""

import asyncio
import logging

import httpx

from core.config import settings
from core.database import SessionLocal
from core.time import now_ts
from repositories.external_forward import ExternalForwardRepository
from repositories.readings import ReadingRepository

logger = logging.getLogger(__name__)


def to_external_value(utility_type: str, value: float) -> float:
    """Reading.air_quality XOM (firmwaredan kelgan, yuqori=ifloslangan)
    semantikada saqlanadi — bizning saytimiz buni "Havo sifati" kartasida
    100-x qilib ko'rsatadi (yuqori=yaxshi). Tashqi "ODOR" tokenlari ham xuddi
    shu (yuqori=yaxshi/toza) shkalani kutadi, shuning uchun forward qilishdan
    oldin bir xil inversiya shu yerda qilinadi."""
    if utility_type == "air_quality":
        return max(0.0, round(100.0 - value, 1))
    return value


async def send_one(token: str, value: float, device: str) -> None:
    """Bitta o'lchovni tashqi API'ga yuboradi. Xato bo'lsa Exception ko'taradi
    (chaqiruvchi — forward_readings_once yoki test endpoint — o'zi tutadi)."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            settings.external_forward_url,
            json=[{"token": token, "value": value, "device": device}],
        )
    response.raise_for_status()
    body = response.json()
    if not body.get("success"):
        raise RuntimeError(f"tashqi API muvaffaqiyatsiz javob berdi: {body}")


async def forward_readings_once() -> dict:
    """Har bir aktiv mapping uchun bino/utility bo'yicha joriy O'RTACHA
    qiymatni hisoblab, tashqi API'ga yuboradi. Bitta mapping xato bersa ham
    qolganlari davom etadi — natija/xato mapping qatoriga yoziladi."""
    sent = 0
    failed = 0
    async with SessionLocal() as session:
        fwd_repo = ExternalForwardRepository(session)
        reading_repo = ReadingRepository(session)
        mappings = await fwd_repo.list_active()

        for m in mappings:
            avg = await reading_repo.latest_utility_average(
                m.utility_type, building_id=m.building_id, sensor_type=m.sensor_type, metric=m.metric
            )
            value = avg.get("value") if avg else None
            if value is None:
                m.last_error = "joriy o'qish topilmadi (2 soat ichida ma'lumot yo'q)"
                failed += 1
                continue
            value = to_external_value(m.utility_type, value)
            try:
                await send_one(m.external_token, value, m.external_device)
                m.last_sent_at = now_ts()
                m.last_sent_value = value
                m.last_error = None
                sent += 1
            except Exception as exc:
                logger.warning(
                    "external_forward: mapping id=%s (building=%s, utility=%s) xato: %s",
                    m.id, m.building_id, m.utility_type, exc,
                )
                m.last_error = str(exc)[:500]
                failed += 1
        await session.commit()

    logger.info("external_forward: sent=%d failed=%d total=%d", sent, failed, len(mappings))
    return {"sent": sent, "failed": failed, "total": len(mappings)}


async def external_forward_worker() -> None:
    """Fon ishchisi — har doim ishga tushadi, lekin EXTERNAL_FORWARD_ENABLED
    false bo'lsa hech narsa qilmasdan uxlab turadi (background.py'dagi boshqa
    worker'lar bilan bir xil naqsh — always-registered, ichki flag bilan
    gate qilingan)."""
    await asyncio.sleep(30)
    while True:
        try:
            if settings.external_forward_enabled:
                await forward_readings_once()
        except Exception:
            logger.exception("external_forward_worker error")
        await asyncio.sleep(settings.external_forward_interval_sec)
