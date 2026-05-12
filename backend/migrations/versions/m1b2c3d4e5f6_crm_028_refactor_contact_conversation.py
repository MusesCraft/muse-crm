"""CRM-028: Contact / Conversation / Message / Analysis / Action 結構重構

對應 PR-2（FILE_STRUCTURE_PLAN §2.1）：
- Contact 新增 customer_identity / sales_stage
- Conversation 擴充 status enum，新增 current_handler_id / supervisor_id /
  watchers / escalated_at / escalation_reason
- Message 新增 is_internal / mentions
- Analysis 新增 risk_flags
- Action 將 conversation_id 補上後改為 NOT NULL

注意：本 migration 也會修正既有資料：
- conversations.status 仍為 active 視為 active；closed 視為 closed
- actions.conversation_id IS NULL：嘗試補上同 contact 的最後一個 conversation；
  若該 contact 無任何 conversation，刪除該 action。

Revision ID: m1b2c3d4e5f6
Revises: i7d8e9f0a1b2
Create Date: 2026-05-12 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


# revision identifiers, used by Alembic.
revision = 'm1b2c3d4e5f6'
down_revision = 'i7d8e9f0a1b2'
branch_labels = None
depends_on = None


def upgrade():
    # ── 1. Contact 新增欄位 ─────────────────────────────
    op.add_column('contacts', sa.Column('customer_identity', sa.String(20), nullable=True))
    op.add_column('contacts', sa.Column('sales_stage', sa.String(20), nullable=True))

    # ── 2. Conversation 新增欄位 + 擴充 status enum ─────
    # 先 drop 舊 check constraint（若存在）
    op.execute("ALTER TABLE conversations DROP CONSTRAINT IF EXISTS ck_conversation_status")

    op.add_column('conversations', sa.Column('current_handler_id', UUID(as_uuid=True), nullable=True))
    op.add_column('conversations', sa.Column('supervisor_id', UUID(as_uuid=True), nullable=True))
    op.add_column('conversations', sa.Column('watchers', JSONB, nullable=True, server_default=sa.text("'[]'::jsonb")))
    op.add_column('conversations', sa.Column('escalated_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('conversations', sa.Column('escalation_reason', sa.String(500), nullable=True))

    op.create_foreign_key(
        'fk_conversations_handler_user',
        'conversations', 'users',
        ['current_handler_id'], ['id'],
        ondelete='SET NULL',
    )
    op.create_foreign_key(
        'fk_conversations_supervisor_user',
        'conversations', 'users',
        ['supervisor_id'], ['id'],
        ondelete='SET NULL',
    )

    # 新的 status enum（PRD §F2.1）
    op.create_check_constraint(
        'ck_conversation_status',
        'conversations',
        "status IN ('unassigned', 'active', 'waiting_customer', 'escalated', "
        "'supervisor_taken', 'resolved', 'closed')"
    )

    op.create_index('idx_conversations_handler', 'conversations', ['current_handler_id'])
    op.create_index('idx_conversations_supervisor', 'conversations', ['supervisor_id'])

    # 重建唯一索引（涵蓋新增的開放狀態）
    op.execute("DROP INDEX IF EXISTS uq_conversations_active_per_contact_channel")
    op.execute(
        "CREATE UNIQUE INDEX uq_conversations_active_per_contact_channel "
        "ON conversations (contact_id, channel) "
        "WHERE status IN ('unassigned', 'active', 'waiting_customer', 'escalated', 'supervisor_taken')"
    )

    # ── 3. Message 新增欄位 ─────────────────────────────
    op.add_column('messages', sa.Column('is_internal', sa.Boolean, nullable=False, server_default=sa.false()))
    op.add_column('messages', sa.Column('mentions', JSONB, nullable=True, server_default=sa.text("'[]'::jsonb")))

    # ── 4. Analysis 新增 risk_flags ─────────────────────
    op.add_column('analyses', sa.Column('risk_flags', sa.ARRAY(sa.String), nullable=True))

    # ── 5. Action.conversation_id 改為 NOT NULL（含資料修補） ─
    # 5a. 對 conversation_id IS NULL 的 action，嘗試補上同 contact 的最後一個 conversation
    op.execute("""
        UPDATE actions a
        SET conversation_id = sub.conv_id
        FROM (
            SELECT DISTINCT ON (contact_id) contact_id, id AS conv_id
            FROM conversations
            ORDER BY contact_id, started_at DESC
        ) sub
        WHERE a.conversation_id IS NULL
          AND a.contact_id = sub.contact_id
    """)

    # 5b. 仍補不到的（孤兒 action）直接刪除
    op.execute("DELETE FROM actions WHERE conversation_id IS NULL")

    # 5c. 改 NOT NULL，並改 ondelete 為 CASCADE
    op.execute("ALTER TABLE actions DROP CONSTRAINT IF EXISTS actions_conversation_id_fkey")
    op.alter_column('actions', 'conversation_id', existing_type=UUID(as_uuid=True), nullable=False)
    op.create_foreign_key(
        'actions_conversation_id_fkey',
        'actions', 'conversations',
        ['conversation_id'], ['id'],
        ondelete='CASCADE',
    )


def downgrade():
    # ── 5. Action ──
    op.drop_constraint('actions_conversation_id_fkey', 'actions', type_='foreignkey')
    op.alter_column('actions', 'conversation_id', existing_type=UUID(as_uuid=True), nullable=True)
    op.create_foreign_key(
        'actions_conversation_id_fkey',
        'actions', 'conversations',
        ['conversation_id'], ['id'],
        ondelete='SET NULL',
    )

    # ── 4. Analysis ──
    op.drop_column('analyses', 'risk_flags')

    # ── 3. Message ──
    op.drop_column('messages', 'mentions')
    op.drop_column('messages', 'is_internal')

    # ── 2. Conversation ──
    op.drop_index('idx_conversations_supervisor', table_name='conversations')
    op.drop_index('idx_conversations_handler', table_name='conversations')
    op.execute("DROP INDEX IF EXISTS uq_conversations_active_per_contact_channel")
    op.execute(
        "CREATE UNIQUE INDEX uq_conversations_active_per_contact_channel "
        "ON conversations (contact_id, channel) "
        "WHERE status = 'active'"
    )
    op.drop_constraint('ck_conversation_status', 'conversations', type_='check')
    op.create_check_constraint(
        'ck_conversation_status',
        'conversations',
        "status IN ('active', 'closed')"
    )
    op.drop_constraint('fk_conversations_supervisor_user', 'conversations', type_='foreignkey')
    op.drop_constraint('fk_conversations_handler_user', 'conversations', type_='foreignkey')
    op.drop_column('conversations', 'escalation_reason')
    op.drop_column('conversations', 'escalated_at')
    op.drop_column('conversations', 'watchers')
    op.drop_column('conversations', 'supervisor_id')
    op.drop_column('conversations', 'current_handler_id')

    # ── 1. Contact ──
    op.drop_column('contacts', 'sales_stage')
    op.drop_column('contacts', 'customer_identity')
