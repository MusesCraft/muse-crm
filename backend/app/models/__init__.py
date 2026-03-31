"""
MUSE CRM — SQLAlchemy Models

所有資料模型的統一入口。
"""

from .contact import Contact, ChannelIdentifier
from .conversation import Conversation
from .message import Message
from .analysis import Analysis, AnalysisQueue
from .action import Action
from .tag import Tag, ContactTag
from .user import User, UserNote
from .llm_usage_log import LlmUsageLog
from .system_setting import SystemSetting
from .llm_fallback_event import LlmFallbackEvent
from .notification_preference import NotificationPreference
from .quick_reply import QuickReply

# 匯出所有模型供其他模組使用
__all__ = [
    'Contact',
    'ChannelIdentifier',
    'Conversation',
    'Message',
    'Analysis',
    'AnalysisQueue',
    'Action',
    'Tag',
    'ContactTag',
    'User',
    'UserNote',
    'LlmUsageLog',
    'SystemSetting',
    'LlmFallbackEvent',
    'NotificationPreference',
    'QuickReply',
]