"""
MUSE CRM — Escalation Service

對話升級、接管、歸還、旁聽核心邏輯（PR-3，PRD §F3.3 / §F3.4）。
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from .. import db
from ..models import Conversation, User, ConversationEvent

logger = logging.getLogger(__name__)


class EscalationService:
    """對話升級與接管"""

    # ── 客服求援（escalate） ──────────────────────────────

    @staticmethod
    def escalate(conversation: Conversation, actor: User, reason: str) -> ConversationEvent:
        """
        客服在對話中按「求援」。

        - 將 status 改為 'escalated'
        - 記錄 escalation_reason / escalated_at
        - 記錄 event（之後由 notification_service 推播給主管）
        """
        if not reason or len(reason) > 200:
            raise ValueError('escalation reason 必填且 ≤ 200 字')

        conversation.status = 'escalated'
        conversation.escalated_at = datetime.now(timezone.utc)
        conversation.escalation_reason = reason

        event = ConversationEvent(
            conversation_id=conversation.id,
            event_type='escalated',
            actor_id=actor.id,
            event_metadata={'reason': reason},
        )
        db.session.add(event)
        return event

    # ── 主管接管 / 強制接管 ──────────────────────────────

    @staticmethod
    def take_over(conversation: Conversation, supervisor: User, force: bool = False,
                  note: Optional[str] = None) -> ConversationEvent:
        """
        主管接管對話。

        - supervisor_id ← 接管者
        - current_handler_id 變更為接管者
        - status 改為 'supervisor_taken'
        - force=True 由 admin 使用，跳過 escalation 必要條件
        """
        if not force and conversation.status not in ('escalated', 'active', 'waiting_customer'):
            raise ValueError(f'對話狀態 {conversation.status} 不允許接管')

        original_handler = conversation.current_handler_id
        conversation.supervisor_id = supervisor.id
        conversation.current_handler_id = supervisor.id
        conversation.status = 'supervisor_taken'

        event = ConversationEvent(
            conversation_id=conversation.id,
            event_type='force_taken' if force else 'taken_over',
            actor_id=supervisor.id,
            target_id=supervisor.id,
            event_metadata={
                'original_handler_id': str(original_handler) if original_handler else None,
                'note': note,
            },
        )
        db.session.add(event)
        return event

    # ── 歸還 ──────────────────────────────────────────────

    @staticmethod
    def return_to_agent(conversation: Conversation, supervisor: User) -> ConversationEvent:
        """主管把對話歸還給原客服。"""
        # 嘗試從 events 找出 take_over 之前的 handler
        last_take_over = (
            ConversationEvent.query
            .filter_by(conversation_id=conversation.id, event_type='taken_over')
            .order_by(ConversationEvent.created_at.desc())
            .first()
        )
        original_handler_id = None
        if last_take_over and last_take_over.event_metadata:
            original_handler_id = last_take_over.event_metadata.get('original_handler_id')

        if original_handler_id:
            conversation.current_handler_id = original_handler_id
        conversation.supervisor_id = None
        conversation.status = 'active'
        conversation.escalation_reason = None
        conversation.escalated_at = None

        event = ConversationEvent(
            conversation_id=conversation.id,
            event_type='returned',
            actor_id=supervisor.id,
            target_id=original_handler_id,
            event_metadata=None,
        )
        db.session.add(event)
        return event

    # ── 旁聽（Watch） ─────────────────────────────────────

    @staticmethod
    def watch(conversation: Conversation, supervisor: User) -> ConversationEvent:
        watchers = list(conversation.watchers or [])
        uid = str(supervisor.id)
        if uid not in watchers:
            watchers.append(uid)
            conversation.watchers = watchers

        event = ConversationEvent(
            conversation_id=conversation.id,
            event_type='watched',
            actor_id=supervisor.id,
        )
        db.session.add(event)
        return event

    @staticmethod
    def unwatch(conversation: Conversation, supervisor: User) -> ConversationEvent:
        watchers = list(conversation.watchers or [])
        uid = str(supervisor.id)
        if uid in watchers:
            watchers.remove(uid)
            conversation.watchers = watchers

        event = ConversationEvent(
            conversation_id=conversation.id,
            event_type='unwatched',
            actor_id=supervisor.id,
        )
        db.session.add(event)
        return event

    # ── 解決 / 重啟 ───────────────────────────────────────

    @staticmethod
    def resolve(conversation: Conversation, actor: User) -> ConversationEvent:
        conversation.status = 'resolved'
        conversation.closed_at = datetime.now(timezone.utc)

        event = ConversationEvent(
            conversation_id=conversation.id,
            event_type='resolved',
            actor_id=actor.id,
        )
        db.session.add(event)
        return event

    @staticmethod
    def reopen(conversation: Conversation, actor: User) -> ConversationEvent:
        conversation.status = 'active'
        conversation.closed_at = None

        event = ConversationEvent(
            conversation_id=conversation.id,
            event_type='reopened',
            actor_id=actor.id,
        )
        db.session.add(event)
        return event
