"""Add readings.temperature_in_c / temperature_out_c for DS18B20 heating sensors.

New heating sensor node (2x DS18B20, qozonxona kirish/chiqish suv harorati)
needs two independent temperature values per reading, distinct from the
existing generic (single, currently unused) temperature_c column.

Revision ID: 0027_add_heating_temps
Revises: 0026_drop_device_ip
Create Date: 2026-08-05
"""

from alembic import op
import sqlalchemy as sa


revision = "0027_add_heating_temps"
down_revision = "0026_drop_device_ip"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("readings", sa.Column("temperature_in_c", sa.Float(), nullable=True))
    op.add_column("readings", sa.Column("temperature_out_c", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("readings", "temperature_out_c")
    op.drop_column("readings", "temperature_in_c")
