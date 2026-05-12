"""
MUSE CRM — 資料可見範圍模組（Scope Filter）

根據用戶角色限制查詢範圍：
- admin: 不限制
- manager: 同 team_id 的成員所負責的資料
- user: 僅限自己負責的資料
"""

import logging
from typing import List

from sqlalchemy import or_
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
        return query.filter(or_(
            Contact.assigned_to.in_(team_ids),
            Contact.assigned_to.is_(None),
        ))

    # user 角色：自己負責的 + 未指派的
    return query.filter(or_(
        Contact.assigned_to == user.id,
        Contact.assigned_to.is_(None),
    ))


def apply_conversation_scope(query: Query, user: User) -> Query:
    """
    套用 Conversation 查詢範圍（透過 join Contact）。

    PR-3 擴充：
    - admin/manager 維持原行為（看 team 全部或全部）
    - user/agent：除了 assigned_to == self 之外，也包含
        a) current_handler_id == self（被分配的對話）
        b) supervisor_id == self（接管中的對話）
        c) watchers 含 self（旁聽中的對話）
        d) contact.assigned_to is None（待認領池）

    注意：呼叫前 query 需已 join Contact，或由此函數 join。
    """
    if user.role == 'admin':
        return query

    if user.role == 'manager':
        team_ids = _get_team_user_ids(user)
        return query.filter(or_(
            Contact.assigned_to.in_(team_ids),
            Contact.assigned_to.is_(None),
        ))

    # user/agent
    uid_str = str(user.id)
    return query.filter(or_(
        Contact.assigned_to == user.id,
        Contact.assigned_to.is_(None),
        Conversation.current_handler_id == user.id,
        Conversation.supervisor_id == user.id,
        # watchers 是 JSONB array，使用 PG @> 包含查詢
        Conversation.watchers.cast(db.Text).like(f'%"{uid_str}"%'),
    ))


def apply_action_scope(query: Query, user: User) -> Query:
    """
    套用 Action 查詢範圍（透過 join Contact）。

    注意：呼叫前 query 需已 join Contact，或由此函數 join。
    """
    if user.role == 'admin':
        return query

    if user.role == 'manager':
        team_ids = _get_team_user_ids(user)
        return query.filter(or_(
            Contact.assigned_to.in_(team_ids),
            Contact.assigned_to.is_(None),
        ))

    return query.filter(or_(
        Contact.assigned_to == user.id,
        Contact.assigned_to.is_(None),
    ))
