"""
MUSE CRM — 資料可見範圍模組（Scope Filter）

根據用戶角色限制查詢範圍：
- admin: 不限制
- manager: 同 team_id 的成員所負責的資料
- user: 僅限自己負責的資料
"""

import logging
from typing import List

from sqlalchemy.orm import Query

from ..models.user import User
from ..models.contact import Contact
from ..models.conversation import Conversation
from ..models.action import Action
from .. import db

logger = logging.getLogger(__name__)


def _get_team_user_ids(user: User) -> List:
    """取得同 team 的所有 user id 列表"""
    if not user.team_id:
        # 沒有 team_id，只能看自己的
        return [user.id]
    team_users = (
        db.session.query(User.id)
        .filter(User.team_id == user.team_id, User.is_active == True)
        .all()
    )
    return [u.id for u in team_users]


def apply_contact_scope(query: Query, user: User) -> Query:
    """
    套用 Contact 查詢範圍。

    - admin: 不加 filter
    - manager: Contact.assigned_to IN (同 team 的 user ids)
    - user: Contact.assigned_to == user.id
    """
    if user.role == 'admin':
        return query

    if user.role == 'manager':
        team_ids = _get_team_user_ids(user)
        return query.filter(Contact.assigned_to.in_(team_ids))

    # user 角色
    return query.filter(Contact.assigned_to == user.id)


def apply_conversation_scope(query: Query, user: User) -> Query:
    """
    套用 Conversation 查詢範圍（透過 join Contact）。

    注意：呼叫前 query 需已 join Contact，或由此函數 join。
    """
    if user.role == 'admin':
        return query

    if user.role == 'manager':
        team_ids = _get_team_user_ids(user)
        return query.filter(Contact.assigned_to.in_(team_ids))

    return query.filter(Contact.assigned_to == user.id)


def apply_action_scope(query: Query, user: User) -> Query:
    """
    套用 Action 查詢範圍（透過 join Contact）。

    注意：呼叫前 query 需已 join Contact，或由此函數 join。
    """
    if user.role == 'admin':
        return query

    if user.role == 'manager':
        team_ids = _get_team_user_ids(user)
        return query.filter(Contact.assigned_to.in_(team_ids))

    return query.filter(Contact.assigned_to == user.id)
