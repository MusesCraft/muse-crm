"""
MUSE CRM — Dashboard API

Dashboard 統計數據相關 API 端點。
"""

from datetime import datetime, timedelta, timezone
from flask import current_app, jsonify, request
from sqlalchemy import func, and_, distinct

from . import api_bp
from ..models import Contact, Conversation, Message, Action, Tag, ContactTag, Analysis
from .. import db
from ..utils.auth import login_required
from ..utils.permissions import get_current_user
from ..utils.scope import apply_contact_scope


@api_bp.route('/dashboard/overview', methods=['GET'])
@login_required
def dashboard_overview():
    """
    Dashboard 總覽數據
    
    Query parameters:
        - days: 統計天數（預設 30）
    """
    days = request.args.get('days', 30, type=int)
    start_date = datetime.utcnow() - timedelta(days=days)
    user = get_current_user()

    # 基礎 Contact 查詢（套用 scope）
    contact_q = Contact.query.filter(Contact.is_merged == False)
    if user:
        contact_q = apply_contact_scope(contact_q, user)

    # 總客戶數
    total_contacts = contact_q.count()

    # 新客戶數（指定期間）
    new_contacts = contact_q.filter(Contact.created_at >= start_date).count()

    # 基礎 Conversation 查詢（套用 scope）
    conv_q = Conversation.query.join(Contact, Conversation.contact_id == Contact.id)
    if user:
        conv_q = apply_contact_scope(conv_q, user)

    # 總對話數
    total_conversations = conv_q.count()

    # 活躍對話數
    active_conversations = conv_q.filter(Conversation.status == 'active').count()

    # 新對話數（指定期間）
    new_conversations = conv_q.filter(Conversation.created_at >= start_date).count()

    # 基礎 Action 查詢（套用 scope）
    action_q = Action.query.join(Contact, Action.contact_id == Contact.id)
    if user:
        action_q = apply_contact_scope(action_q, user)

    # 待辦動作統計
    pending_actions = action_q.filter(
        Action.status.in_(['pending', 'assigned', 'in_progress'])
    ).count()

    overdue_actions = action_q.filter(
        and_(
            Action.due_date < datetime.utcnow().date(),
            Action.status.in_(['pending', 'assigned', 'in_progress'])
        )
    ).count()

    completed_actions = action_q.filter(
        Action.status == 'completed'
    ).count()
    
    # LLM 分析統計
    total_analyses = Analysis.query.count()
    recent_analyses = Analysis.query.filter(
        Analysis.created_at >= start_date
    ).count()
    
    return jsonify({
        'period': f'最近 {days} 天',
        'contacts': {
            'total': total_contacts,
            'new': new_contacts
        },
        'conversations': {
            'total': total_conversations,
            'active': active_conversations,
            'new': new_conversations
        },
        'actions': {
            'pending': pending_actions,
            'overdue': overdue_actions,
            'completed': completed_actions
        },
        'analyses': {
            'total': total_analyses,
            'recent': recent_analyses
        }
    })


@api_bp.route('/dashboard/trends', methods=['GET'])
@login_required
def conversation_trends():
    """
    對話量趨勢數據（按日統計）
    
    Query parameters:
        - days: 統計天數（預設 30）
    """
    days = request.args.get('days', 30, type=int)
    start_date = datetime.utcnow() - timedelta(days=days)
    
    # 按日統計對話數
    results = (
        db.session.query(
            func.date(Conversation.created_at).label('date'),
            func.count(Conversation.id).label('count')
        )
        .filter(Conversation.created_at >= start_date)
        .group_by(func.date(Conversation.created_at))
        .order_by(func.date(Conversation.created_at))
        .all()
    )
    
    trend_data = [
        {
            'date': result.date.isoformat(),
            'count': result.count
        }
        for result in results
    ]
    
    return jsonify({
        'period': f'最近 {days} 天',
        'trends': trend_data
    })


