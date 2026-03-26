"""
MUSE CRM — OCR API

名片辨識相關 API 端點。
"""

import logging

from flask import jsonify, request

from . import api_bp
from ..models import Message, Contact, Conversation
from .. import db
from ..services.ocr_service import BusinessCardOCR
from ..utils.auth import login_required

logger = logging.getLogger(__name__)


@api_bp.route('/ocr/business-card', methods=['POST'])
@login_required
def ocr_business_card():
    """
    手動辨識名片圖片。

    Body:
        { image_url: string }
        或 { conversation_id, message_id }（從訊息的 media_url 讀取）
        可選: { contact_id }（指定要更新的客戶）

    Returns:
        辨識結果 + 是否已更新 contact
    """
    data = request.get_json(silent=True) or {}

    image_url = data.get('image_url')
    conversation_id = data.get('conversation_id')
    message_id = data.get('message_id')
    contact_id = data.get('contact_id')

    # 從 message 取得 image_url
    if not image_url and message_id:
        message = Message.query.get(message_id)
        if not message:
            return jsonify({'error': '找不到訊息'}), 404
        if not message.media_url:
            return jsonify({'error': '該訊息沒有附件'}), 400
        image_url = message.media_url
        # 自動帶入 conversation_id 和 contact_id
        if not conversation_id:
            conversation_id = str(message.conversation_id)
        if not contact_id:
            contact_id = str(message.contact_id)

    if not image_url:
        return jsonify({'error': '請提供 image_url 或 message_id'}), 400

    # 執行 OCR
    ocr = BusinessCardOCR()
    result = ocr.analyze_image(image_url)

    if result is None:
        return jsonify({'error': '名片辨識失敗，請重試'}), 422

    # 嘗試更新 contact
    contact_updated = False
    if contact_id:
        contact = Contact.query.get(contact_id)
        if contact:
            contact_updated = _update_contact_from_ocr(contact, result)

            # 在對話中加 system message
            if contact_updated and conversation_id:
                _add_ocr_system_message(conversation_id, contact, result)

            db.session.commit()

    return jsonify({
        'result': result,
        'contact_updated': contact_updated,
    })


def _update_contact_from_ocr(contact: Contact, ocr_result: dict) -> bool:
    """從 OCR 結果更新客戶資料，回傳是否有更新。"""
    updated = False

    name = ocr_result.get('name')
    if name and not contact.display_name:
        contact.display_name = name
        updated = True

    phone = ocr_result.get('phone')
    if phone and not contact.phone:
        contact.phone = phone
        updated = True

    email = ocr_result.get('email')
    if email and not contact.email:
        contact.email = email
        updated = True

    return updated


def _add_ocr_system_message(conversation_id: str, contact: Contact, ocr_result: dict) -> None:
    """在對話中新增 OCR 辨識結果的 system message。"""
    from datetime import datetime

    parts = []
    if ocr_result.get('name'):
        parts.append(ocr_result['name'])
    if ocr_result.get('company'):
        parts.append(ocr_result['company'])
    if ocr_result.get('phone'):
        parts.append(ocr_result['phone'])

    content = f"📇 名片辨識完成：{' / '.join(parts)}" if parts else "📇 名片辨識完成（無法提取資訊）"

    msg = Message(
        conversation_id=conversation_id,
        contact_id=contact.id,
        sender_type='system',
        message_type='text',
        content=content,
        sent_at=datetime.utcnow(),
    )
    db.session.add(msg)

    # 更新對話統計
    conv = Conversation.query.get(conversation_id)
    if conv:
        conv.message_count += 1
        conv.last_message_at = datetime.utcnow()
