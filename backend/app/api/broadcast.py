"""
MUSE CRM — Broadcast API

批量廣播管理 API 端點。
"""

import logging
from datetime import datetime, timezone

from flask import jsonify, request, g
from sqlalchemy import desc, func

from . import api_bp
from ..models.broadcast import Broadcast
from ..models import Contact, ContactTag, Tag, ChannelIdentifier
from .. import db
from ..utils.auth import login_required
from ..utils.permissions import require_role

logger = logging.getLogger(__name__)


def _get_broadcast_recipients(include_tags, exclude_tags, target_channels, active_within_days=None):
    """
    根據標籤 + 活躍度篩選計算廣播受眾。

    include_tags: OR 邏輯（有任一標籤就選中）
    exclude_tags: OR 邏輯（有任一排除標籤就排除）
    target_channels: 只計算有這些渠道 channel_identifier 的客戶
    active_within_days: 只選 N 天內有互動的客戶（None 或 0 表示不限）
    """
    # 基礎：未合併的客戶
    query = Contact.query.filter(Contact.is_merged == False)

    # 活躍度篩選
    if active_within_days and active_within_days > 0:
        from datetime import timedelta
        cutoff = datetime.now(timezone.utc) - timedelta(days=active_within_days)
        query = query.filter(Contact.last_active_at >= cutoff)

    # 正選：至少有一個 include tag
    if include_tags:
        include_contact_ids = (
            db.session.query(ContactTag.contact_id)
            .join(Tag, ContactTag.tag_id == Tag.id)
            .filter(Tag.name.in_(include_tags))
            .distinct()
            .subquery()
        )
        query = query.filter(Contact.id.in_(include_contact_ids))

    # 反選：排除有任一 exclude tag 的客戶
    if exclude_tags:
        exclude_contact_ids = (
            db.session.query(ContactTag.contact_id)
            .join(Tag, ContactTag.tag_id == Tag.id)
            .filter(Tag.name.in_(exclude_tags))
            .distinct()
            .subquery()
        )
        query = query.filter(~Contact.id.in_(exclude_contact_ids))

    # 渠道篩選：只要客戶有 target_channels 之一的 channel_identifier
    if target_channels:
        channel_contact_ids = (
            db.session.query(ChannelIdentifier.contact_id)
            .filter(ChannelIdentifier.channel.in_(target_channels))
            .distinct()
            .subquery()
        )
        query = query.filter(Contact.id.in_(channel_contact_ids))

    return query


@api_bp.route('/broadcasts', methods=['GET'])
@login_required
@require_role('admin', 'manager')
def list_broadcasts():
    """廣播列表（分頁）"""
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), 100)

    query = Broadcast.query.order_by(desc(Broadcast.created_at))
    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    return jsonify({
        'data': [b.to_dict() for b in pagination.items],
        'pagination': {
            'page': pagination.page,
            'per_page': pagination.per_page,
            'total': pagination.total,
            'pages': pagination.pages,
        },
    })


