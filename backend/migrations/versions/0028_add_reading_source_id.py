"""Add readings.source_id — leaf sensor MAC when an RS-485 bridge forwards
under its own device_id (so one bridge device can expose many sensors).

Revision ID: 0028_add_reading_source_id
Revises: 0027_add_heating_temps
Create Date: 2026-08-07
"""

from alembic import op
import sqlalchemy as sa


revision = "0028_add_reading_source_id"
down_revision = "0027_add_heating_temps"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("readings", sa.Column("source_id", sa.String(length=64), nullable=True))
    op.create_index("idx_readings_device_source", "readings", ["device_id", "source_id", "ts"])


def downgrade() -> None:
    op.drop_index("idx_readings_device_source", table_name="readings")
    op.drop_column("readings", "source_id")
