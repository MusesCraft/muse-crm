"""
MUSE CRM — Conversation Model

對話 Session 模型。
"""

from datetime import datetime, timezone
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
    # v1.1 對話狀態 enum：unassigned/active/waiting_customer/escalated/resolved/closed
    # （v1.0 的 supervisor_taken 已移除 — 主管不再成為對外回覆者，PRD §F2.1）
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
    timeout_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=240)  # 預設 4 小時（與 schema.sql 一致）

    # Ad Referral
    ad_referral: Mapped[Optional[dict]] = mapped_column(JSONB)  # { ad_id, campaign_name, creative_id }

    # Meta 統計
    message_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_message_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # PR-2 新增：對話分配與接管欄位（FILE_STRUCTURE_PLAN §2.1）
    # current_handler_id：當前實際處理者（客服或接管中的主管）
    current_handler_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        db.ForeignKey('users.id', ondelete='SET NULL'),
        nullable=True
    )
    # supervisor_id：接管中的主管（與 current_handler_id 可能相同，也可能為旁聽者）
    supervisor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        db.ForeignKey('users.id', ondelete='SET NULL'),
        nullable=True
    )
    # watchers：旁聽中的使用者 ID 清單（JSONB array of UUID 字串）
    watchers: Mapped[Optional[list]] = mapped_column(JSONB, default=list)
    # 求援/升級資訊
    escalated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    escalation_reason: Mapped[Optional[str]] = mapped_column(String(500))
    
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
        # v1.1：對話狀態機（PRD §F2.1）移除 supervisor_taken
        CheckConstraint(
            "status IN ('unassigned', 'active', 'waiting_customer', 'escalated', "
            "'resolved', 'closed')",
            name='ck_conversation_status'
        ),
        Index('idx_conversations_contact', 'contact_id'),
        Index('idx_conversations_status', 'status', 'last_message_at'),
        Index('idx_conversations_channel', 'channel'),
        Index('idx_conversations_handler', 'current_handler_id'),
        Index('idx_conversations_supervisor', 'supervisor_id'),
        # 唯一約束：同一個 contact + channel 在「非終態」狀態只能有一個
        Index(
            'uq_conversations_active_per_contact_channel',
            'contact_id', 'channel',
            unique=True,
            postgresql_where=db.text(
                "status IN ('unassigned', 'active', 'waiting_customer', 'escalated')"
            )
        ),
    )
    
    def __repr__(self) -> str:
        return f"<Conversation {self.id}: {self.status} on {self.channel}>"
    
    # v1.1：對話狀態判定 helpers（移除 supervisor_taken）
    _OPEN_STATUSES = {'unassigned', 'active', 'waiting_customer', 'escalated'}
    _CLOSED_STATUSES = {'resolved', 'closed'}

    @property
    def is_active(self) -> bool:
        """檢查對話是否仍在活躍狀態（PRD §F2.1）"""
        return self.status in self._OPEN_STATUSES

    @property
    def is_escalated(self) -> bool:
        return self.status == 'escalated'
    
    @property
    def has_ad_referral(self) -> bool:
        """檢查是否有廣告轉介"""
        return self.ad_referral is not None
    
    @property
    def is_expired(self) -> bool:
        """檢查對話是否已超時（正確處理 timezone-aware datetime）"""
        if not self.last_message_at or self.status != 'active':
            return False

        from datetime import timedelta
        timeout_delta = timedelta(minutes=self.timeout_minutes)
        now = datetime.now(timezone.utc)

        # 統一處理 timezone：如果 last_message_at 是 naive，視為 UTC
        last_msg = self.last_message_at
        if last_msg.tzinfo is None:
            last_msg = last_msg.replace(tzinfo=timezone.utc)

        return (now - last_msg) > timeout_delta
    
    def close_conversation(self) -> None:
        """關閉對話"""
        self.status = 'closed'
        self.closed_at = datetime.now(timezone.utc)

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
            # PR-2 新增欄位
            'current_handler_id': str(self.current_handler_id) if self.current_handler_id else None,
            'supervisor_id': str(self.supervisor_id) if self.supervisor_id else None,
            'watchers': self.watchers or [],
            'escalated_at': self.escalated_at.isoformat() if self.escalated_at else None,
            'escalation_reason': self.escalation_reason,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }