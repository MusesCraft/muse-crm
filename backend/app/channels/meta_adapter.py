"""
MUSE CRM — Meta (Messenger + Instagram) 渠道 Adapter

從 webhook.py 抽出的 Meta 平台邏輯，實作 ChannelAdapter 介面。
"""

import hashlib
import hmac
import logging
from typing import Dict, Any, List, Optional

from flask import current_app

from .base import ChannelAdapter, ChannelEvent
from ..utils.meta_api import meta_api

logger = logging.getLogger(__name__)


class MetaAdapter(ChannelAdapter):
    """Meta Business Platform Adapter（Messenger + Instagram）"""

    channel_name = 'meta'  # 內部會根據 payload 區分 messenger/instagram

    def verify_signature(self, payload: bytes, signature: str) -> bool:
        """驗證 X-Hub-Signature-256（HMAC-SHA256 hex）"""
        app_secret = current_app.config.get('META_APP_SECRET')
        if not app_secret:
            logger.warning("META_APP_SECRET 未配置，跳過簽名驗證")
            return False

        if not signature.startswith('sha256='):
            return False

        expected = hmac.new(
            app_secret.encode('utf-8'),
            payload,
            hashlib.sha256,
        ).hexdigest()

        return hmac.compare_digest(f'sha256={expected}', signature)

    def parse_events(self, data: dict) -> List[ChannelEvent]:
        """
        解析 Meta Webhook payload。

        支援 Messenger（entry[].messaging[]）和 Instagram（entry[].changes[]）。
        """
        events = []

        for entry in data.get('entry', []):
            # Messenger events
            if 'messaging' in entry:
                for event in entry['messaging']:
                    parsed = self._parse_messenger_event(event)
                    if parsed:
                        events.append(parsed)

            # Instagram events
            elif 'changes' in entry:
                for change in entry['changes']:
                    if change.get('field') == 'messages':
                        parsed = self._parse_instagram_event(change)
                        if parsed:
                            events.append(parsed)

        return events

    def get_user_profile(self, user_id: str) -> Optional[dict]:
        """透過 Meta Graph API 取得使用者 Profile"""
        try:
            profile = meta_api.get_user_profile(user_id)
            if profile:
                return {
                    'first_name': profile.get('first_name'),
                    'last_name': profile.get('last_name'),
                    'name': profile.get('name'),
                    'profile_pic': profile.get('profile_pic'),
                    'locale': profile.get('locale'),
                }
        except Exception as e:
            logger.warning(f"Meta 取得 profile 失敗 {user_id}: {e}")
        return None

    def send_message(self, user_id: str, message: str) -> bool:
        """透過 Meta Send API 發送訊息"""
        return meta_api.send_message(user_id, message)

    def send_reply(self, reply_token: str, message: str) -> bool:
        """Meta 無 reply token 概念，直接回傳 False"""
        logger.debug("Meta 不支援 reply token，請使用 send_message")
        return False

    # ── 內部解析方法 ──

    def _parse_messenger_event(self, event: Dict[str, Any]) -> Optional[ChannelEvent]:
        """解析 Messenger 訊息事件"""
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
            attachment = message_obj['attachments'][0]
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
        ad_referral = self._extract_ad_referral(event, message_obj)

        # meta_message_id 加到 attachments
        attachments['meta_message_id'] = message_id

        return ChannelEvent(
            channel='messenger',
            event_type='message',
            sender_id=sender_id,
            message_text=message_text,
            message_type=message_type,
            message_id=message_id,
            reply_token=None,
            attachments=attachments,
            ad_referral=ad_referral,
            raw_event=event,
        )

    def _parse_instagram_event(self, change: Dict[str, Any]) -> Optional[ChannelEvent]:
        """解析 Instagram DM 訊息事件"""
        value = change.get('value', {})

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

        # Instagram referral 處理
        ad_referral = None
        referral = value.get('referral')

        if referral:
            ad_referral = {
                'ref': referral.get('ref'),
                'ad_id': referral.get('ad_id'),
                'campaign_name': referral.get('campaign_name'),
                'creative_id': referral.get('creative_id'),
                'source': referral.get('source', 'ADS'),
                'type': referral.get('type', 'OPEN_THREAD'),
            }
        else:
            entry_point = value.get('entry_point')
            if entry_point in ('ice_breaker', 'ig_web_url', 'ig_ad'):
                ad_referral = {
                    'ref': value.get('ref'),
                    'ad_id': value.get('ad_id'),
                    'source': entry_point,
                    'type': entry_point,
                }

        attachments['meta_message_id'] = message_id

        return ChannelEvent(
            channel='instagram',
            event_type='message',
            sender_id=sender_id,
            message_text=message_text,
            message_type=message_type,
            message_id=message_id,
            reply_token=None,
            attachments=attachments,
            ad_referral=ad_referral,
            raw_event=change,
        )

    @staticmethod
    def _extract_ad_referral(event: dict, message_obj: dict) -> Optional[Dict[str, Any]]:
        """從 Messenger 事件中提取 Ad Referral"""
        referral = None

        # 優先：事件層級 referral
        if 'referral' in event:
            referral = event['referral']
        elif 'referral' in message_obj:
            referral = message_obj['referral']

        if referral:
            return {
                'ref': referral.get('ref'),
                'ad_id': referral.get('ad_id'),
                'campaign_name': referral.get('campaign_name'),
                'creative_id': referral.get('creative_id'),
                'source': referral.get('source', 'ADS'),
                'type': referral.get('type', 'OPEN_THREAD'),
            }
        return None
