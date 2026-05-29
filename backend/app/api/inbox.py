"""
MUSE CRM — Inbox API

對話收件匣相關 API 端點。
"""

import logging
from datetime import datetime, timezone
from urllib.parse import unquote

from flask import jsonify, request
from sqlalchemy import desc
from sqlalchemy.orm.attributes import flag_modified
from sqlalchemy.orm import joinedload, subqueryload

from . import api_bp
from ..models import Conversation, Message, Contact, ChannelIdentifier
from .. import db
from ..tasks.analysis_tasks import analyze_conversation
from ..utils import escape_like
from ..utils.auth import login_required
from ..utils.permissions import get_current_user, require_role
from ..utils.scope import apply_contact_scope, apply_conversation_scope
from ..realtime.emitter import emit_new_message

logger = logging.getLogger(__name__)

TELEGRAM_NATIVE_UNSUPPORTED = '尚未支援 Telegram 原生操作'


def _check_conversation_access(conversation):
    """檢查當前用戶是否有權存取此對話。回傳 403 response 或 None。"""
    user = get_current_user()
    if user and user.role not in ('admin', 'manager'):
        scoped = apply_contact_scope(
            Contact.query.filter(Contact.id == conversation.contact_id), user
        ).first()
        if not scoped:
            return jsonify({'error': '權限不足'}), 403
    return None


def _get_message_or_error(message_id):
    message = Message.query.get(message_id)
    if not message:
        return None, (jsonify({'error': '訊息不存在'}), 404)
    denied = _check_conversation_access(message.conversation)
    if denied:
        return None, denied
    return message, None


def _ensure_telegram_conversation(conversation):
    if conversation.channel != 'telegram':
        return jsonify({'error': '此操作僅支援 Telegram 對話'}), 400
    return None


def _message_action_response(message, message_text='訊息已更新', status=200):
    return jsonify({
        'message': message_text,
        'platform_supported': False,
        'platform_message': TELEGRAM_NATIVE_UNSUPPORTED,
        'data': message.to_dict(),
    }), status


def _emit_message_action(message, event='message.updated'):
    try:
        from ..realtime.emitter import emit_scoped

        conversation = message.conversation
        contact = message.contact
        emit_scoped(
            event,
            {
                'message_id': str(message.id),
                'conversation_id': str(message.conversation_id),
                'contact_id': str(message.contact_id),
                'channel': conversation.channel,
                'message': message.to_dict(),
            },
            assigned_user_id=str(conversation.current_handler_id) if conversation.current_handler_id else None,
            team_id=str(contact.assigned_user.team_id) if getattr(contact, 'assigned_user', None) and contact.assigned_user.team_id else None,
        )
    except Exception as exc:
        logger.warning(f"[message action] realtime emit failed: {exc}")


def _emit_new_message_safely(message, conversation, contact):
    try:
        emit_new_message(message=message, conversation=conversation, contact=contact)
    except Exception as exc:
        logger.warning(f"[send_message] new_message realtime emit failed: {exc}")


def _validate_reply_to_message(conversation_id, reply_to_message_id):
    if not reply_to_message_id:
        return None, None
    reply_to = Message.query.get(reply_to_message_id)
    if not reply_to or str(reply_to.conversation_id) != str(conversation_id):
        return None, (jsonify({'error': 'reply_to_message_id 不存在或不屬於此對話'}), 400)
    if reply_to.deleted_at:
        return None, (jsonify({'error': '不能回覆已刪除的訊息'}), 400)
    return reply_to, None

from ..services.contact_service import infer_contact_priority


def _get_contact_external_id(contact, channel=None):
    """從 contact 的 channel_identifiers 取得外部平台 ID（PSID）"""
    query = ChannelIdentifier.query.filter_by(contact_id=contact.id)
    if channel:
        query = query.filter_by(channel=channel)
    ci = query.first()
    return ci.external_id if ci else None


