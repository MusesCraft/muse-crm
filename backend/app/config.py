"""
MUSE CRM — 配置模組

基於環境變數的設定檔，支援 development、production、testing 環境。
"""

import os
from typing import Dict, Type


class BaseConfig:
    """基礎配置類別"""
    
    # Flask
    SECRET_KEY = os.environ.get('SECRET_KEY', 'muse-crm-dev-secret-key-change-in-production')
    
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
    
    # LLM（OpenRouter）
    OPENROUTER_API_KEY = os.environ.get('OPENROUTER_API_KEY')
    OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
    DEFAULT_MODEL = 'anthropic/claude-3-haiku'
    
    # Meta Business API
    META_APP_SECRET = os.environ.get('META_APP_SECRET')
    META_APP_ID = os.environ.get('META_APP_ID')
    META_VERIFY_TOKEN = os.environ.get('META_VERIFY_TOKEN', 'muse_crm_verify')
    META_PAGE_TOKEN = os.environ.get('META_PAGE_TOKEN')
    
    # JWT Authentication
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET', 'dev-secret-key')
    JWT_EXPIRY_HOURS = int(os.environ.get('JWT_EXPIRY_HOURS', '24'))
    
    # Celery
    CELERY_BROKER_URL = REDIS_URL
    CELERY_RESULT_BACKEND = REDIS_URL
    
    # 分析設定
    ANALYSIS_TIMEOUT_MINUTES = int(os.environ.get('ANALYSIS_TIMEOUT_MINUTES', '5'))
    MAX_RETRY_ATTEMPTS = int(os.environ.get('MAX_RETRY_ATTEMPTS', '3'))


class DevelopmentConfig(BaseConfig):
    """開發環境配置"""
    
    DEBUG = True
    TESTING = False
    
    # 開發模式下顯示 SQL
    SQLALCHEMY_ENGINE_OPTIONS = {
        **BaseConfig.SQLALCHEMY_ENGINE_OPTIONS,
        'echo': True
    }


class ProductionConfig(BaseConfig):
    """生產環境配置"""
    
    DEBUG = False
    TESTING = False
    
    # 生產環境強制使用環境變數
    @classmethod
    def init_app(cls, app):
        BaseConfig.init_app(app)
        
        # 檢查必要的環境變數
        required_vars = [
            'SECRET_KEY',
            'DATABASE_URL',
            'REDIS_URL',
            'OPENROUTER_API_KEY',
            'META_APP_SECRET',
            'META_PAGE_TOKEN'
        ]
        
        missing_vars = [var for var in required_vars if not os.environ.get(var)]
        if missing_vars:
            raise RuntimeError(f"Missing required environment variables: {missing_vars}")


class TestingConfig(BaseConfig):
    """測試環境配置"""
    
    DEBUG = True
    TESTING = True
    
    # 測試用 PostgreSQL（避免 JSONB 兼容性問題）
    SQLALCHEMY_DATABASE_URI = 'postgresql://muse:muse_dev@localhost:5432/muse_crm_test'
    
    # 測試時不需要真實的 API keys
    OPENROUTER_API_KEY = 'test-key'
    META_APP_SECRET = 'test-secret'
    META_PAGE_TOKEN = 'test-token'


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