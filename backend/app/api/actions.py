"""
MUSE CRM — Actions API

待辦動作管理相關 API 端點。
"""

from flask import jsonify, request
from sqlalchemy import desc, and_, case

from . import api_bp
from ..models import Action, Contact
from .. import db
from ..utils.auth import login_required
from ..utils.permissions import get_current_user, require_role
from ..utils.scope import apply_action_scope


@api_bp.route('/actions', methods=['GET'])
@login_required
@require_role('admin', 'manager', 'user')
def list_actions():
    """
    列出待辦動作列表（分頁）
    
    Query parameters:
        - page: 頁碼（預設 1）
        - per_page: 每頁筆數（預設 20）
        - status: 篩選狀態 pending/assigned/in_progress/completed/cancelled
        - priority: 篩選優先級 high/medium/low
        - assigned_to: 篩選指派人員
        - overdue: 是否只顯示過期項目 true/false
    """
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), 100)
    status = request.args.get('status')
    priority = request.args.get('priority')
    assigned_to = request.args.get('assigned_to')
    overdue_only = request.args.get('overdue', '').lower() == 'true'
    
    query = Action.query.join(Contact, Action.contact_id == Contact.id)

    # 套用資料可見範圍
    user = get_current_user()
    if user:
        query = apply_action_scope(query, user)

    # 篩選條件
    if status:
        query = query.filter(Action.status == status)
    if priority:
        query = query.filter(Action.priority == priority)
    if assigned_to:
        query = query.filter(Action.assigned_to == assigned_to)
    if overdue_only:
        from datetime import date
        query = query.filter(
            and_(
                Action.due_date < date.today(),
                Action.status.in_(['pending', 'assigned', 'in_progress'])
            )
        )
    
    # 排序：優先級（high=1 > medium=2 > low=3）> 到期日 > 建立時間
    priority_order = case(
        (Action.priority == 'high', 1),
        (Action.priority == 'medium', 2),
        (Action.priority == 'low', 3),
        else_=4,
    )
    query = query.order_by(
        priority_order.asc(),
        Action.due_date.asc().nullslast(),
        desc(Action.created_at)
    )
    
    pagination = query.paginate(page=page, per_page=per_page)
    
    actions = []
    for action in pagination.items:
        action_dict = action.to_dict()
        action_dict['contact'] = action.contact.to_dict()
        action_dict['is_overdue'] = action.is_overdue
        actions.append(action_dict)
    
    return jsonify({
        'data': actions,
        'pagination': {
            'page': pagination.page,
            'per_page': pagination.per_page,
            'total': pagination.total,
            'pages': pagination.pages,
        },
    })


@api_bp.route('/actions/<action_id>', methods=['PATCH'])
@api_bp.route('/actions/<action_id>/status', methods=['PATCH'])
@login_required
@require_role('admin', 'manager')
def update_action_status(action_id):
    """更新動作狀態"""
    action = Action.query.get_or_404(action_id)
    data = request.get_json()
    
    new_status = data.get('status')
    if new_status not in ['pending', 'assigned', 'in_progress', 'completed', 'cancelled']:
        return jsonify({'error': '無效的狀態'}), 400
    
    if new_status == 'assigned':
        assigned_to = data.get('assigned_to')
        if assigned_to:
            action.assign_to(assigned_to)
        else:
            return jsonify({'error': '指派狀態需要 assigned_to'}), 400
    elif new_status == 'in_progress':
        action.start_progress()
    elif new_status == 'completed':
        action.complete()
    elif new_status == 'cancelled':
        action.cancel()
    else:
        action.status = new_status
    
    db.session.commit()
    
    return jsonify({
        'message': '狀態已更新',
        'action': action.to_dict()
    })


@api_bp.route('/actions', methods=['POST'])
@login_required
@require_role('admin', 'manager')
def create_action():
    """建立新的待辦動作"""
    data = request.get_json()
    
    contact_id = data.get('contact_id')
    description = data.get('description', '').strip()
    
    if not contact_id or not description:
        return jsonify({'error': 'contact_id 和 description 為必填'}), 400

    priority = data.get('priority', 'medium')
    if priority not in ['high', 'medium', 'low']:
        return jsonify({'error': '無效的 priority，允許值為 high/medium/low'}), 400

    contact = Contact.query.get(contact_id)
    if not contact:
        return jsonify({'error': '客戶不存在'}), 404
    
    action = Action(
        contact_id=contact.id,
        conversation_id=data.get('conversation_id'),
        description=description,
        source='manual',
        priority=priority,
        assigned_to=data.get('assigned_to'),
        due_date=data.get('due_date')  # ISO date string, SQLAlchemy will parse
    )
    
    db.session.add(action)
    db.session.commit()
    
    return jsonify({
        'message': '待辦動作已建立',
        'action': action.to_dict()
    }), 201