"""
MUSE CRM — Conversation Events API

對話 audit log 查詢端點（PR-3，PRD §6.3）。
"""

from flask import jsonify, request

from . import api_bp
from ..models import Conversation, ConversationEvent
from ..utils.auth import login_required
from ..utils.permissions import get_current_user
from ..utils.scope import apply_contact_scope
from ..models import Contact
from .. import db


@api_bp.route('/inbox/conversations/<conversation_id>/events', methods=['GET'])
@login_required
def list_conversation_events(conversation_id):
    """取得對話的所有 audit log（依時間倒序）"""
    conv = Conversation.query.get(conversation_id)
    if not conv:
        return jsonify({'error': '對話不存在'}), 404

    user = get_current_user()
    # 套 scope：非 admin/manager 必須是該 contact 的負責人
    if user and user.role not in ('admin', 'manager'):
        scoped = apply_contact_scope(
            Contact.query.filter(Contact.id == conv.contact_id), user
        ).first()
        if not scoped:
            return jsonify({'error': '權限不足'}), 403

    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 50, type=int), 200)

    pagination = (
        ConversationEvent.query
        .filter_by(conversation_id=conversation_id)
        .order_by(ConversationEvent.created_at.desc())
        .paginate(page=page, per_page=per_page)
    )

    return jsonify({
        'data': [e.to_dict() for e in pagination.items],
        'pagination': {
            'page': page,
            'per_page': per_page,
            'total': pagination.total,
            'pages': pagination.pages,
        }
    })
