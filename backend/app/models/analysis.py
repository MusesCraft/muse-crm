"""
MUSE CRM — Analysis & AnalysisQueue Models

LLM 分析結果和分析佇列模型。
"""

from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy import String, Text, Integer, Boolean, DateTime, Index, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID, ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
import uuid

from .. import db


class Analysis(db.Model):
    """LLM 分析結果模型（1:N 對 conversation）"""
    
    __tablename__ = 'analyses'
    
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
    
    # MVP 萃取欄位
    customer_name: Mapped[Optional[str]] = mapped_column(String(255))
    demand_summary: Mapped[Optional[str]] = mapped_column(Text)
    mentioned_products: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String))  # PostgreSQL 陣列
    suggested_tags: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String))
    conversation_summary: Mapped[Optional[str]] = mapped_column(Text)
    suggested_action: Mapped[Optional[str]] = mapped_column(Text)
    
    # 後續欄位（v2）
    sentiment: Mapped[Optional[str]] = mapped_column(String(20))        # positive/neutral/negative
    intent: Mapped[Optional[str]] = mapped_column(String(50))
    urgency: Mapped[Optional[str]] = mapped_column(String(10))          # high/medium/low
    customer_stage: Mapped[Optional[str]] = mapped_column(String(50))
    
    # Meta 資訊
    trigger_type: Mapped[str] = mapped_column(String(20), nullable=False, default='auto')  # auto/manual
    is_human_corrected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    correction_diff: Mapped[Optional[dict]] = mapped_column(JSONB)      # 修正前後差異
    
    # LLM 執行資訊
    model_used: Mapped[Optional[str]] = mapped_column(String(100))
    tokens_used: Mapped[Optional[int]] = mapped_column(Integer)
    processing_time_ms: Mapped[Optional[int]] = mapped_column(Integer)
    
    # 審計欄位
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=func.now()
    )
    
    # 關聯
    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="analyses")
    contact: Mapped["Contact"] = relationship("Contact", back_populates="analyses")
    
    # 約束和索引
    __table_args__ = (
        CheckConstraint("trigger_type IN ('auto', 'manual')", name='ck_analysis_trigger_type'),
        CheckConstraint("sentiment IN ('positive', 'neutral', 'negative') OR sentiment IS NULL", name='ck_analysis_sentiment'),
        CheckConstraint("urgency IN ('high', 'medium', 'low') OR urgency IS NULL", name='ck_analysis_urgency'),
        Index('idx_analyses_conversation', 'conversation_id', 'created_at'),
        Index('idx_analyses_contact', 'contact_id'),
    )
    
    def __repr__(self) -> str:
        return f"<Analysis {self.id}: {self.trigger_type} for conversation {self.conversation_id}>"
    
    @property
    def is_automatic(self) -> bool:
        """檢查是否為自動分析"""
        return self.trigger_type == 'auto'
    
    @property
    def is_manual(self) -> bool:
        """檢查是否為手動分析"""
        return self.trigger_type == 'manual'
    
    @property
    def has_corrections(self) -> bool:
        """檢查是否有人工修正"""
        return self.is_human_corrected and bool(self.correction_diff)
    
    def to_dict(self) -> dict:
        """轉換為字典格式"""
        return {
            'id': str(self.id),
            'conversation_id': str(self.conversation_id),
            'contact_id': str(self.contact_id),
            'customer_name': self.customer_name,
            'demand_summary': self.demand_summary,
            'mentioned_products': self.mentioned_products,
            'suggested_tags': self.suggested_tags,
            'conversation_summary': self.conversation_summary,
            'suggested_action': self.suggested_action,
            'sentiment': self.sentiment,
            'intent': self.intent,
            'urgency': self.urgency,
            'customer_stage': self.customer_stage,
            'trigger_type': self.trigger_type,
            'is_human_corrected': self.is_human_corrected,
            'correction_diff': self.correction_diff,
            'model_used': self.model_used,
            'tokens_used': self.tokens_used,
            'processing_time_ms': self.processing_time_ms,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }


class AnalysisQueue(db.Model):
    """分析佇列模型（LLM 不可用時排隊）"""
    
    __tablename__ = 'analysis_queue'
    
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
    
    # 佇列狀態
    status: Mapped[str] = mapped_column(String(20), nullable=False, default='pending')  # pending/processing/completed/failed
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    
    # 時間戳
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        nullable=False, 
        default=func.now()
    )
    processed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    
    # 關聯
    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="analysis_queue_entries")
    
    # 約束和索引
    __table_args__ = (
        CheckConstraint("status IN ('pending', 'processing', 'completed', 'failed')", name='ck_queue_status'),
        Index('idx_queue_status', 'status', 'created_at'),
    )
    
    def __repr__(self) -> str:
        return f"<AnalysisQueue {self.id}: {self.status} for conversation {self.conversation_id}>"
    
    @property
    def is_pending(self) -> bool:
        """檢查是否待處理"""
        return self.status == 'pending'
    
    @property
    def is_processing(self) -> bool:
        """檢查是否處理中"""
        return self.status == 'processing'
    
    @property
    def is_completed(self) -> bool:
        """檢查是否已完成"""
        return self.status == 'completed'
    
    @property
    def is_failed(self) -> bool:
        """檢查是否失敗"""
        return self.status == 'failed'
    
    def mark_as_processing(self) -> None:
        """標記為處理中"""
        self.status = 'processing'
        self.processed_at = datetime.now(timezone.utc)

    def mark_as_completed(self) -> None:
        """標記為完成"""
        self.status = 'completed'
        self.processed_at = datetime.now(timezone.utc)

    def mark_as_failed(self, error_message: str) -> None:
        """標記為失敗"""
        self.status = 'failed'
        self.error_message = error_message
        self.processed_at = datetime.now(timezone.utc)
        self.retry_count += 1
    
    def to_dict(self) -> dict:
        """轉換為字典格式"""
        return {
            'id': str(self.id),
            'conversation_id': str(self.conversation_id),
            'status': self.status,
            'retry_count': self.retry_count,
            'error_message': self.error_message,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'processed_at': self.processed_at.isoformat() if self.processed_at else None
        }