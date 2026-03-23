"""add llm_fallback_events table

Revision ID: a1db0d5ce167
Revises: 14e50b80c3ac
Create Date: 2026-03-23 15:38:37.039895

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'a1db0d5ce167'
down_revision = '14e50b80c3ac'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'llm_fallback_events',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('primary_model', sa.String(100), nullable=False),
        sa.Column('fallback_model', sa.String(100), nullable=False),
        sa.Column('error_reason', sa.Text(), nullable=False, server_default=''),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_index('ix_llm_fallback_events_created_at', 'llm_fallback_events', ['created_at'])


def downgrade():
    op.drop_table('llm_fallback_events')
