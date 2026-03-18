"""
MUSE CRM — Cross-Channel Merge Service

跨渠道客戶合併服務。
利用 Meta Graph API 的 id_match endpoint 和 ASID 進行 Messenger ↔ Instagram 身份合併。

Phase 2: Service 層 stub — 建立介面和基本邏輯。
Phase 3: 實作 Meta id_match API 呼叫和自動合併觸發。
"""

import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime

from ..models import Contact, ChannelIdentifier
from ..services.contact_service import ContactService
from ..utils.meta_api import meta_api
from .. import db

logger = logging.getLogger(__name__)


class MergeService:
    """跨渠道客戶合併服務"""
    
    # ──────────────────────────────────────────────
    # 1. 自動合併檢測（webhook 觸發時呼叫）
    # ──────────────────────────────────────────────
    
    @staticmethod
    def check_and_merge_on_message(
        channel: str,
        external_id: str,
        contact: Contact
    ) -> Optional[Contact]:
        """
        當收到新訊息時，檢查是否有跨渠道合併的機會。
        
        Phase 2 邏輯：
        1. 查看該 contact 的 channel_identifiers
        2. 如果只有一個渠道身份，嘗試透過 ASID 找到其他渠道的身份
        3. 找到匹配 → 執行合併
        
        Args:
            channel: 當前訊息的渠道 (messenger/instagram)
            external_id: 當前渠道的外部 ID
            contact: 當前訊息的聯絡人
            
        Returns:
            合併後的 Contact（如有合併）或 None（無需合併）
        """
        try:
            # 只處理 Meta 平台（Messenger + Instagram）
            if channel not in ('messenger', 'instagram'):
                return None
            
            # 如果已經被合併過，不處理
            if contact.is_merged:
                return None
            
            # 取得該 contact 的所有渠道身份
            channel_ids = ChannelIdentifier.query.filter_by(
                contact_id=contact.id
            ).all()
            
            # 已有多渠道身份 → 已合併，不需再處理
            channels_present = {ci.channel for ci in channel_ids}
            if len(channels_present) > 1:
                return None
            
            # 嘗試透過 ASID 匹配
            current_ci = next(
                (ci for ci in channel_ids if ci.channel == channel and ci.external_id == external_id),
                None
            )
            
            if not current_ci or not current_ci.asid:
                # 嘗試從 Meta API 取得 ASID（Phase 3 實作）
                asid = _fetch_asid_from_meta(channel, external_id)
                if asid and current_ci:
                    current_ci.asid = asid
                    db.session.flush()
                else:
                    return None
            else:
                asid = current_ci.asid
            
            # 用 ASID 查找其他渠道的身份
            matching_ci = ChannelIdentifier.query.filter(
                ChannelIdentifier.asid == asid,
                ChannelIdentifier.contact_id != contact.id
            ).first()
            
            if not matching_ci:
                return None
            
            # 找到匹配！執行合併
            other_contact = matching_ci.contact
            if other_contact.is_merged:
                return None
            
            logger.info(
                f"🔗 [merge] 發現跨渠道匹配！"
                f"Contact {contact.id} ({channel}) ↔ Contact {other_contact.id} ({matching_ci.channel})"
            )
            
            # 決定保留哪個（保留較早建立的）
            if contact.first_seen_at <= other_contact.first_seen_at:
                target, source = contact, other_contact
            else:
                target, source = other_contact, contact
            
            success = ContactService.merge_contacts(
                source_contact_id=str(source.id),
                target_contact_id=str(target.id)
            )
            
            if success:
                logger.info(f"✅ [merge] 合併成功：{source.id} → {target.id}")
                return target
            else:
                logger.warning(f"⚠️ [merge] 合併失敗：{source.id} → {target.id}")
                return None
                
        except Exception as e:
            logger.error(f"❌ [merge] 合併檢測失敗：{e}", exc_info=True)
            return None
    
    # ──────────────────────────────────────────────
    # 2. Meta id_match API 查詢（Phase 3 實作）
    # ──────────────────────────────────────────────
    
    @staticmethod
    def query_id_match(
        user_id: str, 
        source_app_id: str,
        target_app_id: str
    ) -> Optional[str]:
        """
        透過 Meta Graph API 的 id_match endpoint 查詢跨 App 身份對應。
        
        Phase 2: Stub — 僅記錄呼叫，不實際請求 API。
        Phase 3: 實作實際的 API 呼叫。
        
        API Endpoint: GET /{app-id}/id_matches
        Docs: https://developers.facebook.com/docs/messenger-platform/identity/id-matching/
        
        Args:
            user_id: 使用者在來源 App 的 ID
            source_app_id: 來源 App ID
            target_app_id: 目標 App ID（要查詢對應 ID 的 App）
            
        Returns:
            目標 App 中的使用者 ID，或 None
        """
        logger.info(
            f"🔍 [id_match] Stub 呼叫："
            f"user={user_id}, source_app={source_app_id}, target_app={target_app_id}"
        )
        
        # TODO Phase 3: 實作 Meta Graph API 呼叫
        # url = f"https://graph.facebook.com/v21.0/{source_app_id}/id_matches"
        # params = {
        #     'id': user_id,
        #     'app_id': target_app_id,
        #     'access_token': access_token,
        # }
        # response = requests.get(url, params=params)
        # matched_id = response.json().get('data', [{}])[0].get('id')
        
        return None
    
    # ──────────────────────────────────────────────
    # 3. 批量合併掃描（定期任務用）
    # ──────────────────────────────────────────────
    
    @staticmethod
    def scan_for_merge_candidates() -> List[Tuple[str, str]]:
        """
        掃描資料庫中可能需要合併的客戶。
        
        Phase 2: Stub — 基於 ASID 匹配查詢。
        
        Returns:
            可合併的 (source_contact_id, target_contact_id) 對列表
        """
        candidates = []
        
        try:
            # 查找有 ASID 的 channel_identifiers
            identifiers_with_asid = (
                ChannelIdentifier.query
                .filter(ChannelIdentifier.asid.isnot(None))
                .all()
            )
            
            # 按 ASID 分組
            asid_groups: Dict[str, List[ChannelIdentifier]] = {}
            for ci in identifiers_with_asid:
                if ci.asid not in asid_groups:
                    asid_groups[ci.asid] = []
                asid_groups[ci.asid].append(ci)
            
            # 找出同一 ASID 對應多個 contact 的情況
            for asid, cis in asid_groups.items():
                unique_contacts = set()
                for ci in cis:
                    if not ci.contact.is_merged:
                        unique_contacts.add(ci.contact_id)
                
                if len(unique_contacts) > 1:
                    contact_ids = sorted(unique_contacts, key=str)
                    # 第一個作為 target，其餘作為 source
                    target_id = contact_ids[0]
                    for source_id in contact_ids[1:]:
                        candidates.append((str(source_id), str(target_id)))
                        logger.info(
                            f"🔍 [merge] 發現合併候選：{source_id} → {target_id} (ASID: {asid})"
                        )
            
            logger.info(f"🔍 [merge] 掃描完成，發現 {len(candidates)} 組合併候選")
            
        except Exception as e:
            logger.error(f"❌ [merge] 掃描合併候選失敗：{e}", exc_info=True)
        
        return candidates
    
    # ──────────────────────────────────────────────
    # 4. 合併紀錄查詢
    # ──────────────────────────────────────────────
    
    @staticmethod
    def get_merge_history(contact_id: str) -> Dict[str, Any]:
        """
        取得客戶的合併歷史。
        
        Args:
            contact_id: 客戶 ID
            
        Returns:
            合併歷史資訊
        """
        contact = Contact.query.get(contact_id)
        if not contact:
            return {'error': 'Contact not found'}
        
        result = {
            'contact_id': str(contact.id),
            'is_merged': contact.is_merged,
            'merged_into_id': str(contact.merged_into_id) if contact.merged_into_id else None,
            'channel_identifiers': [
                {
                    'channel': ci.channel,
                    'external_id': ci.external_id,
                    'asid': ci.asid,
                }
                for ci in contact.channel_identifiers
            ],
        }
        
        # 查找被合併到此 contact 的其他 contacts
        merged_from = Contact.query.filter_by(
            merged_into_id=contact.id,
            is_merged=True
        ).all()
        
        result['merged_from'] = [
            {
                'contact_id': str(mc.id),
                'display_name': mc.display_name,
                'source_channel': mc.source_channel,
            }
            for mc in merged_from
        ]
        
        return result


def _fetch_asid_from_meta(channel: str, external_id: str) -> Optional[str]:
    """
    從 Meta Graph API 取得 App-Scoped User ID。
    
    Phase 2: Stub — 返回 None。
    Phase 3: 實作 API 呼叫。
    
    Args:
        channel: 渠道名稱
        external_id: 平台外部 ID
        
    Returns:
        ASID 或 None
    """
    logger.debug(f"[merge] _fetch_asid_from_meta stub: channel={channel}, id={external_id}")
    
    # TODO Phase 3: 透過 Meta Graph API 取得 ASID
    # 可能需要呼叫 /{user-id}?fields=ids_for_apps
    
    return None
