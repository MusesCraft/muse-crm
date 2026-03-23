"""
MUSE CRM — 角色權限模組

提供角色檢查裝飾器和 helper 函數。
"""

import logging
from functools import wraps
from typing import Optional

from flask import request, g, jsonify

from ..models.user import User
from .. import db

logger = logging.getLogger(__name__)


def get_current_user() -> Optional[User]:
    """
    從 request 取得當前用戶。

    優先使用 Flask g（JWT 認證後已注入），
    其次嘗試 X-User-Id header（簡易模式，Phase 後續換 JWT）。

    Returns:
        User 或 None
    """
    # 已由 login_required 注入
    if hasattr(g, 'current_user') and g.current_user:
        return g.current_user

    # 簡易模式：X-User-Id header
    user_id = request.headers.get('X-User-Id')
    if user_id:
        user = db.session.get(User, user_id)
        if user and user.is_active:
            g.current_user = user
            return user

    return None


def require_role(*roles):
    """
    角色權限裝飾器。

    檢查當前用戶角色是否在允許的角色列表中。
    需搭配 login_required 使用（或提供 X-User-Id header）。

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
