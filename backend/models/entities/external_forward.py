from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin


class ExternalSensorForward(Base, TimestampMixin):
    """Bino+utility_type -> tashqi tizim (masalan 195.158.8.44:7000) sensor
    token'i bog'lanishi. Fon ishchisi har `EXTERNAL_FORWARD_INTERVAL_SEC`da
    (standart 300s) shu ro'yxatdagi har bir aktiv qatorga mos bino/utility
    uchun joriy O'RTACHA qiymatni hisoblab, tashqi API'ga yuboradi
    (services/external_forward.py). Standart holatda O'CHIRILGAN
    (EXTERNAL_FORWARD_ENABLED=false) — yoqilguncha faqat CRUD/test uchun."""

    __tablename__ = "external_sensor_forwards"
    __table_args__ = (
        UniqueConstraint("building_id", "utility_type", "external_token", name="uq_ext_forward_building_utility_token"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    building_id: Mapped[int] = mapped_column(ForeignKey("buildings.id"), nullable=False)
    utility_type: Mapped[str] = mapped_column(String(32), nullable=False)
    # air_quality bitta binoda ikki JISMONAN alohida manbadan kelishi mumkin
    # (masalan yerto'la MQ135 va yo'lak MQ135) — ular tashqi tomonga alohida-
    # alohida yuborilishi kerak, shuning uchun Reading.sensor_type bo'yicha
    # qo'shimcha filtr (masalan "capacitive_soil_moisture" yoki "microphone").
    # Boshqa utility_type'lar uchun NULL — bino bo'yicha oddiy o'rtacha olinadi.
    sensor_type: Mapped[str | None] = mapped_column(String(64))
    # utility_type="electricity" uchun qaysi ustunni yuborish kerakligini
    # tanlaydi: NULL/boshqa = kuchlanish (sayt kartasi bilan bir xil),
    # "energy_kwh" = sarflangan energiya (tashqi tomon buni kutadi).
    metric: Mapped[str | None] = mapped_column(String(32))
    external_token: Mapped[str] = mapped_column(String(255), nullable=False)
    external_device: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_sent_at: Mapped[int | None] = mapped_column(Integer)
    last_sent_value: Mapped[float | None] = mapped_column(Float)
    last_error: Mapped[str | None] = mapped_column(String(500))
