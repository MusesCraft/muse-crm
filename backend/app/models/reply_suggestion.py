"""
MUSE CRM — ReplySuggestion Model

AI 生成的回覆草稿，用於後續分析採用率（PR-5，PRD §F4.3）。
"""

from datetime import datetime
from typing import Optional
from sqlalchemy import DateTime, Integer, Boolean, String, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
import uuid

from .. import db


class ReplySuggestion(db.Model):
    """AI 回覆草稿紀錄"""

    __tablename__ = 'reply_suggestions'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    message_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        db.ForeignKey('messages.id', ondelete='CASCADE'),
        nullable=True
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        db.ForeignKey('conversations.id', ondelete='CASCADE'),
        nullable=False
    )

    # [{"text": "...", "confidence": 0.8, "kb_refs": ["uuid", ...]}, ...]
    suggestions: Mapped[Optional[list]] = mapped_column(JSONB)

    # 客服採用了第幾則（0-based）；未採用為 NULL
    used_suggestion_index: Mapped[Optional[int]] = mapped_column(Integer)
    # 採用後是否經過編輯
    edited_before_send: Mapped[Optional[bool]] = mapped_column(Boolean)

    model: Mapped[Optional[str]] = mapped_column(String(100))
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=func.now())

    __table_args__ = (
        Index('idx_reply_sugg_conv', 'conversation_id', 'generated_at'),
    )

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'conversation_id': str(self.conversation_id),
            'message_id': str(self.message_id) if self.message_id else None,
            'suggestions': self.suggestions or [],
            'used_suggestion_index': self.used_suggestion_index,
            'edited_before_send': self.edited_before_send,
            'model': self.model,
            'generated_at': self.generated_at.isoformat() if self.generated_at else None,
        }
