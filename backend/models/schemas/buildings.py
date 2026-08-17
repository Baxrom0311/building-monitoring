from typing import Optional

from pydantic import BaseModel, Field

from .enums import BuildingUtilityStatus, MeasurementRole, UtilityType


class BuildingCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    address: Optional[str] = Field(None, max_length=500)
    maps_url: Optional[str] = Field(None, max_length=1000)
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    floors: int = Field(4, ge=1)
    entrances_count: int = Field(3, ge=1)
    description: Optional[str] = None
    # O'zimizdan qo'shimcha
    image_url: Optional[str] = Field(None, max_length=1000)
    total_apartments: Optional[int] = Field(None, ge=1)
    construction_year: Optional[int] = Field(None, ge=1800, le=2100)
    # Urganchshahar integratsiya
    organization_name: Optional[str] = Field(None, max_length=255)
    mahalla_name: Optional[str] = Field(None, max_length=255)
    street_name: Optional[str] = Field(None, max_length=255)
    object_type: Optional[str] = Field(None, max_length=255)
    polygon_coordinate: Optional[str] = None
    is_official: Optional[bool] = None
    ext_sensor_temp_out: Optional[float] = None
    ext_sensor_temp_in: Optional[float] = None
    ext_sensor_pressure: Optional[str] = Field(None, max_length=50)
    ext_sensor_online: Optional[bool] = None
    ext_sensor_updated_at: Optional[str] = Field(None, max_length=100)


class BuildingUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    address: Optional[str] = Field(None, max_length=500)
    maps_url: Optional[str] = Field(None, max_length=1000)
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    floors: Optional[int] = Field(None, ge=1)
    entrances_count: Optional[int] = Field(None, ge=1)
    description: Optional[str] = None
    is_active: Optional[bool] = None
    # O'zimizdan qo'shimcha
    image_url: Optional[str] = Field(None, max_length=1000)
    total_apartments: Optional[int] = Field(None, ge=1)
    construction_year: Optional[int] = Field(None, ge=1800, le=2100)
    # Urganchshahar integratsiya
    organization_name: Optional[str] = Field(None, max_length=255)
    # mahalla_name/street_name atayin yo'q: bir marta o'rnatiladi (import
    # paytida) va boshqa o'zgartirilmaydi.
    object_type: Optional[str] = Field(None, max_length=255)
    polygon_coordinate: Optional[str] = None
    is_official: Optional[bool] = None
    ext_sensor_temp_out: Optional[float] = None
    ext_sensor_temp_in: Optional[float] = None
    ext_sensor_pressure: Optional[str] = Field(None, max_length=50)
    ext_sensor_online: Optional[bool] = None
    ext_sensor_updated_at: Optional[str] = Field(None, max_length=100)


class BuildingUtilityCreate(BaseModel):
    building_id: int
    utility_type: UtilityType
    name: Optional[str] = None
    status: BuildingUtilityStatus = BuildingUtilityStatus.active


class BuildingUtilityUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[BuildingUtilityStatus] = None


class BuildingDefaultProvision(BaseModel):
    electricity_device_id: Optional[str] = None
    water_device_id: Optional[str] = None
    gas_device_id: Optional[str] = None
    top_floor: Optional[int] = None


class PremiseCreate(BaseModel):
    building_id: int
    number: str
    floor: Optional[int] = None
    premise_type: str = "apartment"


class MeasurementPointCreate(BaseModel):
    name: Optional[str] = None
    utility_type: UtilityType = UtilityType.electricity
    role: MeasurementRole = MeasurementRole.electricity_main_meter
    sensor_type: Optional[str] = None
    converter_type: Optional[str] = None
    location_name: Optional[str] = None
    building_id: Optional[int] = None
    utility_module_id: Optional[int] = None
    premise_id: Optional[int] = None
    parent_id: Optional[int] = None
    device_id: Optional[str] = None
    meter_serial: Optional[str] = None
    floor: Optional[int] = None