@api_bp.route('/inbox/conversations', methods=['GET'])
@login_required
def list_conversations():
    """
    列出對話列表（分頁）
    
    Query parameters:
        - page: 頁碼（預設 1）
        - per_page: 每頁筆數（預設 20）
        - status: 篩選狀態 unassigned/active/waiting_customer/escalated/supervisor_taken/resolved/closed
        - channel: 篩選渠道 messenger/instagram
        - search: 搜尋客戶名稱或訊息內容
        - view: 視圖（PR-2/PRD §F1.1）
            mine：分配給我的對話（current_handler_id == self）
            unassigned：待認領（status='unassigned' 或 current_handler_id IS NULL）
            team：團隊視圖（manager/admin only，預設行為）
        - handler_id: 篩選負責人（manager/admin only）
        - escalated: 'true' 時只顯示 status='escalated'
    """
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), 100)
    status = request.args.get('status')
    channel = request.args.get('channel')
    search = request.args.get('search', '').strip()
    view = request.args.get('view')
    handler_id = request.args.get('handler_id')
    escalated_only = request.args.get('escalated') == 'true'
    
    query = (
        db.session.query(Conversation)
        .join(Contact, Conversation.contact_id == Contact.id)
        .options(joinedload(Conversation.contact))
        .order_by(desc(Conversation.last_message_at))
    )

    # 套用資料可見範圍
    user = get_current_user()
    if user:
        query = apply_conversation_scope(query, user)

    # PR-2 視圖篩選
    if view == 'mine' and user:
        query = query.filter(Conversation.current_handler_id == user.id)
    elif view == 'unassigned':
        query = query.filter(
            db.or_(
                Conversation.status == 'unassigned',
                Conversation.current_handler_id.is_(None),
            )
        )
    # 'team' 視圖：保持預設（受 scope 限制，supervisor/admin 看全部）

    # 篩選條件
    if status:
        query = query.filter(Conversation.status == status)
    if channel:
        query = query.filter(Conversation.channel == channel)
    if handler_id and user and user.role in ('admin', 'manager'):
        query = query.filter(Conversation.current_handler_id == handler_id)
    if escalated_only:
        query = query.filter(Conversation.status == 'escalated')
    if search:
        safe_search = escape_like(search)
        query = query.filter(
            Contact.display_name.ilike(f'%{safe_search}%', escape='\\')
        )
    
    pagination = query.paginate(page=page, per_page=per_page)

    # 批次載入所有 last_message（避免 N+1）
    conv_ids = [conv.id for conv in pagination.items]
    last_messages_map = {}
    if conv_ids:
        from sqlalchemy import func as sa_func
        subq = (
            db.session.query(
                Message.conversation_id,
                sa_func.max(Message.sent_at).label('max_sent')
            )
            .filter(Message.conversation_id.in_(conv_ids))
            .group_by(Message.conversation_id)
            .subquery()
        )
        last_msgs = (
            db.session.query(Message)
            .join(subq, db.and_(
                Message.conversation_id == subq.c.conversation_id,
                Message.sent_at == subq.c.max_sent,
            ))
            .all()
        )
        for m in last_msgs:
            last_messages_map[m.conversation_id] = m

    conversations = []
    for conv in pagination.items:
        conv_dict = conv.to_dict()
        contact_dict = conv.contact.to_dict()
        priority = infer_contact_priority(conv.contact)
        contact_dict['priority'] = priority
        conv_dict['contact'] = contact_dict
        conv_dict['urgency'] = priority
        last_msg = last_messages_map.get(conv.id)
        conv_dict['last_message'] = last_msg.to_dict() if last_msg else None
        conversations.append(conv_dict)
    
    return jsonify({
        'data': conversations,
        'pagination': {
            'page': page,
            'per_page': per_page,
            'total': pagination.total,
            'pages': pagination.pages,
            'has_prev': pagination.has_prev,
            'has_next': pagination.has_next
        }
    })


@api_bp.route('/inbox/conversations/<conversation_id>', methods=['GET'])
@login_required
def get_conversation_detail(conversation_id):
    """取得對話詳情（包含所有訊息）"""
    conversation = Conversation.query.get_or_404(conversation_id)

    denied = _check_conversation_access(conversation)
    if denied:
        return denied

    # 取得所有訊息
    messages = (
        Message.query
        .filter_by(conversation_id=conversation.id)
        .order_by(Message.sent_at)
        .all()
    )
    
    return jsonify({
        'conversation': conversation.to_dict(),
        'contact': conversation.contact.to_dict(),
        'messages': [msg.to_dict() for msg in messages],
        'analyses': [
            analysis.to_dict()
            for analysis in sorted(
                conversation.analyses,
                key=lambda item: item.created_at or datetime.min.replace(tzinfo=timezone.utc),
                reverse=True,
            )
        ]
    })


