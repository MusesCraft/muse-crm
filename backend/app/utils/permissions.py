"""
MUSE CRM — 角色權限模組

提供角色檢查裝飾器和 helper 函數。
"""

import logging
from functools import wraps
from typing import Optional

from flask import g, jsonify

from ..models.user import User
from ..utils.auth import _extract_current_user

logger = logging.getLogger(__name__)


def get_current_user() -> Optional[User]:
    """
    從 request 取得當前用戶。

    使用 JWT 認證（Authorization: Bearer <token>）。

    Returns:
        User 或 None
    """
    # 已由 login_required 注入
    if hasattr(g, 'current_user') and g.current_user:
        return g.current_user

    # 嘗試從 Authorization header 取 JWT
    user, error = _extract_current_user()
    if user:
        g.current_user = user
        return user

    return None


def require_role(*roles):
    """
    角色權限裝飾器。

    檢查當前用戶角色是否在允許的角色列表中。
    需搭配 login_required 使用。

    Usage:
        @login_required
        @require_role('admin', 'manager')
        def some_endpoint():
            ...
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            user = get_current_user()
            if not user:
                return jsonify({'error': '未認證'}), 401
            if user.role not in roles:
                logger.warning(
                    f"[權限拒絕] 用戶 {user.id} (role={user.role}) "
                    f"嘗試存取需要 {roles} 權限的資源"
                )
                return jsonify({'error': '權限不足'}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator


def is_admin(user: User) -> bool:
    """檢查是否為管理員"""
    return user.role == 'admin'


def is_manager(user: User) -> bool:
    """檢查是否為主管"""
    return user.role == 'manager'


def is_user(user: User) -> bool:
    """檢查是否為一般使用者"""
    return user.role == 'user'


# ── 對話協作權限（v1.1 PRD §9.1） ─────────────────────────
# v1.1 變更：移除「主管接管」(take-over)，主管不再成為對外回覆者。
# 保留：旁聽（watch）、推 nudge、留 internal note、admin force-handle 例外。

def can_watch(user: User) -> bool:
    """可以旁聽他人對話（manager / admin）"""
    return user.role in ('manager', 'admin')


def can_send_nudge(user: User) -> bool:
    """可以推 nudge 給 agent（manager / admin）"""
    return user.role in ('manager', 'admin')


def can_leave_internal_note(user: User) -> bool:
    """可以留 internal note + @mention（manager / admin / agent 都可以）"""
    return user.role in ('user', 'agent', 'manager', 'admin')


def can_force_take_handler(user: User) -> bool:
    """
    可以強制接管對話（admin only，緊急例外）。
    使用場景：員工離職、客訴升級到法務、agent 明顯失職。需 reason + audit log。
    """
    return user.role == 'admin'


def can_send_external_message(user: User) -> bool:
    """
    可以對客戶直接發送（is_internal=false）訊息。

    v1.1：只有 agent / user 角色能直接發給客戶。
    Admin 不在此列 — 若要發給客戶必須透過 force-handle 流程（會留 audit log）。
    Manager / supervisor 不可發給客戶，只能留 internal note 或推 nudge。
    """
    return user.role in ('user', 'agent')


def can_escalate(user: User) -> bool:
    """可以求援（agent / user 角色才能求援）"""
    return user.role in ('user', 'agent')


def can_manage_kb(user: User) -> bool:
    """可以管理知識庫（manager / admin）"""
    return user.role in ('manager', 'admin')
