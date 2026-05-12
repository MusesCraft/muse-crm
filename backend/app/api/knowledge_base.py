"""
MUSE CRM — Knowledge Base API

知識庫 CRUD + 匯入端點（PR-5，PRD §6.3）。
"""

import csv
import io
import logging

from flask import jsonify, request

from . import api_bp
from .. import db
from ..models import KnowledgeBase
from ..services.knowledge_base_service import KnowledgeBaseService
from ..utils.auth import login_required
from ..utils.permissions import require_role

logger = logging.getLogger(__name__)


@api_bp.route('/knowledge-base', methods=['GET'])
@login_required
def list_kb_entries():
    """列出 KB 條目（含 search）"""
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), 100)
    q = request.args.get('q', '').strip()
    category = request.args.get('category')

    query = KnowledgeBase.query.filter(KnowledgeBase.is_active.is_(True))
    if category:
        query = query.filter(KnowledgeBase.category == category)
    if q:
        like = f'%{q}%'
        query = query.filter(db.or_(
            KnowledgeBase.title.ilike(like),
            KnowledgeBase.content.ilike(like),
        ))

    pagination = query.order_by(KnowledgeBase.updated_at.desc()).paginate(page=page, per_page=per_page)
    return jsonify({
        'data': [kb.to_dict() for kb in pagination.items],
        'pagination': {
            'page': page,
            'per_page': per_page,
            'total': pagination.total,
            'pages': pagination.pages,
        }
    })


@api_bp.route('/knowledge-base/<kb_id>', methods=['GET'])
@login_required
def get_kb_entry(kb_id):
    kb = KnowledgeBase.query.get_or_404(kb_id)
    return jsonify(kb.to_dict())


@api_bp.route('/knowledge-base', methods=['POST'])
@login_required
@require_role('admin', 'manager')
def create_kb_entry():
    data = request.get_json(silent=True) or {}
    title = (data.get('title') or '').strip()
    content = (data.get('content') or '').strip()
    if not title or not content:
        return jsonify({'error': 'title 與 content 必填'}), 400

    kb = KnowledgeBaseService.create(
        title=title,
        content=content,
        category=data.get('category'),
        source_url=data.get('source_url'),
        tags=data.get('tags') or [],
    )

    # 觸發 embedding 生成（非同步）
    try:
        from ..tasks.kb_embedding_tasks import generate_kb_embedding
        generate_kb_embedding.delay(str(kb.id))
    except Exception as e:
        logger.warning(f"[kb] embedding 任務排程失敗（不影響 KB 建立）: {e}")

    return jsonify({'data': kb.to_dict()}), 201


@api_bp.route('/knowledge-base/<kb_id>', methods=['PATCH'])
@login_required
@require_role('admin', 'manager')
def update_kb_entry(kb_id):
    kb = KnowledgeBase.query.get_or_404(kb_id)
    data = request.get_json(silent=True) or {}

    for field in ('title', 'content', 'category', 'source_url'):
        if field in data:
            setattr(kb, field, data[field])
    if 'tags' in data:
        kb.tags = data['tags']
    if 'is_active' in data:
        kb.is_active = bool(data['is_active'])

    db.session.commit()
    return jsonify({'data': kb.to_dict()})


@api_bp.route('/knowledge-base/<kb_id>', methods=['DELETE'])
@login_required
@require_role('admin', 'manager')
def delete_kb_entry(kb_id):
    kb = KnowledgeBase.query.get_or_404(kb_id)
    db.session.delete(kb)
    db.session.commit()
    return jsonify({'message': '已刪除'})


@api_bp.route('/knowledge-base/import', methods=['POST'])
@login_required
@require_role('admin', 'manager')
def import_kb_csv():
    """
    批量匯入 KB。Body: { "csv": "title,content,category\\n..." }
    """
    data = request.get_json(silent=True) or {}
    csv_text = data.get('csv', '')
    if not csv_text:
        return jsonify({'error': '請提供 csv 內容'}), 400

    reader = csv.DictReader(io.StringIO(csv_text))
    created = 0
    failed = 0
    for row in reader:
        title = (row.get('title') or '').strip()
        content = (row.get('content') or '').strip()
        if not title or not content:
            failed += 1
            continue
        try:
            KnowledgeBaseService.create(
                title=title,
                content=content,
                category=(row.get('category') or '').strip() or None,
                source_url=(row.get('source_url') or '').strip() or None,
            )
            created += 1
        except Exception as e:
            logger.error(f"[kb] import 失敗: {e}")
            failed += 1

    return jsonify({'created': created, 'failed': failed})