@api_bp.route('/inbox/conversations/<conversation_id>/analyze', methods=['POST'])
@login_required
def trigger_manual_analysis(conversation_id):
    """
    手動觸發深度分析（Phase 5A）
    
    內部用戶點擊「分析」按鈕時呼叫此端點。
    使用進階模型（Claude 3.5 Sonnet + GPT-4 fallback）做完整 full_analysis。
    
    Returns:
        202 Accepted（非同步處理）
    """
    conversation = Conversation.query.get_or_404(conversation_id)

    denied = _check_conversation_access(conversation)
    if denied:
        return denied

    # 檢查是否有訊息
    message_count = (
        Message.query
        .filter_by(conversation_id=conversation.id)
        .count()
    )
    
    if message_count == 0:
        return jsonify({
            'error': '此對話沒有訊息，無法進行分析'
        }), 400
    
    # 觸發非同步深度分析
    task = analyze_conversation.delay(str(conversation.id), trigger_type='manual')
    
    logger.info(f"🔍 手動分析已觸發: conversation={conversation_id}, task={task.id}")
    
    return jsonify({
        'message': '分析任務已提交',
        'conversation_id': str(conversation.id),
        'task_id': task.id,
        'trigger_type': 'manual'
    }), 202


@api_bp.route('/inbox/conversations/<conversation_id>/send', methods=['POST'])
@login_required
@require_role('admin', 'manager', 'user')
def send_message(conversation_id):
    """
    發送訊息（文字或圖片）

    Request body:
        - content: 訊息內容（文字必填，圖片選填作為 caption）
        - message_type: 'text' | 'image'（預設 'text'）
        - media_url: 圖片 URL（message_type='image' 時必填）
    """
    conversation = Conversation.query.get_or_404(conversation_id)

    denied = _check_conversation_access(conversation)
    if denied:
        return denied

    data = request.get_json() or {}

    message_type = data.get('message_type', 'text')
    allowed_outbound_types = {'text', 'image'}
    if not isinstance(message_type, str) or message_type not in allowed_outbound_types:
        return jsonify({'error': '不支援的訊息類型'}), 400

    raw_content = data.get('content') or ''
    content = raw_content.strip() if isinstance(raw_content, str) else str(raw_content).strip()
    media_url = data.get('media_url')
    # PR-2 新增：內部備註與 @ 提及
    is_internal = bool(data.get('is_internal', False))
    mentions = data.get('mentions') or []
    if not isinstance(mentions, list):
        return jsonify({'error': 'mentions 必須為陣列'}), 400
    reply_to_message_id = data.get('reply_to_message_id')
    reply_to_message, reply_error = _validate_reply_to_message(conversation.id, reply_to_message_id)
    if reply_error:
        return reply_error

    if message_type == 'text' and not content:
        return jsonify({'error': '請提供訊息內容'}), 400
    if message_type == 'image' and not media_url:
        return jsonify({'error': '請提供 media_url'}), 400

    # 找到 PSID
    contact = conversation.contact
    psid = _get_contact_external_id(contact, channel=conversation.channel)

    # 依渠道選擇發送方式（內部備註不對外發送）
    sent_via_api = False
    api_error = None
    channel = conversation.channel

    if is_internal:
        # PR-2：內部備註只儲存，不發送平台
        pass
    else:
        try:
            if psid and channel in ('messenger', 'instagram'):
                from ..utils.meta_api import meta_api
                if message_type == 'text':
                    sent_via_api = meta_api.send_message(psid, content)
                elif message_type == 'image':
                    sent_via_api = meta_api.send_image(psid, media_url)
                    if content and sent_via_api:
                        meta_api.send_message(psid, content)
            elif psid and channel == 'line':
                from ..channels.registry import channel_registry
                line_adapter = channel_registry.get_adapter('line')
                if line_adapter:
                    if message_type == 'text':
                        sent_via_api = line_adapter.send_message(psid, content)
                    elif message_type == 'image':
                        sent_via_api = line_adapter.send_image(psid, media_url)
                        if content and sent_via_api:
                            line_adapter.send_message(psid, content)
        except Exception as e:
            logger.warning(f"[{channel}] API 發送失敗: {e}")
            api_error = str(e)

    # 不管 API 是否成功，都建立 Message 記錄
    now = datetime.now(timezone.utc)
    msg = Message(
        conversation_id=conversation.id,
        contact_id=contact.id,
        sender_type='business',
        message_type=message_type,
        content=content or None,
        media_url=media_url if message_type == 'image' else None,
        is_internal=is_internal,
        mentions=mentions,
        reply_to_message_id=reply_to_message.id if reply_to_message else None,
        sent_at=now,
    )
    db.session.add(msg)

    # 更新 conversation 統計（使用 SQL 表達式做原子遞增，避免並發競態）
    conversation.message_count = Conversation.message_count + 1
    conversation.last_message_at = now

    db.session.commit()
    _emit_new_message_safely(msg, conversation, contact)

    response = {
        'message': '訊息已發送' if sent_via_api else '訊息已記錄（Meta API 未連接）',
        'sent_via_api': sent_via_api,
        'data': msg.to_dict(),
    }
    if api_error:
        response['api_error'] = api_error
        response['message'] = f'訊息已記錄，但發送至平台失敗：{api_error}'

    return jsonify(response)


