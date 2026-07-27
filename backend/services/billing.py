"""Kommunal idoralar Excel hisobotlarini import qilish va tahlil qilish.

Qo'llab-quvvatlanadigan formatlar (avtomatik aniqlanadi):
  - f3       : suv ta'minoti F3 hisoboti (Район/Махалля/Улица/№ дома/... 106 ustun)
  - registry : kadastr-mulk reestri (Правообладатель, Квартира, Площадь...)
  - readings : hisoblagich ko'rsatkichlari (шартнома раками, Манзил, oylik iste'mol)
  - simple   : universal shablon (mahalla, kocha, uy, xonadon, egasi, hajm,
               hisoblangan, tolangan, qarz ustunlari — istalgan tartibda)

Manzillar normalizatsiya qilinadi ("ул. Зарбулок" == "Зарбулоқ кўчаси") va
mahalla → ko'cha → dom → xonadon ierarxiyasiga bog'lanadi.
"""

import asyncio
import io
import re
import unicodedata

import openpyxl
from fastapi import HTTPException

from core.config import settings
from core.database import SessionLocal
from core.time import now_ts
from models.entities import (
    Apartment,
    BillingImport,
    Building,
    Mahalla,
    Street,
    UtilityBilling,
)
from repositories.base import model_to_dict
from sqlalchemy import and_, delete, func, select

UTILITY_TYPES = {"water", "gas", "electricity"}

# ─── Manzil normalizatsiyasi ─────────────────────────────────────────────────
# Kirill/lotin va turli yozilishlarni bir kalitga keltirish
_CYR_MAP = str.maketrans({
    "қ": "к", "ў": "у", "ғ": "г", "ҳ": "х", "ё": "е", "й": "и",
    "Қ": "к", "Ў": "у", "Ғ": "г", "Ҳ": "х",
})
_STOPWORDS = (
    "улица", "ул", "кучаси", "куча", "kochasi", "kocha", "kuchasi",
    "мсг", "msg", "махалля", "махалла", "mahalla", "tor", "тор",
)


def norm_key(value: str) -> str:
    """'ул. Зарбулок' ham, 'Зарбулоқ кўчаси' ham → 'зарбулок'."""
    s = unicodedata.normalize("NFKC", str(value)).lower().strip()
    s = s.translate(_CYR_MAP)
    s = s.replace("ʼ", "").replace("'", "").replace("’", "").replace("‘", "").replace('"', "")
    s = re.sub(r"[.,«»()]", " ", s)
    words = [w for w in s.split() if w and w not in _STOPWORDS]
    return " ".join(words) or s.strip()


def norm_house(value) -> str:
    """Uy raqami: '12/1-уй', ' 12/1 ' → '12/1'."""
    s = str(value).strip()
    s = re.sub(r"[-\s]*(уй|uy|дом|dom)\.?$", "", s, flags=re.I).strip()
    return s.replace(" ", "")


def parse_period(period: str) -> int:
    """'2026-07' → 202607."""
    m = re.match(r"^(\d{4})-(\d{1,2})$", period.strip())
    if not m:
        raise HTTPException(422, "period 'YYYY-MM' formatida bo'lishi kerak (masalan 2026-07)")
    year, month = int(m.group(1)), int(m.group(2))
    if not 1 <= month <= 12:
        raise HTTPException(422, "period oyi 01-12 oralig'ida bo'lishi kerak")
    return year * 100 + month


def _f(value) -> float | None:
    """Excel katakni son sifatida o'qish (bo'sh/xato → None)."""
    if value is None:
        return None
    try:
        return float(str(value).replace(",", ".").replace(" ", ""))
    except (ValueError, TypeError):
        return None


# ─── Parserlar: har biri bir xil shakldagi ro'yxat qaytaradi ─────────────────
# Barcha parserlar _blank_row() asosida to'liq maydonlar to'plamini qaytaradi —
# yo'q maydon None bo'ladi, hech narsa yo'qolmaydi.


def _blank_row() -> dict:
    return {
        "mahalla": None, "street": None, "house": "", "apartment": None,
        "owner": None, "account": None, "cadastre": None,
        "contract_no": None, "contract_date": None, "pinfl": None, "phone": None,
        "people": None, "area": None, "living_area": None, "property_value": None,
        "rooms": None,
        "volume": None, "accrued": None, "paid": None,
        "debt_start": None, "debt": None, "penalty": None, "correction": None,
        "has_meter": None, "meter_count": None, "meter_reading": None,
        "meter_start": None, "meter_end": None,
        "canal_volume": None, "canal_amount": None,
        "tariff": None, "accrual_type": None, "consumer_status": None,
        "last_payment": None,
    }


