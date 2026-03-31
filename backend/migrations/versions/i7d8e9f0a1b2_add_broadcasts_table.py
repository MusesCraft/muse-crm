"""Add broadcasts table

Revision ID: i7d8e9f0a1b2
Revises: h6c7d8e9f0a1
Create Date: 2026-03-31 18:30:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'i7d8e9f0a1b2'
down_revision = 'h6c7d8e9f0a1'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'broadcasts',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('content', sa.Text, nullable=False),
        sa.Column('image_url', sa.Text, nullable=True),
        sa.Column('include_tags', postgresql.ARRAY(sa.Text), nullable=False, server_default='{}'),
        sa.Column('exclude_tags', postgresql.ARRAY(sa.Text), nullable=True, server_default='{}'),
        sa.Column('active_within_days', sa.Integer, nullable=True),
        sa.Column('target_channels', postgresql.ARRAY(sa.Text), nullable=False, server_default='{messenger,instagram,line}'),
        sa.Column('status', sa.String(20), nullable=False, server_default='draft'),
        sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('total_recipients', sa.Integer, nullable=False, server_default='0'),
        sa.Column('sent_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('failed_count', sa.Integer, nullable=False, server_default='0'),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('draft', 'scheduled', 'sending', 'completed', 'failed')", name='ck_broadcast_status'),
    )
    op.create_index('idx_broadcasts_status', 'broadcasts', ['status'])
    op.create_index('idx_broadcasts_created', 'broadcasts', ['created_at'])


def downgrade():
    op.drop_index('idx_broadcasts_created', 'broadcasts')
    op.drop_index('idx_broadcasts_status', 'broadcasts')
    op.drop_table('broadcasts')
