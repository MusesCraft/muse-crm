"""
MUSE CRM — Utils Module

工具函數和錯誤處理的統一入口。
"""

from .error_handler import register_error_handlers, handle_llm_error
from .meta_api import MetaGraphAPI
from .auth import login_required, admin_required, generate_token

__all__ = [
    'register_error_handlers',
    'handle_llm_error',
    'MetaGraphAPI',
    'login_required',
    'admin_required',
    'generate_token',
]