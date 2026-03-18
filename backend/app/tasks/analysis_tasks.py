"""
MUSE CRM — Analysis Tasks

LLM 分析相關的 Celery 背景任務。
"""

import logging
from datetime import datetime
from celery import current_task

from .. import celery, db
from ..models import AnalysisQueue, Conversation, Analysis
from ..utils.error_handler import handle_llm_error

logger = logging.getLogger(__name__)


@celery.task(bind=True)
def process_analysis_queue(self):
    """
    處理分析佇列中的待分析對話
    
    這個任務會取得佇列中的待處理項目並進行 LLM 分析。
    """
    try:
        logger.info("開始處理分析佇列")
        
        # 取得待處理的佇列項目（按建立時間排序）
        pending_items = (
            AnalysisQueue.query
            .filter_by(status='pending')
            .order_by(AnalysisQueue.created_at)
            .limit(10)  # 一次最多處理 10 個
            .all()
        )
        
        if not pending_items:
            logger.info("分析佇列為空")
            return {
                'success': True,
                'processed_count': 0,
                'message': 'No pending items'
            }
        
        processed_count = 0
        success_count = 0
        
        for queue_item in pending_items:
            try:
                # 標記為處理中
                queue_item.mark_as_processing()
                db.session.commit()
                
                # 執行分析
                success = _analyze_conversation(queue_item.conversation_id)
                
                if success:
                    queue_item.mark_as_completed()
                    success_count += 1
                    logger.info(f"對話分析完成：{queue_item.conversation_id}")
                else:
                    queue_item.mark_as_failed("Analysis failed")
                    logger.error(f"對話分析失敗：{queue_item.conversation_id}")
                
                db.session.commit()
                processed_count += 1
                
            except Exception as e:
                logger.error(f"處理佇列項目失敗 {queue_item.conversation_id}: {e}", exc_info=True)
                
                try:
                    queue_item.mark_as_failed(str(e))
                    db.session.commit()
                except Exception as commit_e:
                    logger.error(f"標記失敗狀態失敗: {commit_e}")
                    db.session.rollback()
                
                processed_count += 1
        
        logger.info(f"分析佇列處理完成：處理 {processed_count} 個，成功 {success_count} 個")
        
        return {
            'success': True,
            'processed_count': processed_count,
            'success_count': success_count,
            'timestamp': datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"處理分析佇列失敗: {e}", exc_info=True)
        return {
            'success': False,
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }


def _analyze_conversation(conversation_id: str) -> bool:
    """
    執行對話分析
    
    Args:
        conversation_id: 對話 ID
        
    Returns:
        是否分析成功
    """
    try:
        conversation = Conversation.query.get(conversation_id)
        if not conversation:
            logger.error(f"對話不存在：{conversation_id}")
            return False
        
        # 檢查是否已有分析結果
        if conversation.analyses:
            logger.info(f"對話已有分析結果：{conversation_id}")
            return True
        
        # 準備對話內容
        messages = []
        for message in conversation.messages:
            if message.has_text_content:
                messages.append({
                    'sender': message.sender_type,
                    'content': message.content,
                    'timestamp': message.sent_at.isoformat()
                })
        
        if not messages:
            logger.warning(f"對話無有效訊息內容：{conversation_id}")
            return False
        
        # TODO: 實際 LLM 分析邏輯
        # 這裡先建立一個 mock 分析結果
        analysis_result = _mock_analysis(messages, conversation)
        
        # 儲存分析結果
        analysis = Analysis(
            conversation_id=conversation.id,
            contact_id=conversation.contact_id,
            customer_name=analysis_result.get('customer_name'),
            demand_summary=analysis_result.get('demand_summary'),
            mentioned_products=analysis_result.get('mentioned_products', []),
            suggested_tags=analysis_result.get('suggested_tags', []),
            conversation_summary=analysis_result.get('conversation_summary'),
            suggested_action=analysis_result.get('suggested_action'),
            trigger_type='auto',
            model_used=analysis_result.get('model_used', 'mock'),
            tokens_used=analysis_result.get('tokens_used', 0),
            processing_time_ms=analysis_result.get('processing_time_ms', 100)
        )
        
        db.session.add(analysis)
        
        # 自動打標（如果有建議標籤）
        if analysis_result.get('suggested_tags'):
            _auto_tag_contact(conversation.contact_id, analysis_result['suggested_tags'])
        
        # 自動建立待辦動作（如果有建議）
        if analysis_result.get('suggested_action'):
            _create_suggested_action(
                conversation.contact_id,
                conversation.id,
                analysis_result['suggested_action']
            )
        
        db.session.commit()
        
        logger.info(f"分析結果已儲存：{conversation_id}")
        return True
        
    except Exception as e:
        logger.error(f"分析對話失敗 {conversation_id}: {e}", exc_info=True)
        db.session.rollback()
        
        # 記錄錯誤
        handle_llm_error(
            'llm_error',
            {
                'error_detail': str(e),
                'conversation_id': conversation_id
            },
            conversation_id
        )
        
        return False


