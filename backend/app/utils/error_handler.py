"""
MUSE CRM — 錯誤處理與 Fallback 模組

從 MusesAI-CS 移植，改為使用 PostgreSQL + Flask 版本。

功能：
1. 統一錯誤處理入口 handle_llm_error()
2. 根據錯誤類型提供適當的處理策略
3. 記錄錯誤 log 到 PostgreSQL（並發安全）

錯誤類型：
- llm_timeout: LLM API 超時
- llm_rate_limit: LLM API 被限速  
- llm_error: LLM API 一般錯誤
- parse_error: LLM 回應解析失敗
- db_error: 資料庫操作錯誤
"""

import logging
from datetime import datetime
from typing import Dict, Any, Optional
from flask import Blueprint
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from .. import db

logger = logging.getLogger(__name__)

# 錯誤處理策略
ERROR_STRATEGIES = {
    'llm_timeout': {
        'retry': True,
        'max_retries': 3,
        'backoff_seconds': 30,
        'queue_for_later': True
    },
    'llm_rate_limit': {
        'retry': True,
        'max_retries': 5,
        'backoff_seconds': 60,
        'queue_for_later': True
    },
    'llm_error': {
        'retry': True,
        'max_retries': 2,
        'backoff_seconds': 10,
        'queue_for_later': True
    },
    'parse_error': {
        'retry': True,
        'max_retries': 1,
        'backoff_seconds': 5,
        'queue_for_later': False
    },
    'db_error': {
        'retry': True,
        'max_retries': 3,
        'backoff_seconds': 5,
        'queue_for_later': False
    },
    'general': {
        'retry': False,
        'max_retries': 0,
        'backoff_seconds': 0,
        'queue_for_later': False
    }
}


