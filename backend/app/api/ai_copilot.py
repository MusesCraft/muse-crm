"""
MUSE CRM — AI Copilot API

回覆草稿、對話摘要、知識檢索、風險偵測端點（PR-6，PRD §6.3）。

說明：本版以 stub 結構先建立路由與資料寫入點；真實 LLM 串流呼叫
在後續迭代中由 llm_service 加上 OpenRouter SSE 接管即可。
TODO PR-6+：接 OpenRouter SSE 串流；目前 stream 端點以「一次回應」模擬。
"""

import json
import logging

from flask import Response, jsonify, request, stream_with_context

from . import api_bp
from .. import db
from ..models import Conversation, ReplySuggestion, Message
from ..services.copilot_service import CopilotService
from ..services.knowledge_base_service import KnowledgeBaseService
from ..utils.auth import login_required

logger = logging.getLogger(__name__)


@api_bp.route('/ai/suggestions', methods=['GET'])
@login_required
def get_reply_suggestions():
    """
    取得回覆草稿。

    Query: conversation_id
    若帶 ?stream=1，以 SSE 串流回應（PRD §F4.3）。
    """
    conv_id = request.args.get('conversation_id')
    if not conv_id:
        return jsonify({'error': '請提供 conversation_id'}), 400

    conv = Conversation.query.get(conv_id)
    if not conv:
        return jsonify({'error': '對話不存在'}), 404

    streaming = request.args.get('stream') == '1'
    record = CopilotService.generate_suggestions(conv)

    if not streaming:
        return jsonify({'data': record.to_dict()})

    # ── SSE 串流（TODO：接 LLM 真實串流） ──
    def event_stream():
        # 模擬串流：依序送出每筆 suggestion
        suggestions = record.suggestions or []
        for idx, sug in enumerate(suggestions):
            payload = json.dumps({'index': idx, 'suggestion': sug}, ensure_ascii=False)
            yield f"event: suggestion\ndata: {payload}\n\n"
        yield f"event: done\ndata: {json.dumps({'record_id': str(record.id)})}\n\n"

    return Response(
        stream_with_context(event_stream()),
        mimetype='text/event-stream',
        headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'},
    )


@api_bp.route('/ai/suggestions/<suggestion_id>/used', methods=['POST'])
@login_required
def mark_suggestion_used(suggestion_id):
    """紀錄草稿被採用 + 是否經過編輯"""
    record = ReplySuggestion.query.get_or_404(suggestion_id)
    data = request.get_json(silent=True) or {}
    idx = data.get('used_suggestion_index')
    edited = data.get('edited_before_send')
    if idx is not None:
        record.used_suggestion_index = int(idx)
    if edited is not None:
        record.edited_before_send = bool(edited)
    db.session.commit()
    return jsonify({'data': record.to_dict()})


@api_bp.route('/ai/summary', methods=['GET'])
@login_required
def get_conversation_summary():
    """
    對話摘要（PRD §F4.2）。

    本版以最近 5 則訊息簡單拼接，後續接 LLM。
    TODO PR-6+：接 claude-haiku 異步摘要。
    """
    conv_id = request.args.get('conversation_id')
    if not conv_id:
        return jsonify({'error': '請提供 conversation_id'}), 400

    conv = Conversation.query.get(conv_id)
    if not conv:
        return jsonify({'error': '對話不存在'}), 404

    recent = (
        Message.query
        .filter_by(conversation_id=conv.id, is_internal=False)
        .order_by(Message.sent_at.desc())
        .limit(5)
        .all()
    )
    recent.reverse()
    preview = '\n'.join(
        f"[{('客戶' if m.sender_type == 'customer' else '客服')}] {m.content or ''}"
        for m in recent
    )

    return jsonify({
        'conversation_id': conv_id,
        'summary': preview or '尚無對話內容',
        'is_stub': True,
    })


@api_bp.route('/ai/knowledge-search', methods=['GET'])
@login_required
def search_knowledge():
    """知識庫檢索（PRD §F4.4）"""
    q = request.args.get('q', '').strip()
    category = request.args.get('category')
    top_k = min(request.args.get('top_k', 5, type=int), 20)

    if not q:
        return jsonify({'data': []})

    items = KnowledgeBaseService.search(q, category=category, top_k=top_k)
    return jsonify({'data': [kb.to_dict() for kb in items]})
