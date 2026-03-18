"""
MUSE CRM — Analysis Tasks

LLM 分析相關的 Celery 背景任務。

Tasks:
1. analyze_message(message_id) — 單條訊息意圖辨識 + 實體萃取
2. analyze_conversation(conversation_id) — 對話摘要 + 動作建議
3. batch_analyze_pending() — 批次處理待分析訊息
4. process_analysis_queue() — 處理分析佇列
5. retry_failed_analysis() — 重試失敗的分析
"""

import logging
from datetime import datetime

from .. import celery, db
from ..models import Analysis, AnalysisQueue, Conversation, Message
from ..services.llm_service import (
    LLMService,
    LLMServiceError,
    LLMTimeoutError,
    LLMRateLimitError,
    get_llm_service,
)
from ..services.prompts import format_conversation_for_prompt
from ..services.auto_tagger import AutoTagger
from ..services.action_service import ActionService
from ..utils.error_handler import handle_llm_error

logger = logging.getLogger(__name__)


# ============================================================
# 1. 單條訊息分析
# ============================================================

@celery.task(
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    autoretry_for=(LLMTimeoutError, LLMRateLimitError),
    retry_backoff=True,
    retry_backoff_max=300,
)
def analyze_message(self, message_id: str):
    """
    對單條訊息做意圖辨識和實體萃取。

    Args:
        message_id: Message UUID

    Returns:
        分析結果字典
    """
    try:
        message = db.session.get(Message, message_id)
        if not message:
            logger.error(f"訊息不存在：{message_id}")
            return {"success": False, "error": "Message not found"}

        if not message.has_text_content:
            logger.info(f"訊息無文字內容，跳過：{message_id}")
            return {"success": True, "skipped": True}

        llm = get_llm_service()

        # 意圖辨識
        intent_result, intent_usage = llm.analyze_intent(message.content)

        # 實體萃取（將此訊息作為單條對話處理）
        msg_data = [{
            "sender": message.sender_type,
            "content": message.content,
            "timestamp": message.sent_at.isoformat() if message.sent_at else "",
        }]
        entity_result, entity_usage = llm.extract_entities(msg_data)

        # 合併 token 使用
        total_tokens = (
            intent_usage.get("tokens_used", 0)
            + entity_usage.get("tokens_used", 0)
        )
        total_time = (
            intent_usage.get("processing_time_ms", 0)
            + entity_usage.get("processing_time_ms", 0)
        )

        logger.info(
            f"訊息分析完成：{message_id}, "
            f"intent={intent_result.get('intent')}, "
            f"tokens={total_tokens}"
        )

        return {
            "success": True,
            "message_id": message_id,
            "intent": intent_result,
            "entities": entity_result,
            "tokens_used": total_tokens,
            "processing_time_ms": total_time,
        }

    except LLMServiceError as e:
        logger.error(f"訊息分析 LLM 錯誤 {message_id}: {e}")

        handle_llm_error(
            "llm_error",
            {"error_detail": str(e), "message_id": message_id},
            None,
        )

        # 讓 Celery 自動重試
        raise

    except Exception as e:
        logger.error(f"訊息分析失敗 {message_id}: {e}", exc_info=True)
        return {
            "success": False,
            "message_id": message_id,
            "error": str(e),
        }


# ============================================================
# 2. 對話分析
# ============================================================

