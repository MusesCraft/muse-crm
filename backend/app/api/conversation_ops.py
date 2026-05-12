"""
MUSE CRM — Conversation Operations API

對話分配、接管、求援、旁聽、解決等操作端點（PR-3，PRD §6.3）。
"""

import logging

from flask import jsonify, request

from . import api_bp
from .. import db
from ..models import Conversation, User
from ..services.assignment_service import AssignmentService
from ..services.escalation_service import EscalationService
from ..utils.auth import login_required
from ..utils.permissions import get_current_user, require_role
from ..realtime.emitter import emit_to_user, emit_to_role

logger = logging.getLogger(__name__)


def _get_conversation_or_404(conversation_id: str):
    conv = Conversation.query.get(conversation_id)
    if not conv:
        return None, (jsonify({'error': '對話不存在'}), 404)
    return conv, None


def _emit_to_handler_and_supervisors(conv: Conversation, event: str, payload: dict):
    """通知對話相關人員（handler、supervisor、watcher、所有 manager + admin）"""
    if conv.current_handler_id:
        emit_to_user(conv.current_handler_id, event, payload)
    if conv.supervisor_id:
        emit_to_user(conv.supervisor_id, event, payload)
    for uid in (conv.watchers or []):
        emit_to_user(uid, event, payload)
    emit_to_role('manager', event, payload)
    emit_to_role('admin', event, payload)


# ── 分配 ──────────────────────────────────────────────────

@api_bp.route('/inbox/conversations/<conversation_id>/assign', methods=['POST'])
@login_required
@require_role('admin', 'manager')
def assign_conversation(conversation_id):
    """
    分配對話給指定客服。

    Body: { "user_id": "uuid" } 不傳則嘗試自動分配。
    """
    conv, err = _get_conversation_or_404(conversation_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    target_user_id = data.get('user_id')
    actor = get_current_user()

    if target_user_id:
        target = db.session.get(User, target_user_id)
        if not target:
            return jsonify({'error': '指定的使用者不存在'}), 404
        AssignmentService.manual_assign(conv, target, actor)
    else:
        AssignmentService.auto_assign(conv)

    db.session.commit()

    _emit_to_handler_and_supervisors(
        conv, 'conversation.assigned',
        {'conversation_id': str(conv.id), 'handler_id': str(conv.current_handler_id) if conv.current_handler_id else None}
    )

    return jsonify({'data': conv.to_dict()})


# ── 求援 ──────────────────────────────────────────────────

@api_bp.route('/inbox/conversations/<conversation_id>/escalate', methods=['POST'])
@login_required
@require_role('user', 'agent', 'manager', 'admin')
def escalate_conversation(conversation_id):
    """客服求援。Body: { "reason": "短文字 <= 200 字" }"""
    conv, err = _get_conversation_or_404(conversation_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    reason = (data.get('reason') or '').strip()
    if not reason:
        return jsonify({'error': '請填寫求援原因'}), 400
    if len(reason) > 200:
        return jsonify({'error': '求援原因不可超過 200 字'}), 400

    actor = get_current_user()
    try:
        EscalationService.escalate(conv, actor, reason)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    db.session.commit()

    emit_to_role('manager', 'conversation.escalated', {
        'conversation_id': str(conv.id),
        'reason': reason,
        'actor_id': str(actor.id),
    })
    emit_to_role('admin', 'conversation.escalated', {
        'conversation_id': str(conv.id),
        'reason': reason,
        'actor_id': str(actor.id),
    })

    return jsonify({'data': conv.to_dict()})


# ── 接管 ──────────────────────────────────────────────────

@api_bp.route('/inbox/conversations/<conversation_id>/take-over', methods=['POST'])
@login_required
@require_role('manager', 'admin')
def take_over_conversation(conversation_id):
    """
    主管接管。Body: { "note": "...", "force": false }
    force=true 僅 admin 可用。
    """
    conv, err = _get_conversation_or_404(conversation_id)
    if err:
        return err

    actor = get_current_user()
    data = request.get_json(silent=True) or {}
    force = bool(data.get('force', False))
    if force and actor.role != 'admin':
        return jsonify({'error': '只有 admin 可強制接管'}), 403

    try:
        EscalationService.take_over(conv, actor, force=force, note=data.get('note'))
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    db.session.commit()

    _emit_to_handler_and_supervisors(
        conv, 'conversation.taken_over',
        {'conversation_id': str(conv.id), 'supervisor_id': str(actor.id), 'force': force}
    )

    return jsonify({'data': conv.to_dict()})


# ── 歸還 ──────────────────────────────────────────────────

@api_bp.route('/inbox/conversations/<conversation_id>/return', methods=['POST'])
@login_required
@require_role('manager', 'admin')
def return_conversation(conversation_id):
    """主管把對話歸還原客服"""
    conv, err = _get_conversation_or_404(conversation_id)
    if err:
        return err

    actor = get_current_user()
    EscalationService.return_to_agent(conv, actor)
    db.session.commit()

    _emit_to_handler_and_supervisors(
        conv, 'conversation.returned',
        {'conversation_id': str(conv.id), 'handler_id': str(conv.current_handler_id) if conv.current_handler_id else None}
    )

    return jsonify({'data': conv.to_dict()})


# ── 旁聽 ──────────────────────────────────────────────────

@api_bp.route('/inbox/conversations/<conversation_id>/watch', methods=['POST'])
@login_required
@require_role('manager', 'admin')
def watch_conversation(conversation_id):
    conv, err = _get_conversation_or_404(conversation_id)
    if err:
        return err

    actor = get_current_user()
    EscalationService.watch(conv, actor)
    db.session.commit()
    return jsonify({'data': conv.to_dict()})


@api_bp.route('/inbox/conversations/<conversation_id>/watch', methods=['DELETE'])
@login_required
@require_role('manager', 'admin')
def unwatch_conversation(conversation_id):
    conv, err = _get_conversation_or_404(conversation_id)
    if err:
        return err

    actor = get_current_user()
    EscalationService.unwatch(conv, actor)
    db.session.commit()
    return jsonify({'data': conv.to_dict()})


# ── 解決 / 重啟 ───────────────────────────────────────────

@api_bp.route('/inbox/conversations/<conversation_id>/resolve', methods=['POST'])
@login_required
def resolve_conversation(conversation_id):
    conv, err = _get_conversation_or_404(conversation_id)
    if err:
        return err

    actor = get_current_user()
    # agent 角色只能 resolve 自己的對話
    if actor.role in ('user', 'agent') and conv.current_handler_id != actor.id:
        return jsonify({'error': '只能標記自己負責的對話為已解決'}), 403

    EscalationService.resolve(conv, actor)
    db.session.commit()

    _emit_to_handler_and_supervisors(
        conv, 'conversation.resolved',
        {'conversation_id': str(conv.id)}
    )
    return jsonify({'data': conv.to_dict()})


@api_bp.route('/inbox/conversations/<conversation_id>/reopen', methods=['POST'])
@login_required
@require_role('manager', 'admin', 'user', 'agent')
def reopen_conversation(conversation_id):
    conv, err = _get_conversation_or_404(conversation_id)
    if err:
        return err

    actor = get_current_user()
    EscalationService.reopen(conv, actor)
    db.session.commit()
    return jsonify({'data': conv.to_dict()})
