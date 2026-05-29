"""
MUSE CRM — Webhook API

多渠道 Webhook 接收模組，支援 Meta（Messenger + Instagram）和 LINE。
實作完整的訊息存儲、客戶建檔和冪等性處理。
"""

import concurrent.futures
import hmac
import logging
import threading
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from flask import request, current_app, jsonify
from sqlalchemy.exc import IntegrityError

from . import api_bp
from ..models import Contact, ChannelIdentifier, Conversation, Message
from .. import db
from ..services.contact_service import ContactService
from ..services.session_service import SessionService
from ..tasks.session_tasks import analyze_message
from ..tasks.analysis_tasks import quick_triage_message
from ..services.merge_service import MergeService
from ..services.notification_service import NotificationService
from ..realtime.emitter import emit_new_message
from ..channels import ChannelEvent
from ..channels.registry import channel_registry
from ..utils.media_storage import download_and_store

logger = logging.getLogger(__name__)

_webhook_executor = concurrent.futures.ThreadPoolExecutor(max_workers=20, thread_name_prefix='webhook')


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
    
    if mode == 'subscribe' and verify_token and hmac.compare_digest(token or '', verify_token):
        logger.info("✅ Meta Webhook 驗證成功")
        return challenge, 200
    else:
        logger.warning(f"❌ Meta Webhook 驗證失敗：mode={mode}, token={token[:4]}***" if token else f"❌ Meta Webhook 驗證失敗：mode={mode}, token=None")
        return 'Forbidden', 403


@api_bp.route('/webhook', methods=['POST'])
def webhook_receive():
    """
    Meta Webhook 接收端點（Messenger + Instagram DM）。

    流程：
    1. 驗證 X-Hub-Signature-256（透過 MetaAdapter）
    2. 解析 messaging events（透過 MetaAdapter.parse_events）
    3. 背景處理存儲和分析
    4. 回傳 200 OK（Meta 要求 5 秒內回應）

    Returns:
        200 OK 或錯誤狀態碼
    """
    meta_adapter = channel_registry.get_adapter('meta')

    # ── 驗證簽名 ──
    app_secret = current_app.config.get('META_APP_SECRET')
    if app_secret:
        signature = request.headers.get('X-Hub-Signature-256', '')
        if not meta_adapter.verify_signature(request.data, signature):
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

    # ── 透過 MetaAdapter 解析事件 ──
    channel_events = meta_adapter.parse_events(data)

    # ── 先回 200 給 Meta，再背景處理（避免超時重發） ──
    for event in channel_events:
        if current_app.config.get('TESTING'):
            _handle_channel_event(event)
        else:
            _webhook_executor.submit(
                _handle_channel_event_with_context,
                current_app._get_current_object(), event,
            )

    logger.info(f"✅ Meta Webhook 收到 {len(channel_events)} 個訊息事件")
    return 'OK', 200


def _handle_channel_event_with_context(app, event: 'ChannelEvent'):
    """帶有 Flask 應用上下文的 ChannelEvent 處理包裝器"""
    with app.app_context():
        try:
            _handle_channel_event(event)
        except Exception:
            db.session.rollback()
        finally:
            db.session.remove()


