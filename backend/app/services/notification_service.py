"""
MUSE CRM — Notification Service

通知服務：支援 Discord Webhook 和 LINE Notify 推播。
"""

import logging
from datetime import datetime
from typing import Optional

import requests

from ..models.system_setting import SystemSetting

logger = logging.getLogger(__name__)


class NotificationService:
    """通知服務，負責發送 Discord / LINE Notify 通知"""

    @staticmethod
    def send_discord_webhook(content: dict, webhook_url: Optional[str] = None) -> bool:
        """
        透過 Discord Webhook 發送訊息。

        Args:
            content: Discord Webhook payload（含 embeds）
            webhook_url: 自訂 Webhook URL，若為 None 則讀取全局設定

        Returns:
            是否發送成功
        """
        url = webhook_url or SystemSetting.get('notification_discord_webhook_url')
        if not url:
            logger.debug("Discord Webhook URL 未設定，跳過發送")
            return False

        try:
            resp = requests.post(url, json=content, timeout=10)
            if resp.status_code in (200, 204):
                logger.info("✅ Discord 通知已發送")
                return True
            else:
                logger.warning(f"Discord Webhook 回應異常: status={resp.status_code} body={resp.text[:200]}")
                return False
        except Exception as e:
            logger.warning(f"Discord Webhook 發送失敗: {e}")
            return False

    @staticmethod
    def send_line_notify(message: str, token: Optional[str] = None) -> bool:
        """
        透過 LINE Notify API 推播訊息。

        Args:
            message: 通知訊息內容
            token: 自訂 LINE Notify token，若為 None 則讀取全局設定

        Returns:
            是否發送成功
        """
        notify_token = token or SystemSetting.get('notification_line_notify_token')
        if not notify_token:
            logger.debug("LINE Notify token 未設定，跳過發送")
            return False

        try:
            resp = requests.post(
                'https://notify-api.line.me/api/notify',
                headers={'Authorization': f'Bearer {notify_token}'},
                data={'message': message},
                timeout=10,
            )
            if resp.status_code == 200:
                logger.info("✅ LINE Notify 通知已發送")
                return True
            else:
                logger.warning(f"LINE Notify 回應異常: status={resp.status_code} body={resp.text[:200]}")
                return False
        except Exception as e:
            logger.warning(f"LINE Notify 發送失敗: {e}")
            return False

    @classmethod
    def notify_new_message(cls, contact, message_content: str, channel: str) -> None:
        """
        新客戶訊息通知：組裝內容並發送到已啟用的管道。

        Args:
            contact: Contact 物件
            message_content: 訊息內容
            channel: 渠道 (messenger/instagram)
        """
        if not SystemSetting.get_bool('notification_enabled', default=True):
            logger.debug("通知功能已停用，跳過發送")
            return

        contact_name = contact.display_name or '未知客戶'
        content_preview = message_content[:100] if message_content else '（無文字內容）'
        now = datetime.utcnow().isoformat() + 'Z'

        # Discord Embed
        discord_payload = {
            'embeds': [{
                'title': '📩 新訊息',
                'description': f'客戶名稱: {contact_name}\n渠道: {channel}\n內容: {content_preview}',
                'color': 3447003,
                'timestamp': now,
            }]
        }
        cls.send_discord_webhook(discord_payload)

        # LINE Notify
        line_message = f"\n📩 新訊息\n客戶: {contact_name}\n渠道: {channel}\n內容: {content_preview}"
        cls.send_line_notify(line_message)
