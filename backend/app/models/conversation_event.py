"""
MUSE CRM — ConversationEvent Model

對話狀態變更的 audit log（PR-3，PRD §6.3 / §10.3）。
"""

from datetime import datetime
from typing import Optional
from sqlalchemy import String, DateTime, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
import uuid

from .. import db


class ConversationEvent(db.Model):
    """
    對話狀態變更事件。

    用於記錄誰、在什麼時候、對對話做了什麼操作（assigned / escalated /
    taken_over / returned / resolved / closed / reopened）。
    """

    __tablename__ = 'conversation_events'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        db.ForeignKey('conversations.id', ondelete='CASCADE'),
        nullable=False
    )

    # 事件類型：assigned / escalated / taken_over / returned / watched / unwatched /
    #          resolved / reopened / force_taken / closed
    event_type: Mapped[str] = mapped_column(String(40), nullable=False)

    # 觸發者
    actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        db.ForeignKey('users.id', ondelete='SET NULL'),
        nullable=True
    )

    # 目標使用者（如 assigned 的對象、take_over 後的主管）
    target_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        db.ForeignKey('users.id', ondelete='SET NULL'),
        nullable=True
    )

    # 附加 metadata：求援原因、接管備註、舊狀態等
    event_metadata: Mapped[Optional[dict]] = mapped_column(JSONB)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=func.now()
    )

    # 關聯
    conversation = relationship("Conversation", backref="events")

    __table_args__ = (
        Index('idx_conv_events_conv', 'conversation_id', 'created_at'),
        Index('idx_conv_events_type', 'event_type'),
    )

    def __repr__(self) -> str:
        return f"<ConversationEvent {self.event_type} on {self.conversation_id}>"

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'conversation_id': str(self.conversation_id),
            'event_type': self.event_type,
            'actor_id': str(self.actor_id) if self.actor_id else None,
            'target_id': str(self.target_id) if self.target_id else None,
            'metadata': self.event_metadata or {},
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }
