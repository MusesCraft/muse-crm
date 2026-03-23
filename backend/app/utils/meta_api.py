"""
MUSE CRM — Meta Graph API 工具

Meta Business API 相關工具函數。
"""

import logging
import requests
from typing import Dict, Any, Optional
from flask import current_app

logger = logging.getLogger(__name__)


class MetaGraphAPI:
    """Meta Graph API 工具類別"""
    
    def __init__(self):
        self.base_url = "https://graph.facebook.com/v21.0"
        self.timeout = 10
    
    @property
    def access_token(self) -> Optional[str]:
        """取得 Page Access Token"""
        return current_app.config.get('META_PAGE_TOKEN')
    
    def get_user_profile(self, user_id: str) -> Optional[Dict[str, Any]]:
        """
        取得使用者基本資料
        
        Args:
            user_id: Meta 平台使用者 ID (PSID)
            
        Returns:
            使用者資料字典或 None
        """
        if not self.access_token:
            logger.warning("Missing META_PAGE_TOKEN")
            return None
        
        try:
            url = f"{self.base_url}/{user_id}"
            params = {
                'fields': 'name,first_name,last_name,profile_pic',
                'access_token': self.access_token
            }
            
            response = requests.get(url, params=params, timeout=self.timeout)
            response.raise_for_status()
            
            profile = response.json()
            logger.info(f"成功取得用戶資料：{user_id}")
            
            return profile
            
        except requests.exceptions.RequestException as e:
            logger.error(f"取得用戶資料失敗 {user_id}: {e}")
            return None
        except Exception as e:
            logger.error(f"解析用戶資料失敗 {user_id}: {e}")
            return None
    
    def send_message(self, recipient_id: str, message_text: str) -> bool:
        """
        發送訊息給使用者（預留功能，CRM 可能不需要主動發送）
        
        Args:
            recipient_id: 收件人 ID
            message_text: 訊息內容
            
        Returns:
            是否發送成功
        """
        if not self.access_token:
            logger.warning("Missing META_PAGE_TOKEN")
            return False
        
        try:
            url = f"{self.base_url}/me/messages"
            params = {'access_token': self.access_token}
            payload = {
                'recipient': {'id': recipient_id},
                'message': {'text': message_text}
            }
            
            response = requests.post(
                url, 
                params=params, 
                json=payload, 
                timeout=self.timeout
            )
            response.raise_for_status()
            
            logger.info(f"訊息發送成功：{recipient_id}")
            return True
            
        except requests.exceptions.RequestException as e:
            logger.error(f"訊息發送失敗 {recipient_id}: {e}")
            return False
        except Exception as e:
            logger.error(f"訊息發送處理失敗 {recipient_id}: {e}")
            return False
    
    def send_image(self, recipient_id: str, image_url: str) -> bool:
        """
        發送圖片給使用者
        
        Args:
            recipient_id: 收件人 ID
            image_url: 圖片 URL
            
        Returns:
            是否發送成功
        """
        if not self.access_token:
            logger.warning("Missing META_PAGE_TOKEN")
            return False
        
        try:
            url = f"{self.base_url}/me/messages"
            params = {'access_token': self.access_token}
            payload = {
                'recipient': {'id': recipient_id},
                'message': {
                    'attachment': {
                        'type': 'image',
                        'payload': {
                            'url': image_url,
                            'is_reusable': True
                        }
                    }
                }
            }
            
            response = requests.post(
                url,
                params=params,
                json=payload,
                timeout=self.timeout
            )
            response.raise_for_status()
            
            logger.info(f"圖片發送成功：{recipient_id}")
            return True
            
        except requests.exceptions.RequestException as e:
            logger.error(f"圖片發送失敗 {recipient_id}: {e}")
            return False
        except Exception as e:
            logger.error(f"圖片發送處理失敗 {recipient_id}: {e}")
            return False

    def get_page_info(self) -> Optional[Dict[str, Any]]:
        """
        取得粉絲專頁資訊
        
        Returns:
            粉絲專頁資訊字典或 None
        """
        if not self.access_token:
            logger.warning("Missing META_PAGE_TOKEN")
            return None
        
        try:
            url = f"{self.base_url}/me"
            params = {
                'fields': 'id,name,username,category,verification_status',
                'access_token': self.access_token
            }
            
            response = requests.get(url, params=params, timeout=self.timeout)
            response.raise_for_status()
            
            page_info = response.json()
            logger.info(f"成功取得粉絲專頁資訊：{page_info.get('name')}")
            
            return page_info
            
        except requests.exceptions.RequestException as e:
            logger.error(f"取得粉絲專頁資訊失敗: {e}")
            return None
        except Exception as e:
            logger.error(f"解析粉絲專頁資訊失敗: {e}")
            return None
    
    def get_ids_for_apps(self, user_id: str) -> Optional[str]:
        """
        透過 Meta Graph API 取得使用者的 App-Scoped User ID。

        呼叫 /{user-id}?fields=ids_for_apps 取得 ASID。

        Args:
            user_id: 使用者的 PSID 或 IGSID

        Returns:
            ASID 或 None
        """
        if not self.access_token:
            logger.warning("Missing META_PAGE_TOKEN，無法取得 ASID")
            return None

        try:
            url = f"{self.base_url}/{user_id}"
            params = {
                'fields': 'ids_for_apps',
                'access_token': self.access_token
            }

            response = requests.get(url, params=params, timeout=self.timeout)
            response.raise_for_status()

            data = response.json()
            ids_for_apps = data.get('ids_for_apps', {}).get('data', [])

            if ids_for_apps:
                # 取第一個 app 的 id 作為 ASID
                asid = ids_for_apps[0].get('id')
                logger.info(f"成功取得 ASID：user={user_id}, asid={asid}")
                return asid

            logger.debug(f"使用者無 ids_for_apps 資料：{user_id}")
            return None

        except requests.exceptions.RequestException as e:
            logger.warning(f"取得 ASID 失敗 {user_id}: {e}")
            return None

    def get_id_match(
        self,
        user_id: str,
        source_app_id: str,
        target_app_id: str
    ) -> Optional[str]:
        """
        透過 Meta Graph API 的 id_match endpoint 查詢跨 App 身份對應。

        API: GET /{app-id}/id_matches?id={user_id}&app_id={target_app_id}

        Args:
            user_id: 使用者在來源 App 的 ID
            source_app_id: 來源 App ID
            target_app_id: 目標 App ID

        Returns:
            目標 App 中的使用者 ID，或 None
        """
        if not self.access_token:
            logger.warning("Missing META_PAGE_TOKEN，無法查詢 id_match")
            return None

        try:
            url = f"{self.base_url}/{source_app_id}/id_matches"
            params = {
                'id': user_id,
                'app_id': target_app_id,
                'access_token': self.access_token
            }

            response = requests.get(url, params=params, timeout=self.timeout)
            response.raise_for_status()

            data = response.json()
            matches = data.get('data', [])

            if matches:
                matched_id = matches[0].get('id')
                logger.info(
                    f"id_match 成功：user={user_id}, "
                    f"source_app={source_app_id} → target_app={target_app_id}, "
                    f"matched_id={matched_id}"
                )
                return matched_id

            logger.debug(f"id_match 無匹配：user={user_id}")
            return None

        except requests.exceptions.RequestException as e:
            logger.warning(f"id_match 查詢失敗：{e}")
            return None

    def validate_webhook_token(self, verify_token: str) -> bool:
        """
        驗證 Webhook Token（用於設定檢查）
        
        Args:
            verify_token: 要驗證的 token
            
        Returns:
            是否為有效的 token
        """
        expected_token = current_app.config.get('META_VERIFY_TOKEN')
        return verify_token == expected_token if expected_token else False


# 單例實例
meta_api = MetaGraphAPI()