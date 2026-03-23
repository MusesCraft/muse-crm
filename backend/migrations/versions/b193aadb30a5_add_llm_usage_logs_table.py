"""add llm_usage_logs table

Revision ID: b193aadb30a5
Revises:
Create Date: 2026-03-23 15:33:58.948463

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'b193aadb30a5'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'llm_usage_logs',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('task_type', sa.String(50), nullable=False),
        sa.Column('model', sa.String(100), nullable=False),
        sa.Column('prompt_tokens', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('completion_tokens', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('total_tokens', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('estimated_cost_usd', sa.Numeric(10, 6), nullable=False, server_default='0'),
        sa.Column('conversation_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('message_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('is_fallback', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_index('ix_llm_usage_logs_created_at', 'llm_usage_logs', ['created_at'])
    op.create_index('ix_llm_usage_logs_model', 'llm_usage_logs', ['model'])
    op.create_index('ix_llm_usage_logs_task_type', 'llm_usage_logs', ['task_type'])
    op.create_index('ix_llm_usage_logs_conversation_id', 'llm_usage_logs', ['conversation_id'])


def downgrade():
    op.drop_table('llm_usage_logs')