def _parse_f3(ws) -> list[dict]:
    rows = []
    for row in ws.iter_rows(min_row=6, values_only=True):
        street, house = row[3], row[4]
        if not street or not str(street).strip():
            continue
        phone = None
        for cand in (row[13], row[12]):  # sotoviy birinchi
            if cand and str(cand).strip():
                phone = str(cand).strip()[:30]
                break
        meter_count = int(_f(row[26]) or 0)
        rows.append(_blank_row() | {
            "mahalla": str(row[2]).strip() if row[2] else None,
            "street": str(street).strip(),
            "house": norm_house(house) if house else "",
            "apartment": str(row[5]).strip() if row[5] and str(row[5]).strip() else None,
            "owner": str(row[9]).strip() if row[9] else None,
            "account": str(row[11]).strip() if row[11] and str(row[11]).strip() else None,
            "cadastre": str(row[15]).strip() if row[15] and str(row[15]).strip() else None,
            "pinfl": str(row[17]).strip() if row[17] and str(row[17]).strip() else None,
            "phone": phone,
            "area": None,
            "living_area": None,
            "property_value": None,
            "rooms": int(_f(row[25]) or 0) or None,      # kol-vo komnat
            "contract_no": None,
            "contract_date": None,
            "people": int(_f(row[23]) or 0) or None,     # kol-vo lits (fakt)
            "volume": _f(row[87]),        # Всего кол-во за воду (m3)
            "accrued": _f(row[86]),       # Всего начисленно С НДС
            "paid": _f(row[92]),          # Оплачено
            "debt_start": _f(row[69]),    # Задолж. на начало (Общий дебит)
            "debt": _f(row[93]),          # Задолж. на конец (Общий дебит)
            "penalty": _f(row[99]),       # Пения
            "correction": _f(row[79]),    # Корректировки Общая сумма
            "has_meter": meter_count > 0,
            "meter_count": meter_count or None,
            "meter_reading": _f(row[28]), # Показания
            "meter_start": None,
            "meter_end": None,
            "canal_volume": _f(row[88]),  # Всего кол-во за канализацию
            "canal_amount": _f(row[90]),  # Общие начисления за канализацию
            "tariff": str(row[20]).strip()[:50] if row[20] and str(row[20]).strip() else None,
            "accrual_type": str(row[22]).strip()[:50] if row[22] and str(row[22]).strip() else None,
            "consumer_status": str(row[101]).strip()[:50] if row[101] and str(row[101]).strip() else None,
            "last_payment": str(row[100]).strip()[:20] if row[100] and str(row[100]).strip() else None,
        })
    return rows


def _parse_registry(ws) -> list[dict]:
    rows = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        street, house = row[7], row[8]
        if not street or not str(street).strip():
            continue
        rows.append(_blank_row() | {
            "mahalla": str(row[6]).strip() if row[6] else None,
            "street": str(street).strip(),
            "house": norm_house(house) if house else "",
            "apartment": str(row[9]).strip() if row[9] and str(row[9]).strip() else None,
            "owner": str(row[11]).strip() if row[11] else None,
            "cadastre": str(row[0]).strip() if row[0] and str(row[0]).strip() else None,
            "contract_no": str(row[2]).strip() if row[2] and str(row[2]).strip() else None,
            "contract_date": str(row[1]).strip()[:20] if row[1] and str(row[1]).strip() else None,
            "pinfl": str(row[15]).strip() if row[15] and str(row[15]).strip() else None,
            "area": _f(row[25]),            # umumiy foydali maydon
            "living_area": _f(row[27]),     # yashash maydoni
            "property_value": _f(row[28]),  # kadastr qiymati
            "rooms": int(_f(row[29]) or 0) or None,
        })
    return rows


_ADDR_RE = re.compile(r"д\.?\s*([\w/]+)\s*кв\.?\s*(\w+)", re.I)


