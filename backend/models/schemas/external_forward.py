from typing import Optional

from pydantic import BaseModel

from .enums import UtilityType

# ── Tashqi tizimga (masalan 195.158.8.44:7000) sensor forward mapping ──────────


class ExternalForwardCreate(BaseModel):
    building_id: int
    utility_type: UtilityType
    # air_quality uchun ikki jismonan alohida manbani ajratish: masalan
    # "capacitive_soil_moisture" (yerto'la MQ135) yoki "microphone" (yo'lak MQ135).
    # Boshqa utility_type'lar uchun bo'sh qoldiring.
    sensor_type: Optional[str] = None
    # electricity uchun qaysi ustun yuborilishini tanlaydi: bo'sh = kuchlanish,
    # "energy_kwh" = sarflangan energiya. Boshqa utility_type'lar uchun bo'sh qoldiring.
    metric: Optional[str] = None
    external_token: str
    external_device: str
    is_active: bool = True


class ExternalForwardUpdate(BaseModel):
    sensor_type: Optional[str] = None
    metric: Optional[str] = None
    external_token: Optional[str] = None
    external_device: Optional[str] = None
    is_active: Optional[bool] = None


class ExternalForwardResponse(BaseModel):
    id: int
    building_id: int
    utility_type: str
    sensor_type: Optional[str] = None
    metric: Optional[str] = None
    external_token: str
    external_device: str
    is_active: bool
    last_sent_at: Optional[int] = None
    last_sent_value: Optional[float] = None
    last_error: Optional[str] = None


class ExternalForwardTestResponse(BaseModel):
    ok: bool
    value: Optional[float] = None
    error: Optional[str] = None
