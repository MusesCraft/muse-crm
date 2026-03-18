"""
MUSE CRM — Meta Webhook API

Meta Business Webhook 接收模組，支援 Messenger 和 Instagram DM。
實作完整的訊息存儲、客戶建檔和冪等性處理。
"""

import hashlib
import hmac
import logging
import threading
from datetime import datetime
from typing import Dict, Any, Optional, List, Tuple
from flask import request, current_app, jsonify
from sqlalchemy.exc import IntegrityError

from . import api_bp
from ..models import Contact, ChannelIdentifier, Conversation, Message
from .. import db
from ..services.contact_service import ContactService
from ..services.session_service import SessionService
from ..utils.meta_api import meta_api
from ..tasks.session_tasks import trigger_analysis_task

logger = logging.getLogger(__name__)


@api_bp.route('/webhook', methods=['GET'])
def webhook_verify():
    """
    Meta Webhook 驗證端點（Messenger + Instagram）。
    
    Meta 會發送 GET 請求驗證 webhook URL，
    需要比對 hub.verify_token 並回傳 hub.challenge。
    
    Returns:
        challenge string 或 403 Forbidden
    """
    mode = request.args.get('hub.mode')
    token = request.args.get('hub.verify_token')
    challenge = request.args.get('hub.challenge')
    
    verify_token = current_app.config.get('META_VERIFY_TOKEN')
    
    if mode == 'subscribe' and token == verify_token:
        logger.info("✅ Meta Webhook 驗證成功")
        return challenge, 200
    else:
        logger.warning(f"❌ Meta Webhook 驗證失敗：mode={mode}, token={token}")
        return 'Forbidden', 403


@api_bp.route('/webhook', methods=['POST'])
def webhook_receive():
    """
    Meta Webhook 接收端點（Messenger + Instagram DM）。
    
    流程：
    1. 驗證 X-Hub-Signature-256（如果有 APP_SECRET）
    2. 解析 messaging events（支援 Messenger + Instagram）
    3. 提取訊息資料和附件
    4. 背景處理存儲和分析
    5. 回傳 200 OK（Meta 要求 5 秒內回應）
    
    Returns:
        200 OK 或錯誤狀態碼
    """
    # ── 驗證簽名 ──
    app_secret = current_app.config.get('META_APP_SECRET')
    if app_secret:
        signature = request.headers.get('X-Hub-Signature-256', '')
        if not _verify_signature(request.data, signature, app_secret):
            logger.warning("❌ Webhook 簽名驗證失敗")
            return jsonify({'error': 'Invalid signature'}), 403
    
    # ── 解析 payload ──
    data = request.get_json(silent=True)
    if not data:
        logger.debug("收到空的 webhook payload")
        return 'OK', 200
    
    # 支援多種 object 類型
    object_type = data.get('object')
    if object_type not in ('page', 'instagram'):
        logger.debug(f"不支援的 object 類型：{object_type}")
        return 'OK', 200
    
    # ── 收集待處理的訊息事件 ──
    message_events = _extract_message_events(data)
    
    # ── 先回 200 給 Meta，再背景處理（避免超時重發） ──
    for event in message_events:
        threading.Thread(
            target=_handle_webhook_message_with_context,
            args=(current_app._get_current_object(),) + event,
            daemon=True,
        ).start()
    
    logger.info(f"✅ Webhook 收到 {len(message_events)} 個訊息事件")
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


def _extract_message_events(data: Dict[str, Any]) -> List[Tuple[str, str, str, str, Dict[str, Any], Optional[Dict[str, Any]]]]:
    """
    從 Meta Webhook payload 中提取訊息事件。
    支援 Messenger 和 Instagram DM。
    
    Args:
        data: Webhook payload
        
    Returns:
        List of (channel, sender_id, message_text, message_type, attachments, ad_referral)
    """
    events = []
    object_type = data.get('object')
    
    for entry in data.get('entry', []):
        # Messenger events
        if 'messaging' in entry:
            channel = 'messenger'
            for event in entry['messaging']:
                extracted = _extract_messenger_event(event, channel)
                if extracted:
                    events.append(extracted)
        
        # Instagram events
        elif 'changes' in entry:
            channel = 'instagram'
            for change in entry['changes']:
                if change.get('field') == 'messages':
                    extracted = _extract_instagram_event(change, channel)
                    if extracted:
                        events.append(extracted)
    
    return events


