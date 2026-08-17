from sqlalchemy import Boolean, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class Building(Base, TimestampMixin):
    __tablename__ = "buildings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str | None] = mapped_column(String(500))
    maps_url: Mapped[str | None] = mapped_column(String(1000))
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    floors: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    entrances_count: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # O'zimizdan qo'shimcha
    image_url: Mapped[str | None] = mapped_column(String(1000))
    total_apartments: Mapped[int | None] = mapped_column(Integer)
    construction_year: Mapped[int | None] = mapped_column(Integer)

    # Urganchshahar integratsiya maydonlari
    organization_name: Mapped[str | None] = mapped_column(String(255))
    mahalla_name: Mapped[str | None] = mapped_column(String(255))
    street_name: Mapped[str | None] = mapped_column(String(255))
    object_type: Mapped[str | None] = mapped_column(String(255))
    polygon_coordinate: Mapped[str | None] = mapped_column(Text)
    is_official: Mapped[bool | None] = mapped_column(Boolean)
    ext_sensor_temp_out: Mapped[float | None] = mapped_column(Float)
    ext_sensor_temp_in: Mapped[float | None] = mapped_column(Float)
    ext_sensor_pressure: Mapped[str | None] = mapped_column(String(50))
    ext_sensor_online: Mapped[bool | None] = mapped_column(Boolean)
    ext_sensor_updated_at: Mapped[str | None] = mapped_column(String(100))

    utilities: Mapped[list["BuildingUtility"]] = relationship(back_populates="building")
    measurement_points: Mapped[list["MeasurementPoint"]] = relationship(back_populates="building")
    devices: Mapped[list["Device"]] = relationship(back_populates="building")


class BuildingUtility(Base, TimestampMixin):
    __tablename__ = "building_utilities"
    __table_args__ = (UniqueConstraint("building_id", "utility_type", name="uq_building_utility"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    building_id: Mapped[int] = mapped_column(ForeignKey("buildings.id"), nullable=False)
    utility_type: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)

    building: Mapped["Building"] = relationship(back_populates="utilities")
    measurement_points: Mapped[list["MeasurementPoint"]] = relationship(back_populates="utility_module")


class Premise(Base, TimestampMixin):
    __tablename__ = "premises"
    __table_args__ = (Index("idx_premises_building_floor", "building_id", "floor", "number"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    building_id: Mapped[int] = mapped_column(ForeignKey("buildings.id"), nullable=False)
    number: Mapped[str] = mapped_column(String(64), nullable=False)
    floor: Mapped[int | None] = mapped_column(Integer)
    premise_type: Mapped[str] = mapped_column(String(32), default="apartment", nullable=False)


class MeasurementPoint(Base, TimestampMixin):
    __tablename__ = "measurement_points"
    __table_args__ = (
        Index("idx_measurement_points_building_utility", "building_id", "utility_type", "is_active"),
        Index("idx_measurement_points_role", "role"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    building_id: Mapped[int | None] = mapped_column(ForeignKey("buildings.id"))
    utility_module_id: Mapped[int | None] = mapped_column(ForeignKey("building_utilities.id"))
    premise_id: Mapped[int | None] = mapped_column(ForeignKey("premises.id"))
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("measurement_points.id"))
    device_id: Mapped[str | None] = mapped_column(String(128), ForeignKey("devices.id"))

    name: Mapped[str | None] = mapped_column(String(255))
    utility_type: Mapped[str] = mapped_column(String(32), default="electricity", nullable=False)
    role: Mapped[str] = mapped_column(String(64), nullable=False)
    sensor_type: Mapped[str | None] = mapped_column(String(64))
    converter_type: Mapped[str | None] = mapped_column(String(64))
    location_name: Mapped[str | None] = mapped_column(String(255))
    meter_serial: Mapped[str | None] = mapped_column(String(128))
    floor: Mapped[int | None] = mapped_column(Integer)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    building: Mapped["Building | None"] = relationship(back_populates="measurement_points")
    utility_module: Mapped["BuildingUtility | None"] = relationship(back_populates="measurement_points")
    parent: Mapped["MeasurementPoint | None"] = relationship(remote_side=[id])
    readings: Mapped[list["Reading"]] = relationship(back_populates="measurement_point")
