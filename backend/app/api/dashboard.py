"""
MUSE CRM — Dashboard API

Dashboard 統計數據相關 API 端點。
"""

from datetime import datetime, timedelta, timezone
from flask import current_app, jsonify, request
from sqlalchemy import func, and_, desc, text
from sqlalchemy.orm import aliased

from . import api_bp
from ..models import Contact, Conversation, Message, Action, Analysis
from .. import db
from ..utils.auth import login_required
from ..utils.permissions import get_current_user, require_role
from ..utils.scope import apply_contact_scope


def _scoped_contacts_query(user=None):
    user = user or get_current_user()
    query = Contact.query.filter(Contact.is_merged == False)
    return apply_contact_scope(query, user) if user else query


def _scoped_conversations_query(user=None):
    user = user or get_current_user()
    query = Conversation.query.join(Contact, Conversation.contact_id == Contact.id)
    return apply_contact_scope(query, user) if user else query


def _scoped_conversation_ids_subquery(user=None):
    return (
        _scoped_conversations_query(user)
        .with_entities(Conversation.id.label('id'))
        .subquery()
    )


def _scoped_messages_query(user=None):
    user = user or get_current_user()
    query = Message.query.join(Contact, Message.contact_id == Contact.id)
    return apply_contact_scope(query, user) if user else query


def _scoped_actions_query(user=None):
    user = user or get_current_user()
    query = Action.query.join(Contact, Action.contact_id == Contact.id)
    return apply_contact_scope(query, user) if user else query


def _scoped_analyses_query(user=None):
    user = user or get_current_user()
    query = Analysis.query.join(Contact, Analysis.contact_id == Contact.id)
    return apply_contact_scope(query, user) if user else query


