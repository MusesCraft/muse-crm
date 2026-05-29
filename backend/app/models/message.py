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
    message_type: Mapped[str] = mapped_column(String(20), nullable=False, default='text')  # text/image/sticker/attachment/referral/interactive/callback_query/button
    
    # 訊息內容
    content: Mapped[Optional[str]] = mapped_column(Text)
    media_url: Mapped[Optional[str]] = mapped_column(Text)
    message_metadata: Mapped[Optional[dict]] = mapped_column(JSONB)  # 附件 metadata、貼圖 ID 等
    reactions: Mapped[Optional[dict]] = mapped_column(JSONB, default=dict)
    reply_to_message_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        db.ForeignKey('messages.id', ondelete='SET NULL'),
        nullable=True,
    )
    
    # 平台識別（冪等性與 Telegram 原生操作映射用）
    meta_message_id: Mapped[Optional[str]] = mapped_column(String(255), unique=True)
    platform_message_id: Mapped[Optional[str]] = mapped_column(String(255))
    telegram_message_id: Mapped[Optional[str]] = mapped_column(String(255))
    
    # 時間和狀態
    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=func.now()
    )
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    edited_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    deleted_for: Mapped[Optional[list]] = mapped_column(JSONB, default=list)
    pinned_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    pinned_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        db.ForeignKey('users.id', ondelete='SET NULL'),
        nullable=True,
    )
    
    # 快速分類欄位（Phase 5A: 輕量 per-message triage）
    quick_intent: Mapped[Optional[str]] = mapped_column(String(50))
    quick_identity: Mapped[Optional[str]] = mapped_column(String(50))
    quick_analyzed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # PR-2 新增：內部備註與 @mention（PRD §F6）
    # is_internal=True 表示這是團隊內部訊息，不發給客戶
    is_internal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # mentions：被 @ 提及的 user_id 清單（JSONB array of UUID 字串）
    mentions: Mapped[Optional[list]] = mapped_column(JSONB, default=list)
    
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
        CheckConstraint(
            "message_type IN ('text', 'image', 'sticker', 'attachment', 'referral', "
            "'interactive', 'callback_query', 'button')",
            name='ck_message_type',
        ),
        Index('idx_messages_conversation', 'conversation_id', 'sent_at'),
        Index('idx_messages_contact', 'contact_id'),
        Index('idx_messages_meta_id', 'meta_message_id'),
        Index('idx_messages_platform_id', 'platform_message_id'),
        Index('idx_messages_telegram_id', 'telegram_message_id'),
        Index('idx_messages_reply_to', 'reply_to_message_id'),
        Index('idx_messages_pinned', 'conversation_id', 'pinned_at'),
        # TODO: 全文搜尋 GIN index 待 alembic migration 補（SQLAlchemy 無法 render REGCONFIG literal）
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
        metadata = self.message_metadata or {}
        interactive_payload = metadata if self.message_type in {'interactive', 'callback_query', 'button'} else None
        return {
            'id': str(self.id),
            'conversation_id': str(self.conversation_id),
            'contact_id': str(self.contact_id),
            'sender_type': self.sender_type,
            'message_type': self.message_type,
            'content': self.content,
            'media_url': self.media_url,
            'metadata': metadata,
            'message_metadata': metadata,
            'interactive_payload': interactive_payload,
            'reactions': self.reactions or {},
            'reply_to_message_id': str(self.reply_to_message_id) if self.reply_to_message_id else None,
            'meta_message_id': self.meta_message_id,
            'platform_message_id': self.platform_message_id or self.meta_message_id,
            'telegram_message_id': self.telegram_message_id,
            'sent_at': self.sent_at.isoformat() if self.sent_at else None,
            'is_read': self.is_read,
            'edited_at': self.edited_at.isoformat() if self.edited_at else None,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None,
            'deleted_for': self.deleted_for or [],
            'pinned_at': self.pinned_at.isoformat() if self.pinned_at else None,
            'pinned_by': str(self.pinned_by) if self.pinned_by else None,
            'quick_intent': self.quick_intent,
            'quick_identity': self.quick_identity,
            'quick_analyzed_at': self.quick_analyzed_at.isoformat() if self.quick_analyzed_at else None,
            'is_internal': self.is_internal,
            'mentions': self.mentions or [],
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
