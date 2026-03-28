"""
MUSE CRM — Utils Module

工具函數和錯誤處理的統一入口。
"""

from .error_handler import register_error_handlers, handle_llm_error
from .meta_api import MetaGraphAPI
from .auth import login_required, admin_required, generate_token


def escape_like(value: str) -> str:
    """
    Escape LIKE/ILIKE 萬用字元（%, _, \\）。
    搭配 .ilike(pattern, escape='\\\\') 使用。
    """
    return (
        value
        .replace('\\', '\\\\')
        .replace('%', '\\%')
        .replace('_', '\\_')
    )


__all__ = [
    'register_error_handlers',
    'handle_llm_error',
    'MetaGraphAPI',
    'login_required',
    'admin_required',
    'generate_token',
    'escape_like',
]