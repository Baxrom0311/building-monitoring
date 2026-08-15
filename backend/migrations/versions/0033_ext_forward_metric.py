"""Add metric to external_sensor_forwards (choose which electricity column to forward).

Electricity readings carry both voltage (what our own site displays) and
cumulative energy_kwh (what the external billing party wants). NULL means
the existing default (voltage) for every other utility_type and for
electricity mappings created before this column existed.

Revision ID: 0033_ext_forward_metric
Revises: 0032_ext_forward_sensor_type
Create Date: 2026-08-15
"""

from alembic import op
import sqlalchemy as sa


revision = "0033_ext_forward_metric"
down_revision = "0032_ext_forward_sensor_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "external_sensor_forwards",
        sa.Column("metric", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("external_sensor_forwards", "metric")