@api_bp.route('/inbox/conversations/<conversation_id>/send-image', methods=['POST'])
@login_required
@require_role('admin', 'manager', 'user')
def send_image_message(conversation_id):
    """
    發送圖片訊息（舊版端點，保留向下相容）

    Request body:
        - image_url: 圖片 URL（必填）
        - caption: 圖片說明文字（選填）
    """
    conversation = Conversation.query.get_or_404(conversation_id)

    denied = _check_conversation_access(conversation)
    if denied:
        return denied

    data = request.get_json() or {}

    image_url = data.get('image_url')
    if not image_url:
        return jsonify({'error': '請提供 image_url'}), 400

    caption = data.get('caption', '')

    # 透過 channel_identifiers 取得 PSID
    from ..utils.meta_api import meta_api
    contact = conversation.contact
    psid = _get_contact_external_id(contact, channel=conversation.channel)

    success = False
    if psid:
        try:
            success = meta_api.send_image(psid, image_url)
        except Exception as e:
            logger.warning(f"Meta API send_image 失敗: {e}")

    # 建立訊息記錄
    now = datetime.now(timezone.utc)
    msg = Message(
        conversation_id=conversation.id,
        contact_id=contact.id,
        sender_type='business',
        message_type='image',
        content=caption,
        media_url=image_url,
        sent_at=now,
    )
    db.session.add(msg)

    conversation.message_count = (conversation.message_count or 0) + 1
    conversation.last_message_at = now

    db.session.commit()
    _emit_new_message_safely(msg, conversation, contact)

    return jsonify({
        'message': '圖片已發送' if success else '圖片已記錄（Meta API 未連接）',
        'sent_via_api': success,
        'message_id': str(msg.id),
    })


# ── Message Actions（Telegram native capability boundary） ───────────────


@api_bp.route('/inbox/messages/<message_id>/reactions', methods=['POST'])
@login_required
@require_role('admin', 'manager', 'user')
def add_message_reaction(message_id):
    message, err = _get_message_or_error(message_id)
    if err:
        return err
    channel_err = _ensure_telegram_conversation(message.conversation)
    if channel_err:
        return channel_err

    data = request.get_json(silent=True) or {}
    emoji = data.get('emoji')
    if not isinstance(emoji, str) or not emoji.strip():
        return jsonify({'error': '請提供 emoji'}), 400
    emoji = emoji.strip()
    if len(emoji) > 32:
        return jsonify({'error': 'emoji 長度不可超過 32'}), 400

    actor = get_current_user()
    actor_id = str(actor.id) if actor else 'unknown'
    reactions = dict(message.reactions or {})
    users = reactions.get(emoji)
    if not isinstance(users, list):
        users = []
    if actor_id not in users:
        users.append(actor_id)
    reactions[emoji] = users
    message.reactions = reactions
    flag_modified(message, 'reactions')

    db.session.commit()
    _emit_message_action(message, 'message.reaction_updated')
    return _message_action_response(message, '已記錄訊息反應')


