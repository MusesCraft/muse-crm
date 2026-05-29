"""
MUSE CRM — Realtime Emitter

封裝 WebSocket 事件推送函數，供各模組呼叫。

Scope 規則：
- admin: 收全部事件
- manager: 收同 team 的事件
- user: 只收 assigned_to 自己的事件
"""

import logging
from typing import Any, Dict, Optional

from . import socketio

logger = logging.getLogger(__name__)


def emit_to_user(user_id, event: str, data: Dict[str, Any]) -> None:
    """
    推送事件到特定用戶。

    Args:
        user_id: User UUID（字串或 UUID）
        event: 事件名稱
        data: 事件資料
    """
    room = f'user_{user_id}'
    try:
        socketio.emit(event, data, namespace='/notifications', to=room)
        logger.debug(f"[emit] {event} → user_{user_id}")
    except Exception as e:
        logger.warning(f"[emit] 推送失敗 {event} → user_{user_id}: {e}")


def emit_to_role(role: str, event: str, data: Dict[str, Any]) -> None:
    """
    推送事件到特定角色的所有用戶。

    Args:
        role: 角色名稱 (admin/manager/user)
        event: 事件名稱
        data: 事件資料
    """
    room = f'role_{role}'
    try:
        socketio.emit(event, data, namespace='/notifications', to=room)
        logger.debug(f"[emit] {event} → role_{role}")
    except Exception as e:
        logger.warning(f"[emit] 推送失敗 {event} → role_{role}: {e}")


def emit_to_team(team_id: str, event: str, data: Dict[str, Any]) -> None:
    """
    推送事件到特定團隊的所有用戶。

    Args:
        team_id: 團隊 ID
        event: 事件名稱
        data: 事件資料
    """
    room = f'team_{team_id}'
    try:
        socketio.emit(event, data, namespace='/notifications', to=room)
        logger.debug(f"[emit] {event} → team_{team_id}")
    except Exception as e:
        logger.warning(f"[emit] 推送失敗 {event} → team_{team_id}: {e}")


def emit_to_all(event: str, data: Dict[str, Any]) -> None:
    """
    推送事件到所有連線用戶。

    Args:
        event: 事件名稱
        data: 事件資料
    """
    try:
        socketio.emit(event, data, namespace='/notifications')
        logger.debug(f"[emit] {event} → all")
    except Exception as e:
        logger.warning(f"[emit] 廣播推送失敗 {event}: {e}")


def emit_scoped(
    event: str,
    data: Dict[str, Any],
    assigned_user_id: Optional[str] = None,
    team_id: Optional[str] = None,
) -> None:
    """
    根據 scope 規則推送事件。

    - admin 永遠收到（透過 role room）
    - 如果有 team_id，同 team 的 manager 收到
    - 如果有 assigned_user_id，指派的 user 收到

    Args:
        event: 事件名稱
        data: 事件資料
        assigned_user_id: 被指派的使用者 ID（可選）
        team_id: 團隊 ID（可選）
    """
    # admin 永遠收到
    emit_to_role('admin', event, data)

    # manager 收同 team 的
    if team_id:
        emit_to_team(team_id, event, data)

    # 指派的 user 收到
    if assigned_user_id:
        emit_to_user(assigned_user_id, event, data)


