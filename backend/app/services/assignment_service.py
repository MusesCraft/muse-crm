"""
MUSE CRM — Assignment Service

對話分配核心邏輯（PR-3，PRD §F3.1 自動分配規則）。

優先順序（PRD §F3.1）：
1. 沿用上次負責人（30 天內）
2. AI 路由（依意圖匹配擅長標籤的線上客服）— 本版尚未實作，標 TODO
3. 輪詢分配
4. 降級為 unassigned
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from uuid import UUID

from .. import db
from ..models import Conversation, Contact, User, ConversationEvent

logger = logging.getLogger(__name__)


class AssignmentService:
    """對話自動分配"""

    @staticmethod
    def auto_assign(conversation: Conversation) -> Optional[UUID]:
        """
        對 conversation 進行自動分配。

        Returns:
            分配到的 user.id，或 None（降級為 unassigned）
        """
        contact = conversation.contact

        # ── 1. 沿用上次負責人（30 天內） ──
        recent_handler = AssignmentService._find_recent_handler(contact, days=30)
        if recent_handler and recent_handler.is_active:
            return AssignmentService._do_assign(conversation, recent_handler, reason='reuse_recent_handler')

        # ── 2. AI 路由：TODO（PR-5 之後實作）──

        # ── 3. 輪詢分配給線上 agent ──
        agent = AssignmentService._round_robin_pick_agent()
        if agent:
            return AssignmentService._do_assign(conversation, agent, reason='round_robin')

        # ── 4. 降級為 unassigned ──
        conversation.status = 'unassigned'
        conversation.current_handler_id = None
        logger.info(f"[assignment] 無可用客服，conversation={conversation.id} 維持 unassigned")
        return None

    @staticmethod
    def manual_assign(conversation: Conversation, target_user: User, actor: User) -> ConversationEvent:
        """手動分配（主管操作）"""
        conversation.current_handler_id = target_user.id
        # 確保 contact.assigned_to 也對齊（後續 scope 才看得到）
        if conversation.contact and not conversation.contact.assigned_to:
            conversation.contact.assigned_to = target_user.id
        if conversation.status == 'unassigned':
            conversation.status = 'active'

        event = ConversationEvent(
            conversation_id=conversation.id,
            event_type='assigned',
            actor_id=actor.id,
            target_id=target_user.id,
            event_metadata={'mode': 'manual'},
        )
        db.session.add(event)
        return event

    # ── 內部 helpers ──

    @staticmethod
    def _find_recent_handler(contact: Contact, days: int) -> Optional[User]:
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        prev = (
            ConversationEvent.query
            .filter(
                ConversationEvent.event_type == 'assigned',
                ConversationEvent.created_at >= cutoff,
                ConversationEvent.target_id.isnot(None),
            )
            .join(Conversation, Conversation.id == ConversationEvent.conversation_id)
            .filter(Conversation.contact_id == contact.id)
            .order_by(ConversationEvent.created_at.desc())
            .first()
        )
        if not prev:
            return None
        return db.session.get(User, prev.target_id)

    @staticmethod
    def _round_robin_pick_agent() -> Optional[User]:
        """
        簡易輪詢：選 active 的 user 角色，按 current load 由低到高。

        本版以「目前處理中對話數」作為負載指標。
        """
        from sqlalchemy import func
        active_agents = (
            User.query
            .filter(User.role.in_(('user', 'agent')))
            .filter(User.is_active.is_(True))
            .all()
        )
        if not active_agents:
            return None

        # 統計每個 agent 目前處理中對話數
        load = dict(
            db.session.query(
                Conversation.current_handler_id,
                func.count(Conversation.id),
            )
            .filter(Conversation.status.in_(
                ('active', 'waiting_customer', 'escalated', 'supervisor_taken')
            ))
            .group_by(Conversation.current_handler_id)
            .all()
        )
        return min(active_agents, key=lambda a: load.get(a.id, 0))

    @staticmethod
    def _do_assign(conversation: Conversation, agent: User, reason: str) -> UUID:
        conversation.current_handler_id = agent.id
        if conversation.contact and not conversation.contact.assigned_to:
            conversation.contact.assigned_to = agent.id
        conversation.status = 'active' if conversation.status == 'unassigned' else conversation.status

        event = ConversationEvent(
            conversation_id=conversation.id,
            event_type='assigned',
            target_id=agent.id,
            event_metadata={'mode': 'auto', 'reason': reason},
        )
        db.session.add(event)
        logger.info(f"[assignment] {reason}: conversation={conversation.id} → user={agent.id}")
        return agent.id
