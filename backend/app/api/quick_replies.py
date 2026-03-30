"""
MUSE CRM — Quick Replies API

預存語錄相關 API 端點。
從 scripted_responses.json 載入語錄資料。
"""

import json
import os
import logging
from typing import Optional

from flask import jsonify, request
from . import api_bp
from ..utils.auth import login_required

logger = logging.getLogger(__name__)

# ── 資料載入 ────────────────────────────────────────────

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '..', 'data')
_DB_PATH = os.path.join(_DATA_DIR, 'scripted_responses.json')

_responses: list[dict] = []

_PRIORITY_RANK = {"must": 0, "contextual": 1, "conditional": 2, "template": 3}


def _load():
    """懶載入語錄資料庫。"""
    global _responses
    if _responses:
        return
    try:
        with open(_DB_PATH, 'r', encoding='utf-8') as f:
            _responses = json.load(f)
        logger.info(f"✅ 載入 {len(_responses)} 條預存語錄")
    except FileNotFoundError:
        logger.warning(f"⚠️ 找不到語錄檔案: {_DB_PATH}")
        _responses = []
    except json.JSONDecodeError as e:
        logger.error(f"❌ 語錄檔案格式錯誤: {e}")
        _responses = []


def _search_responses(query: str, category: Optional[str] = None, limit: int = 20) -> list[dict]:
    """搜尋語錄，支援關鍵字和分類篩選。"""
    _load()
    results = []
    q = query.lower().strip()

    for r in _responses:
        # 分類篩選
        if category and r.get('category') != category:
            continue

        score = 0

        # 標題匹配
        if q in r.get('title', '').lower():
            score += 10

        # 內容匹配
        if q in r.get('content', '').lower():
            score += 5

        # 關鍵字匹配
        keywords = r.get('trigger_keywords', [])
        for kw in keywords:
            if q in kw.lower() or kw.lower() in q:
                score += 3

        if score > 0:
            results.append({**r, '_score': score})

    # 按分數排序
    results.sort(key=lambda x: (-x['_score'], _PRIORITY_RANK.get(x.get('priority', 'template'), 3)))

    # 移除 _score 欄位
    for r in results:
        r.pop('_score', None)

    return results[:limit]


# ── API 端點 ────────────────────────────────────────────

@api_bp.route('/quick-replies', methods=['GET'])
@login_required
def list_quick_replies():
    """
    列出所有語錄

    Query parameters:
        - category: 篩選分類
        - limit: 限制筆數（預設 100）
    """
    _load()
    category = request.args.get('category')
    limit = min(request.args.get('limit', 100, type=int), 500)

    results = _responses
    if category:
        results = [r for r in results if r.get('category') == category]

    # 取得所有分類
    categories = list(set(r.get('category', '') for r in _responses))

    return jsonify({
        'data': results[:limit],
        'total': len(results),
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
    q = request.args.get('q', '').strip()
    if not q:
        return jsonify({'error': '請提供搜尋關鍵字 (q)'}), 400

    category = request.args.get('category')
    limit = min(request.args.get('limit', 20, type=int), 100)

    results = _search_responses(q, category=category, limit=limit)

    return jsonify({
        'data': results,
        'total': len(results),
        'query': q,
    })


@api_bp.route('/quick-replies/<response_id>', methods=['GET'])
@login_required
def get_quick_reply(response_id: str):
    """取得單一語錄"""
    _load()
    for r in _responses:
        if r.get('id') == response_id:
            return jsonify(r)

    return jsonify({'error': f'語錄 {response_id} 不存在'}), 404
