from fastapi import APIRouter, Depends, HTTPException

from core.database import SessionLocal
from core.security import require_admin
from core.time import now_ts
from models.entities import ExternalSensorForward
from models.schemas import (
    ExternalForwardCreate,
    ExternalForwardResponse,
    ExternalForwardTestResponse,
    ExternalForwardUpdate,
)
from repositories.external_forward import ExternalForwardRepository
from repositories.readings import ReadingRepository
from services import audit
from services.external_forward import send_one

router = APIRouter(prefix="/api/external-forwards", tags=["external-forwards"])


@router.get("", response_model=list[ExternalForwardResponse])
async def list_external_forwards(_: dict = Depends(require_admin)):
    async with SessionLocal() as session:
        repo = ExternalForwardRepository(session)
        return await repo.list_all()


@router.post("", response_model=ExternalForwardResponse)
async def create_external_forward(body: ExternalForwardCreate, admin: dict = Depends(require_admin)):
    async with SessionLocal() as session:
        repo = ExternalForwardRepository(session)
        row = ExternalSensorForward(
            building_id=body.building_id,
            utility_type=body.utility_type.value,
            external_token=body.external_token,
            external_device=body.external_device,
            is_active=body.is_active,
            created_at=now_ts(),
            updated_at=now_ts(),
        )
        repo.add(row)
        await repo.flush()
        await repo.commit()
        await audit.record(admin, "external_forward.create", "external_forward", str(row.id), body.model_dump(mode="json"))
        return row


@router.patch("/{forward_id}", response_model=ExternalForwardResponse)
async def update_external_forward(forward_id: int, body: ExternalForwardUpdate, admin: dict = Depends(require_admin)):
    async with SessionLocal() as session:
        repo = ExternalForwardRepository(session)
        row = await repo.get(forward_id)
        if not row:
            raise HTTPException(status_code=404, detail="Mapping topilmadi")
        for field, value in body.model_dump(exclude_unset=True).items():
            setattr(row, field, value)
        row.updated_at = now_ts()
        await repo.commit()
        await audit.record(admin, "external_forward.update", "external_forward", str(forward_id), body.model_dump(mode="json", exclude_unset=True))
        return row


@router.delete("/{forward_id}")
async def delete_external_forward(forward_id: int, admin: dict = Depends(require_admin)):
    async with SessionLocal() as session:
        repo = ExternalForwardRepository(session)
        row = await repo.get(forward_id)
        if not row:
            raise HTTPException(status_code=404, detail="Mapping topilmadi")
        await repo.delete(row)
        await repo.commit()
        await audit.record(admin, "external_forward.delete", "external_forward", str(forward_id))
        return {"ok": True}


@router.post("/{forward_id}/test", response_model=ExternalForwardTestResponse)
async def test_external_forward(forward_id: int, admin: dict = Depends(require_admin)):
    """Cron yoqilishidan OLDIN, tashqi tomon bilan kelishib ko'rish uchun —
    shu bitta mapping bo'yicha hozirgi o'rtacha qiymatni darhol yuboradi va
    natijani qaytaradi (worker orqali kutmasdan)."""
    async with SessionLocal() as session:
        fwd_repo = ExternalForwardRepository(session)
        reading_repo = ReadingRepository(session)
        row = await fwd_repo.get(forward_id)
        if not row:
            raise HTTPException(status_code=404, detail="Mapping topilmadi")

        avg = await reading_repo.latest_utility_average(row.utility_type, building_id=row.building_id)
        value = avg.get("value") if avg else None
        if value is None:
            return ExternalForwardTestResponse(ok=False, error="joriy o'qish topilmadi (2 soat ichida ma'lumot yo'q)")

        try:
            await send_one(row.external_token, value, row.external_device)
        except Exception as exc:
            row.last_error = str(exc)[:500]
            await fwd_repo.commit()
            await audit.record(admin, "external_forward.test", "external_forward", str(forward_id), {"ok": False, "error": str(exc)})
            return ExternalForwardTestResponse(ok=False, value=value, error=str(exc))

        row.last_sent_at = now_ts()
        row.last_sent_value = value
        row.last_error = None
        await fwd_repo.commit()
        await audit.record(admin, "external_forward.test", "external_forward", str(forward_id), {"ok": True, "value": value})
        return ExternalForwardTestResponse(ok=True, value=value)
