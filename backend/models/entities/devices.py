from sqlalchemy import Boolean, Float, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class Device(Base, TimestampMixin):
    __tablename__ = "devices"
    __table_args__ = (
        Index("idx_devices_active_last_seen", "is_active", "last_seen"),
        Index("idx_devices_utility_active", "utility_type", "is_active"),
        Index("idx_devices_building_active", "building_id", "is_active"),
    )

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    building_id: Mapped[int | None] = mapped_column(ForeignKey("buildings.id"))
    point_id: Mapped[int | None] = mapped_column(ForeignKey("measurement_points.id"))

    name: Mapped[str | None] = mapped_column(String(255))
    utility_type: Mapped[str] = mapped_column(String(32), default="electricity", nullable=False)
    device_role: Mapped[str | None] = mapped_column(String(64))
    firmware_mode: Mapped[str] = mapped_column(String(32), default="auto", nullable=False)
    meter_type: Mapped[str | None] = mapped_column(String(64), default="unknown")
    meter_serial: Mapped[str | None] = mapped_column(String(128))
    previous_meter_serial: Mapped[str | None] = mapped_column(String(128))
    meter_changed_at: Mapped[int | None] = mapped_column(Integer)
    needs_rebind: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_test_device: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    auto_cleanup_at: Mapped[int | None] = mapped_column(Integer)
    serial_number: Mapped[str | None] = mapped_column(String(128))
    hardware_version: Mapped[str | None] = mapped_column(String(64))
    software_version: Mapped[str | None] = mapped_column(String(64))
    build_number: Mapped[str | None] = mapped_column(String(64))
    api_token_hash: Mapped[str | None] = mapped_column(String(255))
    token_created_at: Mapped[int | None] = mapped_column(Integer)
    token_revoked_at: Mapped[int | None] = mapped_column(Integer)
    token_revoked_by_user_id: Mapped[int | None] = mapped_column(Integer)
    token_revoked_by_username: Mapped[str | None] = mapped_column(String(64))
    baud_rate: Mapped[int | None] = mapped_column(Integer, default=9600)
    chip_model: Mapped[str | None] = mapped_column(String(64))
    rssi: Mapped[int | None] = mapped_column(Integer)
    fw_version: Mapped[str | None] = mapped_column(String(64))

    building_text: Mapped[str | None] = mapped_column("building", String(255))
    floor_text: Mapped[str | None] = mapped_column("floor", String(64))
    room: Mapped[str | None] = mapped_column(String(64))
    group_name: Mapped[str | None] = mapped_column(String(128))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_seen: Mapped[int | None] = mapped_column(Integer)
    registered: Mapped[int | None] = mapped_column(Integer)

    building: Mapped["Building | None"] = relationship(back_populates="devices")
    readings: Mapped[list["Reading"]] = relationship(back_populates="device")


class DeviceProvisioningToken(Base):
    __tablename__ = "device_provisioning_tokens"
    __table_args__ = (
        Index("idx_prov_tokens_device", "device_id"),
        Index("idx_prov_tokens_expires_used", "expires_at", "used_at", "revoked_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    token_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    device_id: Mapped[str | None] = mapped_column(String(128))
    building_id: Mapped[int | None] = mapped_column(ForeignKey("buildings.id"))
    point_id: Mapped[int | None] = mapped_column(ForeignKey("measurement_points.id"))
    utility_type: Mapped[str | None] = mapped_column(String(32))
    device_role: Mapped[str | None] = mapped_column(String(64))
    firmware_mode: Mapped[str | None] = mapped_column(String(32))
    expires_at: Mapped[int] = mapped_column(Integer, nullable=False)
    used_at: Mapped[int | None] = mapped_column(Integer)
    used_by_device_id: Mapped[str | None] = mapped_column(String(128))
    revoked_at: Mapped[int | None] = mapped_column(Integer)
    revoked_by_user_id: Mapped[int | None] = mapped_column(Integer)
    revoked_by_username: Mapped[str | None] = mapped_column(String(64))
    created_by_user_id: Mapped[int | None] = mapped_column(Integer)
    created_by_username: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[int | None] = mapped_column(Integer)


class Sensor(Base):
    """Birinchi-darajali sensor — bridge (Device) ostidagi har bir leaf.

    Bitta fizik ESP (bridge) bir necha RS-485 leaf sensorni o'z device_id'si ostida
    uzatadi; har leaf o'z MAC'i (source_id) va bitta utility_type ga ega.
    sensor_uid = coalesce(source_id, device_id): bridge ostidagi leaf -> leaf MAC;
    to'g'ridan-to'g'ri qurilma -> o'z MAC'i. MQ135 havo sensori alohida 'air'
    sensor bo'ladi (soil o'qishi ichida yashiringan emas). UNIQUE(sensor_uid,
    utility_type) bitta fizik sensorning bir necha identifikatorini birlashtiradi
    (masalan B4BFE91279D0 ning bridge-forwarded + self elektri bittaga)."""

    __tablename__ = "sensors"
    __table_args__ = (
        UniqueConstraint("sensor_uid", "utility_type", name="uq_sensor_uid_utility"),
        Index("idx_sensors_transport_active", "transport_device_id", "is_active"),
        Index("idx_sensors_building_utility_active", "building_id", "utility_type", "is_active"),
        Index("idx_sensors_uid", "sensor_uid"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # device_id String(128) ga mos — source_id yo'q uzun device_id upsertда tushib qolmasin
    sensor_uid: Mapped[str] = mapped_column(String(128), nullable=False)  # coalesce(source_id, device_id)
    utility_type: Mapped[str] = mapped_column(String(32), nullable=False)
    sensor_type: Mapped[str | None] = mapped_column(String(64))  # MQ135, SHT3x, DS18B20, TE71...
    # Hozir uzatayotgan ESP (bridge yoki o'zi). Reading o'z device_id'sini saqlaydi,
    # shuning uchun transport o'zgarsa ham tarix buzilmaydi.
    transport_device_id: Mapped[str] = mapped_column(ForeignKey("devices.id"), nullable=False)
    is_bridged: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    building_id: Mapped[int | None] = mapped_column(ForeignKey("buildings.id"))  # PER-SENSOR bog'lanish
    point_id: Mapped[int | None] = mapped_column(ForeignKey("measurement_points.id"))
    name: Mapped[str | None] = mapped_column(String(255))
    meter_serial: Mapped[str | None] = mapped_column(String(128))
    calibration_offset: Mapped[float | None] = mapped_column(Float)
    calibration_scale: Mapped[float | None] = mapped_column(Float)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_test: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    first_seen: Mapped[int | None] = mapped_column(Integer)
    last_seen: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[int | None] = mapped_column(Integer)
    updated_at: Mapped[int | None] = mapped_column(Integer)
