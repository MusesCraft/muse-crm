"""CRM-018: update user roles to admin/manager/user, add team_id

Revision ID: db52b18e4f19
Revises: a1db0d5ce167
Create Date: 2026-03-23 17:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'db52b18e4f19'
down_revision = 'a1db0d5ce167'
branch_labels = None
depends_on = None


def upgrade():
    # 新增 team_id 欄位
    op.add_column('users', sa.Column('team_id', sa.String(100), nullable=True))
    op.create_index('idx_users_team', 'users', ['team_id'])

    # 角色遷移：supervisor → manager, agent → user, readonly → user
    op.execute("UPDATE users SET role = 'manager' WHERE role = 'supervisor'")
    op.execute("UPDATE users SET role = 'user' WHERE role IN ('agent', 'readonly')")

    # 更新 CHECK 約束
    op.drop_constraint('ck_user_role', 'users', type_='check')
    op.create_check_constraint(
        'ck_user_role', 'users',
        "role IN ('admin', 'manager', 'user')"
    )


def downgrade():
    # 還原 CHECK 約束
    op.drop_constraint('ck_user_role', 'users', type_='check')
    op.create_check_constraint(
        'ck_user_role', 'users',
        "role IN ('admin', 'supervisor', 'agent', 'readonly')"
    )

    # 角色回滾：manager → supervisor, user → agent
    op.execute("UPDATE users SET role = 'supervisor' WHERE role = 'manager'")
    op.execute("UPDATE users SET role = 'agent' WHERE role = 'user'")

    # 移除 team_id
    op.drop_index('idx_users_team', 'users')
    op.drop_column('users', 'team_id')
