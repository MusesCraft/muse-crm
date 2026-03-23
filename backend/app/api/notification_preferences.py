"""
MUSE CRM — Notification Preferences API

用戶通知偏好設定 API 端點。
"""

import logging

from flask import jsonify, request, g

from . import api_bp
from ..models.notification_preference import NotificationPreference
from ..models.user import User
from .. import db
from ..utils.auth import login_required

logger = logging.getLogger(__name__)

# 允許 PATCH 的欄位白名單
ALLOWED_FIELDS = {
    'discord_enabled', 'line_enabled', 'email_enabled',
    'discord_webhook_url', 'line_notify_token', 'email_address',
    'quiet_hours_start', 'quiet_hours_end',
}


@api_bp.route('/users/<user_id>/notification-preferences', methods=['GET'])
@login_required
def get_notification_preferences(user_id):
    """
    取得用戶通知偏好設定。

    權限：自己或 admin 可查看。
    """
    current_user = g.current_user

    # 權限檢查：自己改自己 or admin
    if str(current_user.id) != user_id and current_user.role != 'admin':
        return jsonify({'error': '權限不足'}), 403

    # 確認目標用戶存在
    target_user = db.session.get(User, user_id)
    if not target_user:
        return jsonify({'error': '用戶不存在'}), 404

    pref = NotificationPreference.query.filter_by(user_id=user_id).first()

    if not pref:
        # 回傳預設值（不建立記錄直到使用者主動設定）
        return jsonify({
            'user_id': user_id,
            'discord_enabled': True,
            'line_enabled': False,
            'email_enabled': False,
            'discord_webhook_url': None,
            'line_notify_token': None,
            'email_address': None,
            'quiet_hours_start': None,
            'quiet_hours_end': None,
        })

    return jsonify(pref.to_dict())


@api_bp.route('/users/<user_id>/notification-preferences', methods=['PATCH'])
@login_required
def update_notification_preferences(user_id):
    """
    更新用戶通知偏好設定。

    權限：自己或 admin 可修改。

    Body: { discord_enabled?, line_enabled?, email_enabled?,
            discord_webhook_url?, line_notify_token?, email_address?,
            quiet_hours_start?, quiet_hours_end? }
    """
    current_user = g.current_user

    # 權限檢查
    if str(current_user.id) != user_id and current_user.role != 'admin':
        return jsonify({'error': '權限不足'}), 403

    # 確認目標用戶存在
    target_user = db.session.get(User, user_id)
    if not target_user:
        return jsonify({'error': '用戶不存在'}), 404

    data = request.get_json()
    if not data:
        return jsonify({'error': '缺少請求資料'}), 400

    # 驗證 quiet_hours 格式
    for field in ('quiet_hours_start', 'quiet_hours_end'):
        if field in data and data[field] is not None:
            value = data[field]
            if not _is_valid_time_format(value):
                return jsonify({'error': f'{field} 格式無效，需為 HH:MM'}), 400

    # 取得或建立偏好記錄
    pref = NotificationPreference.query.filter_by(user_id=user_id).first()
    if not pref:
        pref = NotificationPreference(user_id=user_id)
        db.session.add(pref)

    # 更新允許的欄位
    for field in ALLOWED_FIELDS:
        if field in data:
            setattr(pref, field, data[field])

    db.session.commit()

    logger.info(f"✅ 用戶 {user_id} 通知偏好已更新")

    return jsonify({
        'message': '通知偏好已更新',
        'preference': pref.to_dict()
    })


def _is_valid_time_format(value: str) -> bool:
    """
    驗證 HH:MM 格式。

    Args:
        value: 時間字串

    Returns:
        是否合法
    """
    if not isinstance(value, str) or len(value) != 5:
        return False
    try:
        parts = value.split(':')
        if len(parts) != 2:
            return False
        hour, minute = int(parts[0]), int(parts[1])
        return 0 <= hour <= 23 and 0 <= minute <= 59
    except (ValueError, IndexError):
        return False
