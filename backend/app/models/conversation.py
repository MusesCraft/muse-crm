"""
MUSE CRM — Conversation Model

對話 Session 模型。
"""

from datetime import datetime
from typing import List, Optional
from sqlalchemy import String, DateTime, Boolean, Integer, Index, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
import uuid

from .. import db


class Conversation(db.Model):
    """對話 Session 模型"""
    
    __tablename__ = 'conversations'
    
    # 主鍵
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        primary_key=True, 
        default=uuid.uuid4
    )
    
    # 關聯客戶
    contact_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        db.ForeignKey('contacts.id', ondelete='CASCADE'), 
        nullable=False
    )
    
    # 基本資訊
    channel: Mapped[str] = mapped_column(String(50), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), 
        nullable=False, 
        default='active'
    )
    
    # 時間管理
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=func.now()
    )
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    timeout_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=1440)  # 預設 24 小時（PRD §4.1）
    
    # Ad Referral
    ad_referral: Mapped[Optional[dict]] = mapped_column(JSONB)  # { ad_id, campaign_name, creative_id }
    
    # Meta 統計
    message_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_message_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    
    # 審計欄位
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=func.now(),
        onupdate=func.now()
    )
    
    # 關聯
    contact: Mapped["Contact"] = relationship("Contact", back_populates="conversations")
    messages: Mapped[List["Message"]] = relationship(
        "Message", 
        back_populates="conversation",
        cascade="all, delete-orphan"
    )
    analyses: Mapped[List["Analysis"]] = relationship(
        "Analysis", 
        back_populates="conversation"
    )
    actions: Mapped[List["Action"]] = relationship(
        "Action", 
        back_populates="conversation"
    )
    analysis_queue_entries: Mapped[List["AnalysisQueue"]] = relationship(
        "AnalysisQueue", 
        back_populates="conversation"
    )
    
    # 約束和索引
    __table_args__ = (
        CheckConstraint("status IN ('active', 'closed')", name='ck_conversation_status'),
        Index('idx_conversations_contact', 'contact_id'),
        Index('idx_conversations_status', 'status', 'last_message_at'),
        Index('idx_conversations_channel', 'channel'),
        # 注意：has_ad_referral 是 property，不是資料庫欄位，無法建立索引
    )
    
    def __repr__(self) -> str:
        return f"<Conversation {self.id}: {self.status} on {self.channel}>"
    
    @property
    def is_active(self) -> bool:
        """檢查對話是否仍在活躍狀態"""
        return self.status == 'active'
    
    @property
    def has_ad_referral(self) -> bool:
        """檢查是否有廣告轉介"""
        return self.ad_referral is not None
    
    @property
    def is_expired(self) -> bool:
        """檢查對話是否已超時"""
        if not self.last_message_at or self.status != 'active':
            return False
        
        from datetime import timedelta
        timeout_delta = timedelta(minutes=self.timeout_minutes)
        return (datetime.utcnow() - self.last_message_at.replace(tzinfo=None)) > timeout_delta
    
    def close_conversation(self) -> None:
        """關閉對話"""
        self.status = 'closed'
        self.closed_at = datetime.utcnow()
    
    def to_dict(self) -> dict:
        """轉換為字典格式"""
        return {
            'id': str(self.id),
            'contact_id': str(self.contact_id),
            'channel': self.channel,
            'status': self.status,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'closed_at': self.closed_at.isoformat() if self.closed_at else None,
            'timeout_minutes': self.timeout_minutes,
            'ad_referral': self.ad_referral,
            'has_ad_referral': self.has_ad_referral,
            'message_count': self.message_count,
            'last_message_at': self.last_message_at.isoformat() if self.last_message_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }