"""add FK constraints to llm_usage_logs and email NOT NULL

Revision ID: f4a5b6c7d8e9
Revises: e3c4d5e6f7a8
Create Date: 2026-03-30 20:10:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'f4a5b6c7d8e9'
down_revision = 'e3c4d5e6f7a8'
branch_labels = None
depends_on = None


def upgrade():
    # LlmUsageLog: 加入外鍵約束
    op.create_foreign_key(
        'fk_llm_usage_logs_conversation_id',
        'llm_usage_logs', 'conversations',
        ['conversation_id'], ['id'],
        ondelete='SET NULL'
    )
    op.create_foreign_key(
        'fk_llm_usage_logs_message_id',
        'llm_usage_logs', 'messages',
        ['message_id'], ['id'],
        ondelete='SET NULL'
    )

    # Users: email 改為 NOT NULL（所有使用者都需要 email 登入）
    op.alter_column('users', 'email', nullable=False)


def downgrade():
    op.alter_column('users', 'email', nullable=True)
    op.drop_constraint('fk_llm_usage_logs_message_id', 'llm_usage_logs', type_='foreignkey')
    op.drop_constraint('fk_llm_usage_logs_conversation_id', 'llm_usage_logs', type_='foreignkey')
