"""
MUSE CRM — API Blueprint

統一管理所有 API 路由。
"""

from flask import Blueprint

# 建立 API Blueprint
api_bp = Blueprint('api', __name__)

# 匯入所有 API 路由（確保註冊到 Blueprint）
from . import webhook
from . import inbox
from . import contacts
from . import actions
from . import dashboard
from . import tags
from . import auth
from . import quick_replies
from . import llm_usage
from . import users
from . import notification_preferences
from . import sync

# 註冊錯誤處理器
from ..utils.error_handler import register_error_handlers
register_error_handlers(api_bp)