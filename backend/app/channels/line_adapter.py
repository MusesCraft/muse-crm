"""
MUSE CRM — LINE Messaging API 渠道 Adapter

實作 ChannelAdapter 介面，處理 LINE Webhook 事件解析、
簽名驗證、Profile 取得和訊息發送。
"""

import base64
import hashlib
import hmac
import logging
from typing import Dict, Any, List, Optional

import requests
from flask import current_app

from .base import ChannelAdapter, ChannelEvent

logger = logging.getLogger(__name__)


class LineAdapter(ChannelAdapter):
    """LINE Messaging API Adapter"""

    channel_name = 'line'

    LINE_API_BASE = 'https://api.line.me/v2/bot'
    TIMEOUT = 10

    # ── ChannelAdapter 介面實作 ──

    def verify_signature(self, payload: bytes, signature: str) -> bool:
        """
        驗證 X-Line-Signature（HMAC-SHA256 + Base64）。

        Args:
            payload: 請求 body（bytes）
            signature: X-Line-Signature header 值

        Returns:
            簽名是否有效
        """
        channel_secret = current_app.config.get('LINE_CHANNEL_SECRET')
        if not channel_secret:
            logger.warning("LINE_CHANNEL_SECRET 未配置，跳過簽名驗證")
            return False

        hash_value = hmac.new(
            channel_secret.encode('utf-8'),
            payload,
            hashlib.sha256,
        ).digest()
        expected = base64.b64encode(hash_value).decode('utf-8')

        return hmac.compare_digest(expected, signature)

    def parse_events(self, data: dict) -> List[ChannelEvent]:
        """
        解析 LINE Webhook payload（envelope → events array）。

        支援事件類型：message, follow, unfollow, postback
        """
        events = []

        for event in data.get('events', []):
            event_type = event.get('type')
            parser = {
                'message': self._parse_message_event,
                'follow': self._parse_follow_event,
                'unfollow': self._parse_unfollow_event,
                'postback': self._parse_postback_event,
            }.get(event_type)

            if parser:
                parsed = parser(event)
                if parsed:
                    events.append(parsed)
            else:
                logger.debug(f"LINE 不處理的事件類型：{event_type}")

        return events

    def get_user_profile(self, user_id: str) -> Optional[dict]:
        """
        透過 LINE Profile API 取得使用者資料。

        Returns:
            標準化 profile dict: { name, profile_pic, locale }
        """
        access_token = current_app.config.get('LINE_CHANNEL_ACCESS_TOKEN')
        if not access_token:
            logger.warning("LINE_CHANNEL_ACCESS_TOKEN 未配置")
            return None

        try:
            url = f"{self.LINE_API_BASE}/profile/{user_id}"
            headers = {'Authorization': f'Bearer {access_token}'}

            response = requests.get(url, headers=headers, timeout=self.TIMEOUT)
            response.raise_for_status()

            data = response.json()
            logger.info(f"成功取得 LINE 用戶資料：{user_id}")

            return {
                'name': data.get('displayName'),
                'profile_pic': data.get('pictureUrl'),
                'locale': data.get('language'),
            }

        except requests.exceptions.RequestException as e:
            logger.warning(f"LINE 取得 profile 失敗 {user_id}: {e}")
            return None

    def send_message(self, user_id: str, message: str) -> bool:
        """透過 LINE Push API 發送訊息"""
        access_token = current_app.config.get('LINE_CHANNEL_ACCESS_TOKEN')
        if not access_token:
            logger.warning("LINE_CHANNEL_ACCESS_TOKEN 未配置")
            return False

        try:
            url = f"{self.LINE_API_BASE}/message/push"
            headers = {
                'Authorization': f'Bearer {access_token}',
                'Content-Type': 'application/json',
            }
            payload = {
                'to': user_id,
                'messages': [{'type': 'text', 'text': message}],
            }

            response = requests.post(
                url, headers=headers, json=payload, timeout=self.TIMEOUT
            )
            response.raise_for_status()

            logger.info(f"LINE Push 訊息發送成功：{user_id}")
            return True

        except requests.exceptions.RequestException as e:
            logger.error(f"LINE Push 訊息發送失敗 {user_id}: {e}")
            return False

    def send_image(self, recipient_id: str, image_url: str, preview_url: str = None) -> bool:
        """透過 LINE Push API 發送圖片訊息"""
        access_token = current_app.config.get('LINE_CHANNEL_ACCESS_TOKEN')
        if not access_token:
            logger.warning("LINE_CHANNEL_ACCESS_TOKEN 未配置，無法發送圖片")
            return False

        try:
            url = f"{self.LINE_API_BASE}/message/push"
            headers = {
                'Authorization': f'Bearer {access_token}',
                'Content-Type': 'application/json',
            }
            payload = {
                'to': recipient_id,
                'messages': [{
                    'type': 'image',
                    'originalContentUrl': image_url,
                    'previewImageUrl': preview_url or image_url,
                }],
            }

            response = requests.post(
                url, headers=headers, json=payload, timeout=self.TIMEOUT
            )
            response.raise_for_status()

            logger.info(f"LINE 圖片發送成功：{recipient_id}")
            return True

        except requests.exceptions.RequestException as e:
            logger.error(f"LINE 圖片發送失敗 {recipient_id}: {e}")
            return False

    def send_reply(self, reply_token: str, message: str) -> bool:
        """透過 LINE Reply API 回覆訊息（免費，但 token 30 秒內過期）"""
        access_token = current_app.config.get('LINE_CHANNEL_ACCESS_TOKEN')
        if not access_token:
            logger.warning("LINE_CHANNEL_ACCESS_TOKEN 未配置")
            return False

        try:
            url = f"{self.LINE_API_BASE}/message/reply"
            headers = {
                'Authorization': f'Bearer {access_token}',
                'Content-Type': 'application/json',
            }
            payload = {
                'replyToken': reply_token,
                'messages': [{'type': 'text', 'text': message}],
            }

            response = requests.post(
                url, headers=headers, json=payload, timeout=self.TIMEOUT
            )
            response.raise_for_status()

            logger.info("LINE Reply 訊息發送成功")
            return True

        except requests.exceptions.RequestException as e:
            logger.error(f"LINE Reply 訊息發送失敗: {e}")
            return False

    # ── 內部解析方法 ──

    def _parse_message_event(self, event: Dict[str, Any]) -> Optional[ChannelEvent]:
        """解析 LINE message 事件"""
        sender_id = event.get('source', {}).get('userId')
        if not sender_id:
            return None

        message_obj = event.get('message', {})
        line_msg_type = message_obj.get('type', 'text')

        # 對應 LINE 訊息類型到 CRM 統一類型
        message_type_map = {
            'text': 'text',
            'image': 'image',
            'video': 'video',
            'audio': 'audio',
            'file': 'file',
            'location': 'location',
            'sticker': 'sticker',
        }
        message_type = message_type_map.get(line_msg_type, 'text')

        # 取得文字內容
        message_text = ''
        if line_msg_type == 'text':
            message_text = message_obj.get('text', '')
        elif line_msg_type == 'location':
            # 位置訊息：組合地址作為文字
            title = message_obj.get('title', '')
            address = message_obj.get('address', '')
            message_text = f"{title} {address}".strip()

        # 建構附件資訊
        attachments = {}
        message_id = message_obj.get('id')

        if line_msg_type in ('image', 'video', 'audio', 'file'):
            # LINE 需要用 Content API 下載，先記錄 message ID
            attachments['line_content_id'] = message_id
            attachments['attachment_type'] = line_msg_type
        elif line_msg_type == 'sticker':
            attachments['sticker_package_id'] = message_obj.get('packageId')
            attachments['sticker_id'] = message_obj.get('stickerId')
        elif line_msg_type == 'location':
            attachments['latitude'] = message_obj.get('latitude')
            attachments['longitude'] = message_obj.get('longitude')

        # 使用 webhookEventId 作為冪等性 ID
        webhook_event_id = event.get('webhookEventId')
        attachments['meta_message_id'] = webhook_event_id or message_id

        return ChannelEvent(
            channel='line',
            event_type='message',
            sender_id=sender_id,
            message_text=message_text,
            message_type=message_type,
            message_id=webhook_event_id or message_id,
            reply_token=event.get('replyToken'),
            attachments=attachments,
            ad_referral=None,
            raw_event=event,
        )

    def _parse_follow_event(self, event: Dict[str, Any]) -> Optional[ChannelEvent]:
        """解析 LINE follow 事件（使用者加好友）"""
        sender_id = event.get('source', {}).get('userId')
        if not sender_id:
            return None

        webhook_event_id = event.get('webhookEventId')

        return ChannelEvent(
            channel='line',
            event_type='follow',
            sender_id=sender_id,
            message_text='',
            message_type='text',
            message_id=webhook_event_id,
            reply_token=event.get('replyToken'),
            attachments={'meta_message_id': webhook_event_id},
            ad_referral=None,
            raw_event=event,
        )

    def _parse_unfollow_event(self, event: Dict[str, Any]) -> Optional[ChannelEvent]:
        """解析 LINE unfollow 事件（使用者封鎖）"""
        sender_id = event.get('source', {}).get('userId')
        if not sender_id:
            return None

        webhook_event_id = event.get('webhookEventId')

        return ChannelEvent(
            channel='line',
            event_type='unfollow',
            sender_id=sender_id,
            message_text='',
            message_type='text',
            message_id=webhook_event_id,
            reply_token=None,  # unfollow 沒有 reply token
            attachments={'meta_message_id': webhook_event_id},
            ad_referral=None,
            raw_event=event,
        )

    def _parse_postback_event(self, event: Dict[str, Any]) -> Optional[ChannelEvent]:
        """解析 LINE postback 事件"""
        sender_id = event.get('source', {}).get('userId')
        if not sender_id:
            return None

        postback = event.get('postback', {})
        webhook_event_id = event.get('webhookEventId')

        return ChannelEvent(
            channel='line',
            event_type='postback',
            sender_id=sender_id,
            message_text=postback.get('data', ''),
            message_type='text',
            message_id=webhook_event_id,
            reply_token=event.get('replyToken'),
            attachments={
                'meta_message_id': webhook_event_id,
                'postback_data': postback.get('data'),
                'postback_params': postback.get('params'),
            },
            ad_referral=None,
            raw_event=event,
        )
