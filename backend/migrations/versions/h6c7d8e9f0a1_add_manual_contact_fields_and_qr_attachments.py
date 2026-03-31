"""新增手動登記客戶欄位及快捷回覆附件欄位

Revision ID: h6c7d8e9f0a1
Revises: g5b6c7d8e9f0
Create Date: 2026-03-31

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'h6c7d8e9f0a1'
down_revision = 'g5b6c7d8e9f0'
branch_labels = None
depends_on = None


def upgrade():
    # contacts 新增手動登記相關欄位
    op.add_column('contacts', sa.Column('intent', sa.String(50), nullable=True))
    op.add_column('contacts', sa.Column('budget_range', sa.String(50), nullable=True))
    op.add_column('contacts', sa.Column('preferred_products', postgresql.ARRAY(sa.Text()), nullable=True))
    op.add_column('contacts', sa.Column('visit_date', sa.Date(), nullable=True))
    op.add_column('contacts', sa.Column('referral_source', sa.String(255), nullable=True))
    op.add_column('contacts', sa.Column('contact_status', sa.String(20), server_default='new', nullable=True))

    # quick_replies 新增附件欄位
    op.add_column('quick_replies', sa.Column('attachments', sa.JSON(), nullable=True))


def downgrade():
    op.drop_column('quick_replies', 'attachments')
    op.drop_column('contacts', 'contact_status')
    op.drop_column('contacts', 'referral_source')
    op.drop_column('contacts', 'visit_date')
    op.drop_column('contacts', 'preferred_products')
    op.drop_column('contacts', 'budget_range')
    op.drop_column('contacts', 'intent')
