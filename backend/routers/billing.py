from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile

from core.security import current_token_payload
from services import audit
from services import billing as billing_service

router = APIRouter(prefix="/api/billing", tags=["billing"])

MAX_UPLOAD_BYTES = 60 * 1024 * 1024  # 60MB — F3 hisobotlari katta bo'ladi

# Kommunal idora rollari — har biri FAQAT o'z turini yuklay oladi
ORG_ROLE_UTILITY = {
    "water_org": "water",
    "gas_org": "gas",
    "electricity_org": "electricity",
}


def _check_upload_permission(payload: dict, utility_type: str) -> None:
    role = payload.get("role")
    if role == "admin":
        return
    org_utility = ORG_ROLE_UTILITY.get(role)
    if org_utility is None:
        raise HTTPException(403, "Hisobot yuklash uchun ruxsat yo'q")
    if org_utility != utility_type:
        raise HTTPException(
            403,
            f"Sizning rolingiz faqat '{org_utility}' hisobotini yuklashga ruxsat beradi",
        )


@router.post("/import")
async def import_billing(
    file: UploadFile = File(...),
    utility_type: str = Form(...),
    period: str = Form(...),  # 'YYYY-MM'
    only_mahalla: Optional[str] = Form(None),
    payload: dict = Depends(current_token_payload),
):
    _check_upload_permission(payload, utility_type)
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Fayl juda katta (max 60MB)")
    result = await billing_service.import_billing_file(
        content, file.filename or "hisobot.xlsx", utility_type, period, payload, only_mahalla
    )
    await audit.record(
        payload, "billing.import", "billing_import", result.get("import_id"),
        {"filename": file.filename, "utility_type": utility_type, "period": period, **{
            k: v for k, v in result.items() if k != "ok"
        }},
    )
    return result


@router.get("/imports")
async def list_imports(
    limit: int = Query(50, ge=1, le=200),
    _: dict = Depends(current_token_payload),
):
    return await billing_service.list_imports(limit)


@router.get("/periods")
async def billing_periods(_: dict = Depends(current_token_payload)):
    return await billing_service.billing_periods()


@router.get("/summary")
async def billing_summary(
    period: str = Query(..., description="YYYY-MM"),
    utility_type: Optional[str] = None,
    _: dict = Depends(current_token_payload),
):
    return await billing_service.billing_summary(period, utility_type)


@router.get("/top")
async def billing_top(
    period: str = Query(..., description="YYYY-MM"),
    utility_type: str = Query(...),
    limit: int = Query(20, ge=1, le=100),
    _: dict = Depends(current_token_payload),
):
    return await billing_service.billing_top_consumers(period, utility_type, limit)


@router.get("/building/{building_id}")
async def building_billing(
    building_id: int,
    period: Optional[str] = None,
    _: dict = Depends(current_token_payload),
):
    return await billing_service.building_billing(building_id, period)


@router.get("/template")
async def billing_template(
    utility_type: str = Query(...),
    _: dict = Depends(current_token_payload),
):
    content = billing_service.billing_template_xlsx(utility_type)
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{utility_type}_shablon.xlsx"'},
    )
