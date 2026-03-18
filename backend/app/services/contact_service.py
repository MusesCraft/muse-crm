"""
MUSE CRM — Contact Service

客戶管理業務邏輯。
"""

import logging
from typing import Optional, Dict, Any
from datetime import datetime

from ..models import Contact, ChannelIdentifier, db

logger = logging.getLogger(__name__)


class ContactService:
    """客戶服務類別"""
    
    @staticmethod
    def get_or_create_contact(
        channel: str, 
        external_id: str, 
        profile_data: Optional[Dict[str, Any]] = None,
        ad_referral_info: Optional[Dict[str, Any]] = None
    ) -> Contact:
        """
        取得或建立客戶記錄
        
        Args:
            channel: 渠道名稱 (messenger/instagram/line)
            external_id: 外部平台 ID (PSID/ASID/LINE User ID)
            profile_data: 渠道特定的 profile 資料
            ad_referral_info: 廣告轉介資訊
            
        Returns:
            客戶記錄（新建或現有）
        """
        # 1. 先嘗試透過渠道身份找到現有客戶
        channel_id = ChannelIdentifier.query.filter_by(
            channel=channel,
            external_id=external_id
        ).first()
        
        if channel_id:
            contact = channel_id.contact
            logger.info(f"找到現有客戶：{contact.id}")
            
            # 更新最後活躍時間
            contact.last_active_at = datetime.utcnow()
            
            # 更新 profile 資料（如有）
            if profile_data:
                channel_id.profile_data = profile_data
            
            return contact
        
        # 2. 嘗試透過 ASID 跨渠道合併（僅限 Meta 平台）
        asid = None
        if channel in ('messenger', 'instagram') and profile_data:
            asid = profile_data.get('asid')
        
        if asid:
            existing_channel_id = ChannelIdentifier.query.filter_by(asid=asid).first()
            if existing_channel_id:
                contact = existing_channel_id.contact
                logger.info(f"透過 ASID 找到現有客戶，進行跨渠道合併：{contact.id}")
                
                # 為此客戶新增新的渠道身份
                new_channel_id = ChannelIdentifier(
                    contact_id=contact.id,
                    channel=channel,
                    external_id=external_id,
                    asid=asid,
                    profile_data=profile_data
                )
                db.session.add(new_channel_id)
                
                # 更新最後活躍時間
                contact.last_active_at = datetime.utcnow()
                
                return contact
        
        # 3. 建立新客戶
        logger.info(f"建立新客戶：channel={channel}, external_id={external_id}")
        
        # 從 profile_data 提取基本資訊
        display_name = None
        avatar_url = None
        locale = None
        
        if profile_data:
            display_name = (
                profile_data.get('name') or 
                profile_data.get('display_name') or 
                f"{profile_data.get('first_name', '')} {profile_data.get('last_name', '')}".strip()
            )
            avatar_url = profile_data.get('profile_pic') or profile_data.get('avatar_url')
            locale = profile_data.get('locale')
        
        # 判斷來源類型
        source_type = 'ad_referral' if ad_referral_info else 'organic'
        
        contact = Contact(
            display_name=display_name,
            avatar_url=avatar_url,
            locale=locale,
            source_channel=channel,
            source_type=source_type,
            first_seen_at=datetime.utcnow(),
            last_active_at=datetime.utcnow()
        )
        
        db.session.add(contact)
        db.session.flush()  # 取得 contact.id
        
        # 建立渠道身份記錄
        channel_identifier = ChannelIdentifier(
            contact_id=contact.id,
            channel=channel,
            external_id=external_id,
            asid=asid,
            profile_data=profile_data
        )
        
        db.session.add(channel_identifier)
        
        logger.info(f"新客戶已建立：{contact.id}")
        return contact
    
    @staticmethod
    def merge_contacts(source_contact_id: str, target_contact_id: str) -> bool:
        """
        合併客戶記錄
        
        Args:
            source_contact_id: 來源客戶 ID（將被合併）
            target_contact_id: 目標客戶 ID（保留）
            
        Returns:
            是否成功合併
        """
        source_contact = Contact.query.get(source_contact_id)
        target_contact = Contact.query.get(target_contact_id)
        
        if not source_contact or not target_contact:
            return False
        
        if source_contact.is_merged or target_contact.is_merged:
            return False
        
        try:
            # 1. 將來源客戶的所有渠道身份轉移到目標客戶
            for channel_id in source_contact.channel_identifiers:
                channel_id.contact_id = target_contact.id
            
            # 2. 將來源客戶的所有對話轉移到目標客戶
            for conversation in source_contact.conversations:
                conversation.contact_id = target_contact.id
            
            # 3. 將來源客戶的所有訊息轉移到目標客戶
            for message in source_contact.messages:
                message.contact_id = target_contact.id
            
            # 4. 將來源客戶的所有分析結果轉移到目標客戶
            for analysis in source_contact.analyses:
                analysis.contact_id = target_contact.id
            
            # 5. 將來源客戶的所有動作轉移到目標客戶
            for action in source_contact.actions:
                action.contact_id = target_contact.id
            
            # 6. 合併標籤（避免重複）
            source_tag_ids = {ct.tag_id for ct in source_contact.tags}
            target_tag_ids = {ct.tag_id for ct in target_contact.tags}
            
            for contact_tag in source_contact.tags:
                if contact_tag.tag_id not in target_tag_ids:
                    contact_tag.contact_id = target_contact.id
                else:
                    db.session.delete(contact_tag)
            
            # 7. 將來源客戶的所有備註轉移到目標客戶
            for note in source_contact.notes_by_users:
                note.contact_id = target_contact.id
            
            # 8. 標記來源客戶為已合併
            source_contact.is_merged = True
            source_contact.merged_into_id = target_contact.id
            
            # 9. 更新目標客戶的時間戳記
            if source_contact.first_seen_at < target_contact.first_seen_at:
                target_contact.first_seen_at = source_contact.first_seen_at
            
            if source_contact.last_active_at > target_contact.last_active_at:
                target_contact.last_active_at = source_contact.last_active_at
            
            db.session.commit()
            
            logger.info(f"客戶合併成功：{source_contact_id} -> {target_contact_id}")
            return True
            
        except Exception as e:
            db.session.rollback()
            logger.error(f"客戶合併失敗：{e}", exc_info=True)
            return False
    
    @staticmethod
    def update_contact_profile(contact_id: str, **kwargs) -> bool:
        """
        更新客戶資料
        
        Args:
            contact_id: 客戶 ID
            **kwargs: 要更新的欄位
            
        Returns:
            是否成功更新
        """
        contact = Contact.query.get(contact_id)
        if not contact or contact.is_merged:
            return False
        
        try:
            allowed_fields = [
                'display_name', 'avatar_url', 'locale', 'notes', 
                'external_crm_id'
            ]
            
            for field, value in kwargs.items():
                if field in allowed_fields:
                    setattr(contact, field, value)
            
            contact.updated_at = datetime.utcnow()
            db.session.commit()
            
            return True
            
        except Exception as e:
            db.session.rollback()
            logger.error(f"更新客戶資料失敗：{e}", exc_info=True)
            return False