def _extract_messenger_event(event: Dict[str, Any], channel: str) -> Optional[Tuple[str, str, str, str, Dict[str, Any], Optional[Dict[str, Any]]]]:
    """
    提取 Messenger 訊息事件。
    
    Returns:
        (channel, sender_id, message_text, message_type, attachments, ad_referral) 或 None
    """
    sender_id = event.get('sender', {}).get('id')
    if not sender_id or 'message' not in event:
        return None
    
    message_obj = event['message']
    message_id = message_obj.get('mid')
    message_text = message_obj.get('text', '')
    
    # 判斷訊息類型和提取附件
    message_type = 'text'
    attachments = {}
    
    if 'attachments' in message_obj:
        attachment = message_obj['attachments'][0]  # 取第一個附件
        attachment_type = attachment.get('type')
        
        if attachment_type == 'image':
            message_type = 'image'
            attachments['media_url'] = attachment.get('payload', {}).get('url')
        elif attachment_type in ('audio', 'video', 'file'):
            message_type = 'attachment'
            attachments['media_url'] = attachment.get('payload', {}).get('url')
            attachments['attachment_type'] = attachment_type
        elif attachment_type == 'template':
            message_type = 'sticker'
            
        attachments['metadata'] = attachment
    
    # 解析 Ad Referral
    ad_referral = None
    if 'referral' in message_obj:
        referral = message_obj['referral']
        ad_referral = {
            'ref': referral.get('ref'),
            'ad_id': referral.get('ad_id'),
            'campaign_name': referral.get('campaign_name'),
            'creative_id': referral.get('creative_id'),
            'source': referral.get('source', 'ADS'),
            'type': referral.get('type', 'OPEN_THREAD')
        }
    
    # 將 meta_message_id 加到 attachments 中
    attachments['meta_message_id'] = message_id
    
    return (channel, sender_id, message_text, message_type, attachments, ad_referral)


def _extract_instagram_event(change: Dict[str, Any], channel: str) -> Optional[Tuple[str, str, str, str, Dict[str, Any], Optional[Dict[str, Any]]]]:
    """
    提取 Instagram DM 訊息事件。
    
    Returns:
        (channel, sender_id, message_text, message_type, attachments, ad_referral) 或 None
    """
    value = change.get('value', {})
    
    # Instagram webhook 結構不同於 Messenger
    sender_id = value.get('from', {}).get('id')
    if not sender_id:
        return None
    
    message_obj = value.get('message', {})
    message_id = message_obj.get('mid') or value.get('id')
    message_text = message_obj.get('text', '')
    
    # Instagram DM 附件處理
    message_type = 'text'
    attachments = {}
    
    if 'attachments' in message_obj:
        attachment = message_obj['attachments'][0]
        attachment_type = attachment.get('type')
        
        if attachment_type == 'image':
            message_type = 'image'
            attachments['media_url'] = attachment.get('payload', {}).get('url')
        elif attachment_type in ('audio', 'video', 'file'):
            message_type = 'attachment'
            attachments['media_url'] = attachment.get('payload', {}).get('url')
            attachments['attachment_type'] = attachment_type
        
        attachments['metadata'] = attachment
    
    # Instagram 一般不會有 Ad Referral，但保留欄位
    ad_referral = None
    
    # 將 meta_message_id 加到 attachments 中
    attachments['meta_message_id'] = message_id
    
    return (channel, sender_id, message_text, message_type, attachments, ad_referral)


def _handle_webhook_message_with_context(app, *args):
    """帶有 Flask 應用上下文的 webhook 處理包裝器"""
    with app.app_context():
        _handle_webhook_message(*args)