@celery.task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    autoretry_for=(LLMTimeoutError, LLMRateLimitError),
    retry_backoff=True,
    retry_backoff_max=600,
)
def analyze_conversation(self, conversation_id: str, trigger_type: str = "auto"):
    """
    對整個對話做綜合分析（摘要、動作建議、自動打標）。

    使用 full_analysis 一次呼叫完成所有分析，最節省 token。

    Args:
        conversation_id: Conversation UUID
        trigger_type: 觸發類型 ('auto' or 'manual')

    Returns:
        分析結果字典
    """
    try:
        conversation = db.session.get(Conversation, conversation_id)
        if not conversation:
            logger.error(f"對話不存在：{conversation_id}")
            return {"success": False, "error": "Conversation not found"}

        # 準備對話內容
        messages = _prepare_conversation_messages(conversation)
        if not messages:
            logger.warning(f"對話無有效訊息內容：{conversation_id}")
            return {"success": True, "skipped": True, "reason": "no_text_content"}

        # 呼叫 LLM 綜合分析
        llm = get_llm_service()
        analysis_result, usage_info = llm.full_analysis(
            conversation_messages=messages,
            channel=conversation.channel,
            status=conversation.status,
            message_count=conversation.message_count or len(messages),
        )

        # 儲存分析結果到 DB
        analysis = _save_analysis(
            conversation=conversation,
            analysis_result=analysis_result,
            usage_info=usage_info,
            trigger_type=trigger_type,
        )

        # 自動打標
        conversation_text = format_conversation_for_prompt(messages)
        added_tags = AutoTagger.tag_from_analysis(
            contact_id=conversation.contact_id,
            analysis_result=analysis_result,
            conversation_text=conversation_text,
        )

        # 自動建立 Action
        created_action_ids = ActionService.create_from_analysis(
            contact_id=conversation.contact_id,
            conversation_id=conversation.id,
            analysis_result=analysis_result,
        )

        db.session.commit()

        logger.info(
            f"對話分析完成：{conversation_id}, "
            f"model={usage_info.get('model_used')}, "
            f"tokens={usage_info.get('tokens_used')}, "
            f"tags_added={len(added_tags)}, "
            f"actions_created={len(created_action_ids)}"
        )

        return {
            "success": True,
            "conversation_id": conversation_id,
            "analysis_id": str(analysis.id),
            "tags_added": added_tags,
            "actions_created": created_action_ids,
            "tokens_used": usage_info.get("tokens_used", 0),
            "processing_time_ms": usage_info.get("processing_time_ms", 0),
        }

    except LLMServiceError as e:
        logger.error(f"對話分析 LLM 錯誤 {conversation_id}: {e}")
        db.session.rollback()

        handle_llm_error(
            "llm_error",
            {"error_detail": str(e), "conversation_id": conversation_id},
            conversation_id,
        )

        # 讓 Celery 自動重試
        raise

    except Exception as e:
        logger.error(f"對話分析失敗 {conversation_id}: {e}", exc_info=True)
        db.session.rollback()

        handle_llm_error(
            "llm_error",
            {"error_detail": str(e), "conversation_id": conversation_id},
            conversation_id,
        )

        return {
            "success": False,
            "conversation_id": conversation_id,
            "error": str(e),
        }


# ============================================================
# 3. 批次處理待分析訊息
# ============================================================

@celery.task(bind=True)
def batch_analyze_pending(self):
    """
    批次處理待分析的訊息。

    找出尚未分析的 active conversation 並逐一觸發分析。
    """
    try:
        logger.info("開始批次處理待分析的對話")

        # 找到有訊息但尚未分析的對話
        conversations_without_analysis = (
            db.session.query(Conversation)
            .outerjoin(Analysis, Conversation.id == Analysis.conversation_id)
            .filter(
                Analysis.id.is_(None),
                Conversation.message_count > 0,
            )
            .order_by(Conversation.last_message_at.desc().nullslast())
            .limit(20)
            .all()
        )

        if not conversations_without_analysis:
            logger.info("無待分析的對話")
            return {
                "success": True,
                "queued_count": 0,
                "message": "No conversations pending analysis",
            }

        queued_count = 0
        for conv in conversations_without_analysis:
            try:
                # 非同步觸發分析
                analyze_conversation.delay(str(conv.id), "auto")
                queued_count += 1
            except Exception as e:
                logger.error(f"排入分析佇列失敗 {conv.id}: {e}")

        logger.info(f"已排入 {queued_count} 個對話到分析佇列")

        return {
            "success": True,
            "queued_count": queued_count,
            "timestamp": datetime.utcnow().isoformat(),
        }

    except Exception as e:
        logger.error(f"批次處理失敗: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat(),
        }


# ============================================================
# 4. 處理分析佇列（保留 Phase 2 原有介面）
# ============================================================