@api_bp.route('/inbox/messages/<message_id>/reactions/<path:emoji>', methods=['DELETE'])
@login_required
@require_role('admin', 'manager', 'user')
def remove_message_reaction(message_id, emoji):
    message, err = _get_message_or_error(message_id)
    if err:
        return err
    channel_err = _ensure_telegram_conversation(message.conversation)
    if channel_err:
        return channel_err

    decoded_emoji = unquote(emoji or '').strip()
    if not decoded_emoji:
        return jsonify({'error': '請提供 emoji'}), 400

    actor = get_current_user()
    actor_id = str(actor.id) if actor else 'unknown'
    reactions = dict(message.reactions or {})
    users = reactions.get(decoded_emoji)
    if isinstance(users, list):
        users = [uid for uid in users if uid != actor_id]
        if users:
            reactions[decoded_emoji] = users
        else:
            reactions.pop(decoded_emoji, None)
    message.reactions = reactions
    flag_modified(message, 'reactions')

    db.session.commit()
    _emit_message_action(message, 'message.reaction_updated')
    return _message_action_response(message, '已移除訊息反應')


@api_bp.route('/inbox/messages/<message_id>/pin', methods=['POST'])
@login_required
@require_role('admin', 'manager', 'user')
def pin_message(message_id):
    message, err = _get_message_or_error(message_id)
    if err:
        return err
    channel_err = _ensure_telegram_conversation(message.conversation)
    if channel_err:
        return channel_err

    actor = get_current_user()
    message.pinned_at = datetime.now(timezone.utc)
    message.pinned_by = actor.id if actor else None
    db.session.commit()
    _emit_message_action(message, 'message.pinned')
    return _message_action_response(message, '已記錄釘選訊息')


@api_bp.route('/inbox/messages/<message_id>/pin', methods=['DELETE'])
@login_required
@require_role('admin', 'manager', 'user')
def unpin_message(message_id):
    message, err = _get_message_or_error(message_id)
    if err:
        return err
    channel_err = _ensure_telegram_conversation(message.conversation)
    if channel_err:
        return channel_err

    message.pinned_at = None
    message.pinned_by = None
    db.session.commit()
    _emit_message_action(message, 'message.unpinned')
    return _message_action_response(message, '已取消釘選訊息')


@api_bp.route('/inbox/messages/<message_id>', methods=['PATCH'])
@login_required
@require_role('admin', 'manager', 'user')
def edit_message(message_id):
    message, err = _get_message_or_error(message_id)
    if err:
        return err
    channel_err = _ensure_telegram_conversation(message.conversation)
    if channel_err:
        return channel_err
    if message.sender_type != 'business':
        return jsonify({'error': '只能編輯我方訊息'}), 400
    if message.deleted_at:
        return jsonify({'error': '不能編輯已刪除的訊息'}), 400

    data = request.get_json(silent=True) or {}
    raw_content = data.get('content')
    if not isinstance(raw_content, str) or not raw_content.strip():
        return jsonify({'error': '請提供訊息內容'}), 400

    message.content = raw_content.strip()
    message.edited_at = datetime.now(timezone.utc)
    db.session.commit()
    _emit_message_action(message, 'message.edited')
    return _message_action_response(message, '已記錄訊息編輯')


@api_bp.route('/inbox/messages/<message_id>', methods=['DELETE'])
@login_required
@require_role('admin', 'manager', 'user')
def delete_message(message_id):
    message, err = _get_message_or_error(message_id)
    if err:
        return err
    channel_err = _ensure_telegram_conversation(message.conversation)
    if channel_err:
        return channel_err

    data = request.get_json(silent=True) or {}
    deleted_for = data.get('deleted_for') or ['everyone']
    if isinstance(deleted_for, str):
        deleted_for = [deleted_for]
    if not isinstance(deleted_for, list) or not all(isinstance(item, str) for item in deleted_for):
        return jsonify({'error': 'deleted_for 必須為字串或字串陣列'}), 400

    message.deleted_at = datetime.now(timezone.utc)
    message.deleted_for = deleted_for
    flag_modified(message, 'deleted_for')
    db.session.commit()
    _emit_message_action(message, 'message.deleted')
    return _message_action_response(message, '已記錄訊息刪除')


