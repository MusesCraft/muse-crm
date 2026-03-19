"""
MUSE CRM — Tags API

標籤管理相關 API 端點。
"""

from flask import jsonify, request
from sqlalchemy import func

from . import api_bp
from ..models import Tag, ContactTag, Contact
from .. import db
from ..utils.auth import login_required


@api_bp.route('/tags', methods=['GET'])
@login_required
def list_tags():
    """
    列出所有標籤
    
    Query parameters:
        - category: 篩選標籤分類
        - with_counts: 是否包含使用統計 true/false
    """
    category = request.args.get('category')
    with_counts = request.args.get('with_counts', '').lower() == 'true'
    
    query = Tag.query
    
    if category:
        query = query.filter(Tag.category == category)
    
    if with_counts:
        # 包含使用統計的複雜查詢
        tags_with_counts = (
            db.session.query(
                Tag,
                func.count(ContactTag.contact_id).label('usage_count')
            )
            .outerjoin(ContactTag, Tag.id == ContactTag.tag_id)
            .group_by(Tag.id)
            .order_by(Tag.name)
            .all()
        )
        
        tags = []
        for tag, usage_count in tags_with_counts:
            tag_dict = tag.to_dict()
            tag_dict['usage_count'] = usage_count
            tags.append(tag_dict)
    else:
        # 簡單查詢
        tag_objects = query.order_by(Tag.name).all()
        tags = [tag.to_dict() for tag in tag_objects]
    
    return jsonify(tags)


@api_bp.route('/tags/categories', methods=['GET'])
@login_required
def list_tag_categories():
    """列出所有標籤分類"""
    categories = (
        db.session.query(Tag.category)
        .filter(Tag.category.isnot(None))
        .distinct()
        .order_by(Tag.category)
        .all()
    )
    
    return jsonify([cat[0] for cat in categories])


@api_bp.route('/tags', methods=['POST'])
@login_required
def create_tag():
    """建立新標籤"""
    data = request.get_json()
    
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': '標籤名稱不能為空'}), 400
    
    # 檢查是否已存在
    existing = Tag.query.filter_by(name=name).first()
    if existing:
        return jsonify({'error': '標籤名稱已存在'}), 400
    
    tag = Tag(
        name=name,
        category=data.get('category'),
        is_system=False
    )
    
    db.session.add(tag)
    db.session.commit()
    
    return jsonify({
        'message': '標籤已建立',
        'tag': tag.to_dict()
    }), 201


@api_bp.route('/tags/<tag_id>', methods=['PATCH'])
@login_required
def update_tag(tag_id):
    """更新標籤資訊"""
    tag = Tag.query.get_or_404(tag_id)
    
    if tag.is_system:
        return jsonify({'error': '系統標籤不能修改'}), 400
    
    data = request.get_json()
    
    if 'name' in data:
        new_name = data['name'].strip()
        if not new_name:
            return jsonify({'error': '標籤名稱不能為空'}), 400
        
        # 檢查名稱是否重複
        existing = Tag.query.filter(
            Tag.name == new_name,
            Tag.id != tag.id
        ).first()
        if existing:
            return jsonify({'error': '標籤名稱已存在'}), 400
        
        tag.name = new_name
    
    if 'category' in data:
        tag.category = data['category']
    
    db.session.commit()
    
    return jsonify({
        'message': '標籤已更新',
        'tag': tag.to_dict()
    })


@api_bp.route('/tags/<tag_id>', methods=['DELETE'])
@login_required
def delete_tag(tag_id):
    """刪除標籤"""
    tag = Tag.query.get_or_404(tag_id)
    
    if tag.is_system:
        return jsonify({'error': '系統標籤不能刪除'}), 400
    
    # 檢查是否有客戶在使用此標籤
    usage_count = ContactTag.query.filter_by(tag_id=tag.id).count()
    if usage_count > 0:
        return jsonify({
            'error': f'此標籤正被 {usage_count} 位客戶使用，無法刪除'
        }), 400
    
    db.session.delete(tag)
    db.session.commit()
    
    return jsonify({'message': '標籤已刪除'})


@api_bp.route('/tags/<tag_id>/contacts', methods=['GET'])
@login_required
def list_contacts_by_tag(tag_id):
    """列出使用特定標籤的客戶"""
    tag = Tag.query.get_or_404(tag_id)
    
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), 100)
    
    # 透過 ContactTag 關聯查詢客戶
    query = (
        db.session.query(Contact)
        .join(ContactTag, Contact.id == ContactTag.contact_id)
        .filter(
            ContactTag.tag_id == tag.id,
            Contact.is_merged == False
        )
        .order_by(Contact.last_active_at.desc())
    )
    
    pagination = query.paginate(page=page, per_page=per_page)
    
    contacts = []
    for contact in pagination.items:
        contact_dict = contact.to_dict()
        
        # 加入此標籤的來源資訊
        contact_tag = ContactTag.query.filter_by(
            contact_id=contact.id,
            tag_id=tag.id
        ).first()
        
        contact_dict['tag_source'] = contact_tag.source if contact_tag else None
        contact_dict['tagged_at'] = contact_tag.created_at.isoformat() if contact_tag else None
        
        contacts.append(contact_dict)
    
    return jsonify({
        'tag': tag.to_dict(),
        'contacts': contacts,
        'pagination': {
            'page': page,
            'per_page': per_page,
            'total': pagination.total,
            'pages': pagination.pages,
            'has_prev': pagination.has_prev,
            'has_next': pagination.has_next
        }
    })