@celery.task(bind=True)
def process_analysis_queue(self):
    """
    處理分析佇列中的待分析對話。

    這個任務會取得佇列中的待處理項目並進行 LLM 分析。
    保留原有介面以相容 Phase 2 的 trigger_analysis_task。
    """
    try:
        logger.info("開始處理分析佇列")

        # 取得待處理的佇列項目
        pending_items = (
            AnalysisQueue.query
            .filter_by(status="pending")
            .order_by(AnalysisQueue.created_at)
            .limit(10)
            .all()
        )

        if not pending_items:
            logger.info("分析佇列為空")
            return {
                "success": True,
                "processed_count": 0,
                "message": "No pending items",
            }

        processed_count = 0
        success_count = 0

        for queue_item in pending_items:
            try:
                # 標記為處理中
                queue_item.mark_as_processing()
                db.session.commit()

                # 透過 analyze_conversation 執行真正的 LLM 分析
                result = _execute_conversation_analysis(queue_item.conversation_id)

                if result:
                    queue_item.mark_as_completed()
                    success_count += 1
                    logger.info(f"佇列分析完成：{queue_item.conversation_id}")
                else:
                    queue_item.mark_as_failed("Analysis returned no result")
                    logger.error(f"佇列分析失敗：{queue_item.conversation_id}")

                db.session.commit()
                processed_count += 1

            except LLMServiceError as e:
                logger.error(
                    f"LLM 錯誤處理佇列項目 {queue_item.conversation_id}: {e}"
                )
                try:
                    queue_item.mark_as_failed(str(e))
                    db.session.commit()
                except Exception:
                    db.session.rollback()
                processed_count += 1

            except Exception as e:
                logger.error(
                    f"處理佇列項目失敗 {queue_item.conversation_id}: {e}",
                    exc_info=True,
                )
                try:
                    queue_item.mark_as_failed(str(e))
                    db.session.commit()
                except Exception:
                    db.session.rollback()
                processed_count += 1

        logger.info(
            f"分析佇列處理完成：處理 {processed_count} 個，成功 {success_count} 個"
        )

        return {
            "success": True,
            "processed_count": processed_count,
            "success_count": success_count,
            "timestamp": datetime.utcnow().isoformat(),
        }

    except Exception as e:
        logger.error(f"處理分析佇列失敗: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat(),
        }


# ============================================================
# 5. 重試失敗的分析
# ============================================================

@celery.task(bind=True, max_retries=3)
def retry_failed_analysis(self):
    """
    重試失敗的分析任務。

    查找失敗的分析項目並重新加入佇列。
    """
    try:
        logger.info("開始重試失敗的分析任務")

        failed_items = (
            AnalysisQueue.query
            .filter(
                AnalysisQueue.status == "failed",
                AnalysisQueue.retry_count < 3,
            )
            .order_by(AnalysisQueue.created_at)
            .limit(5)
            .all()
        )

        if not failed_items:
            logger.info("無需要重試的失敗項目")
            return {
                "success": True,
                "retried_count": 0,
                "message": "No failed items to retry",
            }

        retried_count = 0

        for item in failed_items:
            try:
                item.status = "pending"
                item.error_message = None
                db.session.commit()
                retried_count += 1
                logger.info(f"重新加入分析佇列：{item.conversation_id}")
            except Exception as e:
                logger.error(f"重試失敗項目出錯 {item.conversation_id}: {e}")
                db.session.rollback()

        if retried_count > 0:
            process_analysis_queue.delay()

        logger.info(f"重試完成，共重試 {retried_count} 個項目")

        return {
            "success": True,
            "retried_count": retried_count,
            "timestamp": datetime.utcnow().isoformat(),
        }

    except Exception as e:
        logger.error(f"重試失敗分析失敗: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat(),
        }


# ============================================================
# 內部 Helper 函數
# ============================================================

def _prepare_conversation_messages(conversation: Conversation) -> list:
    """
    準備對話訊息列表供 LLM 分析使用。

    Args:
        conversation: Conversation 物件

    Returns:
        訊息字典列表
    """
    messages = []
    for message in conversation.messages:
        if message.has_text_content:
            messages.append({
                "sender": message.sender_type,
                "content": message.content,
                "timestamp": message.sent_at.isoformat() if message.sent_at else "",
            })
    return messages


