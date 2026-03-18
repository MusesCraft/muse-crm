"""
MUSE CRM — Meta Webhook API

從 MusesAI-CS 移植的 Meta Business Webhook 接收模組。
只保留核心 Webhook 功能，移除自動回覆相關邏輯。
"""

import hashlib
import hmac
import logging
import threading
from datetime import datetime
from typing import Set
from flask import request, current_app

from . import api_bp
from ..models import Contact, ChannelIdentifier, Conversation, Message, db
from ..services.contact_service import ContactService
from ..services.session_service import SessionService
from ..tasks.session_tasks import trigger_analysis_task

logger = logging.getLogger(__name__)

# 去重機制：記住已處理的訊息 ID
_processed_message_ids: Set[str] = set()
_processed_lock = threading.Lock()
_MAX_PROCESSED_IDS = 10000  # 記住最近 1 萬筆訊息 ID


@api_bp.route('/webhook', methods=['GET'])
def webhook_verify():
    """
    Meta Messenger Webhook 驗證。
    
    Meta 會發送 GET 請求驗證 webhook URL，
    需要比對 hub.verify_token 並回傳 hub.challenge。
    """
    mode = request.args.get('hub.mode')
    token = request.args.get('hub.verify_token')
    challenge = request.args.get('hub.challenge')
    
    verify_token = current_app.config.get('META_VERIFY_TOKEN')
    
    if mode == 'subscribe' and token == verify_token:
        logger.info("✅ Webhook 驗證成功")
        return challenge, 200
    else:
        logger.warning(f"❌ Webhook 驗證失敗：mode={mode}, token={token}")
        return 'Forbidden', 403


@api_bp.route('/webhook', methods=['POST'])
def webhook_receive():
    """
    Meta Messenger Webhook 接收訊息。
    
    流程：
    1. 驗證 X-Hub-Signature-256（如果有 APP_SECRET）
    2. 解析 messaging events
    3. 建立/更新客戶和對話記錄
    4. 觸發 LLM 分析任務（背景處理）
    """
    # ── 驗證簽名 ──
    app_secret = current_app.config.get('META_APP_SECRET')
    if app_secret:
        signature = request.headers.get('X-Hub-Signature-256', '')
        if not _verify_signature(request.data, signature, app_secret):
            logger.warning("❌ Webhook 簽名驗證失敗")
            return 'Invalid signature', 403
    
    # ── 解析 payload ──
    data = request.get_json(silent=True)
    if not data:
        return 'OK', 200
    
    if data.get('object') != 'page':
        return 'OK', 200
    
    # ── 收集待處理的 messaging events ──
    tasks = []
    for entry in data.get('entry', []):
        for event in entry.get('messaging', []):
            sender_id = event.get('sender', {}).get('id')
            
            # ── 只處理訊息事件 ──
            if 'message' not in event:
                continue
            
            message_obj = event['message']
            message_id = message_obj.get('mid')
            message_text = message_obj.get('text', '')
            
            # ── 跳過空訊息或系統訊息 ──
            if not message_text.strip():
                continue
            
            # ── 去重：跳過已處理的訊息（防止 Meta 重發） ──
            with _processed_lock:
                if message_id and message_id in _processed_message_ids:
                    logger.info(f"⏭️ [webhook] 跳過重複訊息 mid={message_id[:20]}")
                    continue
                if message_id:
                    _processed_message_ids.add(message_id)
                    # 超過上限時清除最早的一半
                    if len(_processed_message_ids) > _MAX_PROCESSED_IDS:
                        to_remove = list(_processed_message_ids)[:_MAX_PROCESSED_IDS // 2]
                        for mid in to_remove:
                            _processed_message_ids.discard(mid)
            
            # 解析 Ad Referral（如果有）
            ad_referral = None
            if 'referral' in message_obj:
                referral = message_obj['referral']
                ad_referral = {
                    'ad_id': referral.get('ad_id'),
                    'campaign_name': referral.get('campaign_name'),
                    'creative_id': referral.get('creative_id')
                }
            
            tasks.append((sender_id, message_text, message_id, ad_referral))
    
    # ── 先回 200 給 Meta，再背景處理（避免超時重發） ──
    for sender_id, message_text, message_id, ad_referral in tasks:
        threading.Thread(
            target=_handle_webhook_message,
            args=(sender_id, message_text, message_id, ad_referral),
            daemon=True,
        ).start()
    
    return 'OK', 200


def _verify_signature(payload: bytes, signature: str, app_secret: str) -> bool:
    """
    驗證 Meta Webhook 的 X-Hub-Signature-256。
    
    Args:
        payload: 請求 body（bytes）
        signature: X-Hub-Signature-256 header 值
        app_secret: Meta App Secret
    
    Returns:
        簽名是否有效
    """
    if not signature.startswith('sha256='):
        return False
    
    expected = hmac.new(
        app_secret.encode('utf-8'),
        payload,
        hashlib.sha256,
    ).hexdigest()
    
    return hmac.compare_digest(f'sha256={expected}', signature)


def _handle_webhook_message(sender_id: str, message_text: str, message_id: str, ad_referral: dict = None):
    """
    背景線程處理單一 webhook 訊息。
    
    Args:
        sender_id: Meta 平台的 sender ID
        message_text: 訊息內容
        message_id: Meta 訊息 ID
        ad_referral: 廣告轉介資訊（可選）
    """
    logger.info(f"📩 [webhook] sender={sender_id} message={message_text[:80]}")
    
    try:
        with current_app.app_context():
            # ── 1. 取得或建立客戶記錄 ──
            contact = ContactService.get_or_create_contact(
                channel='messenger',
                external_id=sender_id,
                ad_referral_info=ad_referral
            )
            
            # ── 2. 取得或建立對話 Session ──
            conversation = SessionService.get_or_create_conversation(
                contact=contact,
                channel='messenger',
                ad_referral=ad_referral
            )
            
            # ── 3. 建立訊息記錄 ──
            message = Message(
                conversation_id=conversation.id,
                contact_id=contact.id,
                sender_type='customer',
                message_type='text',
                content=message_text,
                meta_message_id=message_id,
                sent_at=datetime.utcnow()
            )
            
            db.session.add(message)
            
            # ── 4. 更新對話統計 ──
            conversation.message_count += 1
            conversation.last_message_at = datetime.utcnow()
            
            # ── 5. 更新客戶最後活躍時間 ──
            contact.last_active_at = datetime.utcnow()
            
            db.session.commit()
            
            logger.info(f"✅ [webhook] 訊息已儲存：conversation={conversation.id}, message={message.id}")
            
            # ── 6. 觸發 LLM 分析任務（Celery 背景處理） ──
            trigger_analysis_task.delay(str(conversation.id))
            
    except Exception as e:
        logger.error(f"❌ [webhook] 處理失敗 sender={sender_id}: {e}", exc_info=True)
        db.session.rollback()