@api_bp.route('/dashboard/channels', methods=['GET'])
@login_required
def channel_distribution():
    """渠道分布統計"""
    results = (
        db.session.query(
            Contact.source_channel.label('channel'),
            func.count(Contact.id).label('count')
        )
        .filter(Contact.is_merged == False)
        .group_by(Contact.source_channel)
        .order_by(func.count(Contact.id).desc())
        .all()
    )
    
    channel_data = [
        {
            'channel': result.channel or '未知',
            'count': result.count
        }
        for result in results
    ]
    
    return jsonify(channel_data)


@api_bp.route('/dashboard/tags', methods=['GET'])
@login_required
def tag_distribution():
    """標籤分布統計（Top 10）"""
    results = (
        db.session.query(
            Tag.name,
            Tag.category,
            func.count(ContactTag.contact_id).label('count')
        )
        .join(ContactTag, Tag.id == ContactTag.tag_id)
        .group_by(Tag.id, Tag.name, Tag.category)
        .order_by(func.count(ContactTag.contact_id).desc())
        .limit(10)
        .all()
    )
    
    tag_data = [
        {
            'name': result.name,
            'category': result.category,
            'count': result.count
        }
        for result in results
    ]
    
    return jsonify(tag_data)


@api_bp.route('/dashboard/actions/completion', methods=['GET'])
@login_required
def action_completion_rate():
    """待辦動作完成率統計"""
    total_actions = Action.query.count()
    completed_actions = Action.query.filter(Action.status == 'completed').count()
    
    completion_rate = (completed_actions / total_actions * 100) if total_actions > 0 else 0
    
    # 按狀態分組統計
    status_stats = (
        db.session.query(
            Action.status,
            func.count(Action.id).label('count')
        )
        .group_by(Action.status)
        .all()
    )
    
    status_data = [
        {
            'status': result.status,
            'count': result.count
        }
        for result in status_stats
    ]
    
    return jsonify({
        'completion_rate': round(completion_rate, 2),
        'total_actions': total_actions,
        'completed_actions': completed_actions,
        'status_breakdown': status_data
    })