def _handle_channel_event(event: 'ChannelEvent'):
    """
    統一處理所有渠道的 ChannelEvent。

    此函數由 Meta webhook 和 LINE webhook 共用，
    接收標準化的 ChannelEvent 並執行完整的訊息處理流程。

    Args:
        event: 統一的渠道事件
    """
    channel = event.channel
    sender_id = event.sender_id
    message_text = event.message_text
    message_type = event.message_type
    attachments = event.attachments
    ad_referral = event.ad_referral

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

        # ── 1.5 如果有 ad_referral，更新 contact.source_type ──
        if ad_referral and contact.source_type != 'ad_referral':
            contact.source_type = 'ad_referral'
            logger.info(f"[webhook] 更新 contact.source_type=ad_referral: {contact.id}")

        # ── 1.6 跨渠道合併檢測 ──
        merged_contact = MergeService.check_and_merge_on_message(
            channel=channel,
            external_id=sender_id,
            contact=contact
        )
        if merged_contact:
            contact = merged_contact

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
            sent_at=datetime.now(timezone.utc)
        )

        try:
            db.session.add(message)

            # ── 4. 更新對話統計 ──
            conversation.message_count += 1
            conversation.last_message_at = datetime.now(timezone.utc)

            # ── 5. 更新客戶最後活躍時間 ──
            contact.last_active_at = datetime.now(timezone.utc)

            db.session.commit()

            logger.info(f"✅ [webhook] 訊息已儲存：conversation={conversation.id}, message={message.id}")

            # ── 5.1 下載外部媒體並替換為永久 URL ──
            if message.media_url and message.message_type in ('image', 'attachment'):
                try:
                    permanent_url = download_and_store(message.media_url)
                    if permanent_url:
                        message.media_url = permanent_url
                        db.session.commit()
                        logger.info(f"[webhook] 媒體已永久儲存：message={message.id}")
                except Exception as dl_err:
                    logger.warning(f"[webhook] 媒體下載失敗（保留原始 URL）：{dl_err}")

            # ── 5.5 發送新訊息通知 ──
            try:
                NotificationService.notify_new_message(
                    contact=contact,
                    message_content=message_text,
                    channel=channel,
                )
            except Exception as notify_err:
                logger.warning(f"[webhook] 新訊息通知發送失敗: {notify_err}")

            # ── 5.6 WebSocket 即時推送 new_message ──
            try:
                emit_new_message(message=message, conversation=conversation, contact=contact)
            except Exception as ws_err:
                logger.warning(f"[webhook] WebSocket 推送失敗: {ws_err}")

            # ── 5.7 名片 OCR 自動辨識（圖片訊息） ──
            if message_type == 'image' and attachments.get('media_url'):
                try:
                    threading.Thread(
                        target=_ocr_business_card_with_context,
                        args=(
                            current_app._get_current_object(),
                            attachments['media_url'],
                            str(contact.id),
                            str(conversation.id),
                        ),
                        daemon=True,
                    ).start()
                    logger.debug(f"[webhook] 已觸發名片 OCR：message={message.id}")
                except Exception as ocr_err:
                    logger.warning(f"[webhook] 觸發名片 OCR 失敗：{ocr_err}")

            # ── 6. 輕量即時分類（Phase 5A: per-message quick triage） ──
            if message.has_text_content and message.is_from_customer:
                try:
                    quick_triage_message.delay(str(message.id))
                    logger.debug(f"[webhook] 已觸發快速分類：message={message.id}")
                except Exception as triage_err:
                    logger.warning(f"[webhook] 觸發快速分類失敗：{triage_err}")

            # ── 7. 深度分析在 Session 關閉時觸發（PRD §3.4），非 per-message ──

        except IntegrityError as e:
            db.session.rollback()
            if 'meta_message_id' in str(e):
                logger.info(f"⏭️ [webhook] 檢測到重複 meta_message_id，跳過存儲：{meta_message_id}")
            else:
                logger.error(f"❌ [webhook] 資料庫完整性錯誤：{e}")
                raise

    except Exception as e:
        logger.error(f"❌ [webhook] 處理失敗 {channel} sender={sender_id}: {e}", exc_info=True)
        db.session.rollback()


