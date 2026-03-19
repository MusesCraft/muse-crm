"""
MUSE CRM — Message Model

原始訊息模型。
"""

from datetime import datetime
from typing import Optional
from sqlalchemy import String, Text, DateTime, Boolean, Index, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
import uuid

from .. import db


class Message(db.Model):
    """原始訊息模型"""
    
    __tablename__ = 'messages'
    
    # 主鍵
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        primary_key=True, 
        default=uuid.uuid4
    )
    
    # 關聯
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        db.ForeignKey('conversations.id', ondelete='CASCADE'), 
        nullable=False
    )
    contact_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        db.ForeignKey('contacts.id', ondelete='CASCADE'), 
        nullable=False
    )
    
    # 訊息基本資訊
    sender_type: Mapped[str] = mapped_column(String(20), nullable=False)  # customer/business/system
    message_type: Mapped[str] = mapped_column(String(20), nullable=False, default='text')  # text/image/sticker/attachment/referral
    
    # 訊息內容
    content: Mapped[Optional[str]] = mapped_column(Text)
    media_url: Mapped[Optional[str]] = mapped_column(Text)
    message_metadata: Mapped[Optional[dict]] = mapped_column(JSONB)  # 附件 metadata、貼圖 ID 等
    
    # Meta 平台識別（冪等性用）
    meta_message_id: Mapped[Optional[str]] = mapped_column(String(255), unique=True)
    
    # 時間和狀態
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=func.now()
    )
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    
    # 快速分類欄位（Phase 5A: 輕量 per-message triage）
    quick_intent: Mapped[Optional[str]] = mapped_column(String(50))
    quick_identity: Mapped[Optional[str]] = mapped_column(String(50))
    quick_analyzed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    
    # 審計欄位
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=func.now()
    )
    
    # 關聯
    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="messages")
    contact: Mapped["Contact"] = relationship("Contact", back_populates="messages")
    
    # 約束和索引
    __table_args__ = (
        CheckConstraint("sender_type IN ('customer', 'business', 'system')", name='ck_message_sender_type'),
        CheckConstraint("message_type IN ('text', 'image', 'sticker', 'attachment', 'referral')", name='ck_message_type'),
        Index('idx_messages_conversation', 'conversation_id', 'sent_at'),
        Index('idx_messages_contact', 'contact_id'),
        Index('idx_messages_meta_id', 'meta_message_id'),
        # 全文搜尋索引（PostgreSQL 特定）
        Index('idx_messages_content_search', func.to_tsvector('simple', func.coalesce(content, '')), postgresql_using='gin'),
    )
    
    def __repr__(self) -> str:
        content_preview = self.content[:50] + "..." if self.content and len(self.content) > 50 else (self.content or "")
        return f"<Message {self.id}: {self.sender_type} '{content_preview}'>"
    
    @property
    def is_from_customer(self) -> bool:
        """檢查是否為客戶發送的訊息"""
        return self.sender_type == 'customer'
    
    @property
    def is_from_business(self) -> bool:
        """檢查是否為企業發送的訊息"""
        return self.sender_type == 'business'
    
    @property
    def is_system_message(self) -> bool:
        """檢查是否為系統訊息"""
        return self.sender_type == 'system'
    
    @property
    def has_quick_analysis(self) -> bool:
        """檢查是否已完成快速分類"""
        return self.quick_analyzed_at is not None
    
    @property
    def has_text_content(self) -> bool:
        """檢查是否包含文字內容"""
        return bool(self.content and self.content.strip())
    
    @property
    def has_media(self) -> bool:
        """檢查是否包含媒體內容"""
        return bool(self.media_url)
    
    def to_dict(self) -> dict:
        """轉換為字典格式"""
        return {
            'id': str(self.id),
            'conversation_id': str(self.conversation_id),
            'contact_id': str(self.contact_id),
            'sender_type': self.sender_type,
            'message_type': self.message_type,
            'content': self.content,
            'media_url': self.media_url,
            'metadata': self.message_metadata,
            'meta_message_id': self.meta_message_id,
            'sent_at': self.sent_at.isoformat() if self.sent_at else None,
            'is_read': self.is_read,
            'quick_intent': self.quick_intent,
            'quick_identity': self.quick_identity,
            'quick_analyzed_at': self.quick_analyzed_at.isoformat() if self.quick_analyzed_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }