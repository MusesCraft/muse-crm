"""
MUSE CRM — Dashboard API

Dashboard 統計數據相關 API 端點。
"""

from datetime import datetime, timedelta, timezone
from flask import current_app, jsonify, request
from sqlalchemy import func, and_, distinct, desc

from . import api_bp
from ..models import Contact, Conversation, Message, Action, Analysis
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
    days = max(1, min(request.args.get('days', 30, type=int), 365))
    start_date = datetime.now(timezone.utc) - timedelta(days=days)
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
            Action.due_date < datetime.now(timezone.utc).date(),
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
    days = max(1, min(request.args.get('days', 30, type=int), 365))
    start_date = datetime.now(timezone.utc) - timedelta(days=days)

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


# ── PR-7：主管 KPI 端點（PRD §F10） ───────────────────────

@api_bp.route('/dashboard/first-response-time', methods=['GET'])
@login_required
def first_response_time():
    """
    首次回覆時間 P50 / P90（單位：分鐘）。
    對每個對話：找出第一則 customer 訊息 → 之後第一則 business 訊息的時間差。
    """
    from sqlalchemy import text as sa_text
    rows = db.session.execute(sa_text("""
        WITH first_customer AS (
            SELECT conversation_id, MIN(sent_at) AS t
            FROM messages
            WHERE sender_type = 'customer' AND COALESCE(is_internal, false) = false
            GROUP BY conversation_id
        ),
        first_business AS (
            SELECT m.conversation_id, MIN(m.sent_at) AS t
            FROM messages m
            JOIN first_customer fc ON fc.conversation_id = m.conversation_id
            WHERE m.sender_type = 'business'
              AND COALESCE(m.is_internal, false) = false
              AND m.sent_at > fc.t
            GROUP BY m.conversation_id
        ),
        diffs AS (
            SELECT EXTRACT(EPOCH FROM (fb.t - fc.t)) / 60.0 AS minutes
            FROM first_customer fc
            JOIN first_business fb ON fb.conversation_id = fc.conversation_id
        )
        SELECT
            percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes) AS p50,
            percentile_cont(0.9) WITHIN GROUP (ORDER BY minutes) AS p90,
            COUNT(*) AS sample_count
        FROM diffs
    """)).fetchone()

    return jsonify({
        'p50_minutes': float(rows.p50) if rows and rows.p50 is not None else None,
        'p90_minutes': float(rows.p90) if rows and rows.p90 is not None else None,
        'sample_count': int(rows.sample_count) if rows else 0,
    })


