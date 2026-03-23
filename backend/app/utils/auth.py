"""
MUSE CRM — Auth Middleware

JWT 認證 decorator 和工具函數。
"""

import logging
from functools import wraps
from datetime import datetime, timedelta, timezone

import jwt
from flask import request, g, current_app, jsonify

from ..models.user import User

logger = logging.getLogger(__name__)


def _get_secret():
    return current_app.config['JWT_SECRET_KEY']


def _get_expiry_hours():
    return current_app.config.get('JWT_EXPIRY_HOURS', 24)


def create_jwt_token(user_id: str, role: str, email: str = None) -> str:
    """
    產生 JWT token。

    Payload: { sub, user_id, role, email, iat, exp }
    """
    now = datetime.now(timezone.utc)
    payload = {
        'sub': str(user_id),
        'user_id': str(user_id),
        'role': role,
        'iat': now,
        'exp': now + timedelta(hours=_get_expiry_hours()),
    }
    if email:
        payload['email'] = email
    return jwt.encode(payload, _get_secret(), algorithm='HS256')


def generate_token(user: User) -> str:
    """產生 JWT token（便捷包裝，接受 User 物件）。"""
    return create_jwt_token(
        user_id=str(user.id),
        role=user.role,
        email=user.email,
    )


def decode_jwt_token(token: str) -> dict:
    """解碼並驗證 JWT token。"""
    return jwt.decode(token, _get_secret(), algorithms=['HS256'])


# 保留舊名稱相容
decode_token = decode_jwt_token


def _extract_current_user():
    """
    從 Authorization header 提取並驗證 JWT，
    將 current_user 注入 Flask g。

    Returns:
        (User, None) on success, (None, error_response) on failure
    """
    auth_header = request.headers.get('Authorization', '')

    if not auth_header.startswith('Bearer '):
        return None, (jsonify({'error': '缺少認證 token'}), 401)

    token = auth_header[7:]  # Strip 'Bearer '

    try:
        payload = decode_jwt_token(token)
    except jwt.ExpiredSignatureError:
        return None, (jsonify({'error': 'Token 已過期'}), 401)
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid JWT token: {e}")
        return None, (jsonify({'error': '無效的 token'}), 401)

    user_id = payload.get('sub') or payload.get('user_id')
    user = User.query.get(user_id)
    if not user:
        return None, (jsonify({'error': '用戶不存在'}), 401)

    if not user.is_active:
        return None, (jsonify({'error': '帳號已停用'}), 403)

    return user, None


def login_required(f):
    """
    JWT 認證 decorator。

    檢查 Authorization: Bearer <token> header，
    驗證後將 current_user 注入 Flask g。
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user, error = _extract_current_user()
        if error:
            return error
        g.current_user = user
        return f(*args, **kwargs)
    return decorated_function


def admin_required(f):
    """
    Admin 權限 decorator。

    先驗證 JWT，再檢查 role 是否為 admin。
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user, error = _extract_current_user()
        if error:
            return error
        if user.role != 'admin':
            return jsonify({'error': '需要管理員權限'}), 403
        g.current_user = user
        return f(*args, **kwargs)
    return decorated_function
