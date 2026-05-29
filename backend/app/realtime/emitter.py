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
