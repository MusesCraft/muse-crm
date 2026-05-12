"""
MUSE CRM — Copilot Service

整合 LLM + KB + 對話上下文，產出回覆草稿（PR-5/6）。

本版以「整合點」為主，串流與真實 LLM 呼叫沿用 llm_service。
"""

import logging
from typing import List, Optional

from .. import db
from ..models import Conversation, Message, ReplySuggestion, KnowledgeBase
from .knowledge_base_service import KnowledgeBaseService

logger = logging.getLogger(__name__)


class CopilotService:
    """AI Copilot 服務"""

    @staticmethod
    def build_context(conversation: Conversation, latest_n: int = 20) -> str:
        """組裝對話上下文供 prompt 使用"""
        msgs = (
            Message.query
            .filter_by(conversation_id=conversation.id)
            .filter_by(is_internal=False)
            .order_by(Message.sent_at.desc())
            .limit(latest_n)
            .all()
        )
        msgs.reverse()
        lines = []
        for m in msgs:
            role = '客戶' if m.sender_type == 'customer' else '客服'
            if m.content:
                lines.append(f'[{role}] {m.content}')
        return '\n'.join(lines)

    @staticmethod
    def retrieve_kb(query: str, top_k: int = 5) -> List[KnowledgeBase]:
        return KnowledgeBaseService.search(query, top_k=top_k)

    @staticmethod
    def _stub_suggestions(kb_items: List[KnowledgeBase]) -> List[dict]:
        """LLM 不可用時的 fallback 草稿"""
        return [
            {
                'text': '感謝您的詢問！我會立即為您確認相關資訊，請稍候。',
                'confidence': 0.5,
                'kb_refs': [str(kb.id) for kb in kb_items],
            },
            {
                'text': '請問您希望先了解規格還是價格？我可以分別準備資料給您。',
                'confidence': 0.5,
                'kb_refs': [],
            },
            {
                'text': '已收到您的需求，這邊我先為您查詢庫存與報價，今日內回覆您。',
                'confidence': 0.5,
                'kb_refs': [],
            },
        ]

    @staticmethod
    def generate_suggestions(conversation: Conversation) -> ReplySuggestion:
        """
        產生 3 則回覆草稿（PRD §F4.3）。

        優先呼叫 llm_service.generate_reply_suggestions；失敗時退回 stub。
        """
        from .llm_service import get_llm_service

        ctx = CopilotService.build_context(conversation)

        # 取最後一則客戶訊息作為檢索 query
        last_customer_msg = (
            Message.query
            .filter_by(conversation_id=conversation.id, sender_type='customer', is_internal=False)
            .order_by(Message.sent_at.desc())
            .first()
        )
        kb_items: List[KnowledgeBase] = []
        if last_customer_msg and last_customer_msg.content:
            kb_items = CopilotService.retrieve_kb(last_customer_msg.content, top_k=3)

        kb_snippets = '\n'.join(
            f'[{kb.id}] {kb.title}：{(kb.content or "")[:200]}'
            for kb in kb_items
        )

        llm = get_llm_service()
        suggestions: List[dict] = []
        model_used = 'stub'
        try:
            suggestions, _usage = llm.generate_reply_suggestions(
                conversation_text=ctx,
                kb_snippets=kb_snippets,
                tone='professional',
                n=3,
            )
            model_used = getattr(llm, 'primary_model', 'stub')
        except Exception as e:
            logger.warning(f"generate_reply_suggestions 例外（fallback 到 stub）：{e}")

        if not suggestions:
            suggestions = CopilotService._stub_suggestions(kb_items)

        record = ReplySuggestion(
            conversation_id=conversation.id,
            suggestions=suggestions,
            model=model_used,
        )
        db.session.add(record)
        db.session.commit()
        return record
