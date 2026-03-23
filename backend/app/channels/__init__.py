"""
MUSE CRM — 多渠道介面模組

提供統一的渠道抽象層，支援 Messenger、Instagram、LINE 等多渠道接入。
"""

from .base import ChannelAdapter, ChannelEvent
from .registry import ChannelRegistry, channel_registry

__all__ = [
    'ChannelAdapter',
    'ChannelEvent',
    'ChannelRegistry',
    'channel_registry',
]
