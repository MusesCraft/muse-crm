"""
MUSE CRM — LLM Fallback Event Model

記錄 LLM 模型降級事件。
"""

from datetime import datetime
from sqlalchemy import String, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
import uuid

from .. import db


class LlmFallbackEvent(db.Model):
    """LLM 模型降級事件紀錄"""

    __tablename__ = 'llm_fallback_events'

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    primary_model: Mapped[str] = mapped_column(String(100), nullable=False)
    fallback_model: Mapped[str] = mapped_column(String(100), nullable=False)
    error_reason: Mapped[str] = mapped_column(Text, nullable=False, default='')

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    def __repr__(self) -> str:
        return (
            f'<LlmFallbackEvent {self.primary_model} → {self.fallback_model} '
            f'at {self.created_at}>'
        )
