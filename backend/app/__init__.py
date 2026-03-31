"""
MUSE CRM — Flask Application Factory

建立 Flask app 的工廠函數，配置所有必要的擴展。
"""

from flask import Flask
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from celery import Celery

# 初始化擴展（但不綁定到 app）
db = SQLAlchemy()
migrate = Migrate()
celery = Celery(__name__)
limiter = Limiter(key_func=get_remote_address)

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
    config_cls = config[config_name]
    app.config.from_object(config_cls)

    # 安全檢查：SECRET_KEY 和 JWT_SECRET_KEY 不可為空
    if not app.config.get('SECRET_KEY'):
        raise RuntimeError(
            "SECRET_KEY 未設定。請透過環境變數提供 SECRET_KEY。"
        )
    if not app.config.get('JWT_SECRET_KEY'):
        raise RuntimeError(
            "JWT_SECRET_KEY 未設定。請透過環境變數提供 JWT_SECRET（或 JWT_SECRET_KEY）。"
        )

    # Production 環境額外驗證
    if hasattr(config_cls, 'init_app'):
        config_cls.init_app(app)

    # 初始化擴展
    db.init_app(app)
    migrate.init_app(app, db)
    # CORS：production 應透過 CORS_ORIGINS 環境變數限制來源
    cors_origins = app.config.get('CORS_ORIGINS', '*')
    if isinstance(cors_origins, str) and ',' in cors_origins:
        cors_origins = [o.strip() for o in cors_origins.split(',')]
    CORS(app, resources={r"/api/*": {"origins": cors_origins}, r"/uploads/*": {"origins": cors_origins}})
    limiter.init_app(app)

    # 配置 Celery
    _configure_celery(app, celery)

    # 初始化 SocketIO（Redis message_queue 為可選，連不上也不阻塞啟動）
    try:
        socketio.init_app(
            app,
            cors_allowed_origins=cors_origins,
            async_mode='threading',
            message_queue=app.config.get('REDIS_URL'),
        )
    except Exception as _socketio_err:
        import logging
        logging.getLogger(__name__).warning(f"SocketIO message_queue 初始化失敗，改用無 queue 模式: {_socketio_err}")
        socketio.init_app(
            app,
            cors_allowed_origins=cors_origins,
            async_mode='threading',
        )
    # 匯入事件處理器（確保註冊到 socketio）
    from .realtime import events  # noqa: F401

    # 註冊 API Blueprint
    from .api import api_bp
    app.register_blueprint(api_bp, url_prefix='/api/v1')
    
    # 提供 uploads 靜態檔案
    import os
    uploads_dir = os.path.join(app.root_path, '..', 'uploads')
    os.makedirs(uploads_dir, exist_ok=True)

    from flask import send_from_directory

    @app.route('/uploads/<path:filename>')
    def serve_upload(filename):
        return send_from_directory(uploads_dir, filename)

    # Health check — 輕量探針，供 load balancer / Docker 使用
    # 詳細版（含 DB/Redis 檢查）在 /api/v1/health
    @app.route('/api/health')
    def health():
        return {
            'status': 'ok',
            'service': 'muse-crm',
            'version': '1.0.0',
            'detail_url': '/api/v1/health',
        }

    # 自動建立 DB tables（在 app context 內同步執行）
    with app.app_context():
        try:
            db.create_all()
            import logging as _log
            _log.getLogger(__name__).info("✅ DB tables 已就緒")
        except Exception as _db_err:
            import logging as _log
            _log.getLogger(__name__).warning(f"⚠️ DB create_all 失敗（DB 可能尚未就緒）: {_db_err}")

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
                'task': 'crm.tasks.cleanup_expired_sessions',
                'schedule': 3600.0,  # 每小時執行一次
                'options': {'queue': 'maintenance'},
            },
            'retry-failed-analysis': {
                'task': 'crm.tasks.retry_failed_analysis',
                'schedule': 1800.0,  # 每 30 分鐘重試失敗的分析
                'options': {'queue': 'maintenance'},
            },
            'check-due-actions': {
                'task': 'crm.tasks.check_due_actions',
                'schedule': 3600.0,  # 每小時檢查即將到期的待辦動作
                'options': {'queue': 'maintenance'},
            },
            'check-scheduled-broadcasts': {
                'task': 'crm.tasks.check_scheduled_broadcasts',
                'schedule': 60.0,  # 每分鐘檢查排程廣播
                'options': {'queue': 'maintenance'},
            },
            'periodic-data-health-check': {
                'task': 'app.tasks.maintenance_tasks.periodic_data_health_check',
                'schedule': 21600.0,  # 每 6 小時執行一次（已有 explicit name）
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