@api_bp.route('/broadcasts', methods=['POST'])
@login_required
@require_role('admin', 'manager')
def create_broadcast():
    """建立廣播（草稿）"""
    data = request.get_json()
    if not data:
        return jsonify({'error': '缺少請求資料'}), 400

    title = (data.get('title') or '').strip()
    content = (data.get('content') or '').strip()

    if not title or not content:
        return jsonify({'error': 'title 和 content 為必填'}), 400

    include_tags = data.get('include_tags', [])
    if not isinstance(include_tags, list) or len(include_tags) == 0:
        return jsonify({'error': 'include_tags 至少需要一個標籤'}), 400

    # 排程時間
    scheduled_at = None
    scheduled_str = data.get('scheduled_at')
    if scheduled_str:
        try:
            scheduled_at = datetime.fromisoformat(scheduled_str.replace('Z', '+00:00'))
        except (ValueError, TypeError):
            return jsonify({'error': 'scheduled_at 格式不正確'}), 400

    status = 'scheduled' if scheduled_at else 'draft'

    # 活躍天數篩選
    active_within_days = data.get('active_within_days')
    if active_within_days is not None:
        try:
            active_within_days = int(active_within_days)
            if active_within_days < 0:
                active_within_days = None
        except (ValueError, TypeError):
            active_within_days = None

    broadcast = Broadcast(
        title=title,
        content=content,
        image_url=data.get('image_url'),
        include_tags=include_tags,
        exclude_tags=data.get('exclude_tags', []),
        active_within_days=active_within_days,
        target_channels=data.get('target_channels', ['messenger', 'instagram', 'line']),
        status=status,
        scheduled_at=scheduled_at,
        created_by=g.current_user.id,
    )

    db.session.add(broadcast)
    db.session.commit()

    logger.info(f"📢 廣播已建立: {broadcast.id} by {g.current_user.email}")

    return jsonify({
        'message': '廣播已建立',
        'broadcast': broadcast.to_dict(),
    }), 201


@api_bp.route('/broadcasts/<broadcast_id>', methods=['GET'])
@login_required
@require_role('admin', 'manager')
def get_broadcast(broadcast_id):
    """廣播詳情"""
    broadcast = Broadcast.query.get_or_404(broadcast_id)
    return jsonify(broadcast.to_dict())


@api_bp.route('/broadcasts/<broadcast_id>/preview', methods=['POST'])
@login_required
@require_role('admin', 'manager')
def preview_broadcast(broadcast_id):
    """預覽廣播受眾數"""
    broadcast = Broadcast.query.get_or_404(broadcast_id)

    recipients = _get_broadcast_recipients(
        broadcast.include_tags,
        broadcast.exclude_tags,
        broadcast.target_channels,
        broadcast.active_within_days,
    )
    count = recipients.count()

    return jsonify({
        'broadcast_id': str(broadcast.id),
        'recipient_count': count,
        'include_tags': broadcast.include_tags,
        'exclude_tags': broadcast.exclude_tags,
        'target_channels': broadcast.target_channels,
        'active_within_days': broadcast.active_within_days,
    })


@api_bp.route('/broadcasts/<broadcast_id>/send', methods=['POST'])
@login_required
@require_role('admin', 'manager')
def send_broadcast(broadcast_id):
    """執行廣播發送（背景 Celery task）"""
    broadcast = Broadcast.query.get_or_404(broadcast_id)

    if broadcast.status not in ('draft', 'failed'):
        return jsonify({'error': f'狀態 {broadcast.status} 無法發送'}), 400

    # 計算受眾數
    recipients = _get_broadcast_recipients(
        broadcast.include_tags,
        broadcast.exclude_tags,
        broadcast.target_channels,
        broadcast.active_within_days,
    )
    count = recipients.count()

    if count == 0:
        return jsonify({'error': '沒有符合條件的受眾'}), 400

    broadcast.status = 'sending'
    broadcast.total_recipients = count
    broadcast.sent_count = 0
    broadcast.failed_count = 0
    db.session.commit()

    # 觸發 Celery task
    from ..tasks.broadcast_tasks import execute_broadcast
    execute_broadcast.delay(str(broadcast.id))

    logger.info(f"📢 廣播開始發送: {broadcast.id}, 受眾 {count} 人")

    return jsonify({
        'message': f'廣播已開始發送，受眾 {count} 人',
        'broadcast': broadcast.to_dict(),
    })


@api_bp.route('/broadcasts/<broadcast_id>', methods=['DELETE'])
@login_required
@require_role('admin', 'manager')
def delete_broadcast(broadcast_id):
    """刪除廣播（僅 draft 可刪）"""
    broadcast = Broadcast.query.get_or_404(broadcast_id)

    if broadcast.status != 'draft':
        return jsonify({'error': '只能刪除草稿狀態的廣播'}), 400

    db.session.delete(broadcast)
    db.session.commit()

    return jsonify({'message': '廣播已刪除'})
