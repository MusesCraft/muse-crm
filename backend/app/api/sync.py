"""
MUSE CRM — Sync API

歷史對話同步 API 端點。
"""

import logging
from datetime import datetime

from flask import request, jsonify

from . import api_bp
from ..utils.auth import login_required
from ..utils.permissions import require_role
from ..services.history_sync_service import HistorySyncService

logger = logging.getLogger(__name__)

# 儲存最近一次同步狀態
_last_sync_status = None


@api_bp.route('/sync/meta-history', methods=['POST'])
@login_required
@require_role('admin')
def sync_meta_history():
    """
    觸發 Meta 歷史對話同步。

    Body:
        channel: 'messenger' | 'instagram' | 'all'（預設 'all'）
        limit: 最大對話數（預設 100，上限 500）

    Returns:
        同步統計
    """
    global _last_sync_status

    data = request.get_json(silent=True) or {}
    channel = data.get('channel', 'all')
    limit = min(int(data.get('limit', 100)), 500)

    if channel not in ('messenger', 'instagram', 'all'):
        return jsonify({'error': f'不支援的渠道：{channel}'}), 400

    logger.info(f"開始 Meta 歷史同步：channel={channel}, limit={limit}")

    _last_sync_status = {
        'status': 'running',
        'started_at': datetime.utcnow().isoformat(),
        'channel': channel,
        'limit': limit,
    }

    try:
        service = HistorySyncService()
        stats = service.sync_all_conversations(channel=channel, limit=limit)

        _last_sync_status = {
            'status': 'completed',
            'started_at': _last_sync_status['started_at'],
            'completed_at': datetime.utcnow().isoformat(),
            'channel': channel,
            'limit': limit,
            'result': stats,
        }

        logger.info(f"Meta 歷史同步完成：{stats}")
        return jsonify({'data': stats}), 200

    except Exception as e:
        logger.error(f"Meta 歷史同步失敗：{e}", exc_info=True)

        _last_sync_status = {
            'status': 'failed',
            'started_at': _last_sync_status['started_at'],
            'completed_at': datetime.utcnow().isoformat(),
            'channel': channel,
            'error': str(e),
        }

        return jsonify({'error': f'同步失敗：{str(e)}'}), 500


@api_bp.route('/sync/status', methods=['GET'])
@login_required
@require_role('admin')
def sync_status():
    """
    查詢最近同步狀態。

    Returns:
        最近一次同步的狀態資訊
    """
    if not _last_sync_status:
        return jsonify({'data': {'status': 'never_run', 'message': '尚未執行過同步'}}), 200

    return jsonify({'data': _last_sync_status}), 200
