from pydantic import BaseModel


class HealthWorkersResponse(BaseModel):
    inline: bool


class HealthResponse(BaseModel):
    status: str
    ts: int
    devices: int
    readings: int
    open_alerts: int
    pending_commands: int
    ws_clients: int
    version: str
    data_keep_days: int
    workers: HealthWorkersResponse


class ReadyResponse(BaseModel):
    status: str
    checks: dict[str, str]
