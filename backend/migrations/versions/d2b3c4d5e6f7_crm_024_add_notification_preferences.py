"""CRM-024: add notification_preferences table

Revision ID: d2b3c4d5e6f7
Revises: c1a2b3c4d5e6
Create Date: 2026-03-23 21:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


# revision identifiers, used by Alembic.
revision = 'd2b3c4d5e6f7'
down_revision = 'c1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'notification_preferences',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('discord_enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('line_enabled', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('email_enabled', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('discord_webhook_url', sa.Text(), nullable=True),
        sa.Column('line_notify_token', sa.Text(), nullable=True),
        sa.Column('email_address', sa.String(255), nullable=True),
        sa.Column('quiet_hours_start', sa.String(5), nullable=True),
        sa.Column('quiet_hours_end', sa.String(5), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index('idx_notification_pref_user', 'notification_preferences', ['user_id'])


def downgrade():
    op.drop_index('idx_notification_pref_user', table_name='notification_preferences')
    op.drop_table('notification_preferences')