def _handle_webhook_message(
    channel: str, 
    sender_id: str, 
    message_text: str, 
    message_type: str,
    attachments: Dict[str, Any], 
    ad_referral: Optional[Dict[str, Any]] = None
):
    """
    背景線程處理單一 webhook 訊息。
    
    Args:
        channel: 渠道 (messenger/instagram)
        sender_id: Meta 平台的 sender ID
        message_text: 訊息內容
        message_type: 訊息類型 (text/image/attachment/sticker/referral)
        attachments: 附件資訊和 metadata
        ad_referral: 廣告轉介資訊（可選）
    """
    meta_message_id = attachments.get('meta_message_id')
    content_preview = message_text[:50] + '...' if len(message_text) > 50 else message_text
    
    logger.info(f"📩 [webhook] {channel} sender={sender_id} type={message_type} content='{content_preview}'")
    
    try:
        # ── 冪等性檢查：檢查是否已處理此訊息 ──
        if meta_message_id:
            existing_message = Message.query.filter_by(meta_message_id=meta_message_id).first()
            if existing_message:
                logger.info(f"⏭️ [webhook] 跳過重複訊息 mid={meta_message_id}")
                return
        
        # ── 1. 取得或建立客戶記錄（含 profile 拉取） ──
        contact = _get_or_create_contact_with_profile(
            channel=channel,
            external_id=sender_id,
            ad_referral=ad_referral
        )
        
        # ── 2. 取得或建立對話 Session ──
        conversation = SessionService.get_or_create_conversation(
            contact=contact,
            channel=channel,
            ad_referral=ad_referral
        )
        
        # ── 3. 建立訊息記錄（含附件處理） ──
        message = Message(
            conversation_id=conversation.id,
            contact_id=contact.id,
            sender_type='customer',
            message_type=message_type,
            content=message_text if message_text.strip() else None,
            media_url=attachments.get('media_url'),
            message_metadata=attachments.get('metadata'),
            meta_message_id=meta_message_id,
            sent_at=datetime.utcnow()
        )
        
        try:
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
            
        except IntegrityError as e:
            # 處理 meta_message_id 重複的情況
            db.session.rollback()
            if 'meta_message_id' in str(e):
                logger.info(f"⏭️ [webhook] 檢測到重複 meta_message_id，跳過存儲：{meta_message_id}")
            else:
                logger.error(f"❌ [webhook] 資料庫完整性錯誤：{e}")
                raise
        
    except Exception as e:
        logger.error(f"❌ [webhook] 處理失敗 {channel} sender={sender_id}: {e}", exc_info=True)
        if 'db.session' in locals():
            db.session.rollback()


def _get_or_create_contact_with_profile(
    channel: str, 
    external_id: str, 
    ad_referral: Optional[Dict[str, Any]] = None
) -> Contact:
    """
    取得或建立客戶記錄，並嘗試從 Meta Graph API 拉取 profile。
    
    Args:
        channel: 渠道名稱
        external_id: 外部平台 ID
        ad_referral: 廣告轉介資訊
        
    Returns:
        客戶記錄
    """
    # 先檢查是否已存在
    channel_id = ChannelIdentifier.query.filter_by(
        channel=channel,
        external_id=external_id
    ).first()
    
    if channel_id:
        contact = channel_id.contact
        # 如果 profile_data 為空或較舊，嘗試重新拉取
        if not channel_id.profile_data:
            profile_data = _fetch_user_profile(channel, external_id)
            if profile_data:
                channel_id.profile_data = profile_data
                # 同時更新 contact 的基本資料
                _update_contact_from_profile(contact, profile_data)
                db.session.flush()
        
        return contact
    
    # 新建客戶，先拉取 profile
    profile_data = _fetch_user_profile(channel, external_id)
    
    # 使用 ContactService 建立客戶
    contact = ContactService.get_or_create_contact(
        channel=channel,
        external_id=external_id,
        profile_data=profile_data,
        ad_referral_info=ad_referral
    )
    
    return contact


def _fetch_user_profile(channel: str, external_id: str) -> Optional[Dict[str, Any]]:
    """
    從 Meta Graph API 拉取使用者 profile。
    
    Args:
        channel: 渠道 (messenger/instagram)
        external_id: 使用者 ID
        
    Returns:
        使用者 profile 或 None
    """
    try:
        if channel == 'messenger':
            # Messenger: 支援 first_name, last_name, profile_pic, locale
            profile = meta_api.get_user_profile(external_id)
            if profile:
                # 標準化格式
                return {
                    'first_name': profile.get('first_name'),
                    'last_name': profile.get('last_name'),
                    'name': profile.get('name'),
                    'profile_pic': profile.get('profile_pic'),
                    'locale': profile.get('locale')
                }
        
        elif channel == 'instagram':
            # Instagram: 通常只支援 name, profile_pic
            # 注意：Instagram API 可能需要不同的權限和端點
            profile = meta_api.get_user_profile(external_id)
            if profile:
                return {
                    'name': profile.get('name'),
                    'profile_pic': profile.get('profile_pic')
                }
    
    except Exception as e:
        logger.warning(f"拉取 {channel} 用戶 profile 失敗 {external_id}: {e}")
    
    return None