def _parse_readings(ws) -> list[dict]:
    """'12.1 ва 12.2' formati: shartnoma, manzil 'д.12/1 кв.1', ko'rsatkichlar."""
    rows = []
    for row in ws.iter_rows(min_row=3, values_only=True):
        addr = row[2]
        if not addr:
            continue
        m = _ADDR_RE.search(str(addr))
        if not m:
            continue
        rows.append(_blank_row() | {
            "street": "Зарбулок",  # bu hisobot faqat shu ko'cha uchun keladi
            "house": norm_house(m.group(1)),
            "apartment": m.group(2),
            "account": str(row[1]).strip() if row[1] else None,  # shartnoma raqami
            "contract_no": str(row[1]).strip() if row[1] else None,
            "volume": _f(row[5]),          # bir oylik iste'mol
            "meter_start": _f(row[3]),     # davr boshi ko'rsatkich
            "meter_end": _f(row[4]),       # davr oxiri ko'rsatkich
            "has_meter": True,
        })
    return rows


_SIMPLE_ALIASES = {
    "mahalla": ("mahalla", "махалля", "махалла"),
    "street": ("kocha", "ko'cha", "кўча", "улица", "street"),
    "house": ("uy", "дом", "house", "uy raqami"),
    "apartment": ("xonadon", "kvartira", "квартира", "kv"),
    "owner": ("egasi", "владелец", "owner", "fio", "f.i.o"),
    "account": ("hisob", "лиц.счет", "account", "schet"),
    "volume": ("hajm", "volume", "m3", "kwh", "sarf"),
    "accrued": ("hisoblangan", "начислено", "accrued"),
    "paid": ("tolangan", "to'langan", "оплачено", "paid"),
    "debt": ("qarz", "задолженность", "debt"),
}


def _parse_simple(ws) -> list[dict]:
    header = None
    header_row_idx = 0
    for i, row in enumerate(ws.iter_rows(min_row=1, max_row=5, values_only=True), start=1):
        cells = [norm_key(c) if c else "" for c in row]
        if any(any(a in c for a in _SIMPLE_ALIASES["street"]) for c in cells if c):
            header = cells
            header_row_idx = i
            break
    if not header:
        return []
    col: dict[str, int] = {}
    for field, aliases in _SIMPLE_ALIASES.items():
        for j, c in enumerate(header):
            if c and any(a in c for a in aliases):
                col[field] = j
                break
    if "street" not in col or "house" not in col:
        return []

    def cell(row, field):
        j = col.get(field)
        return row[j] if j is not None and j < len(row) else None

    rows = []
    for row in ws.iter_rows(min_row=header_row_idx + 1, values_only=True):
        street = cell(row, "street")
        if not street or not str(street).strip():
            continue
        apartment = cell(row, "apartment")
        rows.append(_blank_row() | {
            "mahalla": str(cell(row, "mahalla")).strip() if cell(row, "mahalla") else None,
            "street": str(street).strip(),
            "house": norm_house(cell(row, "house")) if cell(row, "house") else "",
            "apartment": str(apartment).strip() if apartment and str(apartment).strip() else None,
            "owner": str(cell(row, "owner")).strip() if cell(row, "owner") else None,
            "account": str(cell(row, "account")).strip() if cell(row, "account") else None,
            "volume": _f(cell(row, "volume")),
            "accrued": _f(cell(row, "accrued")),
            "paid": _f(cell(row, "paid")),
            "debt": _f(cell(row, "debt")),
        })
    return rows


def _detect_and_parse(content: bytes) -> tuple[str, list[dict]]:
    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    try:
        ws = wb.active
        head_rows = list(ws.iter_rows(min_row=1, max_row=5, values_only=True))
        head_text = " ".join(
            str(c) for row in head_rows for c in row if c is not None
        ).lower()

        if "лиц.счет" in head_text and "махалля" in head_text:
            return "f3", _parse_f3(ws)
        if "правообладатель" in head_text:
            return "registry", _parse_registry(ws)
        if "шартнома" in head_text:
            return "readings", _parse_readings(ws)
        parsed = _parse_simple(ws)
        if parsed:
            return "simple", parsed
        raise HTTPException(
            422,
            "Excel formati tanilmadi. Ustunlar orasida kamida "
            "'kocha/улица' va 'uy/дом' bo'lishi kerak.",
        )
    finally:
        wb.close()


# ─── Import ──────────────────────────────────────────────────────────────────

