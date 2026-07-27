from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel

from core.security import current_token_payload, require_admin
from services import audit
from services import territory as territory_service

router = APIRouter(prefix="/api/territory", tags=["territory"])

MAX_UPLOAD_BYTES = 20 * 1024 * 1024


class MahallaBody(BaseModel):
    name: str


class StreetCreateBody(BaseModel):
    mahalla_id: int
    name: str


class StreetUpdateBody(BaseModel):
    name: Optional[str] = None
    mahalla_id: Optional[int] = None


class ApartmentBody(BaseModel):
    building_id: Optional[int] = None
    apartment_no: Optional[str] = None
    owner_name: Optional[str] = None
    account_no: Optional[str] = None
    cadastre_code: Optional[str] = None
    contract_no: Optional[str] = None
    contract_date: Optional[str] = None
    pinfl: Optional[str] = None
    phone: Optional[str] = None
    people_count: Optional[int] = None
    area_m2: Optional[float] = None
    living_area_m2: Optional[float] = None
    property_value: Optional[float] = None
    rooms: Optional[int] = None


# ─── Mahalla ──────────────────────────────────────────────────────────────────


@router.get("/mahallas")
async def list_mahallas(_: dict = Depends(current_token_payload)):
    return await territory_service.list_mahallas()


@router.post("/mahallas")
async def create_mahalla(body: MahallaBody, admin: dict = Depends(require_admin)):
    result = await territory_service.create_mahalla(body.name)
    await audit.record(admin, "mahalla.create", "mahalla", result.get("id"), {"name": body.name})
    return result


@router.put("/mahallas/{mahalla_id}")
async def update_mahalla(mahalla_id: int, body: MahallaBody, admin: dict = Depends(require_admin)):
    result = await territory_service.update_mahalla(mahalla_id, body.name)
    await audit.record(admin, "mahalla.update", "mahalla", mahalla_id, {"name": body.name})
    return result


@router.delete("/mahallas/{mahalla_id}")
async def delete_mahalla(mahalla_id: int, admin: dict = Depends(require_admin)):
    result = await territory_service.delete_mahalla(mahalla_id)
    await audit.record(admin, "mahalla.delete", "mahalla", mahalla_id)
    return result


# ─── Street ───────────────────────────────────────────────────────────────────


@router.get("/streets")
async def list_streets(mahalla_id: Optional[int] = None, _: dict = Depends(current_token_payload)):
    return await territory_service.list_streets(mahalla_id)


@router.post("/streets")
async def create_street(body: StreetCreateBody, admin: dict = Depends(require_admin)):
    result = await territory_service.create_street(body.mahalla_id, body.name)
    await audit.record(admin, "street.create", "street", result.get("id"), body.model_dump())
    return result


@router.put("/streets/{street_id}")
async def update_street(street_id: int, body: StreetUpdateBody, admin: dict = Depends(require_admin)):
    result = await territory_service.update_street(street_id, body.name, body.mahalla_id)
    await audit.record(admin, "street.update", "street", street_id, body.model_dump(exclude_none=True))
    return result


@router.delete("/streets/{street_id}")
async def delete_street(street_id: int, admin: dict = Depends(require_admin)):
    result = await territory_service.delete_street(street_id)
    await audit.record(admin, "street.delete", "street", street_id)
    return result


# ─── Apartment ────────────────────────────────────────────────────────────────


@router.get("/apartments")
async def list_apartments(
    building_id: Optional[int] = None,
    mahalla_id: Optional[int] = None,
    street_id: Optional[int] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    _: dict = Depends(current_token_payload),
):
    return await territory_service.list_apartments(
        building_id, mahalla_id, street_id, search, page, limit
    )


@router.post("/apartments")
async def create_apartment(body: ApartmentBody, admin: dict = Depends(require_admin)):
    if not body.building_id:
        raise HTTPException(422, "building_id kiritilishi shart")
    fields = body.model_dump(exclude={"building_id"}, exclude_none=True)
    result = await territory_service.create_apartment(body.building_id, fields)
    await audit.record(admin, "apartment.create", "apartment", result.get("id"), fields)
    return result


@router.put("/apartments/{apartment_id}")
async def update_apartment(apartment_id: int, body: ApartmentBody, admin: dict = Depends(require_admin)):
    fields = body.model_dump(exclude={"building_id"}, exclude_none=True)
    result = await territory_service.update_apartment(apartment_id, fields)
    await audit.record(admin, "apartment.update", "apartment", apartment_id, fields)
    return result


@router.delete("/apartments/{apartment_id}")
async def delete_apartment(apartment_id: int, admin: dict = Depends(require_admin)):
    result = await territory_service.delete_apartment(apartment_id)
    await audit.record(admin, "apartment.delete", "apartment", apartment_id)
    return result


@router.get("/apartments/template")
async def apartments_template(_: dict = Depends(current_token_payload)):
    content = territory_service.apartments_template_xlsx()
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="xonadonlar_shablon.xlsx"'},
    )


@router.post("/apartments/import")
async def import_apartments(
    file: UploadFile = File(...),
    admin: dict = Depends(require_admin),
):
    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Fayl juda katta (max 20MB)")
    result = await territory_service.import_apartments_file(content)
    await audit.record(admin, "apartment.import", "apartment", None,
                        {"filename": file.filename, **{k: v for k, v in result.items() if k != "ok"}})
    return result
