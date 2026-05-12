"""
MUSE CRM — Realtime Events

WebSocket 事件處理：連線驗證（JWT）、加入 room。
Namespace: /notifications

v1.1 對話相關事件（PRD §6.4）：
- conversation.assigned / conversation.escalated / conversation.resolved
- supervisor.nudge.sent      ★ 新增：主管推 nudge 給 agent
- supervisor.watching        ★ 新增：主管開始 / 停止旁聽
- conversation.force_taken   ★ 新增：admin 強制接管（罕見、緊急例外）
- ai.suggestion.ready / ai.risk.detected / notification.mention

v1.1 移除：conversation.taken_over / conversation.returned
（主管不再成為對外回覆者，所以沒有相應事件）
"""

import logging

from flask_socketio import emit, join_room, disconnect
from flask import request

from . import socketio
from ..models.user import User
from ..utils.auth import decode_token
from .. import db

logger = logging.getLogger(__name__)


def _authenticate_ws():
    """
    從 WebSocket 連線提取並驗證 JWT。

    優先從 auth query param 取 token，其次從 Authorization header。

    Returns:
        User 或 None
    """
    import jwt as pyjwt

    # 從 query param 或 header 取 token
    token = request.args.get('auth')
    if not token:
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]

    if not token:
        logger.warning("[ws] 連線被拒：缺少認證 token")
        return None

    try:
        payload = decode_token(token)
    except pyjwt.ExpiredSignatureError:
        logger.warning("[ws] 連線被拒：token 已過期")
        return None
    except pyjwt.InvalidTokenError as e:
        logger.warning(f"[ws] 連線被拒：無效的 token ({e})")
        return None

    user_id = payload.get('user_id')
    if not user_id:
        logger.warning("[ws] 連線被拒：token 缺少 user_id")
        return None

    user = db.session.get(User, user_id)
    if not user or not user.is_active:
        logger.warning(f"[ws] 連線被拒：無效或已停用的用戶 user_id={user_id}")
        return None

    return user


@socketio.on('connect', namespace='/notifications')
def handle_connect():
    """
    WebSocket 連線事件。

    從 JWT token 驗證身份，
    驗證通過後加入 user-specific room（user_{user_id}）
    以及角色 room（role_{role}）。
    """
    user = _authenticate_ws()

    if not user:
        disconnect()
        return False

    user_id = str(user.id)

    # 加入 user-specific room
    join_room(f'user_{user_id}')

    # 加入角色 room（用於 emit_to_role）
    join_room(f'role_{user.role}')

    # 如果有 team_id，加入 team room
    if user.team_id:
        join_room(f'team_{user.team_id}')

    logger.info(f"[ws] 用戶已連線：{user_id} (role={user.role}, team={user.team_id})")

    emit('connected', {
        'user_id': user_id,
        'message': '已連線到通知服務',
    })


@socketio.on('disconnect', namespace='/notifications')
def handle_disconnect():
    """WebSocket 斷線事件"""
    logger.info("[ws] 用戶已斷線")
