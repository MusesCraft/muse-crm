"""
MUSE CRM — Sync API

歷史對話同步 API 端點。
"""

import logging
from datetime import datetime

from flask import request, jsonify

from . import api_bp
from .. import db
from ..models import Conversation, Message
from ..utils.auth import login_required
from ..utils.permissions import require_role
from ..services.history_sync_service import HistorySyncService
from ..services.auto_tagger import AutoTagger

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


@api_bp.route('/sync/analyze-all', methods=['POST'])
@login_required
@require_role('admin')
def analyze_all_conversations():
    """
    對所有對話執行 keyword-based 自動打標。

    遍歷所有 conversations，用 AutoTagger._match_keywords 跑規則打標。
    （LLM 分析因 OPENROUTER_API_KEY 為 placeholder 暫不啟用）

    Returns:
        打標統計
    """
    conversations = Conversation.query.all()
    stats = {
        'total_conversations': len(conversations),
        'tagged_conversations': 0,
        'total_tags_added': 0,
    }

    for conv in conversations:
        messages = Message.query.filter_by(conversation_id=conv.id).all()
        conversation_text = ' '.join(
            m.content for m in messages if m.content
        )
        if not conversation_text.strip():
            continue

        keyword_tags = AutoTagger._match_keywords(conversation_text)
        if keyword_tags:
            added = AutoTagger._apply_tags(conv.contact_id, keyword_tags)
            if added:
                stats['tagged_conversations'] += 1
                stats['total_tags_added'] += len(added)

    db.session.commit()
    logger.info(f"全量自動打標完成：{stats}")
    return jsonify({'data': stats}), 200


@api_bp.route('/sync/backfill-names', methods=['POST'])
@login_required
@require_role('admin')
def backfill_display_names():
    """回填 display_name=None 的 contacts"""
    updated = HistorySyncService.backfill_display_names()
    return jsonify({'data': {'updated': updated}}), 200


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