async def import_billing_file(
    content: bytes,
    filename: str,
    utility_type: str,
    period: str,
    admin: dict,
    only_mahalla: str | None = None,
) -> dict:
    if utility_type not in UTILITY_TYPES:
        raise HTTPException(422, "utility_type: water, gas yoki electricity")
    period_int = parse_period(period)

    fmt, parsed = await asyncio.to_thread(_detect_and_parse, content)

    # Asl faylni diskda saqlaymiz — kerak bo'lsa istalgan payt qayta o'qish
    # yoki boshqa ustunlarini olish mumkin (hech narsa yo'qolmaydi)
    ts_for_name = now_ts()
    safe_name = re.sub(r"[^\w.\-]+", "_", filename)[:120] or "hisobot.xlsx"
    saved_file = settings.billing_upload_dir / f"{ts_for_name}_{utility_type}_{safe_name}"
    saved_path = str(saved_file)
    await asyncio.to_thread(saved_file.write_bytes, content)

    if only_mahalla:
        key = norm_key(only_mahalla)
        parsed = [r for r in parsed if r["mahalla"] and norm_key(r["mahalla"]) == key]
    if not parsed:
        raise HTTPException(422, "Faylda import qilinadigan qator topilmadi")

    ts = now_ts()
    imported = 0
    buildings_created = 0

    async with SessionLocal() as session:
        # Keshlarni yuklab olamiz — 50k qatorli faylda har qatorga query yubormaslik uchun
        mahallas = {m.norm_key: m for m in (await session.scalars(select(Mahalla))).all()}
        streets = {(s.mahalla_id, s.norm_key): s for s in (await session.scalars(select(Street))).all()}
        # Mahallasiz hisobotlar (masalan hisoblagich ko'rsatkichlari) mavjud
        # ko'chani nomi bo'yicha topsin — dublikat ko'cha/bino yaratmaslik uchun
        streets_any = {s.norm_key: s for s in streets.values()}
        buildings = {
            (b.street_id, (b.house_no or "").lower()): b
            for b in (await session.scalars(select(Building).where(Building.street_id.isnot(None)))).all()
        }
        apartments = {
            (a.building_id, a.apartment_no.lower()): a
            for a in (await session.scalars(select(Apartment))).all()
        }

        # Shu davr + utility uchun eski yozuvlarni o'chirib qayta yozamiz
        # (bir xil faylni qayta yuklash xatosiz ishlashi uchun)
        if fmt != "registry":
            await session.execute(
                delete(UtilityBilling).where(
                    and_(
                        UtilityBilling.utility_type == utility_type,
                        UtilityBilling.period == period_int,
                    )
                )
            )

        def get_mahalla(name: str | None) -> Mahalla:
            display = (name or "Noma'lum").strip()
            key = norm_key(display)
            if key not in mahallas:
                m = Mahalla(name=display, norm_key=key, created_at=ts, updated_at=ts)
                session.add(m)
                mahallas[key] = m
            return mahallas[key]

        flush_needed = False
        # 1-bosqich: mahalla/ko'cha/bino/xonadon ierarxiyasini tayyorlash
        for r in parsed:
            skey = norm_key(r["street"])
            if r["mahalla"] is None and skey in streets_any:
                st = streets_any[skey]
                mah = next((m for m in mahallas.values() if m.id == st.mahalla_id), None)
                if mah is None:
                    mah = get_mahalla(None)
            else:
                mah = get_mahalla(r["mahalla"])
                if mah.id is None:
                    await session.flush()
                if (mah.id, skey) not in streets:
                    st = Street(mahalla_id=mah.id, name=r["street"], norm_key=skey,
                                created_at=ts, updated_at=ts)
                    session.add(st)
                    await session.flush()
                    streets[(mah.id, skey)] = st
                    streets_any.setdefault(skey, st)
                st = streets[(mah.id, skey)]

            hkey = (st.id, r["house"].lower())
            if hkey not in buildings:
                b = Building(
                    name=f"{st.name} {r['house']}-uy" if r["house"] else st.name,
                    street_id=st.id,
                    house_no=r["house"] or None,
                    mahalla_name=mah.name,
                    street_name=st.name,
                    created_at=ts,
                    updated_at=ts,
                )
                session.add(b)
                await session.flush()
                buildings[hkey] = b
                buildings_created += 1
            b = buildings[hkey]

            # Yakka xovli (kvartira raqami yo'q) ham xonadon sifatida saqlanadi
            # ('-' belgisi bilan) — egasi/hisob raqami yo'qolmasin
            apt_no = r["apartment"] or "-"
            akey = (b.id, apt_no.lower())
            if akey not in apartments:
                apt = Apartment(
                    building_id=b.id,
                    apartment_no=apt_no,
                    owner_name=r["owner"],
                    account_no=r["account"],
                    cadastre_code=r["cadastre"],
                    contract_no=r["contract_no"],
                    contract_date=r["contract_date"],
                    pinfl=r["pinfl"],
                    phone=r["phone"],
                    people_count=r["people"],
                    area_m2=r["area"],
                    living_area_m2=r["living_area"],
                    property_value=r["property_value"],
                    rooms=r["rooms"],
                    created_at=ts,
                    updated_at=ts,
                )
                session.add(apt)
                flush_needed = True
                apartments[akey] = apt
            else:
                apt = apartments[akey]
                # Har bir import mavjud xonadonni yangi ma'lumot bilan boyitadi
                for src_key, attr in (
                    ("owner", "owner_name"), ("account", "account_no"),
                    ("cadastre", "cadastre_code"), ("contract_no", "contract_no"),
                    ("contract_date", "contract_date"), ("pinfl", "pinfl"),
                    ("phone", "phone"), ("people", "people_count"),
                    ("area", "area_m2"), ("living_area", "living_area_m2"),
                    ("property_value", "property_value"), ("rooms", "rooms"),
                ):
                    if r[src_key] and not getattr(apt, attr):
                        setattr(apt, attr, r[src_key])
                        apt.updated_at = ts
            r["_building"] = b
            r["_apartment"] = apt

        if flush_needed:
            await session.flush()

        # 2-bosqich: billing yozuvlari (registry format faqat xonadonlarni to'ldiradi)
        skipped = 0
        if fmt != "registry":
            seen: set[tuple] = set()
            for r in parsed:
                has_metrics = any(
                    r[k] is not None
                    for k in ("volume", "accrued", "paid", "debt", "debt_start",
                              "penalty", "meter_reading", "meter_end")
                )
                if not has_metrics:
                    skipped += 1
                    continue
                apt = r["_apartment"]
                dedupe_key = (r["_building"].id, apt.id if apt else None)
                if dedupe_key in seen:
                    skipped += 1
                    continue
                seen.add(dedupe_key)
                session.add(
                    UtilityBilling(
                        building_id=r["_building"].id,
                        apartment_id=apt.id if apt else None,
                        utility_type=utility_type,
                        period=period_int,
                        volume=r["volume"],
                        accrued=r["accrued"],
                        paid=r["paid"],
                        debt_start=r["debt_start"],
                        debt=r["debt"],
                        penalty=r["penalty"],
                        correction=r["correction"],
                        has_meter=r["has_meter"],
                        meter_count=r["meter_count"],
                        meter_reading=r["meter_reading"],
                        meter_reading_start=r["meter_start"],
                        meter_reading_end=r["meter_end"],
                        canal_volume=r["canal_volume"],
                        canal_amount=r["canal_amount"],
                        people_count=r["people"],
                        tariff=r["tariff"],
                        accrual_type=r["accrual_type"],
                        consumer_status=r["consumer_status"],
                        last_payment_date=r["last_payment"],
                        created_at=ts,
                    )
                )
                imported += 1
        else:
            imported = len(parsed)

        record = BillingImport(
            filename=filename,
            utility_type=utility_type,
            period=period_int,
            fmt=fmt,
            rows_total=len(parsed),
            rows_imported=imported,
            rows_skipped=skipped,
            buildings_created=buildings_created,
            file_path=saved_path,
            created_by_username=admin.get("username"),
            created_at=ts,
        )
        session.add(record)
        await session.commit()
        await session.refresh(record)

    return {
        "ok": True,
        "format": fmt,
        "rows_total": len(parsed),
        "rows_imported": imported,
        "buildings_created": buildings_created,
        "import_id": record.id,
    }


