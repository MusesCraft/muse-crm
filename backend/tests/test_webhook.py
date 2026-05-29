"""
MUSE CRM — Webhook 測試模組

測試 Meta Webhook 接收和處理邏輯，包括：
- Messenger 文字訊息
- Instagram DM 文字訊息
- 帶圖片的訊息
- 帶 Ad Referral 的訊息
- 冪等性驗證
- Contact 自動建立
- Conversation 自動建立
"""

import unittest
import json
import hashlib
import hmac
from datetime import datetime
from unittest.mock import patch, MagicMock

from flask import Flask
from app import create_app, db
from app.models import Contact, ChannelIdentifier, Conversation, Message


class WebhookTestCase(unittest.TestCase):
    """Webhook 測試案例"""
    
    @classmethod
    def setUpClass(cls):
        """建立測試應用和資料庫"""
        cls.app = create_app('testing')
        cls.app_context = cls.app.app_context()
        cls.app_context.push()
        
        # 建立測試資料庫表
        db.create_all()
        
        # 測試客戶端
        cls.client = cls.app.test_client()
        
        # 測試配置
        cls.verify_token = 'test_verify_token'
        cls.app_secret = 'test_app_secret'
        cls.app.config.update({
            'META_VERIFY_TOKEN': cls.verify_token,
            'META_APP_SECRET': cls.app_secret,
            'META_PAGE_TOKEN': 'test_page_token'
        })
    
    @classmethod
    def tearDownClass(cls):
        """清理測試環境"""
        db.drop_all()
        cls.app_context.pop()
    
    def setUp(self):
        """每個測試前清理資料庫"""
        db.session.query(Message).delete()
        db.session.query(Conversation).delete()
        db.session.query(ChannelIdentifier).delete()
        db.session.query(Contact).delete()
        db.session.commit()
    
    def _generate_signature(self, payload: str) -> str:
        """生成測試用的 HMAC 簽名"""
        return 'sha256=' + hmac.new(
            self.app_secret.encode(),
            payload.encode(),
            hashlib.sha256
        ).hexdigest()
    
    def test_webhook_verification_success(self):
        """測試 Webhook 驗證成功"""
        response = self.client.get('/api/webhook', query_string={
            'hub.mode': 'subscribe',
            'hub.verify_token': self.verify_token,
            'hub.challenge': 'test_challenge'
        })
        
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_data(as_text=True), 'test_challenge')
    
    def test_webhook_verification_failure(self):
        """測試 Webhook 驗證失敗"""
        response = self.client.get('/api/webhook', query_string={
            'hub.mode': 'subscribe',
            'hub.verify_token': 'wrong_token',
            'hub.challenge': 'test_challenge'
        })
        
        self.assertEqual(response.status_code, 403)
    
    @patch('app.utils.meta_api.meta_api.get_user_profile')
    def test_messenger_text_message(self, mock_profile):
        """測試 Messenger 文字訊息處理"""
        # Mock profile API 回應
        mock_profile.return_value = {
            'name': 'John Doe',
            'first_name': 'John',
            'last_name': 'Doe',
            'profile_pic': 'https://example.com/profile.jpg'
        }
        
        # 準備測試 payload
        payload = {
            'object': 'page',
            'entry': [{
                'id': 'page_id',
                'messaging': [{
                    'sender': {'id': 'sender_123'},
                    'recipient': {'id': 'page_id'},
                    'timestamp': int(datetime.now().timestamp() * 1000),
                    'message': {
                        'mid': 'msg_123',
                        'text': 'Hello, this is a test message!'
                    }
                }]
            }]
        }
        
        payload_str = json.dumps(payload)
        signature = self._generate_signature(payload_str)
        
        # 發送 webhook
        response = self.client.post(
            '/api/webhook',
            data=payload_str,
            headers={
                'Content-Type': 'application/json',
                'X-Hub-Signature-256': signature
            }
        )
        
        self.assertEqual(response.status_code, 200)
        
        # 等待背景處理完成（簡化測試，直接檢查資料庫）
        import time
        time.sleep(0.5)
        
        # 驗證 Contact 已建立
        contact = Contact.query.first()
        self.assertIsNotNone(contact)
        self.assertEqual(contact.display_name, 'John Doe')
        self.assertEqual(contact.source_channel, 'messenger')
        
        # 驗證 ChannelIdentifier 已建立
        channel_id = ChannelIdentifier.query.first()
        self.assertIsNotNone(channel_id)
        self.assertEqual(channel_id.channel, 'messenger')
        self.assertEqual(channel_id.external_id, 'sender_123')
        
        # 驗證 Conversation 已建立
        conversation = Conversation.query.first()
        self.assertIsNotNone(conversation)
        self.assertEqual(conversation.contact_id, contact.id)
        self.assertEqual(conversation.channel, 'messenger')
        self.assertEqual(conversation.status, 'active')
        
        # 驗證 Message 已建立
        message = Message.query.first()
        self.assertIsNotNone(message)
        self.assertEqual(message.conversation_id, conversation.id)
        self.assertEqual(message.sender_type, 'customer')
        self.assertEqual(message.message_type, 'text')
        self.assertEqual(message.content, 'Hello, this is a test message!')
        self.assertEqual(message.meta_message_id, 'msg_123')
    
    @patch('app.utils.meta_api.meta_api.get_user_profile')
    def test_instagram_message(self, mock_profile):
        """測試 Instagram DM 訊息處理"""
        # Mock profile API 回應
        mock_profile.return_value = {
            'name': 'Jane Smith',
            'profile_pic': 'https://example.com/jane_profile.jpg'
        }
        
        # Instagram webhook payload 結構
        payload = {
            'object': 'instagram',
            'entry': [{
                'id': 'ig_page_id',
                'changes': [{
                    'field': 'messages',
                    'value': {
                        'from': {'id': 'ig_sender_456'},
                        'to': {'id': 'ig_page_id'},
                        'message': {
                            'mid': 'ig_msg_456',
                            'text': 'Hello from Instagram DM!'
                        },
                        'timestamp': int(datetime.now().timestamp() * 1000)
                    }
                }]
            }]
        }
        
        payload_str = json.dumps(payload)
        signature = self._generate_signature(payload_str)
        
        # 發送 webhook
        response = self.client.post(
            '/api/webhook',
            data=payload_str,
            headers={
                'Content-Type': 'application/json',
                'X-Hub-Signature-256': signature
            }
        )
        
        self.assertEqual(response.status_code, 200)
        
        # 等待背景處理完成
        import time
        time.sleep(0.5)
        
        # 驗證客戶記錄
        contact = Contact.query.first()
        self.assertIsNotNone(contact)
        self.assertEqual(contact.display_name, 'Jane Smith')
        self.assertEqual(contact.source_channel, 'instagram')
        
        # 驗證渠道身份
        channel_id = ChannelIdentifier.query.first()
        self.assertEqual(channel_id.channel, 'instagram')
        self.assertEqual(channel_id.external_id, 'ig_sender_456')
    
    def test_message_with_image_attachment(self):
        """測試帶圖片附件的訊息"""
        payload = {
            'object': 'page',
            'entry': [{
                'messaging': [{
                    'sender': {'id': 'sender_789'},
                    'message': {
                        'mid': 'img_msg_789',
                        'attachments': [{
                            'type': 'image',
                            'payload': {
                                'url': 'https://example.com/image.jpg'
                            }
                        }]
                    }
                }]
            }]
        }
        
        payload_str = json.dumps(payload)
        signature = self._generate_signature(payload_str)
        
        response = self.client.post(
            '/api/webhook',
            data=payload_str,
            headers={
                'Content-Type': 'application/json',
                'X-Hub-Signature-256': signature
            }
        )
        
        self.assertEqual(response.status_code, 200)
        
        import time
        time.sleep(0.5)
        
        # 驗證圖片訊息
        message = Message.query.first()
        self.assertIsNotNone(message)
        self.assertEqual(message.message_type, 'image')
        self.assertEqual(message.media_url, 'https://example.com/image.jpg')
        self.assertIsNotNone(message.metadata)
    
    def test_message_with_ad_referral(self):
        """測試帶廣告轉介的訊息"""
        payload = {
            'object': 'page',
            'entry': [{
                'messaging': [{
                    'sender': {'id': 'sender_ad_123'},
                    'message': {
                        'mid': 'ad_msg_123',
                        'text': 'I came from an ad!',
                        'referral': {
                            'ref': 'summer_campaign',
                            'ad_id': '12345678',
                            'campaign_name': 'Summer Sale 2026',
                            'source': 'ADS',
                            'type': 'OPEN_THREAD'
                        }
                    }
                }]
            }]
        }
        
        payload_str = json.dumps(payload)
        signature = self._generate_signature(payload_str)
        
        response = self.client.post(
            '/api/webhook',
            data=payload_str,
            headers={
                'Content-Type': 'application/json',
                'X-Hub-Signature-256': signature
            }
        )
        
        self.assertEqual(response.status_code, 200)
        
        import time
        time.sleep(0.5)
        
        # 驗證廣告轉介記錄
        contact = Contact.query.first()
        self.assertEqual(contact.source_type, 'ad_referral')
        
        conversation = Conversation.query.first()
        self.assertIsNotNone(conversation.ad_referral)
        self.assertEqual(conversation.ad_referral['ad_id'], '12345678')
        self.assertEqual(conversation.ad_referral['campaign_name'], 'Summer Sale 2026')
    
    def test_message_idempotency(self):
        """測試訊息冪等性（同一訊息發送兩次不重複存儲）"""
        payload = {
            'object': 'page',
            'entry': [{
                'messaging': [{
                    'sender': {'id': 'sender_idem_123'},
                    'message': {
                        'mid': 'idem_msg_123',
                        'text': 'This message should only be stored once'
                    }
                }]
            }]
        }
        
        payload_str = json.dumps(payload)
        signature = self._generate_signature(payload_str)
        
        # 發送第一次
        response1 = self.client.post(
            '/api/webhook',
            data=payload_str,
            headers={
                'Content-Type': 'application/json',
                'X-Hub-Signature-256': signature
            }
        )
        self.assertEqual(response1.status_code, 200)
        
        # 發送第二次（模擬 Meta 重發）
        response2 = self.client.post(
            '/api/webhook',
            data=payload_str,
            headers={
                'Content-Type': 'application/json',
                'X-Hub-Signature-256': signature
            }
        )
        self.assertEqual(response2.status_code, 200)
        
        import time
        time.sleep(0.5)
        
        # 應該只有一條訊息記錄
        messages = Message.query.filter_by(meta_message_id='idem_msg_123').all()
        self.assertEqual(len(messages), 1)
        
        # 應該只有一個客戶和一個對話
        self.assertEqual(Contact.query.count(), 1)
        self.assertEqual(Conversation.query.count(), 1)
    
    def test_invalid_signature(self):
        """測試無效簽名被拒絕"""
        payload = {
            'object': 'page',
            'entry': []
        }
        
        payload_str = json.dumps(payload)
        
        response = self.client.post(
            '/api/webhook',
            data=payload_str,
            headers={
                'Content-Type': 'application/json',
                'X-Hub-Signature-256': 'sha256=invalid_signature'
            }
        )
        
        self.assertEqual(response.status_code, 403)
    
    def test_health_check(self):
        """測試健康檢查端點"""
        response = self.client.get('/api/health')
        self.assertEqual(response.status_code, 200)
        
        data = response.get_json()
        self.assertIn('status', data)
        self.assertIn('checks', data)
        self.assertIn('database', data['checks'])
        self.assertIn('redis', data['checks'])


if __name__ == '__main__':
    # 執行測試
    unittest.main()