"""
MUSE CRM — Dashboard API

Dashboard 統計數據相關 API 端點。
"""

from datetime import datetime, timedelta
from flask import jsonify, request
from sqlalchemy import func, and_, distinct

from . import api_bp
from ..models import Contact, Conversation, Message, Action, Tag, ContactTag, Analysis
from .. import db
from ..utils.auth import login_required


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
    
    # 總客戶數
    total_contacts = Contact.query.filter(Contact.is_merged == False).count()
    
    # 新客戶數（指定期間）
    new_contacts = Contact.query.filter(
        and_(
            Contact.created_at >= start_date,
            Contact.is_merged == False
        )
    ).count()
    
    # 總對話數
    total_conversations = Conversation.query.count()
    
    # 活躍對話數
    active_conversations = Conversation.query.filter(
        Conversation.status == 'active'
    ).count()
    
    # 新對話數（指定期間）
    new_conversations = Conversation.query.filter(
        Conversation.created_at >= start_date
    ).count()
    
    # 待辦動作統計
    pending_actions = Action.query.filter(
        Action.status.in_(['pending', 'assigned', 'in_progress'])
    ).count()
    
    overdue_actions = Action.query.filter(
        and_(
            Action.due_date < datetime.utcnow().date(),
            Action.status.in_(['pending', 'assigned', 'in_progress'])
        )
    ).count()
    
    completed_actions = Action.query.filter(
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


@api_bp.route('/dashboard/export', methods=['GET'])
@login_required
def export_dashboard_csv():
    """匯出 Dashboard 數據為 CSV"""
    # TODO: 實作 CSV 匯出功能
    return jsonify({'message': 'CSV 匯出功能開發中'}), 501