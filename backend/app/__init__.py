"""
MUSE CRM — Flask Application Factory

建立 Flask app 的工廠函數，配置所有必要的擴展。
"""

from flask import Flask
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from celery import Celery

# 初始化擴展（但不綁定到 app）
db = SQLAlchemy()
migrate = Migrate()
celery = Celery(__name__)

# SocketIO 在 realtime 模組中初始化
from .realtime import socketio


def create_app(config_name: str = 'development') -> Flask:
    """
    Flask 應用工廠函數
    
    Args:
        config_name: 配置名稱 ('development', 'production', 'testing')
    
    Returns:
        配置好的 Flask 應用實例
    """
    app = Flask(__name__)
    
    # 載入配置
    from .config import config
    app.config.from_object(config[config_name])
    
    # 初始化擴展
    db.init_app(app)
    migrate.init_app(app, db)
    CORS(app, resources={r"/api/*": {"origins": "*"}})
    
    # 配置 Celery
    _configure_celery(app, celery)

    # 初始化 SocketIO
    socketio.init_app(
        app,
        cors_allowed_origins='*',
        async_mode='threading',
        message_queue=app.config.get('REDIS_URL'),
    )
    # 匯入事件處理器（確保註冊到 socketio）
    from .realtime import events  # noqa: F401

    # 註冊 API Blueprint
    from .api import api_bp
    app.register_blueprint(api_bp, url_prefix='/api/v1')
    
    # Health check endpoint
    @app.route('/api/health')
    def health():
        return {
            'status': 'ok',
            'service': 'muse-crm',
            'version': '1.0.0'
        }
    
    return app


def _configure_celery(app: Flask, celery: Celery) -> None:
    """配置 Celery 與 Flask app 集成"""
    celery.conf.update(
        broker_url=app.config['REDIS_URL'],
        result_backend=app.config['REDIS_URL'],
        task_serializer='json',
        result_serializer='json',
        accept_content=['json'],
        timezone='Asia/Taipei',
        enable_utc=True,
        # Celery Beat 定期任務
        beat_schedule={
            'cleanup-expired-sessions': {
                'task': 'app.tasks.session_tasks.cleanup_expired_sessions',
                'schedule': 3600.0,  # 每小時執行一次
                'options': {'queue': 'maintenance'},
            },
            'retry-failed-analysis': {
                'task': 'app.tasks.analysis_tasks.retry_failed_analysis',
                'schedule': 1800.0,  # 每 30 分鐘重試失敗的分析
                'options': {'queue': 'maintenance'},
            },
            'check-due-actions': {
                'task': 'app.tasks.notification_tasks.check_due_actions',
                'schedule': 3600.0,  # 每小時檢查即將到期的待辦動作
                'options': {'queue': 'maintenance'},
            },
        },
    )
    
    class ContextTask(celery.Task):
        """Flask 應用上下文中執行 Celery 任務"""
        def __call__(self, *args, **kwargs):
            with app.app_context():
                return self.run(*args, **kwargs)
    
    celery.Task = ContextTask