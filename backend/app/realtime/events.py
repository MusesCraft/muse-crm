"""
MUSE CRM — Realtime Events

WebSocket 事件處理：連線驗證、加入 room。
Namespace: /notifications
"""

import logging

from flask_socketio import emit, join_room, disconnect
from flask import request

from . import socketio
from ..models.user import User
from .. import db

logger = logging.getLogger(__name__)


@socketio.on('connect', namespace='/notifications')
def handle_connect():
    """
    WebSocket 連線事件。

    從 query param 取 user_id 驗證身份，
    驗證通過後加入 user-specific room（user_{user_id}）
    以及角色 room（role_{role}）。
    """
    user_id = request.args.get('user_id')

    if not user_id:
        logger.warning("[ws] 連線被拒：缺少 user_id")
        disconnect()
        return False

    # 驗證用戶存在且啟用
    user = db.session.get(User, user_id)
    if not user or not user.is_active:
        logger.warning(f"[ws] 連線被拒：無效的 user_id={user_id}")
        disconnect()
        return False

    # 加入 user-specific room
    join_room(f'user_{user_id}')

    # 加入角色 room（用於 emit_to_role）
    join_room(f'role_{user.role}')

    # 如果有 team_id，加入 team room
    if user.team_id:
        join_room(f'team_{user.team_id}')

    logger.info(f"[ws] 用戶已連線：{user_id} (role={user.role}, team={user.team_id})")

    emit('connected', {
        'user_id': str(user.id),
        'message': '已連線到通知服務',
    })


@socketio.on('disconnect', namespace='/notifications')
def handle_disconnect():
    """WebSocket 斷線事件"""
    user_id = request.args.get('user_id', 'unknown')
    logger.info(f"[ws] 用戶已斷線：{user_id}")
