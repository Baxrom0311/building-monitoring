from typing import Optional

from pydantic import BaseModel


class EnergyBucketResponse(BaseModel):
    bucket_ts: int
    building_id: Optional[int] = None
    energy_kwh_delta: Optional[float] = None
    energy_kwh_max: Optional[float] = None
    avg_power_w: Optional[float] = None
    samples: int
    building_name: str


class EnergyByBuildingResponse(BaseModel):
    from_ts: int
    to_ts: int
    granularity: str
    total: int
    data: list[EnergyBucketResponse]


class BuildingEnergySummaryItem(BaseModel):
    building_id: Optional[int] = None
    building_name: str
    total_energy_kwh: Optional[float] = None
    avg_power_w: Optional[float] = None
    readings: int


class BuildingsEnergySummaryResponse(BaseModel):
    summary: list[BuildingEnergySummaryItem]
    days: int


class SummaryResponse(BaseModel):
    devices_total: int
    devices_online: int
    devices_offline: int
    alerts_active: int
    reads_last_hour: int
    total_energy_kwh: float
    buildings: int
    measurement_points: int
    ws_clients: int


class HourlyUtilityStatResponse(BaseModel):
    id: int
    bucket_ts: int
    building_id: Optional[int] = None
    point_id: Optional[int] = None
    device_id: str
    utility_type: str
    samples: int
    avg_voltage_l1: Optional[float] = None
    avg_power_w: Optional[float] = None
    max_energy_kwh: Optional[float] = None
    avg_pressure_bar: Optional[float] = None
    avg_pressure_bottom_bar: Optional[float] = None
    avg_pressure_top_bar: Optional[float] = None
    avg_flow_rate: Optional[float] = None
    max_volume_m3: Optional[float] = None
    avg_humidity: Optional[float] = None
    avg_air_quality: Optional[float] = None  # Havo sifati o'rtachasi (%) — ilgari javobdan tushib qolardi
    avg_level: Optional[float] = None
    min_level: Optional[float] = None
    max_level: Optional[float] = None
    avg_temperature_in_c: Optional[float] = None
    avg_temperature_out_c: Optional[float] = None
    created_at: Optional[int] = None
    updated_at: Optional[int] = None


class HourlyUtilityStatsResponse(BaseModel):
    stats: list[HourlyUtilityStatResponse]
    hours: int
    total: int


class AnalyticsAggregateResponse(BaseModel):
    ok: bool
    hours: int
    buckets: int


class DeviceReadingStatsResponse(BaseModel):
    stats: list[dict]
    hours: int


class BuildingElectricityAnalyticsResponse(BaseModel):
    samples: int
    energy_kwh: Optional[float] = None
    avg_power_w: Optional[float] = None
    max_power_w: Optional[float] = None
    avg_voltage_l1: Optional[float] = None


class BuildingWaterAnalyticsResponse(BaseModel):
    samples: int
    avg_pressure_bottom_bar: Optional[float] = None
    avg_pressure_top_bar: Optional[float] = None
    avg_pressure_delta_bar: Optional[float] = None
    top_pressure_problem_count: Optional[int] = None


class BuildingGasAnalyticsResponse(BaseModel):
    samples: int
    avg_pressure_bar: Optional[float] = None
    min_pressure_bar: Optional[float] = None
    max_pressure_bar: Optional[float] = None


class BuildingSoilAnalyticsResponse(BaseModel):
    samples: int
    avg_humidity: Optional[float] = None
    min_humidity: Optional[float] = None
    max_humidity: Optional[float] = None


class BuildingSoundAnalyticsResponse(BaseModel):
    samples: int
    avg_level: Optional[float] = None
    min_level: Optional[float] = None
    max_level: Optional[float] = None


class BuildingAnalyticsResponse(BaseModel):
    building_id: int
    hours: int
    active_alerts: int
    electricity: BuildingElectricityAnalyticsResponse
    water: BuildingWaterAnalyticsResponse
    gas: BuildingGasAnalyticsResponse
    soil: BuildingSoilAnalyticsResponse
    sound: BuildingSoundAnalyticsResponse
