"""
MUSE CRM — LLM Usage API

提供 LLM 用量統計與原始 log 查詢。
"""

import logging
from datetime import datetime, timedelta

from flask import jsonify, request
from sqlalchemy import func, cast, Date

from . import api_bp
from .. import db
from ..models.llm_usage_log import LlmUsageLog

logger = logging.getLogger(__name__)


@api_bp.route('/llm/usage/summary', methods=['GET'])
def llm_usage_summary():
    """
    LLM 用量彙總統計。

    Query params:
        period: day | week | month（預設 day）
    """
    period = request.args.get('period', 'day')
    now = datetime.utcnow()

    if period == 'week':
        start_date = (now - timedelta(days=7)).date()
    elif period == 'month':
        start_date = (now - timedelta(days=30)).date()
    else:
        period = 'day'
        start_date = now.date()

    end_date = now.date()

    # 基礎查詢條件
    base_filter = LlmUsageLog.created_at >= datetime.combine(start_date, datetime.min.time())

    # 總計
    totals = db.session.query(
        func.coalesce(func.sum(LlmUsageLog.total_tokens), 0).label('total_tokens'),
        func.coalesce(func.sum(LlmUsageLog.estimated_cost_usd), 0).label('total_cost_usd'),
        func.count(LlmUsageLog.id).label('total_requests'),
    ).filter(base_filter).one()

    # 按 model 分組
    by_model_rows = db.session.query(
        LlmUsageLog.model,
        func.sum(LlmUsageLog.total_tokens).label('tokens'),
        func.sum(LlmUsageLog.estimated_cost_usd).label('cost'),
        func.count(LlmUsageLog.id).label('requests'),
    ).filter(base_filter).group_by(LlmUsageLog.model).all()

    by_model = [
        {
            'model': row.model,
            'tokens': row.tokens or 0,
            'cost': float(row.cost or 0),
            'requests': row.requests,
        }
        for row in by_model_rows
    ]

    # 按 task_type 分組
    by_task_rows = db.session.query(
        LlmUsageLog.task_type,
        func.sum(LlmUsageLog.total_tokens).label('tokens'),
        func.sum(LlmUsageLog.estimated_cost_usd).label('cost'),
        func.count(LlmUsageLog.id).label('requests'),
    ).filter(base_filter).group_by(LlmUsageLog.task_type).all()

    by_task_type = [
        {
            'task_type': row.task_type,
            'tokens': row.tokens or 0,
            'cost': float(row.cost or 0),
            'requests': row.requests,
        }
        for row in by_task_rows
    ]

    # 每日趨勢
    daily_rows = db.session.query(
        cast(LlmUsageLog.created_at, Date).label('date'),
        func.sum(LlmUsageLog.total_tokens).label('tokens'),
        func.sum(LlmUsageLog.estimated_cost_usd).label('cost'),
        func.count(LlmUsageLog.id).label('requests'),
    ).filter(base_filter).group_by(
        cast(LlmUsageLog.created_at, Date)
    ).order_by(
        cast(LlmUsageLog.created_at, Date)
    ).all()

    daily_trend = [
        {
            'date': row.date.isoformat(),
            'tokens': row.tokens or 0,
            'cost': float(row.cost or 0),
            'requests': row.requests,
        }
        for row in daily_rows
    ]

    return jsonify({
        'period': period,
        'start_date': start_date.isoformat(),
        'end_date': end_date.isoformat(),
        'total_tokens': totals.total_tokens,
        'total_cost_usd': float(totals.total_cost_usd),
        'total_requests': totals.total_requests,
        'by_model': by_model,
        'by_task_type': by_task_type,
        'daily_trend': daily_trend,
    })


@api_bp.route('/llm/usage/logs', methods=['GET'])
def llm_usage_logs():
    """
    LLM 用量原始 log 分頁查詢。

    Query params:
        model: 篩選模型
        task_type: 篩選任務類型
        page: 頁碼（預設 1）
        per_page: 每頁筆數（預設 20，最大 100）
    """
    model = request.args.get('model')
    task_type = request.args.get('task_type')
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), 100)

    query = LlmUsageLog.query

    if model:
        query = query.filter(LlmUsageLog.model == model)
    if task_type:
        query = query.filter(LlmUsageLog.task_type == task_type)

    query = query.order_by(LlmUsageLog.created_at.desc())

    pagination = query.paginate(page=page, per_page=per_page, error_out=False)

    logs = [
        {
            'id': str(log.id),
            'task_type': log.task_type,
            'model': log.model,
            'prompt_tokens': log.prompt_tokens,
            'completion_tokens': log.completion_tokens,
            'total_tokens': log.total_tokens,
            'estimated_cost_usd': float(log.estimated_cost_usd),
            'conversation_id': str(log.conversation_id) if log.conversation_id else None,
            'message_id': str(log.message_id) if log.message_id else None,
            'is_fallback': log.is_fallback,
            'created_at': log.created_at.isoformat(),
        }
        for log in pagination.items
    ]

    return jsonify({
        'logs': logs,
        'pagination': {
            'page': pagination.page,
            'per_page': pagination.per_page,
            'total': pagination.total,
            'pages': pagination.pages,
        },
    })
