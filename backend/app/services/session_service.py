"""
MUSE CRM — Session Service

對話 Session 管理業務邏輯。
"""

import logging
from typing import Optional, Dict, Any
from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError

from ..models import Contact, Conversation
from .. import db
from ..realtime.emitter import emit_scoped

logger = logging.getLogger(__name__)


def _get_min_messages_for_analysis() -> int:
    """取得觸發 LLM 分析的最低訊息數門檻（CRM-017）"""
    from flask import current_app
    from ..models.system_setting import SystemSetting
    val = (
        current_app.config.get('MIN_MESSAGES_FOR_ANALYSIS')
        or SystemSetting.get_int('min_messages_for_analysis', default=3)
    )
    try:
        return int(val)
    except (TypeError, ValueError):
        return 3


class SessionService:
    """對話 Session 服務類別"""
    
    @staticmethod
    def get_or_create_conversation(
        contact: Contact,
        channel: str,
        ad_referral: Optional[Dict[str, Any]] = None,
        timeout_minutes: int = 1440  # 預設 24 小時（PRD §4.1）
    ) -> Conversation:
        """
        取得或建立對話 Session
        
        Args:
            contact: 客戶記錄
            channel: 渠道名稱
            ad_referral: 廣告轉介資訊（可選）
            timeout_minutes: Session 超時時間（分鐘）
            
        Returns:
            對話 Session（新建或現有）
        """
        # 1. 使用 FOR UPDATE 鎖定查詢，防止併發建立重複 Session
        active_conversation = (
            Conversation.query
            .filter_by(
                contact_id=contact.id,
                channel=channel,
                status='active'
            )
            .order_by(Conversation.started_at.desc())
            .with_for_update()
            .first()
        )

        if active_conversation:
            # 檢查是否已超時
            if not active_conversation.is_expired:
                logger.info(f"使用現有活躍對話：{active_conversation.id}")
                return active_conversation
            else:
                # 對話已超時，自動關閉
                logger.info(f"對話已超時，自動關閉：{active_conversation.id}")
                active_conversation.close_conversation()
                db.session.flush()

        # 2. 建立新對話
        logger.info(f"為客戶 {contact.id} 建立新對話 Session")

        conversation = Conversation(
            contact_id=contact.id,
            channel=channel,
            status='active',
            started_at=datetime.now(timezone.utc),
            timeout_minutes=timeout_minutes,
            ad_referral=ad_referral
        )

        try:
            db.session.add(conversation)
            db.session.flush()  # 取得 conversation.id，唯一約束在此觸發
        except IntegrityError:
            # 併發情況下唯一約束衝突，回滾並重新查詢
            db.session.rollback()
            logger.info(f"併發建立衝突，重新查詢活躍對話：contact={contact.id}")
            active_conversation = Conversation.query.filter_by(
                contact_id=contact.id,
                channel=channel,
                status='active'
            ).order_by(Conversation.started_at.desc()).first()
            if active_conversation:
                return active_conversation
            # 極端情況：重新建立（若再次衝突則拋出例外）
            try:
                conversation = Conversation(
                    contact_id=contact.id,
                    channel=channel,
                    status='active',
                    started_at=datetime.now(timezone.utc),
                    timeout_minutes=timeout_minutes,
                    ad_referral=ad_referral
                )
                db.session.add(conversation)
                db.session.flush()
            except IntegrityError:
                db.session.rollback()
                logger.warning(f"二次建立衝突，再次查詢：contact={contact.id}")
                return Conversation.query.filter_by(
                    contact_id=contact.id,
                    channel=channel,
                    status='active'
                ).order_by(Conversation.started_at.desc()).first()

        logger.info(f"新對話 Session 已建立：{conversation.id}")
        return conversation
    
    @staticmethod
    def close_conversation(conversation_id: str, reason: str = 'manual') -> bool:
        """
        關閉對話 Session
        
        Args:
            conversation_id: 對話 ID
            reason: 關閉原因 ('manual', 'timeout', 'system')
            
        Returns:
            是否成功關閉
        """
        conversation = Conversation.query.get(conversation_id)
        if not conversation:
            return False
        
        if conversation.status != 'active':
            return False
        
        try:
            conversation.close_conversation()
            db.session.commit()
            
            logger.info(f"對話已關閉：{conversation_id}, 原因：{reason}")

            # WebSocket 推送 session_closed
            try:
                contact = db.session.get(Contact, conversation.contact_id)
                contact_name = contact.display_name if contact else '未知客戶'
                emit_scoped(
                    event='session_closed',
                    data={
                        'conversation_id': conversation_id,
                        'contact_name': contact_name,
                        'message_count': conversation.message_count or 0,
                    },
                    assigned_user_id=getattr(contact, 'assigned_to', None) if contact else None,
                    team_id=None,
                )
            except Exception as ws_err:
                logger.warning(f"[close_conversation] WebSocket 推送失敗: {ws_err}")

            # 觸發 LLM 分析（如果尚未分析且訊息量足夠）
            # CRM-017: 短對話跳過分析，避免浪費 LLM token
            min_messages = _get_min_messages_for_analysis()
            msg_count = conversation.message_count or 0
            if reason in ('manual', 'timeout') and not conversation.analyses:
                if msg_count >= min_messages:
                    from ..tasks.analysis_tasks import analyze_conversation
                    analyze_conversation.delay(str(conversation_id), 'auto')
                else:
                    logger.info(
                        f"跳過分析：conversation={conversation_id} "
                        f"訊息數 {msg_count} < 門檻 {min_messages}"
                    )
            
            return True
            
        except Exception as e:
            db.session.rollback()
            logger.error(f"關閉對話失敗：{e}", exc_info=True)
            return False
    
    @staticmethod
    def cleanup_expired_conversations() -> int:
        """
        清理過期的對話 Session
        
        Returns:
            關閉的對話數量
        """
        # 查找所有活躍但已過期的對話
        expired_conversations = (
            Conversation.query
            .filter(
                Conversation.status == 'active',
                Conversation.last_message_at.isnot(None)
            )
            .all()
        )
        
        closed_count = 0
        
        for conv in expired_conversations:
            if conv.is_expired:
                try:
                    conv.close_conversation()
                    closed_count += 1
                    
                    # 觸發 LLM 分析（短對話跳過，CRM-017）
                    _min_msgs = _get_min_messages_for_analysis()
                    conv_msg_count = conv.message_count or 0
                    if not conv.analyses and conv_msg_count >= _min_msgs:
                        from ..tasks.analysis_tasks import analyze_conversation
                        analyze_conversation.delay(str(conv.id), 'auto')
                        
                except Exception as e:
                    logger.error(f"清理過期對話失敗 {conv.id}: {e}")
                    continue
        
        if closed_count > 0:
            try:
                db.session.commit()
                logger.info(f"已清理 {closed_count} 個過期對話")
            except Exception as e:
                db.session.rollback()
                logger.error(f"提交清理結果失敗：{e}")
                closed_count = 0
        
        return closed_count
    
    @staticmethod
    def get_conversation_summary(conversation_id: str) -> Optional[Dict[str, Any]]:
        """
        取得對話摘要資訊
        
        Args:
            conversation_id: 對話 ID
            
        Returns:
            對話摘要字典或 None
        """
        conversation = Conversation.query.get(conversation_id)
        if not conversation:
            return None
        
        # 基本對話資訊
        summary = conversation.to_dict()
        summary['contact'] = conversation.contact.to_dict()
        
        # 統計資訊
        summary['total_messages'] = len(conversation.messages)
        summary['customer_messages'] = len([
            msg for msg in conversation.messages 
            if msg.sender_type == 'customer'
        ])
        summary['business_messages'] = len([
            msg for msg in conversation.messages 
            if msg.sender_type == 'business'
        ])
        
        # 對話持續時間
        if conversation.closed_at:
            duration = conversation.closed_at - conversation.started_at
        else:
            duration = datetime.now(timezone.utc) - conversation.started_at
        
        summary['duration_minutes'] = int(duration.total_seconds() / 60)
        
        # 最新分析結果
        latest_analysis = (
            conversation.analyses[0] 
            if conversation.analyses 
            else None
        )
        summary['latest_analysis'] = (
            latest_analysis.to_dict() 
            if latest_analysis 
            else None
        )
        
        # 相關動作
        summary['actions'] = [
            action.to_dict() 
            for action in conversation.actions
        ]
        
        return summary
    
    @staticmethod
    def extend_conversation_timeout(conversation_id: str, additional_minutes: int) -> bool:
        """
        延長對話 Session 超時時間
        
        Args:
            conversation_id: 對話 ID
            additional_minutes: 額外的分鐘數
            
        Returns:
            是否成功延長
        """
        conversation = Conversation.query.get(conversation_id)
        if not conversation or conversation.status != 'active':
            return False
        
        try:
            conversation.timeout_minutes += additional_minutes
            db.session.commit()
            
            logger.info(f"對話 {conversation_id} 超時時間已延長 {additional_minutes} 分鐘")
            return True
            
        except Exception as e:
            db.session.rollback()
            logger.error(f"延長對話超時時間失敗：{e}", exc_info=True)
            return False