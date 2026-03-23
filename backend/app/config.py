"""
MUSE CRM — 配置模組

基於環境變數的設定檔，支援 development、production、testing 環境。
"""

import os
from typing import Dict, Type


class BaseConfig:
    """基礎配置類別"""

    # Flask — 無預設值，必須由環境變數或子類別提供
    SECRET_KEY = os.environ.get('SECRET_KEY')

    # 資料庫
    DATABASE_URL = os.environ.get('DATABASE_URL', 'postgresql://muse:muse_dev@localhost:5432/muse_crm')
    SQLALCHEMY_DATABASE_URI = DATABASE_URL
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_pre_ping': True,
        'pool_recycle': 300,
        'echo': False
    }

    # Redis
    REDIS_URL = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')

    # LLM（OpenRouter）— 可選，沒設定則 LLM 功能不可用
    OPENROUTER_API_KEY = os.environ.get('OPENROUTER_API_KEY')
    OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
    DEFAULT_MODEL = 'anthropic/claude-3-haiku'

    # Meta Business API — production 必須設定
    META_APP_SECRET = os.environ.get('META_APP_SECRET')
    META_APP_ID = os.environ.get('META_APP_ID')
    META_VERIFY_TOKEN = os.environ.get('META_VERIFY_TOKEN', 'muse_crm_verify')
    META_PAGE_TOKEN = os.environ.get('META_PAGE_TOKEN')

    # LINE Messaging API
    LINE_CHANNEL_SECRET = os.environ.get('LINE_CHANNEL_SECRET')
    LINE_CHANNEL_ACCESS_TOKEN = os.environ.get('LINE_CHANNEL_ACCESS_TOKEN')

    # JWT Authentication — 無預設值，必須由環境變數或子類別提供
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET')
    JWT_EXPIRY_HOURS = int(os.environ.get('JWT_EXPIRY_HOURS', '24'))

    # Celery
    CELERY_BROKER_URL = REDIS_URL
    CELERY_RESULT_BACKEND = REDIS_URL

    # 分析設定
    ANALYSIS_TIMEOUT_MINUTES = int(os.environ.get('ANALYSIS_TIMEOUT_MINUTES', '5'))
    MAX_RETRY_ATTEMPTS = int(os.environ.get('MAX_RETRY_ATTEMPTS', '3'))
    MIN_MESSAGES_FOR_ANALYSIS = os.environ.get('MIN_MESSAGES_FOR_ANALYSIS')  # .env 優先於 DB 設定


class DevelopmentConfig(BaseConfig):
    """開發環境配置"""

    DEBUG = True
    TESTING = False

    # 開發環境保留 dev 預設值，方便本地開發
    SECRET_KEY = os.environ.get('SECRET_KEY', 'muse-crm-dev-secret-key')
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET', 'muse-crm-dev-jwt-secret')

    # 開發模式下顯示 SQL
    SQLALCHEMY_ENGINE_OPTIONS = {
        **BaseConfig.SQLALCHEMY_ENGINE_OPTIONS,
        'echo': True
    }


class ProductionConfig(BaseConfig):
    """生產環境配置 — 所有安全敏感值必須由環境變數提供"""

    DEBUG = False
    TESTING = False

    # Production 必須設定的環境變數
    REQUIRED_ENV_VARS = [
        'SECRET_KEY',
        'JWT_SECRET',
        'META_APP_SECRET',
        'META_PAGE_TOKEN',
    ]

    @classmethod
    def init_app(cls, app):
        """驗證 production 必要環境變數"""
        missing = [var for var in cls.REQUIRED_ENV_VARS if not os.environ.get(var)]
        if missing:
            raise RuntimeError(
                f"Production 環境缺少必要環境變數: {', '.join(missing)}"
            )


class TestingConfig(BaseConfig):
    """測試環境配置"""

    DEBUG = True
    TESTING = True

    # 測試環境保留固定值
    SECRET_KEY = 'test-secret-key'
    JWT_SECRET_KEY = 'test-jwt-secret-key'

    # 測試用 PostgreSQL（避免 JSONB 兼容性問題）
    SQLALCHEMY_DATABASE_URI = 'postgresql://muse:muse_dev@localhost:5432/muse_crm_test'

    # 測試時不需要真實的 API keys
    OPENROUTER_API_KEY = 'test-key'
    META_APP_SECRET = 'test-secret'
    META_PAGE_TOKEN = 'test-token'
    LINE_CHANNEL_SECRET = 'test-line-secret'
    LINE_CHANNEL_ACCESS_TOKEN = 'test-line-token'


# 配置字典
config: Dict[str, Type[BaseConfig]] = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig,
    'default': DevelopmentConfig
}


def get_config(config_name: str = None) -> Type[BaseConfig]:
    """
    取得配置類別
    
    Args:
        config_name: 配置名稱，如未指定則從 FLASK_ENV 環境變數讀取
    
    Returns:
        配置類別
    """
    if config_name is None:
        config_name = os.environ.get('FLASK_ENV', 'default')
    
    return config.get(config_name, DevelopmentConfig)