@api_bp.route('/dashboard/overview', methods=['GET'])
@login_required
@require_role('admin', 'manager')
def dashboard_overview():
    """
    Dashboard 總覽數據
    
    Query parameters:
        - days: 統計天數（預設 30）
    """
    days = max(1, min(request.args.get('days', 30, type=int), 365))
    start_date = datetime.now(timezone.utc) - timedelta(days=days)
    user = get_current_user()

    # 基礎 Contact 查詢（套用 scope）
    contact_q = _scoped_contacts_query(user)

    # 總客戶數
    total_contacts = contact_q.count()

    # 新客戶數（指定期間）
    new_contacts = contact_q.filter(Contact.created_at >= start_date).count()

    # 基礎 Conversation 查詢（套用 scope）
    conv_q = _scoped_conversations_query(user)

    # 總對話數
    total_conversations = conv_q.count()

    # 活躍對話數
    active_conversations = conv_q.filter(Conversation.status == 'active').count()

    # 新對話數（指定期間）
    new_conversations = conv_q.filter(Conversation.created_at >= start_date).count()

    # 基礎 Action 查詢（套用 scope）
    action_q = _scoped_actions_query(user)

    # 待辦動作統計
    pending_actions = action_q.filter(
        Action.status.in_(['pending', 'assigned', 'in_progress'])
    ).count()

    overdue_actions = action_q.filter(
        and_(
            Action.due_date < datetime.now(timezone.utc).date(),
            Action.status.in_(['pending', 'assigned', 'in_progress'])
        )
    ).count()

    completed_actions = action_q.filter(
        Action.status == 'completed'
    ).count()
    
    # LLM 分析統計（套用 scope）
    analysis_q = _scoped_analyses_query(user)
    total_analyses = analysis_q.count()
    recent_analyses = analysis_q.filter(
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
@require_role('admin', 'manager')
def conversation_trends():
    """
    對話量趨勢數據（按日統計）
    
    Query parameters:
        - days: 統計天數（預設 30）
    """
    days = max(1, min(request.args.get('days', 30, type=int), 365))
    start_date = datetime.now(timezone.utc) - timedelta(days=days)
    user = get_current_user()

    # 按日統計對話數
    results = (
        _scoped_conversations_query(user)
        .with_entities(
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
@require_role('admin', 'manager')
def channel_distribution():
    """渠道分布統計"""
    user = get_current_user()
    results = (
        _scoped_contacts_query(user)
        .with_entities(
            Contact.source_channel.label('channel'),
            func.count(Contact.id).label('count')
        )
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


# ── PR-7：主管 KPI 端點（PRD §F10） ───────────────────────

@api_bp.route('/dashboard/first-response-time', methods=['GET'])
@login_required
@require_role('admin', 'manager')
def first_response_time():
    """
    首次回覆時間 P50 / P90（單位：分鐘）。
    對每個對話：找出第一則 customer 訊息 → 之後第一則 business 訊息的時間差。
    """
    user = get_current_user()
    scoped_conversation_ids = _scoped_conversation_ids_subquery(user)

    first_customer = (
        db.session.query(
            Message.conversation_id.label('conversation_id'),
            func.min(Message.sent_at).label('t'),
        )
        .join(scoped_conversation_ids, Message.conversation_id == scoped_conversation_ids.c.id)
        .filter(
            Message.sender_type == 'customer',
            func.coalesce(Message.is_internal, False).is_(False),
        )
        .group_by(Message.conversation_id)
        .subquery()
    )

    business_message = aliased(Message)
    first_business = (
        db.session.query(
            business_message.conversation_id.label('conversation_id'),
            func.min(business_message.sent_at).label('t'),
        )
        .join(first_customer, first_customer.c.conversation_id == business_message.conversation_id)
        .filter(
            business_message.sender_type == 'business',
            func.coalesce(business_message.is_internal, False).is_(False),
            business_message.sent_at > first_customer.c.t,
        )
        .group_by(business_message.conversation_id)
        .subquery()
    )

    diffs = (
        db.session.query(
            (func.extract('epoch', first_business.c.t - first_customer.c.t) / 60.0).label('minutes')
        )
        .select_from(first_customer)
        .join(first_business, first_business.c.conversation_id == first_customer.c.conversation_id)
        .subquery()
    )

    rows = (
        db.session.query(
            func.percentile_cont(0.5).within_group(diffs.c.minutes).label('p50'),
            func.percentile_cont(0.9).within_group(diffs.c.minutes).label('p90'),
            func.count().label('sample_count'),
        )
        .select_from(diffs)
        .first()
    )

    return jsonify({
        'p50_minutes': float(rows.p50) if rows and rows.p50 is not None else None,
        'p90_minutes': float(rows.p90) if rows and rows.p90 is not None else None,
        'sample_count': int(rows.sample_count) if rows else 0,
    })


@api_bp.route('/dashboard/resolution-rate', methods=['GET'])
@login_required
@require_role('admin', 'manager')
def resolution_rate():
    """
    解決率（resolved / total）（PRD §F10）。
    Query: days（預設 30）
    """
    days = max(1, min(request.args.get('days', 30, type=int), 365))
    start_date = datetime.now(timezone.utc) - timedelta(days=days)
    user = get_current_user()

    conv_q = _scoped_conversations_query(user)
    total = conv_q.filter(Conversation.created_at >= start_date).count()
    resolved = conv_q.filter(
        Conversation.created_at >= start_date,
        Conversation.status.in_(('resolved', 'closed')),
    ).count()
    rate = (resolved / total) if total > 0 else 0
    return jsonify({
        'period_days': days,
        'total': total,
        'resolved': resolved,
        'resolution_rate': round(rate, 4),
    })


@api_bp.route('/dashboard/conversation-status', methods=['GET'])
@login_required
@require_role('admin', 'manager')
def conversation_status_distribution():
    """
    當前對話依 status 分組計數（PR-7 KPI 視圖）。
    回傳: { unassigned, active, waiting_customer, escalated, supervisor_taken, resolved, closed }
    """
    user = get_current_user()
    q = (
        _scoped_conversations_query(user)
        .with_entities(Conversation.status, func.count(Conversation.id))
    )
    rows = q.group_by(Conversation.status).all()

    result = {s: 0 for s in (
        'unassigned', 'active', 'waiting_customer',
        'escalated', 'supervisor_taken', 'resolved', 'closed',
    )}
    for status, cnt in rows:
        if status in result:
            result[status] = int(cnt)
        else:
            # 未在 enum 內，加到 closed 桶以免遺漏
            result['closed'] = result.get('closed', 0) + int(cnt)
    return jsonify(result)


@api_bp.route('/dashboard/today-conversations', methods=['GET'])
@login_required
@require_role('admin', 'manager')
def today_conversations():
    """今日新對話數（以 Asia/Taipei 計算日界）"""
    user = get_current_user()
    tz_name = current_app.config.get('DISPLAY_TIMEZONE', 'Asia/Taipei')
    try:
        import zoneinfo
        tz = zoneinfo.ZoneInfo(tz_name)
    except Exception:
        tz = timezone(timedelta(hours=8))
    now_local = datetime.now(tz)
    today_start = now_local.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
    yesterday_start = today_start - timedelta(days=1)

    q = _scoped_conversations_query(user)
    today_count = q.filter(Conversation.created_at >= today_start).count()
    yesterday_count = q.filter(
        Conversation.created_at >= yesterday_start,
        Conversation.created_at < today_start,
    ).count()
    return jsonify({
        'today': today_count,
        'yesterday': yesterday_count,
    })


@api_bp.route('/dashboard/escalation-rate', methods=['GET'])
@login_required
@require_role('admin', 'manager')
def escalation_rate():
    """求援率 = escalated 對話數 / 全部開放對話數（PRD §F10）"""
    days = max(1, min(request.args.get('days', 30, type=int), 365))
    start_date = datetime.now(timezone.utc) - timedelta(days=days)
    user = get_current_user()

    conv_q = _scoped_conversations_query(user)
    total = conv_q.filter(Conversation.created_at >= start_date).count()
    escalated = conv_q.filter(
        Conversation.created_at >= start_date,
        Conversation.escalated_at.isnot(None),
    ).count()
    rate = (escalated / total) if total > 0 else 0
    return jsonify({
        'period_days': days,
        'total': total,
        'escalated': escalated,
        'escalation_rate': round(rate, 4),
    })


@api_bp.route('/dashboard/actions/completion', methods=['GET'])
@login_required
@require_role('admin', 'manager')
def action_completion_rate():
    """待辦動作完成率統計"""
    user = get_current_user()
    action_q = _scoped_actions_query(user)
    total_actions = action_q.count()
    completed_actions = action_q.filter(Action.status == 'completed').count()
    
    completion_rate = (completed_actions / total_actions * 100) if total_actions > 0 else 0
    
    # 按狀態分組統計
    status_stats = (
        action_q
        .with_entities(
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
@require_role('admin', 'manager')
def dashboard_stats():
    """
    Dashboard 統計數據（簡化版，供前端 DashboardStats 使用）
    
    Returns flat object:
        { total_contacts, total_conversations, active_conversations, total_messages, pending_actions }
    """
    user = get_current_user()

    contact_q = _scoped_contacts_query(user)
    total_contacts = contact_q.count()

    conv_q = _scoped_conversations_query(user)
    total_conversations = conv_q.count()
    active_conversations = conv_q.filter(Conversation.status == 'active').count()

    # 訊息數量：透過 Contact scope 過濾
    msg_q = _scoped_messages_query(user)
    total_messages = msg_q.count()

    action_q = _scoped_actions_query(user)
    pending_actions = action_q.filter(
        Action.status.in_(['pending', 'assigned', 'in_progress'])
    ).count()

    # 緊急度分布：以 contact_status 粗略對應（Tag 系統下線後的暫時替代方案）
    # TODO PR-2/PR-7：改用 Conversation 的 escalated/escalation 統計
    high_contacts = contact_q.filter(Contact.contact_status == 'quoted').count()
    medium_contacts = contact_q.filter(Contact.contact_status == 'following_up').count()
    low_contacts = max(0, total_contacts - high_contacts - medium_contacts)

    # 對話狀態分布
    silent_conversations = conv_q.filter(
        Conversation.status == 'active',
        Conversation.last_message_at < (datetime.now(timezone.utc) - timedelta(hours=24))
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
    today_start = now_local.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
    yesterday_start = today_start - timedelta(days=1)
    today_messages = msg_q.filter(Message.sent_at >= today_start).count()
    yesterday_messages = msg_q.filter(
        Message.sent_at >= yesterday_start,
        Message.sent_at < today_start
    ).count()

    # 渠道分布
    channel_results = (
        contact_q
        .with_entities(
            Contact.source_channel,
            func.count(Contact.id)
        )
        .group_by(Contact.source_channel)
        .order_by(func.count(Contact.id).desc())
        .all()
    )
    channel_distribution_data = [
        {'channel': ch or '未知', 'count': cnt}
        for ch, cnt in channel_results
    ]

    # 客戶跟進狀態分布
    status_results = (
        contact_q
        .with_entities(
            Contact.contact_status,
            func.count(Contact.id)
        )
        .group_by(Contact.contact_status)
        .order_by(func.count(Contact.id).desc())
        .all()
    )
    contact_status_data = {s or 'unknown': cnt for s, cnt in status_results}

    # 購買意向分布
    intent_results = (
        contact_q
        .with_entities(
            Contact.intent,
            func.count(Contact.id)
        )
        .group_by(Contact.intent)
        .order_by(func.count(Contact.id).desc())
        .all()
    )
    intent_data = {i or 'unknown': cnt for i, cnt in intent_results}

    # 轉換漏斗
    funnel_total = total_contacts
    funnel_engaged = contact_q.filter(
        Contact.contact_status.in_(['following_up', 'quoted', 'won'])
    ).count()
    funnel_quoted = contact_q.filter(
        Contact.contact_status.in_(['quoted', 'won'])
    ).count()
    funnel_won = contact_q.filter(Contact.contact_status == 'won').count()

    # 平均回覆時間（小時）
    avg_response_hours = None
    try:
        scoped_conversation_ids = _scoped_conversation_ids_subquery(user)
        customer_message = aliased(Message)
        business_message = aliased(Message)
        result = (
            db.session.query(
                func.avg(
                    func.extract('epoch', business_message.sent_at - customer_message.sent_at) / 3600.0
                )
            )
            .select_from(customer_message)
            .join(scoped_conversation_ids, customer_message.conversation_id == scoped_conversation_ids.c.id)
            .join(
                business_message,
                and_(
                    business_message.conversation_id == customer_message.conversation_id,
                    business_message.sender_type == 'business',
                    business_message.sent_at > customer_message.sent_at,
                    business_message.sent_at - customer_message.sent_at < text("INTERVAL '7 days'"),
                ),
            )
            .filter(customer_message.sender_type == 'customer')
            .scalar()
        )
        if result is not None:
            avg_response_hours = round(float(result), 1)
    except Exception:
        pass

    # 熱門對話 Top 5
    top_convs_q = (
        _scoped_conversations_query(user)
        .with_entities(Conversation, Contact)
        .order_by(desc(Conversation.message_count))
        .limit(5)
        .all()
    )
    top_conversations = [
        {
            'id': str(conv.id),
            'contact_name': contact.display_name or '未知',
            'channel': conv.channel,
            'message_count': conv.message_count or 0,
            'status': conv.status,
            'last_message_at': conv.last_message_at.isoformat() if conv.last_message_at else None,
        }
        for conv, contact in top_convs_q
    ]

    # 30 天訊息活動趨勢
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    activity_results = (
        msg_q
        .with_entities(
            func.date(Message.sent_at).label('date'),
            func.count(Message.id).label('count'),
        )
        .filter(Message.sent_at >= thirty_days_ago)
        .group_by(func.date(Message.sent_at))
        .order_by(func.date(Message.sent_at))
        .all()
    )
    message_activity = [
        {'date': r.date.isoformat() if hasattr(r.date, 'isoformat') else str(r.date), 'count': r.count}
        for r in activity_results
    ]

    return jsonify({
        'total_contacts': total_contacts,
        'total_conversations': total_conversations,
        'active_conversations': active_conversations,
        'total_messages': total_messages,
        'pending_actions': pending_actions,
        'avg_response_hours': avg_response_hours,
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
        'channel_distribution': channel_distribution_data,
        'contact_status': contact_status_data,
        'intent_distribution': intent_data,
        'conversion_funnel': {
            'total': funnel_total,
            'engaged': funnel_engaged,
            'quoted': funnel_quoted,
            'won': funnel_won,
        },
        'top_conversations': top_conversations,
        'message_activity': message_activity,
    })


@api_bp.route('/dashboard/channel-distribution', methods=['GET'])
@login_required
@require_role('admin', 'manager')
def channel_distribution_compat():
    """渠道分布統計（前端相容別名）"""
    return channel_distribution()


@api_bp.route('/dashboard/activity', methods=['GET'])
@login_required
@require_role('admin', 'manager')
def dashboard_activity():
    """
    活動趨勢（前端相容格式）
    
    Returns: [{ date, messages, conversations }]
    """
    days = max(1, min(request.args.get('days', 30, type=int), 365))
    start_date = datetime.now(timezone.utc) - timedelta(days=days)
    user = get_current_user()
    
    # 按日統計對話數
    conv_results = dict(
        _scoped_conversations_query(user)
        .with_entities(
            func.date(Conversation.created_at).label('date'),
            func.count(Conversation.id).label('count')
        )
        .filter(Conversation.created_at >= start_date)
        .group_by(func.date(Conversation.created_at))
        .all()
    )
    
    # 按日統計訊息數
    msg_results = dict(
        _scoped_messages_query(user)
        .with_entities(
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
@require_role('admin', 'manager')
def export_dashboard_csv():
    """
    匯出 Dashboard 數據為 CSV

    TODO: 實作完整 CSV 匯出（含客戶、對話、動作等資料）。
    目前回傳 501 Not Implemented。預計 Phase 3 實作。
    """
    return jsonify({
        'error': 'Not Implemented',
        'message': 'CSV 匯出功能尚未實作，預計 Phase 3 提供。',
    }), 501
