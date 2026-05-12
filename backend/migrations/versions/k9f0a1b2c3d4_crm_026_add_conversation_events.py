"""CRM-026: 新增 conversation_events 對話狀態變更 audit log 表

對應 PR-3（FILE_STRUCTURE_PLAN §4.2）。

Revision ID: k9f0a1b2c3d4
Revises: m1b2c3d4e5f6
Create Date: 2026-05-12 12:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


# revision identifiers, used by Alembic.
revision = 'k9f0a1b2c3d4'
down_revision = 'm1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'conversation_events',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('conversation_id', UUID(as_uuid=True),
                  sa.ForeignKey('conversations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('event_type', sa.String(40), nullable=False),
        sa.Column('actor_id', UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('target_id', UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('event_metadata', JSONB, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  nullable=False, server_default=sa.func.now()),
    )
    op.create_index('idx_conv_events_conv', 'conversation_events', ['conversation_id', 'created_at'])
    op.create_index('idx_conv_events_type', 'conversation_events', ['event_type'])


def downgrade():
    op.drop_index('idx_conv_events_type', table_name='conversation_events')
    op.drop_index('idx_conv_events_conv', table_name='conversation_events')
    op.drop_table('conversation_events')
