"""CRM-023: add reminder_sent_at to actions

Revision ID: c1a2b3c4d5e6
Revises: db52b18e4f19
Create Date: 2026-03-23 20:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c1a2b3c4d5e6'
down_revision = 'db52b18e4f19'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('actions', sa.Column('reminder_sent_at', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('actions', 'reminder_sent_at')
