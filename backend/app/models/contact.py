"""
MUSE CRM — Contact & ChannelIdentifier Models

客戶和渠道身份模型。
"""

from datetime import datetime
from typing import List, Optional
from sqlalchemy import String, Text, DateTime, Boolean, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
import uuid

from .. import db


class Contact(db.Model):
    """客戶模型"""
    
    __tablename__ = 'contacts'
    
    # 主鍵
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        primary_key=True, 
        default=uuid.uuid4
    )
    
    # 基本資訊
    display_name: Mapped[Optional[str]] = mapped_column(String(255))
    avatar_url: Mapped[Optional[str]] = mapped_column(Text)
    locale: Mapped[Optional[str]] = mapped_column(String(10))
    
    # 時間戳
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=func.now()
    )
    last_active_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=func.now()
    )
    
    # 來源資訊
    source_channel: Mapped[Optional[str]] = mapped_column(String(50))  # messenger/instagram/line/webchat
    source_type: Mapped[Optional[str]] = mapped_column(String(50))     # ad_referral/organic
    
    # 備註
    notes: Mapped[Optional[str]] = mapped_column(Text)
    
    # 外部 CRM 整合
    external_crm_id: Mapped[Optional[str]] = mapped_column(String(255))
    
    # 合併功能
    is_merged: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    merged_into_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), 
        db.ForeignKey('contacts.id', ondelete='SET NULL')
    )
    
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
    channel_identifiers: Mapped[List["ChannelIdentifier"]] = relationship(
        "ChannelIdentifier", 
        back_populates="contact",
        cascade="all, delete-orphan"
    )
    conversations: Mapped[List["Conversation"]] = relationship(
        "Conversation", 
        back_populates="contact"
    )
    messages: Mapped[List["Message"]] = relationship(
        "Message", 
        back_populates="contact"
    )
    analyses: Mapped[List["Analysis"]] = relationship(
        "Analysis", 
        back_populates="contact"
    )
    actions: Mapped[List["Action"]] = relationship(
        "Action", 
        back_populates="contact"
    )
    tags: Mapped[List["ContactTag"]] = relationship(
        "ContactTag", 
        back_populates="contact"
    )
    notes_by_users: Mapped[List["UserNote"]] = relationship(
        "UserNote", 
        back_populates="contact"
    )
    
    # 自我關聯（合併功能）
    merged_into: Mapped[Optional["Contact"]] = relationship(
        "Contact", 
        remote_side=[id],
        backref="merged_contacts"
    )
    
    # 索引
    __table_args__ = (
        Index('idx_contacts_last_active', 'last_active_at'),
        Index('idx_contacts_source', 'source_channel', 'source_type'),
        Index('idx_contacts_merged', 'merged_into_id'),
    )
    
    def __repr__(self) -> str:
        return f"<Contact {self.id}: {self.display_name or 'Unknown'}>"
    
    def to_dict(self) -> dict:
        """轉換為字典格式"""
        return {
            'id': str(self.id),
            'display_name': self.display_name,
            'avatar_url': self.avatar_url,
            'locale': self.locale,
            'first_seen_at': self.first_seen_at.isoformat() if self.first_seen_at else None,
            'last_active_at': self.last_active_at.isoformat() if self.last_active_at else None,
            'source_channel': self.source_channel,
            'source_type': self.source_type,
            'notes': self.notes,
            'external_crm_id': self.external_crm_id,
            'is_merged': self.is_merged,
            'merged_into_id': str(self.merged_into_id) if self.merged_into_id else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }


class ChannelIdentifier(db.Model):
    """渠道身份模型（多對一關聯 Contact）"""
    
    __tablename__ = 'channel_identifiers'
    
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
    
    # 渠道資訊
    channel: Mapped[str] = mapped_column(String(50), nullable=False)      # messenger/instagram/line
    external_id: Mapped[str] = mapped_column(String(255), nullable=False) # PSID/ASID/LINE User ID
    asid: Mapped[Optional[str]] = mapped_column(String(255))              # Meta App-Scoped User ID（合併用）
    
    # 渠道特定資料
    profile_data: Mapped[Optional[dict]] = mapped_column(JSONB)
    
    # 審計欄位
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=func.now()
    )
    
    # 關聯
    contact: Mapped["Contact"] = relationship("Contact", back_populates="channel_identifiers")
    
    # 約束和索引
    __table_args__ = (
        db.UniqueConstraint('channel', 'external_id', name='uq_channel_external_id'),
        Index('idx_channel_ids_contact', 'contact_id'),
        Index('idx_channel_ids_asid', 'asid'),
    )
    
    def __repr__(self) -> str:
        return f"<ChannelIdentifier {self.channel}:{self.external_id}>"
    
    def to_dict(self) -> dict:
        """轉換為字典格式"""
        return {
            'id': str(self.id),
            'contact_id': str(self.contact_id),
            'channel': self.channel,
            'external_id': self.external_id,
            'asid': self.asid,
            'profile_data': self.profile_data,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }