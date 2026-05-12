"""
MUSE CRM — Conversation Operations API（v1.1）

對話分配、求援、旁聽、推 Nudge、強制接管（admin 例外）、解決等操作端點。

PRD §6.3（v1.1）：
- 移除 take-over / return（主管不再成為對外回覆者）
- 新增 nudge（主管推提醒給 agent）
- 新增 force-handle（admin 緊急例外接管，需 reason + audit log）
"""

import logging

from flask import jsonify, request

from . import api_bp
from .. import db
from ..models import Conversation, User, ConversationEvent
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


# ── 旁聽（Watch） ─────────────────────────────────────────

@api_bp.route('/inbox/conversations/<conversation_id>/watch', methods=['POST'])
@login_required
@require_role('manager', 'admin')
def watch_conversation(conversation_id):
    """主管旁聽。對話側邊會顯示主管在監看。"""
    conv, err = _get_conversation_or_404(conversation_id)
    if err:
        return err

    actor = get_current_user()
    EscalationService.watch(conv, actor)
    db.session.commit()

    # 通知對話 handler「主管 X 正在監看」
    _emit_to_handler_and_supervisors(
        conv,
        'supervisor.watching',
        {
            'conversation_id': str(conv.id),
            'supervisor_id': str(actor.id),
            'supervisor_name': actor.name or actor.email,
            'action': 'start',
        },
    )

    return jsonify({'data': conv.to_dict()})


@api_bp.route('/inbox/conversations/<conversation_id>/watch', methods=['DELETE'])
@login_required
@require_role('manager', 'admin')
def unwatch_conversation(conversation_id):
    """取消旁聽"""
    conv, err = _get_conversation_or_404(conversation_id)
    if err:
        return err

    actor = get_current_user()
    EscalationService.unwatch(conv, actor)
    db.session.commit()

    _emit_to_handler_and_supervisors(
        conv,
        'supervisor.watching',
        {
            'conversation_id': str(conv.id),
            'supervisor_id': str(actor.id),
            'supervisor_name': actor.name or actor.email,
            'action': 'stop',
        },
    )

    return jsonify({'data': conv.to_dict()})


# ── Nudge（v1.1 新增） ────────────────────────────────────

@api_bp.route('/inbox/conversations/<conversation_id>/nudge', methods=['POST'])
@login_required
@require_role('manager', 'admin')
def nudge_agent(conversation_id):
    """
    主管推 nudge 給特定 agent（PRD §F3.3）。

    Body: { "agent_id": "<user_uuid>", "message": "..." }
    - agent_id 不傳時預設使用對話的 current_handler_id
    - message 必填，≤ 200 字
    """
    conv, err = _get_conversation_or_404(conversation_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    message = (data.get('message') or '').strip()
    if not message:
        return jsonify({'error': '請填寫 nudge 訊息'}), 400

    agent_id = data.get('agent_id') or (str(conv.current_handler_id) if conv.current_handler_id else None)
    if not agent_id:
        return jsonify({'error': '對話無 handler，請指定 agent_id'}), 400

    target = db.session.get(User, agent_id)
    if not target:
        return jsonify({'error': '指定的 agent 不存在'}), 404

    actor = get_current_user()
    if str(target.id) == str(actor.id):
        return jsonify({'error': '不能 nudge 自己'}), 400

    try:
        event = EscalationService.send_nudge(actor, conv, target, message)
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

    db.session.commit()

    return jsonify({'data': event.to_dict()}), 201


# ── 強制接管（admin 緊急例外，v1.1 新增） ──────────────────

@api_bp.route('/inbox/conversations/<conversation_id>/force-handle', methods=['POST'])
@login_required
@require_role('admin')
def force_handle_conversation(conversation_id):
    """
    Admin 強制接管（緊急例外）。需 reason 必填，寫入 audit log。

    使用場景：員工離職、客訴升級到法務、agent 明顯失職等。
    Body: { "reason": "為什麼接管，必填" }

    執行效果：
    - supervisor_id ← admin
    - current_handler_id ← admin
    - status 維持原狀（不切到不存在的 supervisor_taken）
    - 寫 conversation_event(event_type='force_taken')
    - 通知原 handler 和所有 manager
    """
    conv, err = _get_conversation_or_404(conversation_id)
    if err:
        return err

    data = request.get_json(silent=True) or {}
    reason = (data.get('reason') or '').strip()
    if not reason:
        return jsonify({'error': '強制接管必須填寫理由（reason）'}), 400
    if len(reason) > 500:
        return jsonify({'error': '理由不可超過 500 字'}), 400

    actor = get_current_user()
    original_handler_id = conv.current_handler_id

    conv.supervisor_id = actor.id
    conv.current_handler_id = actor.id

    event = ConversationEvent(
        conversation_id=conv.id,
        event_type='force_taken',
        actor_id=actor.id,
        target_id=actor.id,
        event_metadata={
            'reason': reason,
            'original_handler_id': str(original_handler_id) if original_handler_id else None,
        },
    )
    db.session.add(event)
    db.session.commit()

    # 通知原 handler、所有 manager / admin
    payload = {
        'conversation_id': str(conv.id),
        'admin_id': str(actor.id),
        'admin_name': actor.name or actor.email,
        'reason': reason,
        'original_handler_id': str(original_handler_id) if original_handler_id else None,
    }
    if original_handler_id:
        emit_to_user(original_handler_id, 'conversation.force_taken', payload)
    emit_to_role('manager', 'conversation.force_taken', payload)
    emit_to_role('admin', 'conversation.force_taken', payload)

    logger.warning(
        f"[force-handle] admin={actor.id} forced handle of conv={conv.id}: {reason}"
    )

    return jsonify({'data': conv.to_dict()}), 200


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
