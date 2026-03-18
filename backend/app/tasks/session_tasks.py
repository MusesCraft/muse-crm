"""
MUSE CRM — Session Tasks

對話 Session 相關的 Celery 背景任務。
"""

import logging
from datetime import datetime
from celery import current_task

from .. import celery, db
from ..models import Conversation, AnalysisQueue
from ..services.session_service import SessionService

logger = logging.getLogger(__name__)


@celery.task(bind=True, max_retries=3)
def trigger_analysis_task(self, conversation_id: str):
    """
    觸發對話分析任務
    
    Args:
        conversation_id: 對話 ID
    """
    try:
        logger.info(f"觸發對話分析：{conversation_id}")
        
        # 檢查對話是否存在
        conversation = Conversation.query.get(conversation_id)
        if not conversation:
            logger.error(f"對話不存在：{conversation_id}")
            return
        
        # 檢查是否已有分析結果
        if conversation.analyses:
            logger.info(f"對話已有分析結果，跳過：{conversation_id}")
            return
        
        # 檢查是否已在分析佇列中
        existing_queue = AnalysisQueue.query.filter_by(
            conversation_id=conversation.id,
            status='pending'
        ).first()
        
        if existing_queue:
            logger.info(f"對話已在分析佇列中：{conversation_id}")
            return
        
        # 加入分析佇列
        queue_entry = AnalysisQueue(
            conversation_id=conversation.id,
            status='pending'
        )
        
        db.session.add(queue_entry)
        db.session.commit()
        
        logger.info(f"對話已加入分析佇列：{conversation_id}")
        
        # 立即嘗試處理分析
        from .analysis_tasks import process_analysis_queue
        process_analysis_queue.delay()
        
    except Exception as e:
        logger.error(f"觸發對話分析失敗 {conversation_id}: {e}", exc_info=True)
        
        # 重試機制
        if self.request.retries < self.max_retries:
            logger.info(f"重試觸發分析：{conversation_id}, 重試次數：{self.request.retries + 1}")
            raise self.retry(countdown=60 * (2 ** self.request.retries))
        else:
            logger.error(f"觸發分析達到最大重試次數：{conversation_id}")


@celery.task
def cleanup_expired_sessions():
    """
    定期清理過期的對話 Session
    
    這個任務應該通過 Celery Beat 定期執行（例如每小時）。
    """
    try:
        logger.info("開始清理過期對話 Session")
        
        closed_count = SessionService.cleanup_expired_conversations()
        
        logger.info(f"清理完成，共關閉 {closed_count} 個過期對話")
        
        return {
            'success': True,
            'closed_count': closed_count,
            'timestamp': datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"清理過期對話失敗: {e}", exc_info=True)
        return {
            'success': False,
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }


@celery.task(bind=True, max_retries=5)
def close_conversation_task(self, conversation_id: str, reason: str = 'system'):
    """
    背景任務：關閉對話 Session
    
    Args:
        conversation_id: 對話 ID
        reason: 關閉原因
    """
    try:
        logger.info(f"背景關閉對話：{conversation_id}, 原因：{reason}")
        
        success = SessionService.close_conversation(conversation_id, reason)
        
        if success:
            logger.info(f"對話關閉成功：{conversation_id}")
            return {
                'success': True,
                'conversation_id': conversation_id,
                'reason': reason
            }
        else:
            logger.warning(f"對話關閉失敗：{conversation_id}")
            return {
                'success': False,
                'conversation_id': conversation_id,
                'error': 'Close operation failed'
            }
            
    except Exception as e:
        logger.error(f"背景關閉對話失敗 {conversation_id}: {e}", exc_info=True)
        
        # 重試機制
        if self.request.retries < self.max_retries:
            logger.info(f"重試關閉對話：{conversation_id}, 重試次數：{self.request.retries + 1}")
            raise self.retry(countdown=30 * (2 ** self.request.retries))
        else:
            logger.error(f"關閉對話達到最大重試次數：{conversation_id}")
            return {
                'success': False,
                'conversation_id': conversation_id,
                'error': f'Max retries exceeded: {str(e)}'
            }