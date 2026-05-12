"""
MUSE CRM — Assignment Tasks

對話分配相關 Celery 背景任務（PR-3）。

主要任務：
1. reclaim_offline_conversations — 客服離線時，把對話收回 unassigned 池
"""

import logging
from datetime import datetime, timezone, timedelta

from .. import celery, db
from ..models import Conversation, User, ConversationEvent

logger = logging.getLogger(__name__)


@celery.task(name='crm.tasks.reclaim_offline_conversations')
def reclaim_offline_conversations(idle_minutes: int = 60):
    """
    將「負責人離線超過 idle_minutes 分鐘 + 對話進行中」的對話收回待認領池。

    判斷離線：user.last_seen_at < now - idle_minutes（若無此欄位則 fallback：
    當前未連 WebSocket — 暫以 is_active=False 視為離線）。

    Returns:
        統計字典
    """
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=idle_minutes)
    stats = {'reclaimed': 0, 'skipped': 0}

    convs = (
        Conversation.query
        .filter(Conversation.status.in_(('active', 'waiting_customer', 'escalated')))
        .filter(Conversation.current_handler_id.isnot(None))
        .all()
    )

    for conv in convs:
        handler = db.session.get(User, conv.current_handler_id)
        if not handler:
            continue
        # 簡化判斷：用 is_active 替代真正的在線狀態（TODO: 接 WebSocket presence）
        if handler.is_active:
            stats['skipped'] += 1
            continue
        if handler.updated_at and handler.updated_at > cutoff:
            stats['skipped'] += 1
            continue

        previous_id = conv.current_handler_id
        conv.current_handler_id = None
        conv.status = 'unassigned'

        event = ConversationEvent(
            conversation_id=conv.id,
            event_type='assigned',
            actor_id=None,
            target_id=None,
            event_metadata={
                'mode': 'system_reclaim',
                'previous_handler_id': str(previous_id),
                'reason': 'handler_offline',
            },
        )
        db.session.add(event)
        stats['reclaimed'] += 1

    db.session.commit()
    logger.info(f"[assignment] reclaim_offline_conversations 完成: {stats}")
    return stats