# ─── So'rovlar ───────────────────────────────────────────────────────────────

async def list_imports(limit: int = 50) -> dict:
    async with SessionLocal() as session:
        rows = (
            await session.scalars(
                select(BillingImport).order_by(BillingImport.id.desc()).limit(limit)
            )
        ).all()
    return {"imports": [model_to_dict(r) for r in rows]}


async def billing_summary(period: str, utility_type: str | None = None) -> dict:
    """Domlar kesimida sarf: hajm, hisoblangan, to'langan, qarz."""
    period_int = parse_period(period)
    async with SessionLocal() as session:
        stmt = (
            select(
                UtilityBilling.building_id,
                UtilityBilling.utility_type,
                Building.name.label("building_name"),
                Building.house_no,
                Building.mahalla_name,
                Building.street_name,
                func.count(UtilityBilling.id).label("apartments"),
                func.sum(UtilityBilling.volume).label("volume"),
                func.sum(UtilityBilling.accrued).label("accrued"),
                func.sum(UtilityBilling.paid).label("paid"),
                func.sum(UtilityBilling.debt_start).label("debt_start"),
                func.sum(UtilityBilling.debt).label("debt"),
                func.sum(UtilityBilling.penalty).label("penalty"),
                func.sum(UtilityBilling.people_count).label("people"),
            )
            .join(Building, Building.id == UtilityBilling.building_id)
            .where(UtilityBilling.period == period_int)
            .group_by(
                UtilityBilling.building_id,
                UtilityBilling.utility_type,
                Building.name,
                Building.house_no,
                Building.mahalla_name,
                Building.street_name,
            )
            .order_by(func.sum(UtilityBilling.volume).desc())
        )
        if utility_type:
            stmt = stmt.where(UtilityBilling.utility_type == utility_type)
        rows = [dict(r) for r in (await session.execute(stmt)).mappings().all()]
    return {"period": period, "buildings": rows, "total": len(rows)}


