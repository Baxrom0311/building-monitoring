from typing import Optional

from pydantic import BaseModel, Field

from .enums import DeviceRole, FirmwareMode, UtilityType


class OtaInstallReport(BaseModel):
    device_id: str
    firmware_id: Optional[int] = None
    from_version: Optional[str] = None
    target_version: Optional[str] = None
    status: str = Field(..., pattern="^(started|success|failed|rolled_back)$")
    message: Optional[str] = None


class FirmwareCompatibilityResponse(BaseModel):
    id: int
    firmware_id: int
    utility_type: Optional[str] = None
    firmware_mode: Optional[str] = None
    device_role: Optional[str] = None
    hardware_version: Optional[str] = None
    sensor_type: Optional[str] = None
    converter_type: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[int] = None


class FirmwareResponse(BaseModel):
    id: int
    filename: str
    version: str
    hardware_version: Optional[str] = None
    firmware_mode: str
    device_role: Optional[str] = None
    utility_type: Optional[str] = None
    sensor_type: Optional[str] = None
    converter_type: Optional[str] = None
    size: Optional[int] = None
    sha256: Optional[str] = None
    uploaded: Optional[int] = None
    active: bool
    is_stable: bool
    min_version: Optional[str] = None
    rollout_percentage: int
    notes: Optional[str] = None
    description: Optional[str] = None
    release_notes: Optional[str] = None
    compatibility_notes: Optional[str] = None
    compatibilities: list[FirmwareCompatibilityResponse] = Field(default_factory=list)
    url: str


class FirmwareUploadResponse(FirmwareResponse):
    ok: bool


class FirmwareListResponse(BaseModel):
    firmware: list[FirmwareResponse]


class FirmwareCheckResponse(BaseModel):
    update: bool
    id: Optional[int] = None
    filename: Optional[str] = None
    version: Optional[str] = None
    hardware_version: Optional[str] = None
    firmware_mode: Optional[str] = None
    device_role: Optional[str] = None
    utility_type: Optional[str] = None
    sensor_type: Optional[str] = None
    converter_type: Optional[str] = None
    size: Optional[int] = None
    sha256: Optional[str] = None
    uploaded: Optional[int] = None
    active: Optional[bool] = None
    is_stable: Optional[bool] = None
    min_version: Optional[str] = None
    rollout_percentage: Optional[int] = None
    notes: Optional[str] = None
    description: Optional[str] = None
    release_notes: Optional[str] = None
    compatibility_notes: Optional[str] = None
    compatibilities: list[FirmwareCompatibilityResponse] = Field(default_factory=list)
    url: Optional[str] = None


class FirmwareInstallEventResponse(BaseModel):
    id: int
    device_id: str
    firmware_id: Optional[int] = None
    from_version: Optional[str] = None
    target_version: Optional[str] = None
    status: str
    message: Optional[str] = None
    ts: int
    created_at: Optional[int] = None


class FirmwareInstallEventListResponse(BaseModel):
    events: list[FirmwareInstallEventResponse]
    total: int


class OtaReportResponse(BaseModel):
    ok: bool
    id: int
    ts: int


class OTABatchCreate(BaseModel):
    name: str
    firmware_id: int
    device_ids: list[str]
    devices_per_hour: int = Field(100, ge=1, le=10000)
    scheduled_at: Optional[int] = None


class OTABatchDeviceResponse(BaseModel):
    id: int
    batch_id: int
    device_id: str
    status: str
    notified_at: Optional[int] = None
    completed_at: Optional[int] = None
    previous_version: Optional[str] = None
    error_message: Optional[str] = None
    retry_count: int
    created_at: Optional[int] = None
    updated_at: Optional[int] = None


class OTABatchResponse(BaseModel):
    id: int
    name: str
    firmware_id: int
    status: str
    devices_per_hour: int
    scheduled_at: Optional[int] = None
    started_at: Optional[int] = None
    completed_at: Optional[int] = None
    total_devices: int
    success_count: int
    failure_count: int
    skipped_count: int
    created_by_user_id: Optional[int] = None
    created_by_username: Optional[str] = None
    created_at: Optional[int] = None
    updated_at: Optional[int] = None
    progress_percentage: float
    pending_count: int


class OTABatchDetailResponse(OTABatchResponse):
    firmware: FirmwareResponse
    devices: list[OTABatchDeviceResponse]


class OTABatchCreateResponse(BaseModel):
    ok: bool
    batch: OTABatchDetailResponse


class OTABatchListResponse(BaseModel):
    batches: list[OTABatchResponse]
    total: int


class OTABatchProcessResponse(BaseModel):
    ok: bool
    batch_id: int
    queued: int
    skipped: int
    remaining: int


class OTABatchCancelResponse(BaseModel):
    ok: bool
    batch_id: int
    status: str


class FirmwareCompatibilityCreate(BaseModel):
    utility_type: Optional[UtilityType] = None
    firmware_mode: Optional[FirmwareMode] = None
    device_role: Optional[DeviceRole] = None
    hardware_version: Optional[str] = None
    sensor_type: Optional[str] = None
    converter_type: Optional[str] = None
    notes: Optional[str] = None


class FirmwareOnDemandRequest(BaseModel):
    utility_type: UtilityType = UtilityType.electricity
    firmware_mode: FirmwareMode = FirmwareMode.auto
    device_role: Optional[DeviceRole] = None
    version: str = "1.0.0"
    wifi_ssid: Optional[str] = None
    wifi_pass: Optional[str] = None
    server_url: Optional[str] = None
    device_token: Optional[str] = None
    test_mode: bool = False


class FirmwareOnDemandResponse(BaseModel):
    ok: bool
    cached: bool
    filename: str
    url: str
    sha256: str
    size: int
    message: str
