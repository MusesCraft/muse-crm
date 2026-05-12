"""
MUSE CRM — KnowledgeBase Model

知識庫條目（PR-5，PRD §F4.4）。

注意：本版以 JSON 欄位儲存 embedding 向量，
等 Railway pgvector spike 通過後再改為 pgvector vector(1536)。
TODO: pgvector — 改 embedding 欄位型別並建立 IVFFLAT 索引。
"""

from datetime import datetime
from typing import List, Optional
from sqlalchemy import String, Text, DateTime, Index, Boolean
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
import uuid

from .. import db


class KnowledgeBase(db.Model):
    """知識庫條目"""

    __tablename__ = 'knowledge_base'

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # product / faq / policy / spec
    category: Mapped[Optional[str]] = mapped_column(String(50))
    source_url: Mapped[Optional[str]] = mapped_column(Text)
    tags: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String))  # 內部關鍵字

    # TODO: pgvector — 暫以 JSONB 儲存 float[]。Railway 開啟 pgvector 後改為
    # `embedding VECTOR(1536)` 並建立 IVFFLAT 索引。
    embedding: Mapped[Optional[list]] = mapped_column(JSONB)
    embedding_model: Mapped[Optional[str]] = mapped_column(String(100))

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index('idx_kb_category', 'category'),
        Index('idx_kb_active', 'is_active'),
        # TODO: 全文搜尋 GIN index 待 alembic migration 補（SQLAlchemy 無法 render REGCONFIG literal）
    )

    def to_dict(self, include_embedding: bool = False) -> dict:
        d = {
            'id': str(self.id),
            'title': self.title,
            'content': self.content,
            'category': self.category,
            'source_url': self.source_url,
            'tags': self.tags or [],
            'embedding_model': self.embedding_model,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_embedding:
            d['embedding'] = self.embedding
        return d
