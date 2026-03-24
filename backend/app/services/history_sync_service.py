"""
MUSE CRM — History Sync Service

Meta 歷史對話同步服務，從 Graph API 拉取歷史訊息並匯入 DB。
"""

import logging
import time
from datetime import datetime
from typing import Dict, Any, Optional, List

import requests
from sqlalchemy.exc import IntegrityError

from .. import db
from ..models import Contact, Message, Conversation
from ..services.contact_service import ContactService
from ..services.session_service import SessionService
from ..utils.meta_api import meta_api

logger = logging.getLogger(__name__)

# Rate limit 保護：每次 API call 之間的間隔（秒）
API_CALL_DELAY = 0.5


class HistorySyncService:
    """Meta 歷史對話同步服務"""

    def __init__(self):
        self._api_call_count = 0
        self._rate_limited = False

    def _api_get(self, url: str, params: Optional[Dict] = None) -> Optional[Dict]:
        """
        封裝 Meta Graph API GET 請求，含 rate limit 保護。

        Args:
            url: 完整 URL 或 endpoint path
            params: 查詢參數

        Returns:
            JSON 回應或 None（遇到錯誤或 rate limit）
        """
        if self._rate_limited:
            return None

        time.sleep(API_CALL_DELAY)
        self._api_call_count += 1

        try:
            response = requests.get(url, params=params, timeout=15)

            if response.status_code == 429:
                logger.warning(f"Meta API rate limit 已達上限（已呼叫 {self._api_call_count} 次）")
                self._rate_limited = True
                return None

            response.raise_for_status()
            return response.json()

        except requests.exceptions.RequestException as e:
            logger.error(f"Meta API 呼叫失敗: {e}")
            return None

    def _get_page_id(self) -> Optional[str]:
        """取得 Page ID"""
        token = meta_api.access_token
        if not token:
            logger.error("缺少 META_PAGE_TOKEN，無法同步")
            return None

        data = self._api_get(
            f"{meta_api.base_url}/me",
            params={'fields': 'id', 'access_token': token}
        )
        if data:
            return data.get('id')
        return None

    def _fetch_conversations(
        self,
        page_id: str,
        channel: str,
        limit: int
    ) -> List[Dict]:
        """
        取得對話列表（含分頁）。

        Args:
            page_id: Page ID
            channel: messenger 或 instagram
            limit: 最大對話數

        Returns:
            對話列表
        """
        token = meta_api.access_token
        params = {
            'fields': 'participants,updated_time',
            'limit': min(limit, 50),
            'access_token': token,
        }
        if channel == 'instagram':
            params['platform'] = 'instagram'

        url = f"{meta_api.base_url}/{page_id}/conversations"
        conversations = []

        while url and len(conversations) < limit:
            data = self._api_get(url, params=params)
            if not data:
                break

            batch = data.get('data', [])
            conversations.extend(batch)

            # 分頁
            paging = data.get('paging', {})
            url = paging.get('next')
            params = None  # next URL 已含所有參數

        return conversations[:limit]

    def _fetch_messages(self, conversation_id: str) -> List[Dict]:
        """
        取得單一對話的所有訊息（含分頁）。

        Args:
            conversation_id: Meta 對話 ID

        Returns:
            訊息列表
        """
        token = meta_api.access_token
        url = f"{meta_api.base_url}/{conversation_id}/messages"
        params = {
            'fields': 'message,from,created_time,attachments',
            'limit': 100,
            'access_token': token,
        }
        messages = []

        while url:
            data = self._api_get(url, params=params)
            if not data:
                break

            batch = data.get('data', [])
            messages.extend(batch)

            paging = data.get('paging', {})
            url = paging.get('next')
            params = None

        return messages

    def _extract_customer_psid(
        self,
        conversation_data: Dict,
        page_id: str
    ) -> Optional[str]:
        """
        從對話的 participants 中提取客戶 PSID。

        Args:
            conversation_data: 對話資料
            page_id: Page ID（用來排除 page 自身）

        Returns:
            客戶 PSID 或 None
        """
        participants = conversation_data.get('participants', {}).get('data', [])
        for p in participants:
            if p.get('id') != page_id:
                return p.get('id')
        return None

    def sync_all_conversations(self, channel: str = 'messenger', limit: int = 100) -> Dict[str, Any]:
        """
        從 Meta Graph API 拉取所有歷史對話並匯入 DB。

        流程：
        1. GET /{page-id}/conversations — 取得對話列表（分頁）
        2. 每個對話 GET /{conversation-id}/messages?fields=message,from,created_time,attachments
        3. 對每筆訊息：
           a. 從 from.id 取得 sender（判斷是客戶還是 page）
           b. get_or_create_contact（用 sender PSID）
           c. get_or_create_conversation
           d. 建立 Message（檢查 meta_message_id 冪等性）
        4. 回傳統計：{conversations_synced, messages_synced, contacts_created, skipped}

        Args:
            channel: 渠道 ('messenger', 'instagram', 'all')
            limit: 最大對話數

        Returns:
            同步統計字典
        """
        stats = {
            'conversations_synced': 0,
            'messages_synced': 0,
            'contacts_created': 0,
            'skipped': 0,
            'errors': 0,
            'rate_limited': False,
            'api_calls': 0,
        }

        channels = ['messenger', 'instagram'] if channel == 'all' else [channel]

        # 取得 Page ID
        page_id = self._get_page_id()
        if not page_id:
            stats['errors'] = 1
            return stats

        logger.info(f"開始同步歷史對話：page_id={page_id}, channels={channels}, limit={limit}")

        for ch in channels:
            if self._rate_limited:
                break

            conversations = self._fetch_conversations(page_id, ch, limit)
            logger.info(f"[{ch}] 取得 {len(conversations)} 個對話")

            for conv_data in conversations:
                if self._rate_limited:
                    break

                try:
                    result = self._sync_single_conversation(conv_data, page_id, ch)
                    stats['conversations_synced'] += result['conversations']
                    stats['messages_synced'] += result['messages']
                    stats['contacts_created'] += result['contacts']
                    stats['skipped'] += result['skipped']
                except Exception as e:
                    logger.error(f"同步對話失敗 {conv_data.get('id')}: {e}", exc_info=True)
                    db.session.rollback()
                    stats['errors'] += 1

        stats['rate_limited'] = self._rate_limited
        stats['api_calls'] = self._api_call_count

        logger.info(f"歷史對話同步完成：{stats}")
        return stats

    def _sync_single_conversation(
        self,
        conv_data: Dict,
        page_id: str,
        channel: str
    ) -> Dict[str, int]:
        """
        同步單一對話。

        Args:
            conv_data: Meta 對話資料
            page_id: Page ID
            channel: 渠道

        Returns:
            單次同步統計
        """
        result = {'conversations': 0, 'messages': 0, 'contacts': 0, 'skipped': 0}

        meta_conv_id = conv_data.get('id')
        customer_psid = self._extract_customer_psid(conv_data, page_id)

        if not customer_psid:
            logger.warning(f"對話 {meta_conv_id} 找不到客戶 PSID，跳過")
            result['skipped'] += 1
            return result

        # 取得或建立 Contact
        existing = db.session.query(Contact).join(
            Contact.channel_identifiers
        ).filter_by(
            channel=channel,
            external_id=customer_psid
        ).first()

        is_new_contact = existing is None

        # 嘗試拉取 profile
        profile_data = meta_api.get_user_profile(customer_psid)
        contact = ContactService.get_or_create_contact(
            channel=channel,
            external_id=customer_psid,
            profile_data=profile_data,
        )

        if is_new_contact:
            result['contacts'] += 1

        # 取得或建立 Conversation
        conversation = SessionService.get_or_create_conversation(
            contact=contact,
            channel=channel,
        )
        result['conversations'] = 1

        # 拉取此對話的所有訊息
        messages = self._fetch_messages(meta_conv_id)
        logger.info(f"對話 {meta_conv_id} 取得 {len(messages)} 筆訊息")

        # 按時間排序（舊→新）
        messages.sort(key=lambda m: m.get('created_time', ''))

        for msg_data in messages:
            synced = self._sync_single_message(msg_data, conversation, contact, page_id)
            if synced:
                result['messages'] += 1
            else:
                result['skipped'] += 1

        # 更新對話統計
        if result['messages'] > 0:
            conversation.message_count = (conversation.message_count or 0) + result['messages']
            conversation.last_message_at = datetime.utcnow()

        db.session.commit()
        return result

    def _sync_single_message(
        self,
        msg_data: Dict,
        conversation: 'Conversation',
        contact: 'Contact',
        page_id: str
    ) -> bool:
        """
        同步單筆訊息。

        Args:
            msg_data: Meta 訊息資料
            conversation: 對話記錄
            contact: 客戶記錄
            page_id: Page ID

        Returns:
            是否成功同步（False = 跳過重複）
        """
        meta_message_id = msg_data.get('id')

        # 冪等性：檢查 meta_message_id
        if meta_message_id:
            existing = Message.query.filter_by(meta_message_id=meta_message_id).first()
            if existing:
                return False

        # 判斷 sender
        from_data = msg_data.get('from', {})
        sender_id = from_data.get('id')
        sender_type = 'business' if sender_id == page_id else 'customer'

        # 訊息內容
        content = msg_data.get('message', '')

        # 附件處理
        media_url = None
        message_type = 'text'
        message_metadata = None

        attachments = msg_data.get('attachments', {}).get('data', [])
        if attachments:
            first_attachment = attachments[0]
            att_type = first_attachment.get('mime_type', '')
            if att_type.startswith('image'):
                message_type = 'image'
            elif att_type.startswith('video') or att_type.startswith('audio'):
                message_type = 'attachment'
            else:
                message_type = 'attachment'

            media_url = first_attachment.get('image_data', {}).get('url') or first_attachment.get('file_url')
            message_metadata = {'attachments': attachments}

        if not content and not media_url:
            message_type = 'text'

        # 解析 created_time
        sent_at = datetime.utcnow()
        created_time = msg_data.get('created_time')
        if created_time:
            try:
                sent_at = datetime.fromisoformat(created_time.replace('Z', '+00:00'))
            except (ValueError, AttributeError):
                pass

        message = Message(
            conversation_id=conversation.id,
            contact_id=contact.id,
            sender_type=sender_type,
            message_type=message_type,
            content=content if content else None,
            media_url=media_url,
            message_metadata=message_metadata,
            meta_message_id=meta_message_id,
            sent_at=sent_at,
        )

        try:
            db.session.add(message)
            db.session.flush()
            return True
        except IntegrityError:
            db.session.rollback()
            logger.debug(f"重複訊息，跳過：meta_message_id={meta_message_id}")
            return False
