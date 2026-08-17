from typing import Optional

from pydantic import AliasChoices, BaseModel, Field

from .enums import DeviceRole, FirmwareMode, UtilityType


class DeviceRegister(BaseModel):
    device_id: str
    provisioning_token: Optional[str] = None
    name: Optional[str] = None
    utility_type: Optional[UtilityType] = None
    device_role: Optional[DeviceRole] = None
    firmware_mode: FirmwareMode = FirmwareMode.auto
    meter_type: Optional[str] = None
    sensor_type: Optional[str] = None
    meter_serial: Optional[str] = None
    is_test_device: Optional[bool] = None
    serial_number: Optional[str] = None
    hardware_version: Optional[str] = None
    software_version: Optional[str] = None
    build_number: Optional[str] = None
    baud_rate: Optional[int] = 9600
    chip_model: Optional[str] = None
    rssi: Optional[int] = None
    fw_version: Optional[str] = None
    building_id: Optional[int] = None
    point_id: Optional[int] = None


class DeviceCreate(BaseModel):
    device_id: str = Field(..., min_length=1, max_length=128)
    name: Optional[str] = None
    utility_type: UtilityType = UtilityType.electricity
    device_role: Optional[DeviceRole] = None
    firmware_mode: FirmwareMode = FirmwareMode.auto
    meter_type: Optional[str] = "unknown"
    meter_serial: Optional[str] = None
    serial_number: Optional[str] = None
    hardware_version: Optional[str] = None
    software_version: Optional[str] = None
    build_number: Optional[str] = None
    building_id: Optional[int] = None
    point_id: Optional[int] = None
    is_active: bool = True


class DeviceProvisioningTokenCreate(BaseModel):
    device_id: Optional[str] = None
    building_id: Optional[int] = None
    point_id: Optional[int] = None
    utility_type: Optional[UtilityType] = None
    device_role: Optional[DeviceRole] = None
    firmware_mode: Optional[FirmwareMode] = None
    ttl_sec: int = Field(86400, ge=60, le=2592000)


class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    building: Optional[str] = None
    floor: Optional[str] = None
    room: Optional[str] = None
    group_name: Optional[str] = None
    utility_type: Optional[UtilityType] = None
    device_role: Optional[DeviceRole] = None
    firmware_mode: Optional[FirmwareMode] = None
    hardware_version: Optional[str] = None
    software_version: Optional[str] = None
    build_number: Optional[str] = None
    building_id: Optional[int] = None
    point_id: Optional[int] = None
    is_active: Optional[bool] = None
    is_test_device: Optional[bool] = None


class DeviceTokenResponse(BaseModel):
    device_id: str
    device_token: str
    token_type: str = "device"


class DeviceRegisterResponse(BaseModel):
    ok: bool
    device_id: str
    provisioned: bool
    device_token: Optional[str] = None
    token_type: Optional[str] = None


class DeviceStatusResponse(BaseModel):
    ok: bool


class DeviceConfigIntervalsResponse(BaseModel):
    telemetry_sec: int
    status_sec: int
    command_poll_sec: int


class DeviceConfigServerResponse(BaseModel):
    url: str
    priority: int
    enabled: bool


class DeviceConfigEndpointsResponse(BaseModel):
    register_: str = Field(alias="register")
    readings: str
    status: str
    commands: str
    ota_check: str


class DeviceConfigResponse(BaseModel):
    device_id: str
    registered: bool
    firmware_mode: str
    utility_type: str
    device_role: Optional[str] = None
    building_id: Optional[int] = None
    building: Optional[dict] = None
    measurement_point_id: Optional[int] = None
    measurement_point: Optional[dict] = None
    hardware_version: Optional[str] = None
    software_version: Optional[str] = None
    token_required: bool
    intervals: DeviceConfigIntervalsResponse
    servers: list[DeviceConfigServerResponse]
    endpoints: DeviceConfigEndpointsResponse


class DeviceResponse(BaseModel):
    id: str
    building_id: Optional[int] = None
    point_id: Optional[int] = None
    name: Optional[str] = None
    utility_type: str
    device_role: Optional[str] = None
    firmware_mode: str
    meter_type: Optional[str] = None
    meter_serial: Optional[str] = None
    previous_meter_serial: Optional[str] = None
    meter_changed_at: Optional[int] = None
    needs_rebind: bool = False
    is_test_device: bool = False
    auto_cleanup_at: Optional[int] = None
    serial_number: Optional[str] = None
    hardware_version: Optional[str] = None
    software_version: Optional[str] = None
    build_number: Optional[str] = None
    token_created_at: Optional[int] = None
    token_revoked_at: Optional[int] = None
    token_revoked_by_user_id: Optional[int] = None
    token_revoked_by_username: Optional[str] = None
    baud_rate: Optional[int] = None
    chip_model: Optional[str] = None
    rssi: Optional[int] = None
    fw_version: Optional[str] = None
    # Entity uses building_text/floor_text (Python attrs) mapped to "building"/"floor" DB columns
    building: Optional[str] = Field(None, validation_alias=AliasChoices("building", "building_text"))
    floor: Optional[str] = Field(None, validation_alias=AliasChoices("floor", "floor_text"))
    room: Optional[str] = None
    group_name: Optional[str] = None
    is_active: bool
    last_seen: Optional[int] = None
    registered: Optional[int] = None
    created_at: Optional[int] = None
    updated_at: Optional[int] = None
    online: Optional[bool] = None


class DeviceListResponse(BaseModel):
    devices: list[DeviceResponse]
    total: int
    limit: Optional[int] = None
    offset: int = 0


class DeviceCreateResponse(BaseModel):
    ok: bool
    device: DeviceResponse


class DeviceUpdateResponse(BaseModel):
    ok: bool


class DeviceTokenRevokeResponse(BaseModel):
    ok: bool
    device_id: str
    token_revoked_at: Optional[int] = None


class DeviceProvisioningTokenResponse(BaseModel):
    id: int
    device_id: Optional[str] = None
    building_id: Optional[int] = None
    point_id: Optional[int] = None
    utility_type: Optional[str] = None
    device_role: Optional[str] = None
    firmware_mode: Optional[str] = None
    expires_at: int
    used_at: Optional[int] = None
    used_by_device_id: Optional[str] = None
    revoked_at: Optional[int] = None
    revoked_by_user_id: Optional[int] = None
    revoked_by_username: Optional[str] = None
    created_by_user_id: Optional[int] = None
    created_by_username: Optional[str] = None
    created_at: Optional[int] = None


class DeviceProvisioningTokenCreateResponse(BaseModel):
    ok: bool
    id: int
    provisioning_token: str
    expires_at: int
    device_id: Optional[str] = None
    building_id: Optional[int] = None
    point_id: Optional[int] = None
    utility_type: Optional[str] = None
    device_role: Optional[str] = None
    firmware_mode: Optional[str] = None


class DeviceProvisioningTokenListResponse(BaseModel):
    tokens: list[DeviceProvisioningTokenResponse]


class DeviceProvisioningTokenRevokeResponse(BaseModel):
    ok: bool
    token: DeviceProvisioningTokenResponse
