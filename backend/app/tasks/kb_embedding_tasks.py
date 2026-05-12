"""
MUSE CRM — KB Embedding Tasks

異步產生知識庫條目的 embedding（PR-5）。

TODO: pgvector / 真實 embedding API — 目前以 stub 寫入 1536 維零向量。
"""

import logging

from .. import celery, db
from ..models import KnowledgeBase

logger = logging.getLogger(__name__)


@celery.task(name='crm.tasks.generate_kb_embedding')
def generate_kb_embedding(kb_id: str):
    """為單一 KB 條目產生 embedding（暫以 stub 寫入零向量）"""
    kb = db.session.get(KnowledgeBase, kb_id)
    if not kb:
        return {'success': False, 'error': 'KB not found'}

    # TODO: 接 OpenAI text-embedding-3-small 或 Gemini embedding
    kb.embedding = [0.0] * 1536
    kb.embedding_model = 'stub'
    db.session.commit()
    logger.info(f"[kb] embedding stub 寫入 kb={kb_id}")
    return {'success': True, 'kb_id': kb_id}


@celery.task(name='crm.tasks.backfill_kb_embeddings')
def backfill_kb_embeddings():
    """補齊所有沒有 embedding 的 KB 條目"""
    items = KnowledgeBase.query.filter(KnowledgeBase.embedding.is_(None)).all()
    for kb in items:
        generate_kb_embedding.delay(str(kb.id))
    return {'queued': len(items)}
