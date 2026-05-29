"""CRM-030: Expand message types for bot interactive records

Revision ID: o3d4e5f6a7b8
Revises: n2c3d4e5f6a7
Create Date: 2026-05-28 18:00:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'o3d4e5f6a7b8'
down_revision = 'n2c3d4e5f6a7'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE messages DROP CONSTRAINT IF EXISTS ck_message_type")
    op.create_check_constraint(
        'ck_message_type',
        'messages',
        "message_type IN ('text', 'image', 'sticker', 'attachment', 'referral', "
        "'interactive', 'callback_query', 'button')",
    )


def downgrade():
    op.execute("ALTER TABLE messages DROP CONSTRAINT IF EXISTS ck_message_type")
    op.create_check_constraint(
        'ck_message_type',
        'messages',
        "message_type IN ('text', 'image', 'sticker', 'attachment', 'referral')",
    )
