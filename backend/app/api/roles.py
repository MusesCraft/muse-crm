"""
MUSE CRM — Roles API

身份組（角色）管理 API 端點。
"""

import logging
from datetime import datetime, timezone

from flask import jsonify, request

from . import api_bp
from ..models.role import Role, UserRole
from ..models.user import User
from .. import db
from ..utils.auth import login_required
from ..utils.permissions import require_role

logger = logging.getLogger(__name__)

# 所有允許的權限鍵
VALID_PERMISSIONS = {
    'contacts.read', 'contacts.write',
    'inbox.read', 'inbox.send',
    'actions.manage',
    'settings.view', 'settings.admin',
    'users.manage',
    'inventory.read', 'inventory.write',
}


def _validate_permissions(permissions: dict) -> str | None:
    """驗證權限 dict，回傳錯誤訊息或 None"""
    if not isinstance(permissions, dict):
        return '權限格式錯誤，需為 JSON 物件'
    for key in permissions:
        if key not in VALID_PERMISSIONS:
            return f'無效的權限鍵: {key}'
    return None


# ── 身份組 CRUD ──────────────────────────────────────────

@api_bp.route('/roles', methods=['GET'])
@login_required
def list_roles():
    """取得所有身份組（依 position 排序）"""
    roles = Role.query.order_by(Role.position.asc(), Role.created_at.asc()).all()
    return jsonify([r.to_dict() for r in roles])


@api_bp.route('/roles', methods=['POST'])
@login_required
@require_role('admin')
def create_role():
    """
    新增身份組

    Body: { name, color?, permissions?, position? }
    """
    data = request.get_json()
    if not data:
        return jsonify({'error': '缺少請求資料'}), 400

    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': '身份組名稱為必填'}), 400

    # 檢查名稱唯一
    existing = Role.query.filter_by(name=name).first()
    if existing:
        return jsonify({'error': f'身份組名稱「{name}」已存在'}), 409

    color = (data.get('color') or '#6366f1').strip()
    permissions = data.get('permissions', {})
    position = data.get('position', 0)

    # 驗證權限
    perm_err = _validate_permissions(permissions)
    if perm_err:
        return jsonify({'error': perm_err}), 400

    role = Role(
        name=name,
        color=color,
        permissions=permissions,
        position=position,
        is_system=False,
    )
    db.session.add(role)
    db.session.commit()

    logger.info(f"身份組已建立: {role.name} (id={role.id})")
    return jsonify(role.to_dict()), 201


@api_bp.route('/roles/<role_id>', methods=['PUT'])
@login_required
@require_role('admin')
def update_role(role_id):
    """
    更新身份組

    Body: { name?, color?, permissions?, position? }
    系統身份組不可更改名稱。
    """
    role = Role.query.get_or_404(role_id)
    data = request.get_json()
    if not data:
        return jsonify({'error': '缺少請求資料'}), 400

    if 'name' in data:
        new_name = (data['name'] or '').strip()
        if not new_name:
            return jsonify({'error': '身份組名稱不可為空'}), 400
        if role.is_system and new_name != role.name:
            return jsonify({'error': '系統身份組不可更改名稱'}), 403
        # 檢查名稱唯一（排除自身）
        existing = Role.query.filter(Role.name == new_name, Role.id != role.id).first()
        if existing:
            return jsonify({'error': f'身份組名稱「{new_name}」已存在'}), 409
        role.name = new_name

    if 'color' in data:
        role.color = (data['color'] or '#6366f1').strip()

    if 'permissions' in data:
        perm_err = _validate_permissions(data['permissions'])
        if perm_err:
            return jsonify({'error': perm_err}), 400
        role.permissions = data['permissions']

    if 'position' in data:
        role.position = data['position']

    role.updated_at = datetime.now(timezone.utc)
    db.session.commit()

    logger.info(f"身份組已更新: {role.name} (id={role.id})")
    return jsonify(role.to_dict())


@api_bp.route('/roles/<role_id>', methods=['DELETE'])
@login_required
@require_role('admin')
def delete_role(role_id):
    """刪除身份組（系統身份組不可刪除）"""
    role = Role.query.get_or_404(role_id)

    if role.is_system:
        return jsonify({'error': '系統身份組不可刪除'}), 403

    # 移除所有使用者的此身份組指派
    UserRole.query.filter_by(role_id=role_id).delete()
    db.session.delete(role)
    db.session.commit()

    logger.info(f"身份組已刪除: {role.name} (id={role_id})")
    return jsonify({'message': f'身份組「{role.name}」已刪除'})


# ── 使用者身份組指派 ──────────────────────────────────────

@api_bp.route('/users/<user_id>/roles', methods=['GET'])
@login_required
def get_user_roles(user_id):
    """取得使用者的所有身份組"""
    user = User.query.get_or_404(user_id)
    return jsonify([{'id': r.id, 'name': r.name, 'color': r.color} for r in user.assigned_roles])


@api_bp.route('/users/<user_id>/roles', methods=['POST'])
@login_required
@require_role('admin')
def assign_user_role(user_id):
    """
    指派身份組給使用者

    Body: { role_id }
    """
    user = User.query.get_or_404(user_id)
    data = request.get_json()
    if not data or not data.get('role_id'):
        return jsonify({'error': '缺少 role_id'}), 400

    role_id = data['role_id']
    role = Role.query.get(role_id)
    if not role:
        return jsonify({'error': '身份組不存在'}), 404

    # 檢查是否已指派
    existing = UserRole.query.filter_by(user_id=str(user.id), role_id=role_id).first()
    if existing:
        return jsonify({'error': '使用者已擁有此身份組'}), 409

    user_role = UserRole(user_id=str(user.id), role_id=role_id)
    db.session.add(user_role)
    db.session.commit()

    logger.info(f"已指派身份組 {role.name} 給使用者 {user.email}")
    return jsonify({'message': f'已指派身份組「{role.name}」'}), 201


@api_bp.route('/users/<user_id>/roles/<role_id>', methods=['DELETE'])
@login_required
@require_role('admin')
def remove_user_role(user_id, role_id):
    """移除使用者的身份組"""
    user = User.query.get_or_404(user_id)
    user_role = UserRole.query.filter_by(user_id=str(user.id), role_id=role_id).first()
    if not user_role:
        return jsonify({'error': '使用者未擁有此身份組'}), 404

    role = Role.query.get(role_id)
    role_name = role.name if role else role_id

    db.session.delete(user_role)
    db.session.commit()

    logger.info(f"已移除使用者 {user.email} 的身份組 {role_name}")
    return jsonify({'message': f'已移除身份組「{role_name}」'})