def emit_contact_updated(contact, changed_fields: list[str]) -> None:
    """
    推送 Contact 更新事件。

    payload 僅放 Inbox/CustomerSidebar 需要的最小資料，避免把電話、email、
    notes 等個資塞進 realtime event。
    """
    if not changed_fields:
        return

    conversations = list(getattr(contact, 'conversations', []) or [])
    conversation_ids = [
        str(conv.id)
        for conv in conversations
        if getattr(conv, 'id', None)
    ]
    updated_at = getattr(contact, 'updated_at', None)

    payload = {
        'contact_id': str(contact.id),
        'conversation_ids': conversation_ids,
        'changed_fields': changed_fields,
        'contact': {
            'id': str(contact.id),
            'customer_identity': getattr(contact, 'customer_identity', None),
            'sales_stage': getattr(contact, 'sales_stage', None),
            'updated_at': updated_at.isoformat() if updated_at else None,
        },
    }

    user_ids = set()
    team_ids = set()

    if getattr(contact, 'assigned_to', None):
        user_ids.add(str(contact.assigned_to))
    assigned_user = getattr(contact, 'assigned_user', None)
    if getattr(assigned_user, 'team_id', None):
        team_ids.add(str(assigned_user.team_id))

    for conv in conversations:
        if getattr(conv, 'current_handler_id', None):
            user_ids.add(str(conv.current_handler_id))
        if getattr(conv, 'supervisor_id', None):
            user_ids.add(str(conv.supervisor_id))
        for watcher_id in (getattr(conv, 'watchers', None) or []):
            if watcher_id:
                user_ids.add(str(watcher_id))

    # 從相關 user 反查 team，讓 manager 的團隊視圖也能收到更新。
    if user_ids:
        try:
            from ..models import User

            users = User.query.filter(User.id.in_(list(user_ids))).all()
            for user in users:
                if user.team_id:
                    team_ids.add(str(user.team_id))
        except Exception as e:
            logger.warning(f"[emit] contact.updated team scope lookup failed: {e}")

    event = 'contact.updated'
    emit_to_role('admin', event, payload)
    for team_id in sorted(team_ids):
        emit_to_team(team_id, event, payload)
    for user_id in sorted(user_ids):
        emit_to_user(user_id, event, payload)


def emit_new_message(message, conversation, contact) -> None:
    """
    推送新訊息事件。

    事件 payload 放 Inbox 即時刷新需要的最小資料；完整內容仍由前端
    refetch conversation/list 取得，避免 realtime event 承擔資料同步責任。
    """
    sent_at = getattr(message, 'sent_at', None)
    last_message_at = getattr(conversation, 'last_message_at', None)
    updated_at = getattr(conversation, 'updated_at', None)

    payload = {
        'message_id': str(message.id),
        'conversation_id': str(conversation.id),
        'contact_id': str(contact.id),
        'channel': getattr(conversation, 'channel', None),
        'message': {
            'id': str(message.id),
            'conversation_id': str(conversation.id),
            'contact_id': str(contact.id),
            'sender_type': getattr(message, 'sender_type', None),
            'message_type': getattr(message, 'message_type', None),
            'content_preview': (getattr(message, 'content', None) or '')[:100],
            'media_url': getattr(message, 'media_url', None),
            'sent_at': sent_at.isoformat() if sent_at else None,
        },
        'contact': {
            'id': str(contact.id),
            'display_name': getattr(contact, 'display_name', None),
            'customer_identity': getattr(contact, 'customer_identity', None),
            'sales_stage': getattr(contact, 'sales_stage', None),
            'assigned_to': str(contact.assigned_to) if getattr(contact, 'assigned_to', None) else None,
        },
        'conversation': {
            'id': str(conversation.id),
            'contact_id': str(contact.id),
            'channel': getattr(conversation, 'channel', None),
            'status': getattr(conversation, 'status', None),
            'message_count': getattr(conversation, 'message_count', None),
            'last_message_at': last_message_at.isoformat() if last_message_at else None,
            'updated_at': updated_at.isoformat() if updated_at else None,
        },
    }

    user_ids = set()
    team_ids = set()

    if getattr(contact, 'assigned_to', None):
        user_ids.add(str(contact.assigned_to))
    assigned_user = getattr(contact, 'assigned_user', None)
    if getattr(assigned_user, 'team_id', None):
        team_ids.add(str(assigned_user.team_id))

    for field in ('current_handler_id', 'supervisor_id'):
        if getattr(conversation, field, None):
            user_ids.add(str(getattr(conversation, field)))
    for watcher_id in (getattr(conversation, 'watchers', None) or []):
        if watcher_id:
            user_ids.add(str(watcher_id))

    if user_ids:
        try:
            from ..models import User

            users = User.query.filter(User.id.in_(list(user_ids))).all()
            for user in users:
                if user.team_id:
                    team_ids.add(str(user.team_id))
        except Exception as e:
            logger.warning(f"[emit] new_message team scope lookup failed: {e}")

    event = 'new_message'
    emit_to_role('admin', event, payload)

    # 目前 manager 的資料 scope 會看到未指派 contact，所以未指派新訊息也
    # 需要通知 manager，否則團隊/待認領視圖只能等 polling。
    if not getattr(contact, 'assigned_to', None):
        emit_to_role('manager', event, payload)

    for team_id in sorted(team_ids):
        emit_to_team(team_id, event, payload)
    for user_id in sorted(user_ids):
        emit_to_user(user_id, event, payload)