class MeasurementPointUpdate(BaseModel):
    name: Optional[str] = None
    utility_type: Optional[UtilityType] = None
    role: Optional[MeasurementRole] = None
    sensor_type: Optional[str] = None
    converter_type: Optional[str] = None
    location_name: Optional[str] = None
    building_id: Optional[int] = None
    utility_module_id: Optional[int] = None
    premise_id: Optional[int] = None
    parent_id: Optional[int] = None
    device_id: Optional[str] = None
    meter_serial: Optional[str] = None
    floor: Optional[int] = None
    is_active: Optional[bool] = None


class MeasurementPointDeviceBind(BaseModel):
    device_id: str


class BuildingResponse(BaseModel):
    id: int
    name: str
    address: Optional[str] = None
    maps_url: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    floors: int
    entrances_count: int
    description: Optional[str] = None
    is_active: bool
    created_at: Optional[int] = None
    updated_at: Optional[int] = None
    # O'zimizdan qo'shimcha
    image_url: Optional[str] = None
    total_apartments: Optional[int] = None
    construction_year: Optional[int] = None
    # Urganchshahar integratsiya
    organization_name: Optional[str] = None
    mahalla_name: Optional[str] = None
    street_name: Optional[str] = None
    object_type: Optional[str] = None
    polygon_coordinate: Optional[str] = None
    is_official: Optional[bool] = None
    ext_sensor_temp_out: Optional[float] = None
    ext_sensor_temp_in: Optional[float] = None
    ext_sensor_pressure: Optional[str] = None
    ext_sensor_online: Optional[bool] = None
    ext_sensor_updated_at: Optional[str] = None


class BuildingCreateResponse(BaseModel):
    ok: bool
    id: int


class BuildingListResponse(BaseModel):
    buildings: list[BuildingResponse]


class BuildingUpdateResponse(BaseModel):
    ok: bool


class BuildingDeleteResponse(BaseModel):
    ok: bool


class BuildingUtilityResponse(BaseModel):
    id: int
    building_id: int
    utility_type: str
    name: Optional[str] = None
    status: str
    created_at: Optional[int] = None
    updated_at: Optional[int] = None


class BuildingUtilityCreateResponse(BaseModel):
    ok: bool
    id: int


class BuildingUtilityListResponse(BaseModel):
    utilities: list[BuildingUtilityResponse]


class BuildingUtilityUpdateResponse(BaseModel):
    ok: bool


class PremiseResponse(BaseModel):
    id: int
    building_id: int
    number: str
    floor: Optional[int] = None
    premise_type: str
    created_at: Optional[int] = None
    updated_at: Optional[int] = None


class PremiseCreateResponse(BaseModel):
    ok: bool
    id: int


class PremiseListResponse(BaseModel):
    premises: list[PremiseResponse]


class MeasurementPointResponse(BaseModel):
    id: int
    building_id: Optional[int] = None
    utility_module_id: Optional[int] = None
    premise_id: Optional[int] = None
    parent_id: Optional[int] = None
    device_id: Optional[str] = None
    name: Optional[str] = None
    utility_type: str
    role: str
    sensor_type: Optional[str] = None
    converter_type: Optional[str] = None
    location_name: Optional[str] = None
    meter_serial: Optional[str] = None
    floor: Optional[int] = None
    is_active: bool
    created_at: Optional[int] = None
    updated_at: Optional[int] = None


class MeasurementPointCreateResponse(BaseModel):
    ok: bool
    id: int


class MeasurementPointListResponse(BaseModel):
    points: list[MeasurementPointResponse]


class MeasurementPointUpdateResponse(BaseModel):
    ok: bool


class BuildingDefaultProvisionResponse(BaseModel):
    ok: bool
    building_id: int
    utilities: list[BuildingUtilityResponse]
    created_points: list[MeasurementPointResponse]
    existing_points: list[MeasurementPointResponse]
