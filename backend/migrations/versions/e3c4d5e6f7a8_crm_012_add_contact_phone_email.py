"""CRM-012: add phone and email to contacts

Revision ID: e3c4d5e6f7a8
Revises: d2b3c4d5e6f7
Create Date: 2026-03-23 22:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e3c4d5e6f7a8'
down_revision = 'd2b3c4d5e6f7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('contacts', sa.Column('phone', sa.String(50), nullable=True))
    op.add_column('contacts', sa.Column('email', sa.String(255), nullable=True))


def downgrade():
    op.drop_column('contacts', 'email')
    op.drop_column('contacts', 'phone')
