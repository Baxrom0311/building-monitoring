from typing import Optional

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: int
    ts: int
    user_id: Optional[int] = None
    username: Optional[str] = None
    action: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    detail: Optional[str] = None


class AuditLogListResponse(BaseModel):
    audit_logs: list[AuditLogResponse]
    total: int
    page: int
    pages: int
