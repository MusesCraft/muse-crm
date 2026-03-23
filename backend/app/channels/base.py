"""
MUSE CRM — 渠道抽象基類

定義所有渠道 Adapter 必須實作的統一介面。
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional


@dataclass
class ChannelEvent:
    """
    渠道事件的統一資料結構。

    不論來自 Messenger、Instagram 或 LINE，
    所有事件都被轉換為此格式供業務邏輯統一處理。
    """
    channel: str                          # 'messenger' | 'instagram' | 'line'
    event_type: str                       # 'message' | 'follow' | 'unfollow' | 'postback'
    sender_id: str                        # 平台的使用者 ID
    message_text: str                     # 訊息內容（非 message 事件為空字串）
    message_type: str                     # 'text' | 'image' | 'sticker' | 'audio' | 'video' | 'file' | 'location'
    message_id: Optional[str] = None      # 平台訊息 ID（用於冪等性）
    reply_token: Optional[str] = None     # LINE reply token（Meta 無此欄位）
    attachments: Dict[str, Any] = field(default_factory=dict)
    ad_referral: Optional[Dict[str, Any]] = None
    raw_event: Dict[str, Any] = field(default_factory=dict)


class ChannelAdapter(ABC):
    """
    渠道 Adapter 抽象基類。

    所有渠道（Messenger、Instagram、LINE 等）都必須實作此介面，
    提供統一的簽名驗證、事件解析、Profile 取得和訊息發送能力。
    """

    channel_name: str  # 'messenger' | 'instagram' | 'line'

    @abstractmethod
    def verify_signature(self, payload: bytes, signature: str) -> bool:
        """
        驗證 Webhook 簽名。

        Args:
            payload: 請求 body（bytes）
            signature: 簽名 header 值

        Returns:
            簽名是否有效
        """
        ...

    @abstractmethod
    def parse_events(self, data: dict) -> List[ChannelEvent]:
        """
        解析 Webhook payload 為統一的 ChannelEvent 列表。

        Args:
            data: Webhook JSON payload

        Returns:
            ChannelEvent 列表
        """
        ...

    @abstractmethod
    def get_user_profile(self, user_id: str) -> Optional[dict]:
        """
        取得使用者 Profile。

        Args:
            user_id: 平台使用者 ID

        Returns:
            標準化的 profile dict 或 None
        """
        ...

    @abstractmethod
    def send_message(self, user_id: str, message: str) -> bool:
        """
        主動發送訊息（Push）。

        Args:
            user_id: 收件人 ID
            message: 訊息內容

        Returns:
            是否發送成功
        """
        ...

    @abstractmethod
    def send_reply(self, reply_token: str, message: str) -> bool:
        """
        使用 reply token 回覆訊息（LINE 專用，Meta 可直接呼叫 send_message）。

        Args:
            reply_token: 回覆 token
            message: 訊息內容

        Returns:
            是否發送成功
        """
        ...
