"""
MUSE CRM — LLM Usage API

提供 LLM 用量統計與原始 log 查詢。
"""

import logging
from datetime import datetime, timedelta, timezone

from flask import current_app, jsonify, request
from sqlalchemy import func, cast, Date

from . import api_bp
from .. import db
from ..models.llm_usage_log import LlmUsageLog
from ..models.llm_fallback_event import LlmFallbackEvent
from ..models.system_setting import SystemSetting
from ..utils.auth import login_required
from ..utils.permissions import require_role

logger = logging.getLogger(__name__)


@api_bp.route('/llm/usage/summary', methods=['GET'])
@login_required
def llm_usage_summary():
    """
    LLM 用量彙總統計。

    Query params:
        period: day | week | month（預設 day）
    """
    period = request.args.get('period', 'day')
    now = datetime.now(timezone.utc)

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
@login_required
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


@api_bp.route('/llm/budget', methods=['GET'])
@login_required
def llm_budget_status():
    """
    取得當前 LLM 預算狀態。
    """
    enabled = SystemSetting.get_bool('llm_cost_limit_enabled', default=True)
    cost_limit = SystemSetting.get_float('llm_monthly_cost_limit_usd', default=50.0)
    token_limit = SystemSetting.get_int('llm_monthly_token_limit')

    # 查詢本月累計
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    result = db.session.query(
        func.coalesce(func.sum(LlmUsageLog.estimated_cost_usd), 0).label('cost'),
        func.coalesce(func.sum(LlmUsageLog.total_tokens), 0).label('tokens'),
        func.count(LlmUsageLog.id).label('requests'),
    ).filter(LlmUsageLog.created_at >= month_start).one()

    current_cost = float(result.cost)
    current_tokens = int(result.tokens)

    cost_percentage = (current_cost / cost_limit * 100) if cost_limit > 0 else 0
    token_percentage = (current_tokens / token_limit * 100) if token_limit and token_limit > 0 else None

    return jsonify({
        'enabled': enabled,
        'cost': {
            'current_usd': round(current_cost, 6),
            'limit_usd': cost_limit,
            'percentage': round(cost_percentage, 2),
        },
        'tokens': {
            'current': current_tokens,
            'limit': token_limit,
            'percentage': round(token_percentage, 2) if token_percentage is not None else None,
        },
        'total_requests': result.requests,
        'month': now.strftime('%Y-%m'),
    })


@api_bp.route('/llm/budget', methods=['PUT'])
@login_required
@require_role('admin')
def llm_budget_update():
    """
    更新 LLM 預算設定。

    JSON body:
        cost_limit_usd: float（月度成本上限）
        token_limit: int | null（月度 token 上限）
        enabled: bool（是否啟用）
    """
    data = request.get_json(force=True)

    if 'cost_limit_usd' in data:
        SystemSetting.set(
            'llm_monthly_cost_limit_usd',
            str(data['cost_limit_usd']),
            description='月度 LLM 成本上限（USD）',
        )

    if 'token_limit' in data:
        val = data['token_limit']
        SystemSetting.set(
            'llm_monthly_token_limit',
            str(val) if val is not None else '',
            description='月度 LLM token 上限',
        )

    if 'enabled' in data:
        SystemSetting.set(
            'llm_cost_limit_enabled',
            'true' if data['enabled'] else 'false',
            description='是否啟用 LLM 成本上限',
        )

    db.session.commit()
    logger.info(f"LLM 預算設定已更新：{data}")

    return jsonify({'success': True, 'updated': data})


@api_bp.route('/llm/settings', methods=['GET'])
@login_required
def llm_settings():
    """
    取得 LLM 相關設定。

    回傳所有 LLM 設定項目，包含成本上限、token 上限、分析門檻等。
    """
    # .env 優先於 DB
    env_min = current_app.config.get('MIN_MESSAGES_FOR_ANALYSIS')
    if env_min is not None:
        try:
            min_messages = int(env_min)
        except (ValueError, TypeError):
            min_messages = SystemSetting.get_int('min_messages_for_analysis', default=3)
    else:
        min_messages = SystemSetting.get_int('min_messages_for_analysis', default=3)

    return jsonify({
        'llm_cost_limit_enabled': SystemSetting.get_bool('llm_cost_limit_enabled', default=True),
        'llm_monthly_cost_limit_usd': SystemSetting.get_float('llm_monthly_cost_limit_usd', default=50.0),
        'llm_monthly_token_limit': SystemSetting.get_int('llm_monthly_token_limit'),
        'min_messages_for_analysis': min_messages,
    })


@api_bp.route('/llm/fallback-events', methods=['GET'])
@login_required
def llm_fallback_events():
    """
    查詢 LLM 模型降級事件。

    Query params:
        page: 頁碼（預設 1）
        per_page: 每頁筆數（預設 20，最大 100）
    """
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), 100)

    pagination = (
        LlmFallbackEvent.query
        .order_by(LlmFallbackEvent.created_at.desc())
        .paginate(page=page, per_page=per_page, error_out=False)
    )

    events = [
        {
            'id': str(event.id),
            'primary_model': event.primary_model,
            'fallback_model': event.fallback_model,
            'error_reason': event.error_reason,
            'created_at': event.created_at.isoformat(),
        }
        for event in pagination.items
    ]

    return jsonify({
        'events': events,
        'pagination': {
            'page': pagination.page,
            'per_page': pagination.per_page,
            'total': pagination.total,
            'pages': pagination.pages,
        },
    })
