"""
MUSE CRM — Users API

用戶管理相關 API 端點（僅 admin 可存取）。
"""

import logging

from flask import jsonify, request
from sqlalchemy import or_

from . import api_bp
from ..models.user import User
from .. import db
from ..utils import escape_like
from ..utils.auth import login_required
from ..utils.permissions import require_role

logger = logging.getLogger(__name__)


@api_bp.route('/users', methods=['GET'])
@login_required
@require_role('admin')
def list_users():
    """
    用戶列表（分頁）

    Query parameters:
        - role: 篩選角色 admin/manager/user
        - is_active: 篩選啟用狀態 true/false
        - page: 頁碼（預設 1）
        - per_page: 每頁筆數（預設 20）
        - search: 搜尋名稱或 email
    """
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), 100)
    role = request.args.get('role')
    is_active = request.args.get('is_active')
    search = request.args.get('search', '').strip()

    query = User.query

    if role:
        query = query.filter(User.role == role)

    if is_active is not None:
        active_val = is_active.lower() == 'true'
        query = query.filter(User.is_active == active_val)

    if search:
        safe_search = escape_like(search)
        query = query.filter(
            or_(
                User.name.ilike(f'%{safe_search}%', escape='\\'),
                User.email.ilike(f'%{safe_search}%', escape='\\')
            )
        )

    query = query.order_by(User.created_at.desc())
    pagination = query.paginate(page=page, per_page=per_page)

    return jsonify({
        'users': [u.to_dict() for u in pagination.items],
        'total': pagination.total,
        'page': page,
        'per_page': per_page,
    })


@api_bp.route('/users', methods=['POST'])
@login_required
@require_role('admin')
def create_user():
    """
    新增用戶

    Body: { name, email, role?, team_id?, password? }
    """
    data = request.get_json()
    if not data:
        return jsonify({'error': '缺少請求資料'}), 400

    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip().lower()
    role = data.get('role', 'user')
    team_id = data.get('team_id')

    if not name or not email:
        return jsonify({'error': 'name 和 email 為必填'}), 400

    if role not in ('admin', 'manager', 'user'):
        return jsonify({'error': '無效的角色'}), 400

    # 檢查 email 是否已被使用
    existing = User.query.filter_by(email=email).first()
    if existing:
        return jsonify({'error': '此 Email 已被註冊'}), 409

    user = User(
        name=name,
        email=email,
        role=role,
        team_id=team_id,
        is_active=True,
    )

    # 若提供密碼則設定，否則留空（可稍後設定）
    password = data.get('password')
    if password:
        from .auth import _validate_password_strength
        pw_err = _validate_password_strength(password)
        if pw_err:
            return jsonify({'error': pw_err}), 400
        user.set_password(password)

    db.session.add(user)
    db.session.commit()

    logger.info(f"✅ 管理員新增用戶: {user.email} (role={user.role}, team={user.team_id})")

    return jsonify({
        'message': '用戶已建立',
        'user': user.to_dict()
    }), 201


@api_bp.route('/users/<user_id>', methods=['PATCH'])
@login_required
@require_role('admin')
def update_user(user_id):
    """
    編輯用戶

    Body: { role?, team_id?, is_active?, name? }
    """
    user = User.query.get_or_404(user_id)
    data = request.get_json()

    if not data:
        return jsonify({'error': '缺少請求資料'}), 400

    if 'name' in data:
        user.name = data['name'].strip()

    if 'role' in data:
        if data['role'] not in ('admin', 'manager', 'user'):
            return jsonify({'error': '無效的角色'}), 400
        user.role = data['role']

    if 'team_id' in data:
        user.team_id = data['team_id']

    if 'is_active' in data:
        user.is_active = bool(data['is_active'])

    db.session.commit()

    logger.info(f"✅ 管理員更新用戶: {user.email} → {data}")

    return jsonify({
        'message': '用戶已更新',
        'user': user.to_dict()
    })


@api_bp.route('/users/<user_id>', methods=['DELETE'])
@login_required
@require_role('admin')
def delete_user(user_id):
    """
    停用用戶（soft delete，設 is_active=False）
    """
    user = User.query.get_or_404(user_id)

    if not user.is_active:
        return jsonify({'error': '此用戶已停用'}), 400

    user.is_active = False
    db.session.commit()

    logger.info(f"✅ 管理員停用用戶: {user.email}")

    return jsonify({
        'message': '用戶已停用',
        'user': user.to_dict()
    })
