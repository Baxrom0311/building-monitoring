from sqlalchemy import Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class WorkerLock(Base):
    __tablename__ = "worker_locks"

    name: Mapped[str] = mapped_column(String(128), primary_key=True)
    locked_until: Mapped[int] = mapped_column(Integer, nullable=False)
    owner: Mapped[str | None] = mapped_column(String(128))
    updated_at: Mapped[int | None] = mapped_column(Integer)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("idx_audit_logs_ts", "ts"),
        Index("idx_audit_logs_action_ts", "action", "ts"),
        Index("idx_audit_logs_entity_ts", "entity_type", "entity_id", "ts"),
        Index("idx_audit_logs_user_ts", "user_id", "ts"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[int] = mapped_column(Integer, nullable=False)
    user_id: Mapped[int | None] = mapped_column(Integer)
    username: Mapped[str | None] = mapped_column(String(64))
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    entity_type: Mapped[str | None] = mapped_column(String(64))
    entity_id: Mapped[str | None] = mapped_column(String(128))
    detail: Mapped[str | None] = mapped_column(Text)
