"""
MUSE CRM — 渠道 Adapter 註冊中心

管理所有渠道 Adapter 的註冊和查詢。
"""

import logging
from typing import Dict, Optional

from .base import ChannelAdapter

logger = logging.getLogger(__name__)


class ChannelRegistry:
    """
    渠道 Adapter 註冊中心。

    統一管理已註冊的渠道 Adapter，提供依名稱查詢功能。
    """

    def __init__(self):
        self._adapters: Dict[str, ChannelAdapter] = {}

    def register(self, adapter: ChannelAdapter) -> None:
        """
        註冊渠道 Adapter。

        Args:
            adapter: ChannelAdapter 實例
        """
        name = adapter.channel_name
        self._adapters[name] = adapter
        logger.info(f"渠道 Adapter 已註冊：{name}")

    def get_adapter(self, channel_name: str) -> Optional[ChannelAdapter]:
        """
        取得指定渠道的 Adapter。

        Args:
            channel_name: 渠道名稱

        Returns:
            ChannelAdapter 實例或 None
        """
        return self._adapters.get(channel_name)

    def list_channels(self) -> list:
        """列出所有已註冊的渠道名稱"""
        return list(self._adapters.keys())


# 全域單例
channel_registry = ChannelRegistry()

# 預設註冊 Meta 和 LINE Adapter
from .meta_adapter import MetaAdapter
from .line_adapter import LineAdapter

channel_registry.register(MetaAdapter())
channel_registry.register(LineAdapter())
