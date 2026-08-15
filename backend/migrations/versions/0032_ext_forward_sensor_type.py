"""Add sensor_type to external_sensor_forwards (disambiguate air_quality by physical source).

air_quality can come from two physically distinct MQ135 sensors in the same
building (e.g. one on a soil-moisture leaf in the basement, one on a sound
leaf in the hallway) - the external-forward mapping needs to say which one
it wants so the worker doesn't average two different rooms' air together.
NULL for every other utility_type (unaffected, plain building average).

Revision ID: 0032_ext_forward_sensor_type
Revises: 0031_external_sensor_forwards
Create Date: 2026-08-15
"""

from alembic import op
import sqlalchemy as sa


revision = "0032_ext_forward_sensor_type"
down_revision = "0031_external_sensor_forwards"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "external_sensor_forwards",
        sa.Column("sensor_type", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("external_sensor_forwards", "sensor_type")
