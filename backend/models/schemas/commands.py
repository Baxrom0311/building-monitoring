from typing import Optional

from pydantic import BaseModel

from .enums import FirmwareMode


class DeviceStatus(BaseModel):
    device_id: str
    utility_type: Optional[str] = None
    rssi: Optional[int] = None
    online: bool = True
    hardware_version: Optional[str] = None
    software_version: Optional[str] = None
    firmware_mode: Optional[FirmwareMode] = None
    build_number: Optional[str] = None
    # Firmware diagnostika (core/api.h yuboradi — ilgari jimgina tashlab yuborilardi)
    heap_free: Optional[int] = None
    uptime_s: Optional[int] = None
    sensor_errors: Optional[int] = None
    wifi_drops: Optional[int] = None
    read_interval_ms: Optional[int] = None
    last_error: Optional[str] = None


class CommandCreate(BaseModel):
    action: str
    params: Optional[dict] = None


class CommandQueuedResponse(BaseModel):
    ok: bool
    cmd_id: int
    expires_at: Optional[int] = None


class PendingCommandResponse(BaseModel):
    id: int
    action: str
    param: Optional[str] = None
    # Firmware `params` obyektini o'qiydi (param JSON-string edi — mos emas edi)
    params: Optional[dict] = None
    expires_at: Optional[int] = None
    attempts: int
    max_attempts: int


class PendingCommandListResponse(BaseModel):
    commands: list[PendingCommandResponse]


class CommandResponse(BaseModel):
    id: int
    device_id: str
    action: str
    param: Optional[str] = None
    status: str
    created: Optional[int] = None
    expires_at: Optional[int] = None
    sent: Optional[int] = None
    acked: Optional[int] = None
    ack_result: Optional[str] = None
    attempts: int
    max_attempts: int


class CommandListResponse(BaseModel):
    commands: list[CommandResponse]