@api_bp.route('/dashboard/stats', methods=['GET'])
@login_required
def dashboard_stats():
    """
    Dashboard 統計數據（簡化版，供前端 DashboardStats 使用）
    
    Returns flat object:
        { total_contacts, total_conversations, active_conversations, total_messages, pending_actions }
    """
    user = get_current_user()

    contact_q = Contact.query.filter(Contact.is_merged == False)
    if user:
        contact_q = apply_contact_scope(contact_q, user)
    total_contacts = contact_q.count()

    conv_q = Conversation.query.join(Contact, Conversation.contact_id == Contact.id)
    if user:
        conv_q = apply_contact_scope(conv_q, user)
    total_conversations = conv_q.count()
    active_conversations = conv_q.filter(Conversation.status == 'active').count()

    # 訊息數量：透過 Contact scope 過濾
    msg_q = Message.query.join(Contact, Message.contact_id == Contact.id)
    if user:
        msg_q = apply_contact_scope(msg_q, user)
    total_messages = msg_q.count()

    action_q = Action.query.join(Contact, Action.contact_id == Contact.id)
    if user:
        action_q = apply_contact_scope(action_q, user)
    pending_actions = action_q.filter(
        Action.status.in_(['pending', 'assigned', 'in_progress'])
    ).count()

    # 緊急度分布：根據 contact tags 推斷
    from ..models import ContactTag, Tag
    high_priority_tags = {'VIP', '投訴者'}
    medium_priority_tags = {'潛在客戶'}

    # 取得有高優先標籤的 contact 數
    high_contacts = (
        db.session.query(func.count(distinct(ContactTag.contact_id)))
        .join(Tag, ContactTag.tag_id == Tag.id)
        .filter(Tag.name.in_(high_priority_tags))
        .scalar()
    ) or 0
    medium_contacts = (
        db.session.query(func.count(distinct(ContactTag.contact_id)))
        .join(Tag, ContactTag.tag_id == Tag.id)
        .filter(Tag.name.in_(medium_priority_tags))
        .scalar()
    ) or 0
    low_contacts = max(0, total_contacts - high_contacts - medium_contacts)

    # 對話狀態分布
    silent_conversations = conv_q.filter(
        Conversation.status == 'active',
        Conversation.last_message_at < (datetime.utcnow() - timedelta(hours=24))
    ).count()
    unanswered_conversations = conv_q.filter(
        Conversation.status == 'active',
        Conversation.message_count <= 1
    ).count()
    truly_active = max(0, active_conversations - silent_conversations - unanswered_conversations)

    # 今日訊息 vs 昨日（使用 Asia/Taipei 時區計算日期邊界）
    tz_name = current_app.config.get('DISPLAY_TIMEZONE', 'Asia/Taipei')
    try:
        import zoneinfo
        tz = zoneinfo.ZoneInfo(tz_name)
    except Exception:
        tz = timezone(timedelta(hours=8))  # fallback UTC+8
    now_local = datetime.now(tz)
    today_start = now_local.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc).replace(tzinfo=None)
    yesterday_start = today_start - timedelta(days=1)
    today_messages = msg_q.filter(Message.sent_at >= today_start).count()
    yesterday_messages = msg_q.filter(
        Message.sent_at >= yesterday_start,
        Message.sent_at < today_start
    ).count()

    # 來源分析
    ad_contacts = contact_q.filter(Contact.source_type == 'ad_referral').count()
    organic_contacts = total_contacts - ad_contacts
    referral_contacts = 0  # 目前無 referral 來源

    return jsonify({
        'total_contacts': total_contacts,
        'total_conversations': total_conversations,
        'active_conversations': active_conversations,
        'total_messages': total_messages,
        'pending_actions': pending_actions,
        'urgency_distribution': {
            'high': high_contacts,
            'medium': medium_contacts,
            'low': low_contacts,
        },
        'status_distribution': {
            'active': truly_active,
            'silent': silent_conversations,
            'unanswered': unanswered_conversations,
        },
        'today_messages': {
            'count': today_messages,
            'yesterdayCount': yesterday_messages,
        },
        'source_analysis': {
            'organic': organic_contacts,
            'ad': ad_contacts,
            'referral': referral_contacts,
        },
    })


@api_bp.route('/dashboard/channel-distribution', methods=['GET'])
@login_required
def channel_distribution_compat():
    """渠道分布統計（前端相容別名）"""
    return channel_distribution()


@api_bp.route('/dashboard/activity', methods=['GET'])
@login_required
def dashboard_activity():
    """
    活動趨勢（前端相容格式）
    
    Returns: [{ date, messages, conversations }]
    """
    days = request.args.get('days', 30, type=int)
    start_date = datetime.utcnow() - timedelta(days=days)
    
    # 按日統計對話數
    conv_results = dict(
        db.session.query(
            func.date(Conversation.created_at).label('date'),
            func.count(Conversation.id).label('count')
        )
        .filter(Conversation.created_at >= start_date)
        .group_by(func.date(Conversation.created_at))
        .all()
    )
    
    # 按日統計訊息數
    msg_results = dict(
        db.session.query(
            func.date(Message.sent_at).label('date'),
            func.count(Message.id).label('count')
        )
        .filter(Message.sent_at >= start_date)
        .group_by(func.date(Message.sent_at))
        .all()
    )
    
    # 合併所有日期
    all_dates = sorted(set(list(conv_results.keys()) + list(msg_results.keys())))
    
    activity = [
        {
            'date': d.isoformat() if hasattr(d, 'isoformat') else str(d),
            'messages': msg_results.get(d, 0),
            'conversations': conv_results.get(d, 0),
        }
        for d in all_dates
    ]
    
    return jsonify(activity)


@api_bp.route('/dashboard/export', methods=['GET'])
@login_required
def export_dashboard_csv():
    """匯出 Dashboard 數據為 CSV"""
    # TODO: 實作 CSV 匯出功能
    return jsonify({'message': 'CSV 匯出功能開發中'}), 501