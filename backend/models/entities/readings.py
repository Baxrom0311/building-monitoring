from sqlalchemy import Boolean, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base


class Reading(Base):
    __tablename__ = "readings"
    __table_args__ = (
        Index("idx_readings_device_ts", "device_id", "ts"),
        Index("idx_readings_device_utility_ts", "device_id", "utility_type", "ts"),
        Index("idx_readings_point_ts", "point_id", "ts"),
        Index("idx_readings_building_ts", "building_id", "ts"),
        Index("idx_readings_ts", "ts"),
        Index("idx_readings_building_utility_ts", "building_id", "utility_type", "ts"),
        Index("idx_readings_sensor_ts", "sensor_id", "ts"),
        UniqueConstraint("device_id", "reading_id", name="uq_device_reading_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    device_id: Mapped[str] = mapped_column(ForeignKey("devices.id"), nullable=False)
    reading_id: Mapped[str | None] = mapped_column(String(128))
    sequence_no: Mapped[int | None] = mapped_column(Integer)
    building_id: Mapped[int | None] = mapped_column(ForeignKey("buildings.id"))
    point_id: Mapped[int | None] = mapped_column(ForeignKey("measurement_points.id"))
    # Birinchi-darajali sensor (leaf) FK — nullable (additiv, eski qatorlar NULL;
    # backfill to'ldiradi). Reading o'z device_id/source_id/utility_type'ini ham saqlaydi.
    sensor_id: Mapped[int | None] = mapped_column(ForeignKey("sensors.id"))
    utility_type: Mapped[str] = mapped_column(String(32), default="electricity", nullable=False)
    # RS-485 bridge o'z nomidan yuborganda leaf sensorining asl MAC'i —
    # bitta bridge qurilma ichida sensorlarni ajratish uchun.
    source_id: Mapped[str | None] = mapped_column(String(64))
    sensor_type: Mapped[str | None] = mapped_column(String(64))
    meter_serial: Mapped[str | None] = mapped_column(String(128))
    ts: Mapped[int] = mapped_column(Integer, nullable=False)

    voltage_l1: Mapped[float | None] = mapped_column(Float)
    voltage_l2: Mapped[float | None] = mapped_column(Float)
    voltage_l3: Mapped[float | None] = mapped_column(Float)
    current_l1: Mapped[float | None] = mapped_column(Float)
    current_l2: Mapped[float | None] = mapped_column(Float)
    current_l3: Mapped[float | None] = mapped_column(Float)
    power_w: Mapped[float | None] = mapped_column(Float)
    power_var: Mapped[float | None] = mapped_column(Float)
    frequency: Mapped[float | None] = mapped_column(Float)
    pf: Mapped[float | None] = mapped_column(Float)
    energy_kwh: Mapped[float | None] = mapped_column(Float)
    energy_t1: Mapped[float | None] = mapped_column(Float)
    energy_t2: Mapped[float | None] = mapped_column(Float)
    energy_t3: Mapped[float | None] = mapped_column(Float)
    energy_t4: Mapped[float | None] = mapped_column(Float)
    relay_on: Mapped[bool | None] = mapped_column(Boolean)

    pressure_bar: Mapped[float | None] = mapped_column(Float)
    pressure_bottom_bar: Mapped[float | None] = mapped_column(Float)
    pressure_top_bar: Mapped[float | None] = mapped_column(Float)
    flow_rate: Mapped[float | None] = mapped_column(Float)
    volume_m3: Mapped[float | None] = mapped_column(Float)
    temperature_c: Mapped[float | None] = mapped_column(Float)
    temperature_in_c: Mapped[float | None] = mapped_column(Float)   # Qozonxona kirish (DS18B20)
    temperature_out_c: Mapped[float | None] = mapped_column(Float)  # Qozonxona chiqish (DS18B20)
    humidity: Mapped[float | None] = mapped_column(Float)
    air_quality: Mapped[float | None] = mapped_column(Float) # Havo sifati / MQ135 (%)
    level: Mapped[float | None] = mapped_column(Float)   # Ovoz darajasi (0–100%)
    raw_payload: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[int | None] = mapped_column(Integer)

    device: Mapped["Device"] = relationship(back_populates="readings")
    measurement_point: Mapped["MeasurementPoint | None"] = relationship(back_populates="readings")


class HourlyUtilityStats(Base):
    __tablename__ = "hourly_utility_stats"
    __table_args__ = (
        UniqueConstraint("bucket_ts", "device_id", "utility_type", name="uq_hourly_stats_device_utility"),
        Index("idx_hourly_stats_building_utility_bucket", "building_id", "utility_type", "bucket_ts"),
        Index("idx_hourly_stats_device_bucket", "device_id", "bucket_ts"),
        Index("idx_hourly_stats_sensor_bucket", "sensor_id", "bucket_ts"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bucket_ts: Mapped[int] = mapped_column(Integer, nullable=False)
    building_id: Mapped[int | None] = mapped_column(ForeignKey("buildings.id"))
    point_id: Mapped[int | None] = mapped_column(ForeignKey("measurement_points.id"))
    sensor_id: Mapped[int | None] = mapped_column(ForeignKey("sensors.id"))
    device_id: Mapped[str] = mapped_column(String(128), ForeignKey("devices.id"), nullable=False)
    utility_type: Mapped[str] = mapped_column(String(32), nullable=False)
    samples: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    avg_voltage_l1: Mapped[float | None] = mapped_column(Float)
    avg_power_w: Mapped[float | None] = mapped_column(Float)
    max_energy_kwh: Mapped[float | None] = mapped_column(Float)
    avg_pressure_bar: Mapped[float | None] = mapped_column(Float)
    avg_pressure_bottom_bar: Mapped[float | None] = mapped_column(Float)
    avg_pressure_top_bar: Mapped[float | None] = mapped_column(Float)
    avg_flow_rate: Mapped[float | None] = mapped_column(Float)
    max_volume_m3: Mapped[float | None] = mapped_column(Float)
    avg_humidity: Mapped[float | None] = mapped_column(Float)
    avg_air_quality: Mapped[float | None] = mapped_column(Float) # Havo sifati o'rtachasi (%)
    avg_level: Mapped[float | None] = mapped_column(Float)   # Ovoz o'rtachasi
    min_level: Mapped[float | None] = mapped_column(Float)
    max_level: Mapped[float | None] = mapped_column(Float)
    avg_temperature_in_c: Mapped[float | None] = mapped_column(Float)   # Issiqlik kirish
    avg_temperature_out_c: Mapped[float | None] = mapped_column(Float)  # Issiqlik chiqish
    created_at: Mapped[int | None] = mapped_column(Integer)
    updated_at: Mapped[int | None] = mapped_column(Integer)
