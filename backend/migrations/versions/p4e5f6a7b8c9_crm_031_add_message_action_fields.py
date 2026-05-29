"""CRM-031: Add message action fields

Revision ID: p4e5f6a7b8c9
Revises: o3d4e5f6a7b8
Create Date: 2026-05-28 19:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB


# revision identifiers, used by Alembic.
revision = 'p4e5f6a7b8c9'
down_revision = 'o3d4e5f6a7b8'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('messages', sa.Column('reactions', JSONB, nullable=True, server_default=sa.text("'{}'::jsonb")))
    op.add_column('messages', sa.Column('reply_to_message_id', UUID(as_uuid=True), nullable=True))
    op.add_column('messages', sa.Column('platform_message_id', sa.String(255), nullable=True))
    op.add_column('messages', sa.Column('telegram_message_id', sa.String(255), nullable=True))
    op.add_column('messages', sa.Column('edited_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('messages', sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('messages', sa.Column('deleted_for', JSONB, nullable=True, server_default=sa.text("'[]'::jsonb")))
    op.add_column('messages', sa.Column('pinned_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('messages', sa.Column('pinned_by', UUID(as_uuid=True), nullable=True))

    op.create_foreign_key(
        'fk_messages_reply_to_message',
        'messages',
        'messages',
        ['reply_to_message_id'],
        ['id'],
        ondelete='SET NULL',
    )
    op.create_foreign_key(
        'fk_messages_pinned_by_user',
        'messages',
        'users',
        ['pinned_by'],
        ['id'],
        ondelete='SET NULL',
    )
    op.create_index('idx_messages_platform_id', 'messages', ['platform_message_id'])
    op.create_index('idx_messages_telegram_id', 'messages', ['telegram_message_id'])
    op.create_index('idx_messages_reply_to', 'messages', ['reply_to_message_id'])
    op.create_index('idx_messages_pinned', 'messages', ['conversation_id', 'pinned_at'])


def downgrade():
    op.drop_index('idx_messages_pinned', table_name='messages')
    op.drop_index('idx_messages_reply_to', table_name='messages')
    op.drop_index('idx_messages_telegram_id', table_name='messages')
    op.drop_index('idx_messages_platform_id', table_name='messages')
    op.drop_constraint('fk_messages_pinned_by_user', 'messages', type_='foreignkey')
    op.drop_constraint('fk_messages_reply_to_message', 'messages', type_='foreignkey')

    op.drop_column('messages', 'pinned_by')
    op.drop_column('messages', 'pinned_at')
    op.drop_column('messages', 'deleted_for')
    op.drop_column('messages', 'deleted_at')
    op.drop_column('messages', 'edited_at')
    op.drop_column('messages', 'telegram_message_id')
    op.drop_column('messages', 'platform_message_id')
    op.drop_column('messages', 'reply_to_message_id')
    op.drop_column('messages', 'reactions')
