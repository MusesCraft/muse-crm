"""
MUSE CRM — Quick Replies API

預存語錄 CRUD API 端點。
資料儲存在 PostgreSQL quick_replies 表，首次請求時從 scripted_responses.json 種子匯入。
"""

import json
import os
import logging

from flask import jsonify, request, g
from . import api_bp
from .. import db
from ..models.quick_reply import QuickReply
from ..utils.auth import login_required
from ..utils.permissions import require_role

logger = logging.getLogger(__name__)

# ── 資料路徑 & 種子匯入 ──────────────────────────────────

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '..', 'data')
_JSON_PATH = os.path.join(_DATA_DIR, 'scripted_responses.json')

_PRIORITY_RANK = {"must": 0, "contextual": 1, "conditional": 2, "template": 3}


def _seed_from_json():
    """從 JSON 檔匯入種子資料（僅在 table 為空時自動觸發）。"""
    try:
        with open(_JSON_PATH, 'r', encoding='utf-8') as f:
            items = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        logger.warning(f"無法載入種子檔案: {e}")
        return 0

    count = 0
    for item in items:
        qr = QuickReply(
            id=item.get('id', None),
            category=item.get('category', 'general'),
            title=item.get('title', ''),
            content=item.get('content', ''),
            trigger_keywords=item.get('trigger_keywords', []),
            priority=item.get('priority', 'template'),
            is_system=True,
        )
        db.session.add(qr)
        count += 1

    db.session.commit()
    logger.info(f"種子匯入完成：{count} 條語錄")
    return count


_seeded = False


def _ensure_seeded():
    """確保資料庫中有語錄（空表時自動種子匯入，結果快取避免每次查詢）。"""
    global _seeded
    if _seeded:
        return
    if QuickReply.query.first() is None:
        _seed_from_json()
    _seeded = True


# ── API 端點 ──────────────────────────────────────────────

@api_bp.route('/quick-replies', methods=['GET'])
@login_required
def list_quick_replies():
    """
    列出所有語錄

    Query parameters:
        - category: 篩選分類
        - limit: 限制筆數（預設 100）
    """
    _ensure_seeded()

    category = request.args.get('category')
    limit = min(request.args.get('limit', 100, type=int), 500)

    query = QuickReply.query
    if category:
        query = query.filter_by(category=category)
    query = query.order_by(QuickReply.category, QuickReply.created_at)
    items = query.limit(limit).all()

    # 取得所有分類
    categories = [row[0] for row in db.session.query(QuickReply.category).distinct().all()]

    return jsonify({
        'data': [item.to_dict() for item in items],
        'total': query.count(),
        'categories': sorted(categories),
    })


@api_bp.route('/quick-replies/search', methods=['GET'])
@login_required
def search_quick_replies():
    """
    搜尋語錄

    Query parameters:
        - q: 搜尋關鍵字（必填）
        - category: 篩選分類
        - limit: 限制筆數（預設 20）
    """
    _ensure_seeded()

    q = request.args.get('q', '').strip()
    if not q:
        return jsonify({'error': '請提供搜尋關鍵字 (q)'}), 400

    category = request.args.get('category')
    limit = min(request.args.get('limit', 20, type=int), 100)

    query = QuickReply.query
    if category:
        query = query.filter_by(category=category)

    all_items = query.all()
    q_lower = q.lower()
    results = []

    for item in all_items:
        score = 0
        if q_lower in (item.title or '').lower():
            score += 10
        if q_lower in (item.content or '').lower():
            score += 5
        for kw in (item.trigger_keywords or []):
            if q_lower in kw.lower() or kw.lower() in q_lower:
                score += 3
        if score > 0:
            results.append((score, item))

    results.sort(key=lambda x: (-x[0], _PRIORITY_RANK.get(x[1].priority or 'template', 3)))

    return jsonify({
        'data': [item.to_dict() for _, item in results[:limit]],
        'total': len(results),
        'query': q,
    })


@api_bp.route('/quick-replies/<response_id>', methods=['GET'])
@login_required
def get_quick_reply(response_id: str):
    """取得單一語錄"""
    _ensure_seeded()
    item = QuickReply.query.get(response_id)
    if not item:
        return jsonify({'error': f'語錄 {response_id} 不存在'}), 404
    return jsonify(item.to_dict())


@api_bp.route('/quick-replies', methods=['POST'])
@login_required
@require_role('admin', 'manager')
def create_quick_reply():
    """新增語錄"""
    data = request.get_json(silent=True) or {}

    category = (data.get('category') or '').strip()
    title = (data.get('title') or '').strip()
    content = (data.get('content') or '').strip()

    if not category or not title or not content:
        return jsonify({'error': '必填欄位：category, title, content'}), 400

    qr = QuickReply(
        category=category,
        title=title,
        content=content,
        trigger_keywords=data.get('trigger_keywords', []),
        priority=data.get('priority', 'template'),
        attachments=data.get('attachments', []),
        is_system=False,
        created_by=g.current_user.id if hasattr(g, 'current_user') and g.current_user else None,
    )
    db.session.add(qr)
    db.session.commit()

    logger.info(f"新增語錄 {qr.id}: {qr.title}")
    return jsonify(qr.to_dict()), 201


@api_bp.route('/quick-replies/<response_id>', methods=['PUT'])
@login_required
@require_role('admin', 'manager')
def update_quick_reply(response_id: str):
    """更新語錄"""
    item = QuickReply.query.get(response_id)
    if not item:
        return jsonify({'error': f'語錄 {response_id} 不存在'}), 404

    data = request.get_json(silent=True) or {}

    if 'category' in data and data['category']:
        item.category = data['category'].strip()
    if 'title' in data and data['title']:
        item.title = data['title'].strip()
    if 'content' in data and data['content']:
        item.content = data['content'].strip()
    if 'trigger_keywords' in data:
        item.trigger_keywords = data['trigger_keywords']
    if 'priority' in data:
        item.priority = data['priority']
    if 'attachments' in data:
        item.attachments = data['attachments']

    db.session.commit()

    logger.info(f"更新語錄 {item.id}: {item.title}")
    return jsonify(item.to_dict())


@api_bp.route('/quick-replies/<response_id>', methods=['DELETE'])
@login_required
@require_role('admin', 'manager')
def delete_quick_reply(response_id: str):
    """刪除語錄（系統語錄僅限 admin 刪除）"""
    item = QuickReply.query.get(response_id)
    if not item:
        return jsonify({'error': f'語錄 {response_id} 不存在'}), 404

    # 系統語錄僅 admin 可刪
    if item.is_system:
        user = g.current_user if hasattr(g, 'current_user') else None
        if not user or user.role != 'admin':
            return jsonify({'error': '系統語錄僅限管理員刪除'}), 403

    db.session.delete(item)
    db.session.commit()

    logger.info(f"刪除語錄 {response_id}")
    return jsonify({'message': f'語錄 {response_id} 已刪除'})


@api_bp.route('/quick-replies/seed', methods=['POST'])
@login_required
@require_role('admin')
def seed_quick_replies():
    """重新從 JSON 檔種子匯入（admin only，會清除現有系統語錄）"""
    # 刪除所有系統語錄
    deleted = QuickReply.query.filter_by(is_system=True).delete()
    db.session.commit()

    count = _seed_from_json()

    return jsonify({
        'message': f'已重新匯入 {count} 條系統語錄（刪除了 {deleted} 條舊資料）',
        'seeded': count,
        'deleted': deleted,
    })
