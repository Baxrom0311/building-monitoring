"""Hududiy ierarxiya (mahalla/ko'cha/xonadon) va kommunal billing jadvallari.

Revision ID: 0023_billing_structure
Revises: 0022_sound_sensor
Create Date: 2026-07-26
"""

from alembic import op
import sqlalchemy as sa


revision = "0023_billing_structure"
down_revision = "0022_sound_sensor"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mahallas",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(150), nullable=False, unique=True),
        sa.Column("norm_key", sa.String(150), nullable=False, unique=True),
        sa.Column("created_at", sa.Integer()),
        sa.Column("updated_at", sa.Integer()),
    )
    op.create_table(
        "streets",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("mahalla_id", sa.Integer(), sa.ForeignKey("mahallas.id"), nullable=False),
        sa.Column("name", sa.String(150), nullable=False),
        sa.Column("norm_key", sa.String(150), nullable=False),
        sa.Column("created_at", sa.Integer()),
        sa.Column("updated_at", sa.Integer()),
        sa.UniqueConstraint("mahalla_id", "norm_key", name="uq_street_mahalla_key"),
    )
    op.add_column("buildings", sa.Column("street_id", sa.Integer(), sa.ForeignKey("streets.id"), nullable=True))
    op.add_column("buildings", sa.Column("house_no", sa.String(20), nullable=True))
    op.create_table(
        "apartments",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("building_id", sa.Integer(), sa.ForeignKey("buildings.id"), nullable=False),
        sa.Column("apartment_no", sa.String(20), nullable=False),
        sa.Column("owner_name", sa.String(150)),
        sa.Column("account_no", sa.String(30)),
        sa.Column("cadastre_code", sa.String(40)),
        sa.Column("contract_no", sa.String(40)),
        sa.Column("contract_date", sa.String(20)),
        sa.Column("pinfl", sa.String(14)),
        sa.Column("phone", sa.String(30)),
        sa.Column("people_count", sa.Integer()),
        sa.Column("area_m2", sa.Float()),
        sa.Column("living_area_m2", sa.Float()),
        sa.Column("property_value", sa.Float()),
        sa.Column("rooms", sa.Integer()),
        sa.Column("created_at", sa.Integer()),
        sa.Column("updated_at", sa.Integer()),
        sa.UniqueConstraint("building_id", "apartment_no", name="uq_apartment_building_no"),
    )
    op.create_index("ix_apartments_building", "apartments", ["building_id"])
    op.create_table(
        "utility_billings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("building_id", sa.Integer(), sa.ForeignKey("buildings.id"), nullable=False),
        sa.Column("apartment_id", sa.Integer(), sa.ForeignKey("apartments.id"), nullable=True),
        sa.Column("utility_type", sa.String(20), nullable=False),
        sa.Column("period", sa.Integer(), nullable=False),
        sa.Column("volume", sa.Float()),
        sa.Column("accrued", sa.Float()),
        sa.Column("paid", sa.Float()),
        sa.Column("debt_start", sa.Float()),
        sa.Column("debt", sa.Float()),
        sa.Column("penalty", sa.Float()),
        sa.Column("correction", sa.Float()),
        sa.Column("has_meter", sa.Boolean()),
        sa.Column("meter_count", sa.Integer()),
        sa.Column("meter_reading", sa.Float()),
        sa.Column("meter_reading_start", sa.Float()),
        sa.Column("meter_reading_end", sa.Float()),
        sa.Column("canal_volume", sa.Float()),
        sa.Column("canal_amount", sa.Float()),
        sa.Column("people_count", sa.Integer()),
        sa.Column("tariff", sa.String(50)),
        sa.Column("accrual_type", sa.String(50)),
        sa.Column("consumer_status", sa.String(50)),
        sa.Column("last_payment_date", sa.String(20)),
        sa.Column("created_at", sa.Integer()),
        sa.UniqueConstraint(
            "building_id", "apartment_id", "utility_type", "period",
            name="uq_billing_apartment_period",
        ),
    )
    op.create_index("ix_billing_period_type", "utility_billings", ["period", "utility_type"])
    op.create_index("ix_billing_building", "utility_billings", ["building_id"])
    op.create_table(
        "billing_imports",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("utility_type", sa.String(20), nullable=False),
        sa.Column("period", sa.Integer(), nullable=False),
        sa.Column("fmt", sa.String(30)),
        sa.Column("rows_total", sa.Integer(), server_default="0"),
        sa.Column("rows_imported", sa.Integer(), server_default="0"),
        sa.Column("rows_skipped", sa.Integer(), server_default="0"),
        sa.Column("buildings_created", sa.Integer(), server_default="0"),
        sa.Column("file_path", sa.String(500)),
        sa.Column("created_by_username", sa.String(64)),
        sa.Column("created_at", sa.Integer()),
    )


def downgrade() -> None:
    op.drop_table("billing_imports")
    op.drop_index("ix_billing_building", table_name="utility_billings")
    op.drop_index("ix_billing_period_type", table_name="utility_billings")
    op.drop_table("utility_billings")
    op.drop_index("ix_apartments_building", table_name="apartments")
    op.drop_table("apartments")
    op.drop_column("buildings", "house_no")
    op.drop_column("buildings", "street_id")
    op.drop_table("streets")
    op.drop_table("mahallas")