@api_bp.route('/dashboard/resolution-rate', methods=['GET'])
@login_required
def resolution_rate():
    """
    解決率（resolved / total）（PRD §F10）。
    Query: days（預設 30）
    """
    days = max(1, min(request.args.get('days', 30, type=int), 365))
    start_date = datetime.now(timezone.utc) - timedelta(days=days)

    total = Conversation.query.filter(Conversation.created_at >= start_date).count()
    resolved = Conversation.query.filter(
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
def conversation_status_distribution():
    """
    當前對話依 status 分組計數（PR-7 KPI 視圖，v1.1 移除 supervisor_taken）。
    回傳: { unassigned, active, waiting_customer, escalated, resolved, closed }
    """
    user = get_current_user()
    q = (
        db.session.query(Conversation.status, func.count(Conversation.id))
        .join(Contact, Conversation.contact_id == Contact.id)
    )
    if user:
        q = apply_contact_scope(q, user)
    rows = q.group_by(Conversation.status).all()

    result = {s: 0 for s in (
        'unassigned', 'active', 'waiting_customer',
        'escalated', 'resolved', 'closed',
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

    q = Conversation.query.join(Contact, Conversation.contact_id == Contact.id)
    if user:
        q = apply_contact_scope(q, user)
    today_count = q.filter(Conversation.created_at >= today_start).count()
    yesterday_count = q.filter(
        Conversation.created_at >= yesterday_start,
        Conversation.created_at < today_start,
    ).count()
    return jsonify({
        'today': today_count,
        'yesterday': yesterday_count,
    })


@api_bp.route('/dashboard/team-overview', methods=['GET'])
@login_required
def team_overview():
    """
    主管視角：團隊員工工作量總覽（v1.1 新增，PRD §F10.1 / §7.2）。

    僅 manager / admin 可呼叫。回傳每個 active 員工的：
    - active_count：目前 active/waiting_customer/escalated 的對話數
    - avg_response_minutes：近 30 天首次回覆平均時間（分鐘）
    - nudges_received：近 30 天收到的 nudge 次數
    - resolved_30d：近 30 天解決的對話數
    """
    from sqlalchemy import text as sa_text
    actor = get_current_user()
    if not actor or actor.role not in ('manager', 'admin'):
        return jsonify({'error': '權限不足'}), 403

    # 1. agent 清單（含 user / agent / manager 角色，過濾 is_active）
    from ..models.user import User as UserModel
    agents = (
        UserModel.query
        .filter(UserModel.is_active.is_(True))
        .filter(UserModel.role.in_(('user', 'agent', 'manager')))
        .all()
    )

    # 2. 每個 agent 目前 active 對話數
    open_statuses = ('active', 'waiting_customer', 'escalated')
    workload = dict(
        db.session.query(
            Conversation.current_handler_id,
            func.count(Conversation.id),
        )
        .filter(Conversation.status.in_(open_statuses))
        .filter(Conversation.current_handler_id.isnot(None))
        .group_by(Conversation.current_handler_id)
        .all()
    )

    # 3. 近 30 天每個 agent 收到的 nudge 數
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    from ..models import ConversationEvent
    nudge_counts = dict(
        db.session.query(
            ConversationEvent.target_id,
            func.count(ConversationEvent.id),
        )
        .filter(ConversationEvent.event_type == 'nudge_sent')
        .filter(ConversationEvent.created_at >= thirty_days_ago)
        .group_by(ConversationEvent.target_id)
        .all()
    )

    # 4. 近 30 天每個 agent 解決的對話數
    resolved_counts = dict(
        db.session.query(
            ConversationEvent.actor_id,
            func.count(ConversationEvent.id),
        )
        .filter(ConversationEvent.event_type == 'resolved')
        .filter(ConversationEvent.created_at >= thirty_days_ago)
        .group_by(ConversationEvent.actor_id)
        .all()
    )

    # 5. 平均首次回覆時間（per agent，近 30 天）
    # 註：messages 表沒有 sender_id 欄位，這裡用 conversation.current_handler_id
    # 作為「該對話 business 回覆者」的近似（與既有 first_response_time 端點口徑一致）。
    avg_response_rows = db.session.execute(sa_text("""
        WITH first_customer AS (
            SELECT m.conversation_id, MIN(m.sent_at) AS t
            FROM messages m
            JOIN conversations c ON c.id = m.conversation_id
            WHERE m.sender_type = 'customer'
              AND COALESCE(m.is_internal, false) = false
              AND c.created_at >= :start_date
            GROUP BY m.conversation_id
        ),
        first_business AS (
            SELECT m.conversation_id, MIN(m.sent_at) AS t
            FROM messages m
            JOIN first_customer fc ON fc.conversation_id = m.conversation_id
            WHERE m.sender_type = 'business'
              AND COALESCE(m.is_internal, false) = false
              AND m.sent_at > fc.t
            GROUP BY m.conversation_id
        )
        SELECT c.current_handler_id AS agent_id,
               AVG(EXTRACT(EPOCH FROM (fb.t - fc.t)) / 60.0) AS avg_minutes
        FROM first_customer fc
        JOIN first_business fb ON fb.conversation_id = fc.conversation_id
        JOIN conversations c ON c.id = fc.conversation_id
        WHERE c.current_handler_id IS NOT NULL
        GROUP BY c.current_handler_id
    """), {'start_date': thirty_days_ago}).fetchall()
    avg_response = {row.agent_id: float(row.avg_minutes) for row in avg_response_rows if row.avg_minutes is not None}

    result = []
    for u in agents:
        result.append({
            'id': str(u.id),
            'name': u.name or u.email,
            'email': u.email,
            'role': u.role,
            'active_count': int(workload.get(u.id, 0)),
            'avg_response_minutes': avg_response.get(u.id),
            'nudges_received': int(nudge_counts.get(u.id, 0)),
            'resolved_30d': int(resolved_counts.get(u.id, 0)),
        })

    # 依 active_count 倒序
    result.sort(key=lambda r: r['active_count'], reverse=True)

    return jsonify({
        'period_days': 30,
        'data': result,
    })


@api_bp.route('/dashboard/escalation-rate', methods=['GET'])
@login_required
def escalation_rate():
    """求援率 = escalated 對話數 / 全部開放對話數（PRD §F10）"""
    days = max(1, min(request.args.get('days', 30, type=int), 365))
    start_date = datetime.now(timezone.utc) - timedelta(days=days)

    total = Conversation.query.filter(Conversation.created_at >= start_date).count()
    escalated = Conversation.query.filter(
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
        db.session.query(
            Contact.source_channel,
            func.count(Contact.id)
        )
        .filter(Contact.is_merged.is_(False))
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
        db.session.query(
            Contact.contact_status,
            func.count(Contact.id)
        )
        .filter(Contact.is_merged.is_(False))
        .group_by(Contact.contact_status)
        .order_by(func.count(Contact.id).desc())
        .all()
    )
    contact_status_data = {s or 'unknown': cnt for s, cnt in status_results}

    # 購買意向分布
    intent_results = (
        db.session.query(
            Contact.intent,
            func.count(Contact.id)
        )
        .filter(Contact.is_merged.is_(False))
        .group_by(Contact.intent)
        .order_by(func.count(Contact.id).desc())
        .all()
    )
    intent_data = {i or 'unknown': cnt for i, cnt in intent_results}

    # 轉換漏斗
    from sqlalchemy import literal_column
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
        from sqlalchemy import text as sa_text
        result = db.session.execute(sa_text("""
            SELECT AVG(EXTRACT(EPOCH FROM (m2.sent_at - m1.sent_at))/3600)::numeric(10,1) AS avg_hours
            FROM messages m1
            JOIN messages m2 ON m1.conversation_id = m2.conversation_id
            WHERE m1.sender_type = 'customer' AND m2.sender_type = 'business'
            AND m2.sent_at > m1.sent_at
            AND m2.sent_at - m1.sent_at < INTERVAL '7 days'
        """)).scalar()
        if result is not None:
            avg_response_hours = float(result)
    except Exception:
        pass

    # 熱門對話 Top 5
    top_convs_q = (
        db.session.query(Conversation, Contact)
        .join(Contact, Conversation.contact_id == Contact.id)
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
        db.session.query(
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
    days = max(1, min(request.args.get('days', 30, type=int), 365))
    start_date = datetime.now(timezone.utc) - timedelta(days=days)
    
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
    """
    匯出 Dashboard 數據為 CSV

    TODO: 實作完整 CSV 匯出（含客戶、對話、動作等資料）。
    目前回傳 501 Not Implemented。預計 Phase 3 實作。
    """
    return jsonify({
        'error': 'Not Implemented',
        'message': 'CSV 匯出功能尚未實作，預計 Phase 3 提供。',
    }), 501