def _update_contact_from_profile(contact: Contact, profile_data: Dict[str, Any]) -> None:
    """
    從 profile 資料更新 contact 的基本資訊。
    
    Args:
        contact: 客戶記錄
        profile_data: Profile 資料
    """
    if not profile_data:
        return
    
    # 更新 display_name（如果尚未設定）
    if not contact.display_name:
        name = (
            profile_data.get('name') or
            f"{profile_data.get('first_name', '')} {profile_data.get('last_name', '')}".strip()
        )
        if name:
            contact.display_name = name
    
    # 更新 avatar_url（如果尚未設定）
    if not contact.avatar_url and profile_data.get('profile_pic'):
        contact.avatar_url = profile_data['profile_pic']
    
    # 更新 locale（如果尚未設定）
    if not contact.locale and profile_data.get('locale'):
        contact.locale = profile_data['locale']


@api_bp.route('/health', methods=['GET'])
def health_check():
    """
    系統健康檢查端點
    
    檢查項目：
    - 資料庫連線狀態
    - Redis 連線狀態
    - 最近訊息統計
    - Meta API 配置狀態
    
    Returns:
        系統狀態資訊
    """
    import redis
    from datetime import timedelta
    
    health_data = {
        'status': 'ok',
        'timestamp': datetime.utcnow().isoformat(),
        'service': 'muse-crm',
        'version': '1.0.0'
    }
    
    checks = {}
    overall_status = 'ok'
    
    # ── PostgreSQL 連線檢查 ──
    try:
        db.session.execute(db.text('SELECT 1')).scalar()
        checks['database'] = {
            'status': 'ok',
            'message': 'PostgreSQL 連線正常'
        }
    except Exception as e:
        checks['database'] = {
            'status': 'error',
            'message': f'PostgreSQL 連線失敗: {str(e)}'
        }
        overall_status = 'degraded'
    
    # ── Redis 連線檢查 ──
    try:
        redis_url = current_app.config.get('REDIS_URL', 'redis://localhost:6379/0')
        redis_client = redis.from_url(redis_url)
        redis_client.ping()
        checks['redis'] = {
            'status': 'ok',
            'message': 'Redis 連線正常'
        }
    except Exception as e:
        checks['redis'] = {
            'status': 'error',
            'message': f'Redis 連線失敗: {str(e)}'
        }
        overall_status = 'degraded'
    
    # ── 最近訊息統計 ──
    try:
        last_24h = datetime.utcnow() - timedelta(hours=24)
        recent_messages = Message.query.filter(Message.created_at >= last_24h).count()
        recent_contacts = Contact.query.filter(Contact.last_active_at >= last_24h).count()
        active_conversations = Conversation.query.filter(Conversation.status == 'active').count()
        
        checks['activity'] = {
            'status': 'ok',
            'recent_messages_24h': recent_messages,
            'active_contacts_24h': recent_contacts,
            'active_conversations': active_conversations
        }
    except Exception as e:
        checks['activity'] = {
            'status': 'error',
            'message': f'活動統計查詢失敗: {str(e)}'
        }
        overall_status = 'degraded'
    
    # ── Meta API 配置檢查 ──
    meta_config_status = 'ok'
    meta_config_issues = []
    
    if not current_app.config.get('META_VERIFY_TOKEN'):
        meta_config_issues.append('META_VERIFY_TOKEN 未配置')
        meta_config_status = 'warning'
    
    if not current_app.config.get('META_APP_SECRET'):
        meta_config_issues.append('META_APP_SECRET 未配置')
        meta_config_status = 'warning'
    
    if not current_app.config.get('META_PAGE_TOKEN'):
        meta_config_issues.append('META_PAGE_TOKEN 未配置（無法拉取 profile）')
        meta_config_status = 'warning'
    
    checks['meta_config'] = {
        'status': meta_config_status,
        'issues': meta_config_issues if meta_config_issues else None,
        'message': 'Meta API 配置正常' if not meta_config_issues else f'{len(meta_config_issues)} 個配置問題'
    }
    
    if meta_config_status == 'warning' and overall_status == 'ok':
        overall_status = 'warning'
    
    health_data['status'] = overall_status
    health_data['checks'] = checks
    
    # 根據狀態回傳適當的 HTTP 狀態碼
    status_code = 200
    if overall_status == 'warning':
        status_code = 200  # 警告但仍可用
    elif overall_status == 'degraded':
        status_code = 503  # 服務降級
    elif overall_status == 'error':
        status_code = 503  # 服務不可用
    
    return jsonify(health_data), status_code