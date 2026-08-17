from pydantic import BaseModel


class BackupInfo(BaseModel):
    filename: str
    size: int
    created_at: int


class BackupCreateResponse(BaseModel):
    ok: bool
    filename: str
    path: str
    size: int
    sha256: str
    created_at: int
    tables: dict[str, int]


class BackupListResponse(BaseModel):
    backups: list[BackupInfo]
    total: int
    keep_days: int


class BackupCleanupResponse(BaseModel):
    ok: bool
    deleted: list[BackupInfo]
    deleted_count: int
    keep_days: int


class BackupRestoreResponse(BaseModel):
    ok: bool
    restored_from: str
    pre_restore_backup: str
    tables: dict[str, int]


class BackupDeleteResponse(BaseModel):
    ok: bool
    filename: str
    size: int