def _save_analysis(
    conversation: Conversation,
    analysis_result: dict,
    usage_info: dict,
    trigger_type: str = "auto",
) -> Analysis:
    """
    將 LLM 分析結果儲存到 DB。

    Args:
        conversation: Conversation 物件
        analysis_result: LLM 回傳的分析結果
        usage_info: 使用資訊（model, tokens 等）
        trigger_type: 觸發類型

    Returns:
        Analysis 物件
    """
    # 從結構化結果中萃取各欄位
    entities = analysis_result.get("entities", {})
    summary = analysis_result.get("summary", {})
    intent = analysis_result.get("intent", {})

    # 處理 suggested_action：合併所有建議動作為一段文字
    suggested_actions = analysis_result.get("suggested_actions", [])
    if isinstance(suggested_actions, list) and suggested_actions:
        action_descriptions = [
            a.get("description", "") for a in suggested_actions if a.get("description")
        ]
        suggested_action_text = "; ".join(action_descriptions)
    elif isinstance(suggested_actions, str):
        suggested_action_text = suggested_actions
    else:
        suggested_action_text = None

    analysis = Analysis(
        conversation_id=conversation.id,
        contact_id=conversation.contact_id,
        # MVP 萃取欄位
        customer_name=entities.get("customer_name"),
        demand_summary=(
            summary.get("text")
            if isinstance(summary, dict)
            else str(summary) if summary else None
        ),
        mentioned_products=entities.get("products_interested", []),
        suggested_tags=analysis_result.get("suggested_tags", []),
        conversation_summary=(
            summary.get("text")
            if isinstance(summary, dict)
            else str(summary) if summary else None
        ),
        suggested_action=suggested_action_text,
        # v2 欄位
        sentiment=(
            summary.get("sentiment")
            if isinstance(summary, dict) else None
        ),
        intent=(
            intent.get("primary")
            if isinstance(intent, dict) else str(intent) if intent else None
        ),
        urgency=(
            summary.get("urgency")
            if isinstance(summary, dict) else None
        ),
        customer_stage=(
            summary.get("customer_stage")
            if isinstance(summary, dict) else None
        ),
        # Meta
        trigger_type=trigger_type,
        model_used=usage_info.get("model_used", "unknown"),
        tokens_used=usage_info.get("tokens_used", 0),
        processing_time_ms=usage_info.get("processing_time_ms", 0),
    )

    db.session.add(analysis)
    db.session.flush()

    return analysis


def _execute_conversation_analysis(conversation_id) -> bool:
    """
    同步執行對話分析（供 process_analysis_queue 使用）。

    Args:
        conversation_id: Conversation UUID

    Returns:
        是否分析成功
    """
    try:
        conversation = db.session.get(Conversation, conversation_id)
        if not conversation:
            logger.error(f"對話不存在：{conversation_id}")
            return False

        # 已有分析結果則跳過
        if conversation.analyses:
            logger.info(f"對話已有分析結果：{conversation_id}")
            return True

        messages = _prepare_conversation_messages(conversation)
        if not messages:
            logger.warning(f"對話無有效訊息：{conversation_id}")
            return False

        # LLM 分析
        llm = get_llm_service()
        analysis_result, usage_info = llm.full_analysis(
            conversation_messages=messages,
            channel=conversation.channel,
            status=conversation.status,
            message_count=conversation.message_count or len(messages),
        )

        # 儲存結果
        _save_analysis(
            conversation=conversation,
            analysis_result=analysis_result,
            usage_info=usage_info,
            trigger_type="auto",
        )

        # 自動打標
        conversation_text = format_conversation_for_prompt(messages)
        AutoTagger.tag_from_analysis(
            contact_id=conversation.contact_id,
            analysis_result=analysis_result,
            conversation_text=conversation_text,
        )

        # 自動建立 Action
        ActionService.create_from_analysis(
            contact_id=conversation.contact_id,
            conversation_id=conversation.id,
            analysis_result=analysis_result,
        )

        return True

    except LLMServiceError as e:
        logger.error(f"LLM 分析失敗 {conversation_id}: {e}")
        handle_llm_error(
            "llm_error",
            {"error_detail": str(e), "conversation_id": str(conversation_id)},
            str(conversation_id),
        )
        raise

    except Exception as e:
        logger.error(f"分析對話失敗 {conversation_id}: {e}", exc_info=True)
        handle_llm_error(
            "llm_error",
            {"error_detail": str(e), "conversation_id": str(conversation_id)},
            str(conversation_id),
        )
        return False
