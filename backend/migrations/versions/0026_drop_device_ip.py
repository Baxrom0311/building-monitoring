"""Drop dead devices.ip column.

WiFi IP reporting was removed from IoT firmware and backend earlier (refactor
62f39d0); the column has been passive/unused ever since. No accepted request
schema (DeviceRegister, DeviceStatus) has ever exposed it, so no data loss.

Revision ID: 0026_drop_device_ip
Revises: 0025_drop_leak_columns
Create Date: 2026-08-02
"""

from alembic import op
import sqlalchemy as sa


revision = "0026_drop_device_ip"
down_revision = "0025_drop_leak_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("devices", "ip")


def downgrade() -> None:
    op.add_column("devices", sa.Column("ip", sa.String(length=64), nullable=True))