def _mock_analysis(messages: list, conversation: Conversation) -> dict:
    """
    Mock LLM 分析（開發階段使用）
    
    Args:
        messages: 對話訊息列表
        conversation: 對話物件
        
    Returns:
        分析結果字典
    """
    # 簡單的關鍵字分析作為 mock
    content = ' '.join(msg['content'] for msg in messages if msg['sender'] == 'customer')
    
    mentioned_products = []
    suggested_tags = []
    
    # 產品關鍵字檢測
    if any(keyword in content for keyword in ['電視牆', 'TV牆']):
        mentioned_products.append('電視牆')
        suggested_tags.append('電視牆')
    
    if any(keyword in content for keyword in ['一體盆', '洗手台']):
        mentioned_products.append('一體盆')
        suggested_tags.append('一體盆')
    
    if any(keyword in content for keyword in ['檯面', '廚房']):
        mentioned_products.append('檯面')
        suggested_tags.append('檯面')
    
    # 客戶類型檢測
    if any(keyword in content for keyword in ['設計師', '設計']):
        suggested_tags.append('設計師')
    elif any(keyword in content for keyword in ['屋主', '房子', '家裡']):
        suggested_tags.append('屋主')
    
    # 狀態檢測
    if any(keyword in content for keyword in ['報價', '價格', '多少錢']):
        suggested_tags.append('詢價')
    
    return {
        'customer_name': None,  # 需要更複雜的 NER
        'demand_summary': f'客戶對 {", ".join(mentioned_products) if mentioned_products else "產品"} 有興趣',
        'mentioned_products': mentioned_products,
        'suggested_tags': suggested_tags,
        'conversation_summary': f'客戶詢問相關產品資訊，共 {len(messages)} 則訊息',
        'suggested_action': '聯絡客戶提供更詳細的產品資訊' if mentioned_products else '了解客戶具體需求',
        'model_used': 'mock-analyzer-v1',
        'tokens_used': len(content),
        'processing_time_ms': 150
    }


def _auto_tag_contact(contact_id: str, suggested_tags: list):
    """
    自動為客戶打標
    
    Args:
        contact_id: 客戶 ID
        suggested_tags: 建議標籤列表
    """
    try:
        from ..models import Tag, ContactTag
        
        for tag_name in suggested_tags:
            # 取得或建立標籤
            tag = Tag.query.filter_by(name=tag_name).first()
            if not tag:
                tag = Tag(name=tag_name, category='auto')
                db.session.add(tag)
                db.session.flush()
            
            # 檢查是否已存在
            existing = ContactTag.query.filter_by(
                contact_id=contact_id,
                tag_id=tag.id
            ).first()
            
            if not existing:
                contact_tag = ContactTag(
                    contact_id=contact_id,
                    tag_id=tag.id,
                    source='llm'
                )
                db.session.add(contact_tag)
                logger.info(f"自動打標：{contact_id} -> {tag_name}")
        
    except Exception as e:
        logger.error(f"自動打標失敗 {contact_id}: {e}")


def _create_suggested_action(contact_id: str, conversation_id: str, action_description: str):
    """
    建立建議的待辦動作
    
    Args:
        contact_id: 客戶 ID
        conversation_id: 對話 ID
        action_description: 動作描述
    """
    try:
        from ..models import Action
        
        action = Action(
            contact_id=contact_id,
            conversation_id=conversation_id,
            description=action_description,
            source='llm',
            priority='medium'
        )
        
        db.session.add(action)
        logger.info(f"建立建議動作：{contact_id} -> {action_description}")
        
    except Exception as e:
        logger.error(f"建立建議動作失敗 {contact_id}: {e}")


@celery.task(bind=True, max_retries=3)
def retry_failed_analysis(self):
    """
    重試失敗的分析任務
    
    這個任務會查找失敗的分析項目並重新加入佇列。
    """
    try:
        logger.info("開始重試失敗的分析任務")
        
        # 查找失敗且重試次數未達上限的項目
        failed_items = (
            AnalysisQueue.query
            .filter(
                AnalysisQueue.status == 'failed',
                AnalysisQueue.retry_count < 3
            )
            .order_by(AnalysisQueue.created_at)
            .limit(5)  # 一次最多重試 5 個
            .all()
        )
        
        if not failed_items:
            logger.info("無需要重試的失敗項目")
            return {
                'success': True,
                'retried_count': 0,
                'message': 'No failed items to retry'
            }
        
        retried_count = 0
        
        for item in failed_items:
            try:
                # 重置為 pending 狀態
                item.status = 'pending'
                item.error_message = None
                db.session.commit()
                
                retried_count += 1
                logger.info(f"重新加入分析佇列：{item.conversation_id}")
                
            except Exception as e:
                logger.error(f"重試失敗項目出錯 {item.conversation_id}: {e}")
                db.session.rollback()
        
        # 觸發佇列處理
        if retried_count > 0:
            process_analysis_queue.delay()
        
        logger.info(f"重試完成，共重試 {retried_count} 個項目")
        
        return {
            'success': True,
            'retried_count': retried_count,
            'timestamp': datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"重試失敗分析失敗: {e}", exc_info=True)
        return {
            'success': False,
            'error': str(e),
            'timestamp': datetime.utcnow().isoformat()
        }