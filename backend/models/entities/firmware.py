from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class Firmware(Base):
    __tablename__ = "firmware"
    __table_args__ = (Index("idx_firmware_active_uploaded", "active", "uploaded"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    version: Mapped[str] = mapped_column(String(64), nullable=False)
    hardware_version: Mapped[str | None] = mapped_column(String(64))
    firmware_mode: Mapped[str] = mapped_column(String(32), default="auto", nullable=False)
    device_role: Mapped[str | None] = mapped_column(String(64))
    utility_type: Mapped[str | None] = mapped_column(String(32))
    sensor_type: Mapped[str | None] = mapped_column(String(64))
    converter_type: Mapped[str | None] = mapped_column(String(64))
    size: Mapped[int | None] = mapped_column(Integer)
    sha256: Mapped[str | None] = mapped_column(String(128))
    uploaded: Mapped[int | None] = mapped_column(Integer)
    active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_stable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    min_version: Mapped[str | None] = mapped_column(String(64))
    rollout_percentage: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    release_notes: Mapped[str | None] = mapped_column(Text)
    compatibility_notes: Mapped[str | None] = mapped_column(Text)

    compatibilities: Mapped[list["FirmwareCompatibility"]] = relationship(
        back_populates="firmware",
        cascade="all, delete-orphan",
    )
    ota_batches: Mapped[list["OTABatch"]] = relationship(back_populates="firmware")


class FirmwareCompatibility(Base):
    __tablename__ = "firmware_compatibilities"
    __table_args__ = (
        Index("idx_fw_compat_lookup", "firmware_mode", "hardware_version", "sensor_type", "converter_type"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    firmware_id: Mapped[int] = mapped_column(ForeignKey("firmware.id"), nullable=False)
    utility_type: Mapped[str | None] = mapped_column(String(32))
    firmware_mode: Mapped[str | None] = mapped_column(String(32))
    device_role: Mapped[str | None] = mapped_column(String(64))
    hardware_version: Mapped[str | None] = mapped_column(String(64))
    sensor_type: Mapped[str | None] = mapped_column(String(64))
    converter_type: Mapped[str | None] = mapped_column(String(64))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[int | None] = mapped_column(Integer)

    firmware: Mapped["Firmware"] = relationship(back_populates="compatibilities")


class FirmwareInstallEvent(Base):
    __tablename__ = "firmware_install_events"
    __table_args__ = (
        Index("idx_firmware_events_device_ts", "device_id", "ts"),
        Index("idx_firmware_events_status_ts", "status", "ts"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    device_id: Mapped[str] = mapped_column(String(128), ForeignKey("devices.id"), nullable=False)
    firmware_id: Mapped[int | None] = mapped_column(ForeignKey("firmware.id"))
    from_version: Mapped[str | None] = mapped_column(String(64))
    target_version: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    message: Mapped[str | None] = mapped_column(Text)
    ts: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[int | None] = mapped_column(Integer)


class OTABatch(Base, TimestampMixin):
    __tablename__ = "ota_batches"
    __table_args__ = (
        Index("idx_ota_batches_status_scheduled", "status", "scheduled_at"),
        Index("idx_ota_batches_firmware", "firmware_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    firmware_id: Mapped[int] = mapped_column(ForeignKey("firmware.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    devices_per_hour: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    scheduled_at: Mapped[int | None] = mapped_column(Integer)
    started_at: Mapped[int | None] = mapped_column(Integer)
    completed_at: Mapped[int | None] = mapped_column(Integer)
    total_devices: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    success_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failure_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    skipped_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_by_user_id: Mapped[int | None] = mapped_column(Integer)
    created_by_username: Mapped[str | None] = mapped_column(String(64))

    firmware: Mapped["Firmware"] = relationship(back_populates="ota_batches")
    devices: Mapped[list["OTABatchDevice"]] = relationship(
        back_populates="batch",
        cascade="all, delete-orphan",
    )


class OTABatchDevice(Base):
    __tablename__ = "ota_batch_devices"
    __table_args__ = (
        UniqueConstraint("batch_id", "device_id", name="uq_ota_batch_device"),
        Index("idx_ota_batch_devices_batch_status", "batch_id", "status"),
        Index("idx_ota_batch_devices_device_status", "device_id", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("ota_batches.id"), nullable=False)
    device_id: Mapped[str] = mapped_column(ForeignKey("devices.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    notified_at: Mapped[int | None] = mapped_column(Integer)
    completed_at: Mapped[int | None] = mapped_column(Integer)
    previous_version: Mapped[str | None] = mapped_column(String(64))
    error_message: Mapped[str | None] = mapped_column(Text)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[int | None] = mapped_column(Integer)
    updated_at: Mapped[int | None] = mapped_column(Integer)

    batch: Mapped["OTABatch"] = relationship(back_populates="devices")
