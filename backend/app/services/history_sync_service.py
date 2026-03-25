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
from ..services.auto_tagger import AutoTagger
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
        """取得 Page ID（優先從環境變數讀取，避免 /me 權限問題）"""
        import os
        from flask import current_app

        # 優先從環境變數或 config 讀取
        page_id = os.environ.get('META_PAGE_ID') or current_app.config.get('META_APP_ID')
        if page_id:
            return page_id

        # Fallback: 從 /me 取得
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

        # 最終 fallback: 從 conversations API 的 participants 推斷
        logger.warning("無法從 /me 取得 Page ID，嘗試從 conversations 推斷")
        data = self._api_get(
            f"{meta_api.base_url}/me/conversations",
            params={'fields': 'participants', 'limit': '1', 'access_token': token}
        )
        if data and data.get('data'):
            participants = data['data'][0].get('participants', {}).get('data', [])
            # Page 通常是名稱含「商店」或 ID 較小的那個
            for p in participants:
                # 嘗試用此 ID 查 conversations，如果成功就是 page
                test = self._api_get(
                    f"{meta_api.base_url}/{p['id']}/conversations",
                    params={'limit': '1', 'access_token': token}
                )
                if test and 'data' in test:
                    logger.info(f"推斷 Page ID: {p['id']} ({p.get('name')})")
                    return p['id']

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

    def _extract_customer_info(
        self,
        conversation_data: Dict,
        page_id: str
    ) -> Optional[Dict[str, str]]:
        """
        從對話的 participants 中提取客戶 PSID 和名稱。

        Args:
            conversation_data: 對話資料
            page_id: Page ID（用來排除 page 自身）

        Returns:
            {'id': PSID, 'name': 名稱} 或 None
        """
        participants = conversation_data.get('participants', {}).get('data', [])
        for p in participants:
            if p.get('id') != page_id:
                return {'id': p.get('id'), 'name': p.get('name')}
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

        # 回填所有 display_name 為 None 的 contacts（從 participants 或 profile）
        try:
            backfilled = self._backfill_names_from_conversations(page_id, channels, limit)
            stats['names_backfilled'] = backfilled
        except Exception as e:
            logger.error(f"回填 display_name 失敗: {e}")
            stats['names_backfilled'] = 0

        stats['rate_limited'] = self._rate_limited
        stats['api_calls'] = self._api_call_count

        # 同步完成後自動跑資料健康修復
        try:
            from .data_health_service import DataHealthService

            count_fixed = DataHealthService.fix_message_counts()
            tag_result = DataHealthService.run_keyword_tagging()

            stats['health_check'] = {
                'message_counts_fixed': count_fixed,
                'keyword_tagging': tag_result,
            }
            logger.info(f"同步後健康修復完成: counts={count_fixed}, tags={tag_result}")
        except Exception as e:
            logger.error(f"同步後健康修復失敗: {e}", exc_info=True)
            stats['health_check'] = {'error': str(e)}

        logger.info(f"歷史對話同步完成：{stats}")
        return stats

    def _backfill_names_from_conversations(
        self, page_id: str, channels: List[str], limit: int
    ) -> int:
        """
        對所有 display_name 為 None 的 contacts，嘗試從已拉取的
        conversations participants 回填名稱。
        """
        from ..models import ChannelIdentifier

        contacts = Contact.query.filter(
            Contact.display_name.is_(None),
            Contact.is_merged == False,
        ).all()

        if not contacts:
            return 0

        # 建立 external_id → contact 的映射
        ext_id_map = {}
        for c in contacts:
            for ci in c.channel_identifiers:
                ext_id_map[ci.external_id] = c

        if not ext_id_map:
            return 0

        # 從已同步的 conversations 中尋找 participant names
        updated = 0
        for ch in channels:
            conversations = self._fetch_conversations(page_id, ch, limit)
            for conv_data in conversations:
                customer_info = self._extract_customer_info(conv_data, page_id)
                if not customer_info:
                    continue
                cid = customer_info.get('id')
                cname = customer_info.get('name')
                if cid in ext_id_map and cname:
                    contact = ext_id_map[cid]
                    if not contact.display_name:
                        contact.display_name = cname
                        updated += 1
                        logger.info(f"回填 display_name (sync 結束): {cid} → {cname}")

        if updated:
            db.session.commit()
            logger.info(f"sync 結束回填 display_name: {updated} 個 contacts")

        return updated

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
        customer_info = self._extract_customer_info(conv_data, page_id)

        if not customer_info or not customer_info.get('id'):
            logger.warning(f"對話 {meta_conv_id} 找不到客戶 PSID，跳過")
            result['skipped'] += 1
            return result

        customer_psid = customer_info['id']
        customer_name = customer_info.get('name')

        # 取得或建立 Contact
        existing = db.session.query(Contact).join(
            Contact.channel_identifiers
        ).filter_by(
            channel=channel,
            external_id=customer_psid
        ).first()

        is_new_contact = existing is None

        # 嘗試拉取 profile，合併 participants 的客戶名稱
        profile_data = meta_api.get_user_profile(customer_psid) or {}
        if customer_name and not profile_data.get('name'):
            profile_data['name'] = customer_name
        contact = ContactService.get_or_create_contact(
            channel=channel,
            external_id=customer_psid,
            profile_data=profile_data if profile_data else None,
        )

        if is_new_contact:
            result['contacts'] += 1

        # 回填 display_name：如果 contact 沒有名稱，從 participants 取得
        if not contact.display_name and customer_name:
            contact.display_name = customer_name
            logger.info(f"回填 display_name: {customer_psid} → {customer_name}")

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

        # 同步完成後跑 keyword-based auto-tagging
        try:
            all_msgs = Message.query.filter_by(
                conversation_id=conversation.id
            ).all()
            conversation_text = ' '.join(
                m.content for m in all_msgs if m.content
            )
            if conversation_text.strip():
                keyword_tags = AutoTagger._match_keywords(conversation_text)
                if keyword_tags:
                    added = AutoTagger._apply_tags(contact.id, keyword_tags)
                    if added:
                        logger.info(f"自動打標（sync）: contact={contact.id}, tags={added}")
        except Exception as e:
            logger.error(f"同步後自動打標失敗: {e}")

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

    @staticmethod
    def backfill_display_names() -> int:
        """
        回填 display_name=None 的 contacts。
        嘗試從 Meta profile API 拉取名稱。

        Returns:
            更新的 contact 數量
        """
        contacts = Contact.query.filter(
            Contact.display_name.is_(None),
            Contact.is_merged == False,
        ).all()

        updated = 0
        for contact in contacts:
            # 嘗試從 channel_identifiers 拿 external_id 去拉 profile
            for ci in contact.channel_identifiers:
                if ci.channel in ('messenger', 'instagram'):
                    try:
                        profile = meta_api.get_user_profile(ci.external_id)
                        if profile and profile.get('name'):
                            contact.display_name = profile['name']
                            updated += 1
                            logger.info(f"回填 display_name: {ci.external_id} → {profile['name']}")
                            break
                    except Exception as e:
                        logger.debug(f"拉取 profile 失敗 ({ci.external_id}): {e}")

        if updated:
            db.session.commit()
            logger.info(f"回填 display_name 完成，更新 {updated} 個 contacts")

        return updated
