"""
MUSE CRM — Action Model

待辦動作模型。
"""

from datetime import datetime, date, timezone
from typing import Optional
from sqlalchemy import String, Text, DateTime, Date, CheckConstraint, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
import uuid

from .. import db


class Action(db.Model):
    """待辦動作模型"""
    
    __tablename__ = 'actions'
    
    # 主鍵
    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        primary_key=True, 
        default=uuid.uuid4
    )
    
    # 關聯
    contact_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), 
        db.ForeignKey('contacts.id', ondelete='CASCADE'), 
        nullable=False
    )
    conversation_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), 
        db.ForeignKey('conversations.id', ondelete='SET NULL')
    )
    
    # 動作內容
    description: Mapped[str] = mapped_column(Text, nullable=False)
    
    # 來源和狀態
    source: Mapped[str] = mapped_column(String(20), nullable=False, default='llm')      # llm/manual
    status: Mapped[str] = mapped_column(String(20), nullable=False, default='pending') # pending/assigned/in_progress/completed/cancelled
    priority: Mapped[str] = mapped_column(String(10), nullable=False, default='medium') # high/medium/low
    
    # 指派和時程
    assigned_to: Mapped[Optional[str]] = mapped_column(String(255))  # 預留：使用者 ID
    due_date: Mapped[Optional[date]] = mapped_column(Date)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    
    # 提醒
    reminder_sent_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
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
    contact: Mapped["Contact"] = relationship("Contact", back_populates="actions")
    conversation: Mapped[Optional["Conversation"]] = relationship("Conversation", back_populates="actions")
    
    # 約束和索引
    __table_args__ = (
        CheckConstraint("source IN ('llm', 'manual')", name='ck_action_source'),
        CheckConstraint("status IN ('pending', 'assigned', 'in_progress', 'completed', 'cancelled')", name='ck_action_status'),
        CheckConstraint("priority IN ('high', 'medium', 'low')", name='ck_action_priority'),
        Index('idx_actions_contact', 'contact_id'),
        Index('idx_actions_status', 'status', 'priority', 'due_date'),
        Index('idx_actions_assigned', 'assigned_to'),
    )
    
    def __repr__(self) -> str:
        desc_preview = self.description[:50] + "..." if len(self.description) > 50 else self.description
        return f"<Action {self.id}: {self.status} '{desc_preview}'>"
    
    @property
    def is_pending(self) -> bool:
        """檢查是否待處理"""
        return self.status == 'pending'
    
    @property
    def is_assigned(self) -> bool:
        """檢查是否已指派"""
        return self.status == 'assigned'
    
    @property
    def is_in_progress(self) -> bool:
        """檢查是否進行中"""
        return self.status == 'in_progress'
    
    @property
    def is_completed(self) -> bool:
        """檢查是否已完成"""
        return self.status == 'completed'
    
    @property
    def is_cancelled(self) -> bool:
        """檢查是否已取消"""
        return self.status == 'cancelled'
    
    @property
    def is_overdue(self) -> bool:
        """檢查是否過期"""
        if not self.due_date or self.is_completed or self.is_cancelled:
            return False
        return date.today() > self.due_date
    
    @property
    def is_high_priority(self) -> bool:
        """檢查是否高優先級"""
        return self.priority == 'high'
    
    @property
    def is_from_llm(self) -> bool:
        """檢查是否來自 LLM"""
        return self.source == 'llm'
    
    def assign_to(self, user_id: str) -> None:
        """指派給使用者"""
        self.assigned_to = user_id
        if self.status == 'pending':
            self.status = 'assigned'
    
    def start_progress(self) -> None:
        """開始處理"""
        if self.status in ('pending', 'assigned'):
            self.status = 'in_progress'
    
    def complete(self) -> None:
        """標記為完成"""
        self.status = 'completed'
        self.completed_at = datetime.now(timezone.utc)
    
    def cancel(self) -> None:
        """取消動作"""
        self.status = 'cancelled'
    
    def to_dict(self) -> dict:
        """轉換為字典格式"""
        return {
            'id': str(self.id),
            'contact_id': str(self.contact_id),
            'conversation_id': str(self.conversation_id) if self.conversation_id else None,
            'description': self.description,
            'source': self.source,
            'status': self.status,
            'priority': self.priority,
            'assigned_to': self.assigned_to,
            'due_date': self.due_date.isoformat() if self.due_date else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
            'reminder_sent_at': self.reminder_sent_at.isoformat() if self.reminder_sent_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }