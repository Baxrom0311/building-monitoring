from sqlalchemy import Boolean, Float, ForeignKey, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin


class Alert(Base):
    __tablename__ = "alerts"
    __table_args__ = (
        Index("idx_alerts_cleared_ts", "cleared", "ts"),
        Index("idx_alerts_device_kind_ts", "device_id", "kind", "ts"),
        Index("idx_alerts_building_cleared_ts", "building_id", "cleared", "ts"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    device_id: Mapped[str] = mapped_column(String(128), nullable=False)
    building_id: Mapped[int | None] = mapped_column(ForeignKey("buildings.id"))
    point_id: Mapped[int | None] = mapped_column(ForeignKey("measurement_points.id"))
    utility_type: Mapped[str] = mapped_column(String(32), default="electricity", nullable=False)
    severity: Mapped[str] = mapped_column(String(32), default="warning", nullable=False)
    ts: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    value: Mapped[float | None] = mapped_column(Float)
    message: Mapped[str | None] = mapped_column(String(500))
    cleared: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    cleared_at: Mapped[int | None] = mapped_column(Integer)


class AlertRule(Base, TimestampMixin):
    __tablename__ = "alert_rules"
    __table_args__ = (
        Index("idx_alert_rules_lookup", "enabled", "building_id", "utility_type", "kind"),
        Index("idx_alert_rules_kind", "kind"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    building_id: Mapped[int | None] = mapped_column(ForeignKey("buildings.id"))
    utility_type: Mapped[str | None] = mapped_column(String(32))
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    min_value: Mapped[float | None] = mapped_column(Float)
    max_value: Mapped[float | None] = mapped_column(Float)
    severity: Mapped[str] = mapped_column(String(32), default="warning", nullable=False)
    dedupe_sec: Mapped[int | None] = mapped_column(Integer)
    message: Mapped[str | None] = mapped_column(String(500))
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class AlertNotification(Base):
    __tablename__ = "alert_notifications"
    __table_args__ = (
        Index("idx_alert_notifications_status_created", "status", "created_at"),
        Index("idx_alert_notifications_alert", "alert_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    alert_id: Mapped[int | None] = mapped_column(ForeignKey("alerts.id"))
    device_id: Mapped[str] = mapped_column(String(128), nullable=False)
    building_id: Mapped[int | None] = mapped_column(ForeignKey("buildings.id"))
    point_id: Mapped[int | None] = mapped_column(ForeignKey("measurement_points.id"))
    utility_type: Mapped[str] = mapped_column(String(32), nullable=False)
    severity: Mapped[str] = mapped_column(String(32), nullable=False)
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    channel: Mapped[str] = mapped_column(String(32), default="internal", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    message: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[int] = mapped_column(Integer, nullable=False)
    sent_at: Mapped[int | None] = mapped_column(Integer)
