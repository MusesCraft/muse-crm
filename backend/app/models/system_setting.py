"""
MUSE CRM — System Setting Model

系統設定 key-value 存儲。
"""

from datetime import datetime
from typing import Any, Optional
from sqlalchemy import String, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from .. import db


class SystemSetting(db.Model):
    """系統設定模型（key-value）"""

    __tablename__ = 'system_settings'

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[str] = mapped_column(Text, nullable=False, default='')
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    # 預設值定義
    DEFAULTS = {
        'llm_monthly_cost_limit_usd': '50.0',
        'llm_monthly_token_limit': '',       # 空字串表示不限制
        'llm_cost_limit_enabled': 'true',
        'min_messages_for_analysis': '3',    # 短對話跳過分析門檻
        'notification_enabled': 'true',               # 通知功能開關
        'notification_discord_webhook_url': '',        # Discord Webhook URL
        'notification_line_notify_token': '',          # LINE Notify token
        'action_reminder_hours': '24',                 # 待辦提醒：到期前 N 小時
    }

    @classmethod
    def get(cls, key: str, default: Optional[str] = None) -> Optional[str]:
        """
        取得設定值。

        Args:
            key: 設定鍵名
            default: 預設值（如果未設定且無系統預設）

        Returns:
            設定值字串
        """
        setting = db.session.get(cls, key)
        if setting:
            return setting.value
        return cls.DEFAULTS.get(key, default)

    @classmethod
    def get_float(cls, key: str, default: float = 0.0) -> float:
        """取得浮點數設定值"""
        val = cls.get(key)
        if not val:
            return default
        try:
            return float(val)
        except (ValueError, TypeError):
            return default

    @classmethod
    def get_int(cls, key: str, default: Optional[int] = None) -> Optional[int]:
        """取得整數設定值"""
        val = cls.get(key)
        if not val:
            return default
        try:
            return int(val)
        except (ValueError, TypeError):
            return default

    @classmethod
    def get_bool(cls, key: str, default: bool = False) -> bool:
        """取得布林設定值"""
        val = cls.get(key)
        if val is None:
            return default
        return val.lower() in ('true', '1', 'yes')

    @classmethod
    def set(cls, key: str, value: Any, description: Optional[str] = None) -> 'SystemSetting':
        """
        設定值（upsert）。

        Args:
            key: 設定鍵名
            value: 設定值
            description: 描述

        Returns:
            SystemSetting 實例
        """
        setting = db.session.get(cls, key)
        if setting:
            setting.value = str(value)
            if description is not None:
                setting.description = description
        else:
            setting = cls(
                key=key,
                value=str(value),
                description=description,
            )
            db.session.add(setting)
        return setting

    def __repr__(self) -> str:
        return f'<SystemSetting {self.key}={self.value}>'