def handle_llm_error(
    error_type: str, 
    context: Optional[Dict[str, Any]] = None,
    conversation_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    統一錯誤處理入口。
    
    Args:
        error_type: 錯誤類型
        context: 錯誤上下文資訊，包含 error_detail、model_used 等
        conversation_id: 相關對話 ID
        
    Returns:
        錯誤處理策略字典
    """
    if context is None:
        context = {}
    
    strategy = ERROR_STRATEGIES.get(error_type, ERROR_STRATEGIES['general'])
    
    # 記錄錯誤
    _log_error(error_type, context, conversation_id)
    
    logger.error(f"LLM 錯誤：{error_type}, conversation_id={conversation_id}, detail={context.get('error_detail', '')}")
    
    return {
        'error_type': error_type,
        'strategy': strategy,
        'conversation_id': conversation_id,
        'context': context
    }


def _log_error(error_type: str, context: Dict[str, Any], conversation_id: Optional[str] = None):
    """
    將錯誤記錄寫入 PostgreSQL（並發安全）。
    
    Args:
        error_type: 錯誤類型
        context: 錯誤上下文
        conversation_id: 相關對話 ID
    """
    try:
        # 延遲建立 error_logs 表
        _ensure_error_logs_table()

        # 使用原生 SQL 確保並發安全
        db.session.execute(
            text("""
                INSERT INTO error_logs (
                    timestamp, error_type, conversation_id, 
                    model_used, error_detail, context_data
                ) VALUES (
                    :timestamp, :error_type, :conversation_id,
                    :model_used, :error_detail, :context_data
                )
            """),
            {
                'timestamp': datetime.utcnow(),
                'error_type': error_type,
                'conversation_id': conversation_id,
                'model_used': context.get('model_used'),
                'error_detail': context.get('error_detail', ''),
                'context_data': context
            }
        )
        
        db.session.commit()
        
    except SQLAlchemyError as e:
        # 錯誤日誌系統本身出錯時，只記錄到應用日誌
        logger.error(f"錯誤日誌寫入失敗：{e}")
        db.session.rollback()


def get_error_stats(days: int = 30) -> Dict[str, Any]:
    """
    取得錯誤統計資訊（供管理後台或除錯用）。
    
    Args:
        days: 統計天數
        
    Returns:
        各錯誤類型的發生次數和趨勢
    """
    try:
        # 按錯誤類型統計
        type_stats = db.session.execute(
            text("""
                SELECT error_type, COUNT(*) as count
                FROM error_logs 
                WHERE timestamp >= NOW() - INTERVAL :days DAY
                GROUP BY error_type
                ORDER BY count DESC
            """),
            {'days': days}
        ).fetchall()
        
        # 按日期統計趨勢
        daily_stats = db.session.execute(
            text("""
                SELECT DATE(timestamp) as date, COUNT(*) as count
                FROM error_logs
                WHERE timestamp >= NOW() - INTERVAL :days DAY
                GROUP BY DATE(timestamp)
                ORDER BY date DESC
            """),
            {'days': days}
        ).fetchall()
        
        return {
            'period_days': days,
            'by_type': {row.error_type: row.count for row in type_stats},
            'by_date': [
                {
                    'date': row.date.isoformat(),
                    'count': row.count
                }
                for row in daily_stats
            ],
            'total_errors': sum(row.count for row in type_stats)
        }
        
    except SQLAlchemyError as e:
        logger.error(f"取得錯誤統計失敗：{e}")
        return {
            'period_days': days,
            'by_type': {},
            'by_date': [],
            'total_errors': 0
        }


def register_error_handlers(blueprint: Blueprint):
    """
    為 Flask Blueprint 註冊錯誤處理器。
    
    Args:
        blueprint: Flask Blueprint 實例
    """
    
    @blueprint.errorhandler(400)
    def bad_request(error):
        return {
            'error': 'Bad Request',
            'message': '請求格式不正確'
        }, 400
    
    @blueprint.errorhandler(401)
    def unauthorized(error):
        return {
            'error': 'Unauthorized', 
            'message': '未授權訪問'
        }, 401
    
    @blueprint.errorhandler(403)
    def forbidden(error):
        return {
            'error': 'Forbidden',
            'message': '禁止訪問'
        }, 403
    
    @blueprint.errorhandler(404)
    def not_found(error):
        return {
            'error': 'Not Found',
            'message': '資源不存在'
        }, 404
    
    @blueprint.errorhandler(405)
    def method_not_allowed(error):
        return {
            'error': 'Method Not Allowed',
            'message': '不支援的請求方法'
        }, 405
    
    @blueprint.errorhandler(422)
    def unprocessable_entity(error):
        return {
            'error': 'Unprocessable Entity',
            'message': '無法處理的請求內容'
        }, 422
    
    @blueprint.errorhandler(500)
    def internal_server_error(error):
        # 記錄錯誤到日誌
        logger.error(f"Internal Server Error: {error}", exc_info=True)
        
        # 回滾資料庫交易
        db.session.rollback()
        
        return {
            'error': 'Internal Server Error',
            'message': '伺服器內部錯誤，請稍後重試'
        }, 500
    
    @blueprint.errorhandler(SQLAlchemyError)
    def handle_db_error(error):
        logger.error(f"Database Error: {error}", exc_info=True)
        
        # 回滾交易
        db.session.rollback()
        
        # 記錄錯誤（避免遞迴）
        try:
            _log_error(
                'db_error', 
                {'error_detail': str(error)}, 
                None
            )
        except:
            pass
        
        return {
            'error': 'Database Error',
            'message': '資料庫操作失敗，請稍後重試'
        }, 500


# 確保 error_logs 表存在
_error_logs_table_ensured = False


def _ensure_error_logs_table():
    """確保 error_logs 表存在（延遲建立，需在 app context 內呼叫）"""
    global _error_logs_table_ensured
    if _error_logs_table_ensured:
        return

    try:
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS error_logs (
                id SERIAL PRIMARY KEY,
                timestamp TIMESTAMPTZ NOT NULL,
                error_type VARCHAR(50) NOT NULL,
                conversation_id UUID,
                model_used VARCHAR(100),
                error_detail TEXT,
                context_data JSONB
            )
        """))
        
        # 建立索引
        db.session.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp 
            ON error_logs(timestamp)
        """))
        
        db.session.execute(text("""
            CREATE INDEX IF NOT EXISTS idx_error_logs_type 
            ON error_logs(error_type)
        """))
        
        db.session.commit()
        _error_logs_table_ensured = True
        
    except SQLAlchemyError as e:
        logger.error(f"建立 error_logs 表失敗：{e}")
        db.session.rollback()