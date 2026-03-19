"""
MUSE CRM — Inbox API

對話收件匣相關 API 端點。
"""

import logging

from flask import jsonify, request
from sqlalchemy import desc

from . import api_bp
from ..models import Conversation, Message, Contact
from .. import db
from ..tasks.analysis_tasks import analyze_conversation
from ..utils.auth import login_required

logger = logging.getLogger(__name__)


@api_bp.route('/inbox/conversations', methods=['GET'])
@login_required
def list_conversations():
    """
    列出對話列表（分頁）
    
    Query parameters:
        - page: 頁碼（預設 1）
        - per_page: 每頁筆數（預設 20）
        - status: 篩選狀態 active/closed
        - channel: 篩選渠道 messenger/instagram
        - search: 搜尋客戶名稱或訊息內容
    """
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), 100)
    status = request.args.get('status')
    channel = request.args.get('channel')
    search = request.args.get('search', '').strip()
    
    query = (
        db.session.query(Conversation)
        .join(Contact, Conversation.contact_id == Contact.id)
        .order_by(desc(Conversation.last_message_at))
    )
    
    # 篩選條件
    if status:
        query = query.filter(Conversation.status == status)
    if channel:
        query = query.filter(Conversation.channel == channel)
    if search:
        query = query.filter(
            Contact.display_name.ilike(f'%{search}%')
        )
    
    pagination = query.paginate(page=page, per_page=per_page)
    
    conversations = []
    for conv in pagination.items:
        # 取得最後一則訊息
        last_message = (
            Message.query
            .filter_by(conversation_id=conv.id)
            .order_by(desc(Message.sent_at))
            .first()
        )
        
        conv_dict = conv.to_dict()
        conv_dict['contact'] = conv.contact.to_dict()
        conv_dict['last_message'] = last_message.to_dict() if last_message else None
        conversations.append(conv_dict)
    
    return jsonify({
        'conversations': conversations,
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
        'analyses': [analysis.to_dict() for analysis in conversation.analyses]
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


@api_bp.route('/inbox/conversations/<conversation_id>/close', methods=['POST'])
@login_required
def close_conversation(conversation_id):
    """手動關閉對話"""
    conversation = Conversation.query.get_or_404(conversation_id)
    
    if conversation.status == 'active':
        conversation.close_conversation()
        db.session.commit()
        
        return jsonify({
            'message': '對話已關閉',
            'conversation': conversation.to_dict()
        })
    else:
        return jsonify({'error': '對話已經關閉'}), 400