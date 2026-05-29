"""MUSE CRM — QuickReply Model"""
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Text, Boolean, DateTime, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
import uuid

from .. import db


class QuickReply(db.Model):
    __tablename__ = 'quick_replies'

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    trigger_keywords: Mapped[Optional[list]] = mapped_column(JSONB, default=list)
    priority: Mapped[Optional[str]] = mapped_column(String(20), default='template')
    attachments: Mapped[Optional[list]] = mapped_column(JSONB, default=list)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[Optional[str]] = mapped_column(UUID(as_uuid=False), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=func.now(), onupdate=func.now()
    )

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'category': self.category,
            'title': self.title,
            'content': self.content,
            'trigger_keywords': self.trigger_keywords or [],
            'priority': self.priority,
            'attachments': self.attachments or [],
            'is_system': self.is_system,
            'created_by': str(self.created_by) if self.created_by else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
