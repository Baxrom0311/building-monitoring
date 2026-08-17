from typing import Optional

from pydantic import BaseModel, Field

from .enums import UtilityType


class AlertRuleCreate(BaseModel):
    kind: str
    utility_type: Optional[UtilityType] = None
    building_id: Optional[int] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    severity: str = Field("warning", pattern="^(info|warning|critical)$")
    dedupe_sec: Optional[int] = Field(None, ge=0, le=86400)
    message: Optional[str] = None
    enabled: bool = True


class AlertRuleUpdate(BaseModel):
    kind: Optional[str] = None
    utility_type: Optional[UtilityType] = None
    building_id: Optional[int] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    severity: Optional[str] = Field(None, pattern="^(info|warning|critical)$")
    dedupe_sec: Optional[int] = Field(None, ge=0, le=86400)
    message: Optional[str] = None
    enabled: Optional[bool] = None


class AlertResponse(BaseModel):
    id: int
    device_id: str
    building_id: Optional[int] = None
    point_id: Optional[int] = None
    utility_type: str
    severity: str
    ts: int
    kind: str
    value: Optional[float] = None
    message: Optional[str] = None
    cleared: bool
    cleared_at: Optional[int] = None


class AlertListResponse(BaseModel):
    alerts: list[AlertResponse]
    total: int = 0
    limit: int = 50
    offset: int = 0


class AlertNotificationResponse(BaseModel):
    id: int
    alert_id: Optional[int] = None
    device_id: str
    building_id: Optional[int] = None
    point_id: Optional[int] = None
    utility_type: str
    severity: str
    kind: str
    channel: str
    status: str
    message: Optional[str] = None
    created_at: int
    sent_at: Optional[int] = None


class AlertNotificationListResponse(BaseModel):
    notifications: list[AlertNotificationResponse]
    total: int


class AlertRuleResponse(BaseModel):
    id: int
    building_id: Optional[int] = None
    utility_type: Optional[str] = None
    kind: str
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    severity: str
    dedupe_sec: Optional[int] = None
    message: Optional[str] = None
    enabled: bool
    created_at: Optional[int] = None
    updated_at: Optional[int] = None


class AlertRuleListResponse(BaseModel):
    rules: list[AlertRuleResponse]
    total: int
    allowed_kinds: list[str]


class AlertRuleMutationResponse(BaseModel):
    ok: bool
    rule: AlertRuleResponse
