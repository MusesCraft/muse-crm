"""CRM-029: Drop tags / contact_tags / broadcasts tables（PR-1 收尾）

PR-1 已停用前後端的 Tag / Broadcast 邏輯（model 已從 app/models 移除），
此 migration 將對應的資料表刪除。

執行前提（資料保全）：
  1. 部署 muse-crm-backend 時已先把 archive_legacy 端點（或人工 SQL）
     將 tags / contact_tags / broadcasts 內容匯出到備份位置。
  2. 確認 schema.sql 已同步移除這些表（避免下次重建 schema 時又被建回）。

Revision ID: n2c3d4e5f6a7
Revises: l0a1b2c3d4e5
Create Date: 2026-05-12 16:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'n2c3d4e5f6a7'
down_revision = 'l0a1b2c3d4e5'
branch_labels = None
depends_on = None


def upgrade():
    """
    刪除 PR-1 已停用的標籤與廣播相關資料表。

    順序：
      1. contact_tags（join table，先刪以解除 FK）
      2. tags
      3. broadcasts
    若資料表不存在（例如新環境直接建立 schema 時已不包含），以 IF EXISTS 略過。
    """
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if 'contact_tags' in existing_tables:
        op.drop_table('contact_tags')

    if 'tags' in existing_tables:
        op.drop_table('tags')

    if 'broadcasts' in existing_tables:
        op.drop_table('broadcasts')


def downgrade():
    """
    不可逆。
    Tag / Broadcast 系統已從程式碼中完全移除（PR-1），重建表也無對應 ORM 使用。
    若需回復，請從備份還原資料表，並 git revert PR-1 相關 commit。
    """
    # 不可逆
    pass
