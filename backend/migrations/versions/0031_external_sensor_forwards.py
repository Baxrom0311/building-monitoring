"""Add external_sensor_forwards table (send building averages to a 3rd-party API).

Maps (building_id, utility_type) -> an external system's sensor token/device
label. A background worker (services/external_forward.py), disabled by default
via EXTERNAL_FORWARD_ENABLED, will periodically POST the building's current
averaged reading for that utility_type to EXTERNAL_FORWARD_URL using this
mapping. Brand-new, standalone table — no existing tables touched, safe as a
plain transactional migration.

Revision ID: 0031_external_sensor_forwards
Revises: 0030_add_sensors_table
Create Date: 2026-08-14
"""

from alembic import op
import sqlalchemy as sa


revision = "0031_external_sensor_forwards"
down_revision = "0030_add_sensors_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "external_sensor_forwards",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("building_id", sa.Integer(), nullable=False),
        sa.Column("utility_type", sa.String(length=32), nullable=False),
        sa.Column("external_token", sa.String(length=255), nullable=False),
        sa.Column("external_device", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("last_sent_at", sa.Integer(), nullable=True),
        sa.Column("last_sent_value", sa.Float(), nullable=True),
        sa.Column("last_error", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.Integer(), nullable=True),
        sa.Column("updated_at", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["building_id"], ["buildings.id"]),
        sa.UniqueConstraint(
            "building_id", "utility_type", "external_token", name="uq_ext_forward_building_utility_token"
        ),
    )
    op.create_index(
        "idx_ext_forward_active", "external_sensor_forwards", ["is_active", "building_id", "utility_type"]
    )


def downgrade() -> None:
    op.drop_table("external_sensor_forwards")
