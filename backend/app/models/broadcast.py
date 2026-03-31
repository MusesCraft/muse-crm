"""
MUSE CRM — Broadcast Model

批量廣播訊息模型。
"""

from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import String, Text, DateTime, Integer, CheckConstraint, Index
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
import uuid

from .. import db


class Broadcast(db.Model):
    """批量廣播模型"""

    __tablename__ = 'broadcasts'

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # 廣播內容
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    image_url: Mapped[Optional[str]] = mapped_column(Text)

    # 標籤篩選
    include_tags: Mapped[List[str]] = mapped_column(ARRAY(Text), nullable=False, default=list)
    exclude_tags: Mapped[Optional[List[str]]] = mapped_column(ARRAY(Text), default=list)

    # 活躍天數篩選（只發送 N 天內有互動的客戶，0 或 null 表示不限）
    active_within_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # 目標渠道
    target_channels: Mapped[List[str]] = mapped_column(
        ARRAY(Text), nullable=False, default=lambda: ['messenger', 'instagram', 'line']
    )

    # 狀態
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default='draft'
    )
    scheduled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # 統計
    total_recipients: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sent_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # 建立者
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), db.ForeignKey('users.id', ondelete='SET NULL')
    )

    # 審計
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=func.now(), onupdate=func.now()
    )

    # 關聯
    creator = relationship("User", foreign_keys=[created_by])

    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'scheduled', 'sending', 'completed', 'failed')",
            name='ck_broadcast_status',
        ),
        Index('idx_broadcasts_status', 'status'),
        Index('idx_broadcasts_created', 'created_at'),
    )

    def to_dict(self) -> dict:
        return {
            'id': str(self.id),
            'title': self.title,
            'content': self.content,
            'image_url': self.image_url,
            'include_tags': self.include_tags or [],
            'exclude_tags': self.exclude_tags or [],
            'active_within_days': self.active_within_days,
            'target_channels': self.target_channels or [],
            'status': self.status,
            'scheduled_at': self.scheduled_at.isoformat() if self.scheduled_at else None,
            'sent_at': self.sent_at.isoformat() if self.sent_at else None,
            'total_recipients': self.total_recipients,
            'sent_count': self.sent_count,
            'failed_count': self.failed_count,
            'created_by': str(self.created_by) if self.created_by else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
