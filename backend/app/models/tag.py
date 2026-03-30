"""
MUSE CRM — Tag & ContactTag Models

標籤定義和客戶-標籤關聯模型。
"""

from datetime import datetime
from typing import List, Optional
from sqlalchemy import String, DateTime, Boolean, CheckConstraint, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates
from sqlalchemy.sql import func
import uuid

from .. import db


class Tag(db.Model):
    """標籤定義模型"""
    
    __tablename__ = 'tags'
    
    # 主鍵
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        primary_key=True, 
        default=uuid.uuid4
    )
    
    # 標籤資訊
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    category: Mapped[Optional[str]] = mapped_column(String(50))  # identity/interest/status/region
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)  # 系統預設標籤
    
    # 審計欄位
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=func.now()
    )
    
    # 關聯
    contact_associations: Mapped[List["ContactTag"]] = relationship(
        "ContactTag", 
        back_populates="tag",
        cascade="all, delete-orphan"
    )
    
    @validates('name')
    def validate_name(self, key, name):
        """正規化標籤名稱：去除前後空白並轉小寫，確保不區分大小寫的唯一性"""
        return name.strip().lower() if name else name

    def __repr__(self) -> str:
        system_indicator = " (系統)" if self.is_system else ""
        return f"<Tag {self.name}{system_indicator}>"
    
    @property
    def is_user_created(self) -> bool:
        """檢查是否為使用者建立的標籤"""
        return not self.is_system
    
    @property
    def contact_count(self) -> int:
        """取得使用此標籤的客戶數量"""
        return len(self.contact_associations)
    
    def to_dict(self) -> dict:
        """轉換為字典格式"""
        return {
            'id': str(self.id),
            'name': self.name,
            'tag_name': self.name,          # 前端相容欄位
            'category': self.category,
            'is_system': self.is_system,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'contact_count': self.contact_count
        }


class ContactTag(db.Model):
    """客戶-標籤多對多關聯模型"""
    
    __tablename__ = 'contact_tags'
    
    # 複合主鍵
    contact_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        db.ForeignKey('contacts.id', ondelete='CASCADE'),
        primary_key=True
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        db.ForeignKey('tags.id', ondelete='CASCADE'),
        primary_key=True
    )
    
    # 來源資訊
    source: Mapped[str] = mapped_column(String(20), nullable=False, default='llm')  # llm/manual
    
    # 審計欄位
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=func.now()
    )
    
    # 關聯
    contact: Mapped["Contact"] = relationship("Contact", back_populates="tags")
    tag: Mapped["Tag"] = relationship("Tag", back_populates="contact_associations")
    
    # 約束和索引
    __table_args__ = (
        CheckConstraint("source IN ('llm', 'manual')", name='ck_contact_tag_source'),
        Index('idx_contact_tags_tag', 'tag_id'),
    )
    
    def __repr__(self) -> str:
        return f"<ContactTag contact={self.contact_id} tag={self.tag_id} source={self.source}>"
    
    @property
    def is_from_llm(self) -> bool:
        """檢查是否來自 LLM 自動打標"""
        return self.source == 'llm'
    
    @property
    def is_manual(self) -> bool:
        """檢查是否為手動打標"""
        return self.source == 'manual'
    
    def to_dict(self) -> dict:
        """轉換為字典格式"""
        return {
            'contact_id': str(self.contact_id),
            'tag_id': str(self.tag_id),
            'source': self.source,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }