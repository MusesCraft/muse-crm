"""
MUSE CRM — Services Module

業務邏輯服務層的統一入口。
"""

from .contact_service import ContactService
from .session_service import SessionService
from .merge_service import MergeService

# TODO: 實作 LLMService 和 AnalysisService
# from .llm_service import LLMService
# from .analysis_service import AnalysisService

__all__ = [
    'ContactService',
    'SessionService',
    'MergeService',
]