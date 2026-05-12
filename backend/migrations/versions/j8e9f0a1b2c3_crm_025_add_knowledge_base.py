"""CRM-025: 新增 knowledge_base 表

對應 PR-5（FILE_STRUCTURE_PLAN §4.2）。

注意：embedding 暫以 JSONB 儲存，等 Railway pgvector spike 驗證後再以
後續 migration 改為 VECTOR(1536) 並建立 IVFFLAT 索引。
TODO: pgvector

Revision ID: j8e9f0a1b2c3
Revises: k9f0a1b2c3d4
Create Date: 2026-05-12 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


# revision identifiers, used by Alembic.
revision = 'j8e9f0a1b2c3'
down_revision = 'k9f0a1b2c3d4'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'knowledge_base',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('title', sa.String(500), nullable=False),
        sa.Column('content', sa.Text, nullable=False),
        sa.Column('category', sa.String(50), nullable=True),
        sa.Column('source_url', sa.Text, nullable=True),
        sa.Column('tags', sa.ARRAY(sa.String), nullable=True),
        # TODO: pgvector — 改為 VECTOR(1536) 並加 IVFFLAT 索引
        sa.Column('embedding', JSONB, nullable=True),
        sa.Column('embedding_model', sa.String(100), nullable=True),
        sa.Column('is_active', sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('idx_kb_category', 'knowledge_base', ['category'])
    op.create_index('idx_kb_active', 'knowledge_base', ['is_active'])
    op.execute(
        "CREATE INDEX idx_kb_content_fts ON knowledge_base "
        "USING gin (to_tsvector('simple', coalesce(content, '')))"
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS idx_kb_content_fts")
    op.drop_index('idx_kb_active', table_name='knowledge_base')
    op.drop_index('idx_kb_category', table_name='knowledge_base')
    op.drop_table('knowledge_base')
