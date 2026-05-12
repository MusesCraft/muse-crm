"""CRM-027: 新增 reply_suggestions 表

對應 PR-5（FILE_STRUCTURE_PLAN §4.2）。

Revision ID: l0a1b2c3d4e5
Revises: j8e9f0a1b2c3
Create Date: 2026-05-12 13:15:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


# revision identifiers, used by Alembic.
revision = 'l0a1b2c3d4e5'
down_revision = 'j8e9f0a1b2c3'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'reply_suggestions',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('message_id', UUID(as_uuid=True),
                  sa.ForeignKey('messages.id', ondelete='CASCADE'), nullable=True),
        sa.Column('conversation_id', UUID(as_uuid=True),
                  sa.ForeignKey('conversations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('suggestions', JSONB, nullable=True),
        sa.Column('used_suggestion_index', sa.Integer, nullable=True),
        sa.Column('edited_before_send', sa.Boolean, nullable=True),
        sa.Column('model', sa.String(100), nullable=True),
        sa.Column('generated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('idx_reply_sugg_conv', 'reply_suggestions', ['conversation_id', 'generated_at'])


def downgrade():
    op.drop_index('idx_reply_sugg_conv', table_name='reply_suggestions')
    op.drop_table('reply_suggestions')
