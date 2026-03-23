"""
MUSE CRM — Contacts API

客戶管理相關 API 端點。
"""

from flask import jsonify, request, g
from sqlalchemy import desc, or_, func

from . import api_bp
from ..models import Contact, ContactTag, Tag, UserNote
from .. import db
from ..utils.auth import login_required
from ..utils.permissions import get_current_user
from ..utils.scope import apply_contact_scope


@api_bp.route('/contacts', methods=['GET'])
@login_required
def list_contacts():
    """
    列出客戶列表（分頁）
    
    Query parameters:
        - page: 頁碼（預設 1）
        - per_page: 每頁筆數（預設 20）
        - search: 搜尋客戶名稱
        - tag: 篩選標籤
        - channel: 篩選來源渠道
        - source_type: 篩選來源類型 ad_referral/organic
    """
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), 100)
    search = request.args.get('search', '').strip()
    tag_name = request.args.get('tag')
    channel = request.args.get('channel')
    source_type = request.args.get('source_type')
    
    query = Contact.query.filter(Contact.is_merged == False)

    # 套用資料可見範圍
    user = get_current_user()
    if user:
        query = apply_contact_scope(query, user)

    # 篩選條件
    if search:
        query = query.filter(
            or_(
                Contact.display_name.ilike(f'%{search}%'),
                Contact.notes.ilike(f'%{search}%')
            )
        )
    
    if tag_name:
        query = (
            query.join(ContactTag, Contact.id == ContactTag.contact_id)
            .join(Tag, ContactTag.tag_id == Tag.id)
            .filter(Tag.name == tag_name)
        )
    
    if channel:
        query = query.filter(Contact.source_channel == channel)
    
    if source_type:
        query = query.filter(Contact.source_type == source_type)
    
    # 排序：最近活躍優先
    query = query.order_by(desc(Contact.last_active_at))
    
    pagination = query.paginate(page=page, per_page=per_page)
    
    contacts = []
    for contact in pagination.items:
        contact_dict = contact.to_dict()
        
        # 加入標籤資訊
        contact_dict['tags'] = [
            {
                'name': ct.tag.name,
                'category': ct.tag.category,
                'source': ct.source
            }
            for ct in contact.tags
        ]
        
        # 加入統計資訊
        contact_dict['conversation_count'] = len(contact.conversations)
        contact_dict['message_count'] = len(contact.messages)
        
        contacts.append(contact_dict)
    
    return jsonify({
        'data': contacts,
        'pagination': {
            'page': page,
            'per_page': per_page,
            'total': pagination.total,
            'pages': pagination.pages,
            'has_prev': pagination.has_prev,
            'has_next': pagination.has_next
        }
    })


@api_bp.route('/contacts/<contact_id>', methods=['GET'])
@login_required
def get_contact_detail(contact_id):
    """取得客戶 360 檢視"""
    contact = Contact.query.get_or_404(contact_id)
    
    if contact.is_merged:
        return jsonify({'error': '此客戶已被合併'}), 400
    
    contact_dict = contact.to_dict()
    
    # 標籤
    contact_dict['tags'] = [
        {
            'id': str(ct.tag.id),
            'name': ct.tag.name,
            'category': ct.tag.category,
            'source': ct.source,
            'created_at': ct.created_at.isoformat()
        }
        for ct in contact.tags
    ]
    
    # 對話歷史
    contact_dict['conversations'] = [
        {
            **conv.to_dict(),
            'message_count': conv.message_count
        }
        for conv in sorted(contact.conversations, key=lambda x: x.started_at, reverse=True)
    ]
    
    # 分析結果
    contact_dict['analyses'] = [
        analysis.to_dict()
        for analysis in sorted(contact.analyses, key=lambda x: x.created_at, reverse=True)
    ]
    
    # 待辦動作
    contact_dict['actions'] = [
        action.to_dict()
        for action in sorted(contact.actions, key=lambda x: x.created_at, reverse=True)
    ]
    
    # 使用者備註
    contact_dict['notes'] = [
        note.to_dict()
        for note in sorted(contact.notes_by_users, key=lambda x: x.created_at, reverse=True)
    ]
    
    return jsonify(contact_dict)


@api_bp.route('/contacts/<contact_id>/notes', methods=['POST'])
@login_required
def add_contact_note(contact_id):
    """新增客戶備註"""
    contact = Contact.query.get_or_404(contact_id)
    data = request.get_json()
    
    if not data or not data.get('content', '').strip():
        return jsonify({'error': '備註內容不能為空'}), 400
    
    note = UserNote(
        contact_id=contact.id,
        # author_id=current_user.id,  # TODO: 實作認證後啟用
        content=data['content'].strip()
    )
    
    db.session.add(note)
    db.session.commit()
    
    return jsonify({
        'message': '備註已新增',
        'note': note.to_dict()
    }), 201


@api_bp.route('/contacts/<contact_id>/tags', methods=['POST'])
@login_required
def add_contact_tag(contact_id):
    """為客戶新增標籤"""
    contact = Contact.query.get_or_404(contact_id)
    data = request.get_json()
    
    tag_name = data.get('tag_name', '').strip()
    if not tag_name:
        return jsonify({'error': '標籤名稱不能為空'}), 400
    
    # 取得或建立標籤
    tag = Tag.query.filter_by(name=tag_name).first()
    if not tag:
        tag = Tag(name=tag_name, category=data.get('category'))
        db.session.add(tag)
        db.session.flush()
    
    # 檢查是否已存在
    existing = ContactTag.query.filter_by(
        contact_id=contact.id,
        tag_id=tag.id
    ).first()
    
    if existing:
        return jsonify({'error': '標籤已存在'}), 400
    
    # 新增關聯
    contact_tag = ContactTag(
        contact_id=contact.id,
        tag_id=tag.id,
        source='manual'
    )
    
    db.session.add(contact_tag)
    db.session.commit()
    
    return jsonify({
        'message': '標籤已新增',
        'tag': {
            'id': str(tag.id),
            'name': tag.name,
            'category': tag.category,
            'source': 'manual'
        }
    }), 201


@api_bp.route('/contacts/<contact_id>/tags/<tag_id>', methods=['DELETE'])
@login_required
def remove_contact_tag(contact_id, tag_id):
    """移除客戶標籤"""
    contact_tag = ContactTag.query.filter_by(
        contact_id=contact_id,
        tag_id=tag_id
    ).first_or_404()
    
    db.session.delete(contact_tag)
    db.session.commit()
    
    return jsonify({'message': '標籤已移除'})