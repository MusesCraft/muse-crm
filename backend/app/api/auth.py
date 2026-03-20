"""
MUSE CRM — Auth API

認證相關 API 端點：登入、註冊、個人資訊、修改密碼。
"""

import logging

from flask import jsonify, request, g

from . import api_bp
from ..models.user import User
from .. import db
from ..utils.auth import generate_token, login_required, admin_required

logger = logging.getLogger(__name__)


@api_bp.route('/auth/login', methods=['POST'])
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
    
    logger.info(f"✅ 用戶登入成功: {user.email}")
    
    return jsonify({
        'token': token,
        'user': user.to_dict()
    })


@api_bp.route('/auth/register', methods=['POST'])
def auth_register():
    """
    用戶註冊
    
    規則：
    - 如果系統中沒有任何用戶，第一個註冊的自動成為 admin
    - 否則需要 admin 權限才能建立新用戶
    
    Body: { name, email, password, role? }
    Response: { user }
    """
    data = request.get_json()
    if not data:
        return jsonify({'error': '缺少請求資料'}), 400
    
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip().lower()
    password = data.get('password') or ''
    role = data.get('role', 'agent')
    
    if not name or not email or not password:
        return jsonify({'error': 'name、email、password 為必填'}), 400
    
    if len(password) < 6:
        return jsonify({'error': '密碼至少 6 個字元'}), 400
    
    if role not in ('admin', 'supervisor', 'agent', 'readonly'):
        return jsonify({'error': '無效的角色'}), 400
    
    # 檢查 email 是否已被使用
    existing = User.query.filter_by(email=email).first()
    if existing:
        return jsonify({'error': '此 Email 已被註冊'}), 409
    
    # 判斷是否為第一個用戶
    user_count = User.query.count()
    is_first_user = user_count == 0
    
    if not is_first_user:
        # 非第一個用戶，需要 admin 權限
        from ..utils.auth import _extract_current_user
        current_user, error = _extract_current_user()
        if error:
            return jsonify({'error': '需要管理員權限才能建立新用戶'}), 403
        if current_user.role != 'admin':
            return jsonify({'error': '需要管理員權限'}), 403
    else:
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
