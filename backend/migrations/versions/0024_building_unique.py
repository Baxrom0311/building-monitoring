"""Buildings (street_id, house_no) uchun unique constraint — bulk import paytida
ON CONFLICT DO NOTHING orqali xavfsiz/tez qo'shish uchun.

Revision ID: 0024_building_street_house_unique
Revises: 0023_billing_structure
Create Date: 2026-07-27
"""

from alembic import op
import sqlalchemy as sa


revision = "0024_building_unique"
down_revision = "0023_billing_structure"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "uq_building_street_house",
        "buildings",
        ["street_id", sa.text("lower(house_no)")],
        unique=True,
        postgresql_where=sa.text("street_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_building_street_house", table_name="buildings")
