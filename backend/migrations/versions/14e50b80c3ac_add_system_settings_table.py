"""add system_settings table

Revision ID: 14e50b80c3ac
Revises: b193aadb30a5
Create Date: 2026-03-23 15:36:30.546148

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '14e50b80c3ac'
down_revision = 'b193aadb30a5'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'system_settings',
        sa.Column('key', sa.String(100), primary_key=True),
        sa.Column('value', sa.Text(), nullable=False, server_default=''),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # 插入預設值
    op.execute(
        "INSERT INTO system_settings (key, value, description) VALUES "
        "('llm_monthly_cost_limit_usd', '50.0', '月度 LLM 成本上限（USD）'), "
        "('llm_monthly_token_limit', '', '月度 LLM token 上限（空=不限制）'), "
        "('llm_cost_limit_enabled', 'true', '是否啟用 LLM 成本上限')"
    )


def downgrade():
    op.drop_table('system_settings')
