from typing import Optional

from pydantic import BaseModel, Field

from .buildings import MeasurementPointResponse
from .devices import DeviceResponse
from .enums import UtilityType


class MeterReading(BaseModel):
    device_id: str
    # RS-485 bridge o'zi nomidan yuborganda leaf sensorining asl MAC'i — faqat
    # traceability uchun (alohida qurilma yaratmaydi).
    source_id: Optional[str] = None
    reading_id: Optional[str] = None
    sequence_no: Optional[int] = None
    building_id: Optional[int] = None
    point_id: Optional[int] = None
    # None = qurilmaning DB dagi utility_type i ishlatiladi (default electricity
    # bo'lsa, faqat status ping yuborgan water/gas qurilma electricity ga aylanib qolardi)
    utility_type: Optional[UtilityType] = None
    sensor_type: Optional[str] = None
    meter_serial: Optional[str] = None
    is_test_device: Optional[bool] = None
    fw_version: Optional[str] = None
    software_version: Optional[str] = None
    hardware_version: Optional[str] = None
    # Firmware NTP vaqti (ISO-8601 yoki epoch) — offline buferdan kelgan
    # readinglar server vaqti bilan emas, o'z vaqti bilan saqlanishi uchun
    timestamp: Optional[str | int] = None
    lora_rssi: Optional[int] = None

    voltage_l1: Optional[float] = None
    voltage_l2: Optional[float] = None
    voltage_l3: Optional[float] = None
    current_l1: Optional[float] = None
    current_l2: Optional[float] = None
    current_l3: Optional[float] = None
    power_w: Optional[float] = None
    power_var: Optional[float] = None
    frequency: Optional[float] = None
    pf: Optional[float] = None
    energy_kwh: Optional[float] = None
    energy_t1: Optional[float] = None
    energy_t2: Optional[float] = None
    energy_t3: Optional[float] = None
    energy_t4: Optional[float] = None
    relay_on: Optional[bool] = None

    pressure_bar: Optional[float] = None
    pressure_bottom_bar: Optional[float] = None
    pressure_top_bar: Optional[float] = None
    flow_rate: Optional[float] = None
    volume_m3: Optional[float] = None
    temperature_c: Optional[float] = None
    temperature_in_c: Optional[float] = None   # Qozonxona kirish suvi (DS18B20)
    temperature_out_c: Optional[float] = None  # Qozonxona chiqish suvi (DS18B20)

    humidity: Optional[float] = None
    air_quality: Optional[float] = None
    air_pct: Optional[float] = None
    level: Optional[float] = None  # Ovoz darajasi (0–100%)


class MeterReadingBatch(BaseModel):
    device_id: Optional[str] = None
    readings: list[MeterReading]


class TestDeviceSimulationRequest(BaseModel):
    device_id: str = Field(..., min_length=1, max_length=128)
    meter_serial: str = Field("202032000525", min_length=1, max_length=128)
    utility_type: UtilityType = UtilityType.electricity
    energy_kwh: Optional[float] = 1.0
    production_guard_only: bool = False


class TestDeviceSimulationResponse(BaseModel):
    ok: bool
    saved: bool
    guarded: bool
    message: str
    ts: Optional[int] = None
    device: Optional[DeviceResponse] = None


class ReadingResponse(BaseModel):
    id: int
    device_id: str
    reading_id: Optional[str] = None
    sequence_no: Optional[int] = None
    building_id: Optional[int] = None
    point_id: Optional[int] = None
    utility_type: str
    source_id: Optional[str] = None
    sensor_type: Optional[str] = None
    meter_serial: Optional[str] = None
    ts: int
    voltage_l1: Optional[float] = None
    voltage_l2: Optional[float] = None
    voltage_l3: Optional[float] = None
    current_l1: Optional[float] = None
    current_l2: Optional[float] = None
    current_l3: Optional[float] = None
    power_w: Optional[float] = None
    power_var: Optional[float] = None
    frequency: Optional[float] = None
    pf: Optional[float] = None
    energy_kwh: Optional[float] = None
    energy_t1: Optional[float] = None
    energy_t2: Optional[float] = None
    energy_t3: Optional[float] = None
    energy_t4: Optional[float] = None
    relay_on: Optional[bool] = None
    pressure_bar: Optional[float] = None
    pressure_bottom_bar: Optional[float] = None
    pressure_top_bar: Optional[float] = None
    flow_rate: Optional[float] = None
    volume_m3: Optional[float] = None
    temperature_c: Optional[float] = None
    temperature_in_c: Optional[float] = None
    temperature_out_c: Optional[float] = None
    humidity: Optional[float] = None
    air_quality: Optional[float] = None  # Havo sifati / MQ135 (%) — ilgari javobdan tushib qolardi
    level: Optional[float] = None
    raw_payload: Optional[str] = None
    created_at: Optional[int] = None


class ReadingIngestResponse(BaseModel):
    ok: bool
    ts: int


class ReadingBatchErrorResponse(BaseModel):
    index: int
    error: str


class ReadingBatchResponse(BaseModel):
    ok: bool
    accepted: int
    skipped: int
    errors: list[ReadingBatchErrorResponse]
    last_ts: Optional[int] = None


class ReadingHistoryResponse(BaseModel):
    readings: list[ReadingResponse]
    total: int
    page: int
    pages: int


class MeasurementPointLatestResponse(MeasurementPointResponse):
    latest_reading: Optional[ReadingResponse] = None


class BuildingLatestReadingsResponse(BaseModel):
    building_id: int
    points: list[MeasurementPointLatestResponse]


class BuildingReadingHistoryResponse(ReadingHistoryResponse):
    building_id: int
