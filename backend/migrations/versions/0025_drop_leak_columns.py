"""Drop dead leak_detected/valve_open (readings) and leak_count (hourly_utility_stats) columns.

Never populated by any IoT firmware — gas leak detection was never implemented in
hardware, so these were always NULL in production. Removing the columns and the
related dead alert path (gas_leak).

Revision ID: 0025_drop_leak_columns
Revises: 0024_building_unique
Create Date: 2026-08-02
"""

from alembic import op
import sqlalchemy as sa


revision = "0025_drop_leak_columns"
down_revision = "0024_building_unique"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("readings", "leak_detected")
    op.drop_column("readings", "valve_open")
    op.drop_column("hourly_utility_stats", "leak_count")


def downgrade() -> None:
    op.add_column("hourly_utility_stats", sa.Column("leak_count", sa.Integer(), nullable=True))
    op.add_column("readings", sa.Column("valve_open", sa.Boolean(), nullable=True))
    op.add_column("readings", sa.Column("leak_detected", sa.Boolean(), nullable=True))
