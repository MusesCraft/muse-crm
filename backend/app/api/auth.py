"""
MUSE CRM — Auth API

認證相關 API 端點：登入、註冊、個人資訊、修改密碼。
"""

import logging
import time

import jwt as pyjwt
from flask import jsonify, request, g, current_app

from . import api_bp
from ..models.user import User
from .. import db, limiter
from ..utils.auth import generate_token, generate_refresh_token, decode_jwt_token, login_required, admin_required, blacklist_token

logger = logging.getLogger(__name__)


@api_bp.route('/auth/login', methods=['POST'])
@limiter.limit("5/minute")
def auth_login():
    """
    用戶登入
    
    Body: { email, password }
    Response: { token, user }
    """
    data = request.get_json()
    if not data:
        return jsonify({'error': '缺少請求資料'}), 400
    
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''
    
    if not email or not password:
        return jsonify({'error': 'Email 和密碼為必填'}), 400
    
    user = User.query.filter_by(email=email).first()
    
    if not user or not user.check_password(password):
        return jsonify({'error': 'Email 或密碼錯誤'}), 401
    
    if not user.is_active:
        return jsonify({'error': '帳號已停用'}), 403
    
    token = generate_token(user)
    refresh_token = generate_refresh_token(user)

    logger.info(f"✅ 用戶登入成功: {user.email}")

    return jsonify({
        'token': token,
        'refresh_token': refresh_token,
        'user': user.to_dict()
    })


@api_bp.route('/auth/register', methods=['POST'])
def auth_register():
    """
    用戶註冊
    
    規則：
    - 如果系統中沒有任何用戶，第一個註冊的自動成為 admin
    - 否則需要 admin 權限才能建立新用戶（需 JWT）
    
    Body: { name, email, password, role? }
    Response: { user }
    """
    # 判斷是否為第一個用戶（在驗證前就檢查）
    user_count = User.query.count()
    is_first_user = user_count == 0

    if not is_first_user:
        # 非第一個用戶，強制要求 admin JWT
        from ..utils.auth import _extract_current_user
        current_user, error = _extract_current_user()
        if error:
            return error  # 回傳原始 401/403 而非籠統的 403
        if current_user.role != 'admin':
            return jsonify({'error': '需要管理員權限'}), 403

    data = request.get_json()
    if not data:
        return jsonify({'error': '缺少請求資料'}), 400
    
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''
    role = data.get('role', 'user')

    if not name or not email or not password:
        return jsonify({'error': 'name、email、password 為必填'}), 400

    if len(password) < 6:
        return jsonify({'error': '密碼至少 6 個字元'}), 400

    if role not in ('admin', 'manager', 'user'):
        return jsonify({'error': '無效的角色'}), 400
    
    # 檢查 email 是否已被使用
    existing = User.query.filter_by(email=email).first()
    if existing:
        return jsonify({'error': '此 Email 已被註冊'}), 409
    
    if is_first_user:
        # 第一個用戶自動成為 admin
        role = 'admin'
    
    # 建立用戶
    user = User(
        name=name,
        email=email,
        role=role,
        is_active=True
    )
    user.set_password(password)
    
    db.session.add(user)
    db.session.commit()
    
    logger.info(f"✅ 新用戶已建立: {user.email} (role={user.role}, first_user={is_first_user})")
    
    return jsonify({
        'message': '用戶已建立',
        'user': user.to_dict()
    }), 201


@api_bp.route('/auth/refresh', methods=['POST'])
def auth_refresh():
    """
    用 refresh token 換發新的 access token

    Body: { refresh_token }
    Response: { token }
    """
    data = request.get_json()
    if not data or not data.get('refresh_token'):
        return jsonify({'error': '缺少 refresh_token'}), 400

    try:
        payload = decode_jwt_token(data['refresh_token'])
    except pyjwt.ExpiredSignatureError:
        return jsonify({'error': 'Refresh token 已過期，請重新登入'}), 401
    except pyjwt.InvalidTokenError:
        return jsonify({'error': '無效的 refresh token'}), 401

    if payload.get('type') != 'refresh':
        return jsonify({'error': '無效的 token 類型'}), 401

    user = User.query.get(payload.get('sub'))
    if not user or not user.is_active:
        return jsonify({'error': '用戶不存在或已停用'}), 401

    new_token = generate_token(user)
    logger.info(f"🔄 Token 已刷新: {user.email}")

    return jsonify({'token': new_token})


@api_bp.route('/auth/me', methods=['GET'])
@login_required
def auth_me():
    """
    取得當前用戶資訊
    
    需要 JWT 認證。
    """
    return jsonify({
        'user': g.current_user.to_dict()
    })


@api_bp.route('/auth/change-password', methods=['POST'])
@login_required
def auth_change_password():
    """
    修改密碼
    
    Body: { old_password, new_password }
    """
    data = request.get_json()
    if not data:
        return jsonify({'error': '缺少請求資料'}), 400
    
    old_password = data.get('old_password') or ''
    new_password = data.get('new_password') or ''
    
    if not old_password or not new_password:
        return jsonify({'error': 'old_password 和 new_password 為必填'}), 400
    
    if len(new_password) < 6:
        return jsonify({'error': '新密碼至少 6 個字元'}), 400
    
    user = g.current_user
    
    if not user.check_password(old_password):
        return jsonify({'error': '舊密碼不正確'}), 400
    
    user.set_password(new_password)
    db.session.commit()
    
    logger.info(f"✅ 用戶修改密碼成功: {user.email}")

    return jsonify({'message': '密碼已更新'})


@api_bp.route('/auth/logout', methods=['POST'])
@login_required
def logout():
    """登出並撤銷 token"""
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    try:
        payload = pyjwt.decode(token, current_app.config['JWT_SECRET_KEY'], algorithms=['HS256'])
        jti = payload.get('jti')
        exp = payload.get('exp', 0)
        if jti:
            ttl = max(exp - int(time.time()), 0)
            blacklist_token(jti, ttl)
    except Exception:
        pass
    return jsonify({'message': '已登出'}), 200