@api_bp.route('/inbox/messages/<message_id>/forward', methods=['POST'])
@login_required
@require_role('admin', 'manager', 'user')
def forward_message(message_id):
    source_message, err = _get_message_or_error(message_id)
    if err:
        return err
    channel_err = _ensure_telegram_conversation(source_message.conversation)
    if channel_err:
        return channel_err
    if source_message.deleted_at:
        return jsonify({'error': '不能轉發已刪除的訊息'}), 400

    data = request.get_json(silent=True) or {}
    target_conversation_id = data.get('target_conversation_id') or data.get('conversation_id')
    if not target_conversation_id:
        return jsonify({'error': '請提供 target_conversation_id'}), 400

    target_conversation = Conversation.query.get(target_conversation_id)
    if not target_conversation:
        return jsonify({'error': '目標對話不存在'}), 404
    denied = _check_conversation_access(target_conversation)
    if denied:
        return denied
    channel_err = _ensure_telegram_conversation(target_conversation)
    if channel_err:
        return channel_err

    now = datetime.now(timezone.utc)
    metadata = dict(source_message.message_metadata or {})
    metadata['forwarded_from_message_id'] = str(source_message.id)
    metadata['forwarded_from_conversation_id'] = str(source_message.conversation_id)
    forwarded = Message(
        conversation_id=target_conversation.id,
        contact_id=target_conversation.contact_id,
        sender_type='business',
        message_type=source_message.message_type,
        content=source_message.content,
        media_url=source_message.media_url,
        message_metadata=metadata,
        sent_at=now,
    )
    db.session.add(forwarded)
    target_conversation.message_count = Conversation.message_count + 1
    target_conversation.last_message_at = now
    db.session.commit()
    _emit_message_action(forwarded, 'message.forwarded')

    return jsonify({
        'message': '已記錄轉發訊息',
        'platform_supported': False,
        'platform_message': TELEGRAM_NATIVE_UNSUPPORTED,
        'data': forwarded.to_dict(),
    }), 201


@api_bp.route('/inbox/conversations/<conversation_id>/read', methods=['POST'])
@login_required
@require_role('admin', 'manager', 'user')
def mark_conversation_read(conversation_id):
    conversation = Conversation.query.get_or_404(conversation_id)
    denied = _check_conversation_access(conversation)
    if denied:
        return denied

    Message.query.filter_by(conversation_id=conversation.id).update(
        {'is_read': True},
        synchronize_session=False,
    )
    db.session.commit()
    return jsonify({'message': '對話已標記為已讀', 'conversation_id': str(conversation.id)})


@api_bp.route('/inbox/conversations/<conversation_id>/unread', methods=['POST'])
@login_required
@require_role('admin', 'manager', 'user')
def mark_conversation_unread(conversation_id):
    conversation = Conversation.query.get_or_404(conversation_id)
    denied = _check_conversation_access(conversation)
    if denied:
        return denied

    Message.query.filter_by(conversation_id=conversation.id).update(
        {'is_read': False},
        synchronize_session=False,
    )
    db.session.commit()
    return jsonify({'message': '對話已標記為未讀', 'conversation_id': str(conversation.id)})


@api_bp.route('/inbox/conversations/<conversation_id>/typing', methods=['POST'])
@login_required
@require_role('admin', 'manager', 'user')
def send_typing_indicator(conversation_id):
    conversation = Conversation.query.get_or_404(conversation_id)
    denied = _check_conversation_access(conversation)
    if denied:
        return denied
    channel_err = _ensure_telegram_conversation(conversation)
    if channel_err:
        return channel_err

    return jsonify({
        'message': TELEGRAM_NATIVE_UNSUPPORTED,
        'platform_supported': False,
        'conversation_id': str(conversation.id),
    }), 501


@api_bp.route('/inbox/conversations/<conversation_id>/close', methods=['POST'])
@login_required
def close_conversation(conversation_id):
    """手動關閉對話"""
    conversation = Conversation.query.get_or_404(conversation_id)

    denied = _check_conversation_access(conversation)
    if denied:
        return denied

    if conversation.status == 'active':
        conversation.close_conversation()
        db.session.commit()
        
        return jsonify({
            'message': '對話已關閉',
            'conversation': conversation.to_dict()
        })
    else:
        return jsonify({'error': '對話已經關閉'}), 400