async def billing_top_consumers(
    period: str, utility_type: str, limit: int = 20
) -> dict:
    """Eng ko'p ishlatgan xonadonlar."""
    period_int = parse_period(period)
    async with SessionLocal() as session:
        stmt = (
            select(
                UtilityBilling.volume,
                UtilityBilling.accrued,
                UtilityBilling.paid,
                UtilityBilling.debt,
                UtilityBilling.penalty,
                UtilityBilling.people_count,
                UtilityBilling.has_meter,
                Apartment.apartment_no,
                Apartment.owner_name,
                Apartment.account_no,
                Building.id.label("building_id"),
                Building.name.label("building_name"),
            )
            .join(Apartment, Apartment.id == UtilityBilling.apartment_id)
            .join(Building, Building.id == UtilityBilling.building_id)
            .where(
                and_(
                    UtilityBilling.period == period_int,
                    UtilityBilling.utility_type == utility_type,
                    UtilityBilling.volume.isnot(None),
                )
            )
            .order_by(UtilityBilling.volume.desc())
            .limit(limit)
        )
        rows = [dict(r) for r in (await session.execute(stmt)).mappings().all()]
    return {"period": period, "utility_type": utility_type, "top": rows}


async def building_billing(building_id: int, period: str | None = None) -> dict:
    """Bitta dom bo'yicha xonadonlar sarfi."""
    async with SessionLocal() as session:
        stmt = (
            select(
                UtilityBilling.utility_type,
                UtilityBilling.period,
                UtilityBilling.volume,
                UtilityBilling.accrued,
                UtilityBilling.paid,
                UtilityBilling.debt,
                UtilityBilling.penalty,
                UtilityBilling.people_count,
                UtilityBilling.has_meter,
                Apartment.apartment_no,
                Apartment.owner_name,
            )
            .outerjoin(Apartment, Apartment.id == UtilityBilling.apartment_id)
            .where(UtilityBilling.building_id == building_id)
            .order_by(UtilityBilling.period.desc(), UtilityBilling.volume.desc())
        )
        if period:
            stmt = stmt.where(UtilityBilling.period == parse_period(period))
        rows = [dict(r) for r in (await session.execute(stmt)).mappings().all()]

        apartments = (
            await session.scalars(
                select(Apartment).where(Apartment.building_id == building_id).order_by(Apartment.apartment_no)
            )
        ).all()
    return {
        "building_id": building_id,
        "billings": rows,
        "apartments": [model_to_dict(a) for a in apartments],
    }


async def billing_periods() -> dict:
    """Mavjud davrlar ro'yxati (filtr uchun)."""
    async with SessionLocal() as session:
        rows = (
            await session.execute(
                select(UtilityBilling.period, UtilityBilling.utility_type)
                .distinct()
                .order_by(UtilityBilling.period.desc())
            )
        ).all()
    return {
        "periods": [
            {"period": f"{p // 100:04d}-{p % 100:02d}", "utility_type": u} for p, u in rows
        ]
    }
