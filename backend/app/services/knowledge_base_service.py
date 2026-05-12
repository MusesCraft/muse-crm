"""
MUSE CRM — Knowledge Base Service

KB CRUD + 向量檢索（PR-5）。

注意：本版以 PG 全文檢索 + 內存 cosine 計算為過渡實作；
等 pgvector spike 通過後，會改為 PG-native 向量檢索。
TODO: pgvector
"""

import logging
import math
from typing import List, Optional

from sqlalchemy import func, or_

from .. import db
from ..models import KnowledgeBase

logger = logging.getLogger(__name__)


class KnowledgeBaseService:
    """知識庫服務"""

    @staticmethod
    def search(query: str, category: Optional[str] = None, top_k: int = 5) -> List[KnowledgeBase]:
        """
        簡易檢索：PG 全文 + LIKE。

        TODO: pgvector — 改為向量相似度檢索 + re-rank。
        """
        q = KnowledgeBase.query.filter(KnowledgeBase.is_active.is_(True))
        if category:
            q = q.filter(KnowledgeBase.category == category)

        if query:
            like = f'%{query}%'
            q = q.filter(or_(
                KnowledgeBase.title.ilike(like),
                KnowledgeBase.content.ilike(like),
            ))

        return q.order_by(KnowledgeBase.updated_at.desc()).limit(top_k).all()

    @staticmethod
    def cosine_similarity(a: List[float], b: List[float]) -> float:
        """暫時的內存 cosine（pgvector 上線前用）"""
        if not a or not b or len(a) != len(b):
            return 0.0
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = math.sqrt(sum(x * x for x in a))
        norm_b = math.sqrt(sum(y * y for y in b))
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)

    @staticmethod
    def vector_search(query_embedding: List[float], top_k: int = 5) -> List[KnowledgeBase]:
        """
        向量檢索（暫以內存計算 — 待 pgvector spike）。

        TODO: pgvector — 改為 SELECT ... ORDER BY embedding <-> %s LIMIT N。
        """
        items = (
            KnowledgeBase.query
            .filter(KnowledgeBase.is_active.is_(True))
            .filter(KnowledgeBase.embedding.isnot(None))
            .all()
        )
        scored = [
            (kb, KnowledgeBaseService.cosine_similarity(query_embedding, kb.embedding or []))
            for kb in items
        ]
        scored.sort(key=lambda x: x[1], reverse=True)
        return [kb for kb, _ in scored[:top_k]]

    @staticmethod
    def create(title: str, content: str, category: Optional[str] = None,
               source_url: Optional[str] = None, tags: Optional[List[str]] = None) -> KnowledgeBase:
        kb = KnowledgeBase(
            title=title,
            content=content,
            category=category,
            source_url=source_url,
            tags=tags or [],
        )
        db.session.add(kb)
        db.session.commit()
        return kb
