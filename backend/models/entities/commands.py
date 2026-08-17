from sqlalchemy import Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base


class Command(Base):
    __tablename__ = "commands"
    __table_args__ = (
        Index("idx_commands_device_status", "device_id", "status", "id"),
        Index("idx_commands_expires_status", "expires_at", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    device_id: Mapped[str] = mapped_column(String(128), nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    param: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    created: Mapped[int | None] = mapped_column(Integer)
    expires_at: Mapped[int | None] = mapped_column(Integer)
    sent: Mapped[int | None] = mapped_column(Integer)
    acked: Mapped[int | None] = mapped_column(Integer)
    ack_result: Mapped[str | None] = mapped_column(Text)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