def _get_or_create_contact_with_profile(
    channel: str,
    external_id: str,
    ad_referral: Optional[Dict[str, Any]] = None
) -> Contact:
    """
    取得或建立客戶記錄，並嘗試透過對應渠道 Adapter 拉取 profile。

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
        # 如果 profile_data 為空，嘗試重新拉取
        if not channel_id.profile_data:
            profile_data = _fetch_user_profile_via_adapter(channel, external_id)
            if profile_data:
                channel_id.profile_data = profile_data
                _update_contact_from_profile(contact, profile_data)
                db.session.flush()

        return contact

    # 新建客戶，先拉取 profile
    profile_data = _fetch_user_profile_via_adapter(channel, external_id)

    # 使用 ContactService 建立客戶
    contact = ContactService.get_or_create_contact(
        channel=channel,
        external_id=external_id,
        profile_data=profile_data,
        ad_referral_info=ad_referral
    )

    return contact


def _fetch_user_profile_via_adapter(channel: str, external_id: str) -> Optional[Dict[str, Any]]:
    """
    透過渠道 Adapter 拉取使用者 profile。

    根據 channel 名稱自動選用對應的 Adapter（Meta 或 LINE）。
    Meta adapter 的 channel_name 為 'meta'，同時服務 messenger 和 instagram。

    Args:
        channel: 渠道 (messenger/instagram/line)
        external_id: 使用者 ID

    Returns:
        使用者 profile 或 None
    """
    # Meta 渠道（messenger/instagram）使用同一個 adapter
    adapter_name = 'meta' if channel in ('messenger', 'instagram') else channel
    adapter = channel_registry.get_adapter(adapter_name)

    if not adapter:
        logger.warning(f"找不到渠道 Adapter：{adapter_name}")
        return None

    return adapter.get_user_profile(external_id)


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


def _ocr_business_card_with_context(app, media_url: str, contact_id: str, conversation_id: str):
    """背景執行名片 OCR 辨識（帶 Flask app context）"""
    with app.app_context():
        try:
            from ..services.ocr_service import BusinessCardOCR
            from .ocr import _update_contact_from_ocr, _add_ocr_system_message

            ocr = BusinessCardOCR()
            result = ocr.analyze_image(media_url)

            if result is None:
                return

            # 只有辨識出 name/phone/email 才更新
            if not (result.get('name') or result.get('phone') or result.get('email')):
                return

            contact = Contact.query.get(contact_id)
            if not contact:
                return

            updated = _update_contact_from_ocr(contact, result)
            if updated:
                _add_ocr_system_message(conversation_id, contact, result)
                db.session.commit()
                logger.info(f"📇 [webhook] 名片 OCR 自動更新 contact={contact_id}")

        except Exception as e:
            logger.error(f"❌ [webhook] 名片 OCR 背景處理失敗：{e}", exc_info=True)
            db.session.rollback()
        finally:
            db.session.remove()


# ── LINE Webhook ──

@api_bp.route('/webhook/line', methods=['POST'])
def webhook_line():
    """
    LINE Webhook 接收端點。

    流程：
    1. 驗證 X-Line-Signature（透過 LineAdapter）
    2. 解析 events（透過 LineAdapter.parse_events）
    3. 依事件類型處理：message→建客戶+Session+存訊息, follow→建客戶, unfollow→標記不活躍
    4. 回傳 200 OK（LINE 要求 1 秒內回應）

    Returns:
        200 OK 或錯誤狀態碼
    """
    line_adapter = channel_registry.get_adapter('line')

    # ── 驗證簽名 ──
    signature = request.headers.get('X-Line-Signature', '')
    if not line_adapter.verify_signature(request.data, signature):
        logger.warning("❌ LINE Webhook 簽名驗證失敗")
        return jsonify({'error': 'Invalid signature'}), 403

    # ── 解析 payload ──
    data = request.get_json(silent=True)
    if not data:
        logger.debug("收到空的 LINE webhook payload")
        return 'OK', 200

    # ── 透過 LineAdapter 解析事件 ──
    channel_events = line_adapter.parse_events(data)

    # ── 先回 200 給 LINE，再背景處理 ──
    for event in channel_events:
        app = current_app._get_current_object()
        if event.event_type == 'message':
            _webhook_executor.submit(
                _handle_channel_event_with_context, app, event,
            )
        elif event.event_type == 'follow':
            _webhook_executor.submit(
                _handle_line_follow_with_context, app, event,
            )
        elif event.event_type == 'unfollow':
            _webhook_executor.submit(
                _handle_line_unfollow_with_context, app, event,
            )

    logger.info(f"✅ LINE Webhook 收到 {len(channel_events)} 個事件")
    return 'OK', 200


def _handle_line_follow_with_context(app, event: 'ChannelEvent'):
    """帶有 Flask 應用上下文的 LINE follow 處理包裝器"""
    with app.app_context():
        try:
            _handle_line_follow(event)
        except Exception:
            db.session.rollback()
        finally:
            db.session.remove()


def _handle_line_follow(event: 'ChannelEvent'):
    """
    處理 LINE follow 事件（使用者加好友）。

    建立客戶記錄並拉取 profile。
    """
    sender_id = event.sender_id
    logger.info(f"➕ [webhook/line] follow sender={sender_id}")

    try:
        contact = _get_or_create_contact_with_profile(
            channel='line',
            external_id=sender_id,
        )
        contact.last_active_at = datetime.now(timezone.utc)
        db.session.commit()
        logger.info(f"✅ [webhook/line] follow 客戶已建立/更新：{contact.id}")
    except Exception as e:
        logger.error(f"❌ [webhook/line] follow 處理失敗 sender={sender_id}: {e}", exc_info=True)
        db.session.rollback()


def _handle_line_unfollow_with_context(app, event: 'ChannelEvent'):
    """帶有 Flask 應用上下文的 LINE unfollow 處理包裝器"""
    with app.app_context():
        try:
            _handle_line_unfollow(event)
        except Exception:
            db.session.rollback()
        finally:
            db.session.remove()


def _handle_line_unfollow(event: 'ChannelEvent'):
    """
    處理 LINE unfollow 事件（使用者封鎖）。

    標記客戶不活躍（關閉所有活躍對話）。
    """
    sender_id = event.sender_id
    logger.info(f"➖ [webhook/line] unfollow sender={sender_id}")

    try:
        channel_id = ChannelIdentifier.query.filter_by(
            channel='line',
            external_id=sender_id
        ).first()

        if not channel_id:
            logger.debug(f"[webhook/line] unfollow 找不到客戶：{sender_id}")
            return

        contact = channel_id.contact

        # 關閉所有活躍的 LINE 對話
        active_conversations = Conversation.query.filter_by(
            contact_id=contact.id,
            channel='line',
            status='active'
        ).all()

        for conv in active_conversations:
            SessionService.close_conversation(conv.id, reason='system')

        logger.info(f"✅ [webhook/line] unfollow 已處理：contact={contact.id}, 關閉 {len(active_conversations)} 個對話")

    except Exception as e:
        logger.error(f"❌ [webhook/line] unfollow 處理失敗 sender={sender_id}: {e}", exc_info=True)
        db.session.rollback()


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
        'timestamp': datetime.now(timezone.utc).isoformat(),
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
        last_24h = datetime.now(timezone.utc) - timedelta(hours=24)
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
