"""
MUSE CRM — Escalation Service（v1.1）

對話升級、旁聽、推 Nudge 的核心邏輯。

v1.1 變更（PRD §F3.3）：
- 主管不再「接管」對話成為對外回覆者，因此移除 `take_over` / `return_to_agent`。
- 新增 `send_nudge`：主管推給特定 agent 的提醒（寫 conversation_event + WebSocket emit）。
- 保留 `escalate` / `watch` / `unwatch` / `resolve` / `reopen`。
- 強制接管（force-handle）改在 API 層直接記錄事件，不在此 service 暴露
  ── 因為它是緊急例外，刻意不放在「正常」流程的 API 表面。
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from .. import db
from ..models import Conversation, User, ConversationEvent
from ..realtime.emitter import emit_to_user

logger = logging.getLogger(__name__)


class EscalationService:
    """對話升級、旁聽、Nudge 的核心服務"""

    # ── 客服求援（escalate） ──────────────────────────────

    @staticmethod
    def escalate(conversation: Conversation, actor: User, reason: str) -> ConversationEvent:
        """
        客服在對話中按「求援」。

        - 將 status 改為 'escalated'
        - 記錄 escalation_reason / escalated_at
        - 寫一筆 event，後續由 notification_service / WebSocket 推給主管
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

    # ── 旁聽（Watch） ─────────────────────────────────────

    @staticmethod
    def watch(conversation: Conversation, supervisor: User) -> ConversationEvent:
        """主管加入旁聽清單。Agent 端會看到「主管 X 正在監看」提示。"""
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

    # ── Nudge（v1.1 新增） ────────────────────────────────

    @staticmethod
    def send_nudge(
        supervisor: User,
        conversation: Conversation,
        target_agent: User,
        message: str,
    ) -> ConversationEvent:
        """
        主管推 nudge 給特定 agent。

        - 寫一筆 conversation_event (event_type='nudge_sent')
        - WebSocket emit `supervisor.nudge.sent` 給 target agent

        message 限 200 字以內，因為這是給 agent 看的 toast，不是完整指導文。
        """
        msg = (message or '').strip()
        if not msg:
            raise ValueError('nudge 訊息不可為空')
        if len(msg) > 200:
            raise ValueError('nudge 訊息不可超過 200 字')

        event = ConversationEvent(
            conversation_id=conversation.id,
            event_type='nudge_sent',
            actor_id=supervisor.id,
            target_id=target_agent.id,
            event_metadata={'message': msg},
        )
        db.session.add(event)

        # 直接推給 target agent 的 toast / inbox
        emit_to_user(
            target_agent.id,
            'supervisor.nudge.sent',
            {
                'conversation_id': str(conversation.id),
                'supervisor_id': str(supervisor.id),
                'supervisor_name': supervisor.name or supervisor.email,
                'message': msg,
                'created_at': datetime.now(timezone.utc).isoformat(),
            },
        )

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
