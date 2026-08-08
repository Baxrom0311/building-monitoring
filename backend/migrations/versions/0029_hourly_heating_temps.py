"""Add avg_temperature_in_c / avg_temperature_out_c to hourly_utility_stats
so the display/analytics can chart heating (DS18B20) temperatures.

Revision ID: 0029_hourly_heating_temps
Revises: 0028_add_reading_source_id
Create Date: 2026-08-08
"""

from alembic import op
import sqlalchemy as sa


revision = "0029_hourly_heating_temps"
down_revision = "0028_add_reading_source_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("hourly_utility_stats", sa.Column("avg_temperature_in_c", sa.Float(), nullable=True))
    op.add_column("hourly_utility_stats", sa.Column("avg_temperature_out_c", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("hourly_utility_stats", "avg_temperature_out_c")
    op.drop_column("hourly_utility_stats", "avg_temperature_in_c")
