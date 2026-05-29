#!/usr/bin/env python3
"""
MUSE CRM — Mock Webhook 工具

用於手動測試 Webhook 端點的命令列工具。
支援發送各種類型的模擬 Meta Webhook 到本地 Flask 應用。

使用方式：
    python mock_webhook.py --type messenger --text "Hello" --sender 123
    python mock_webhook.py --type instagram --image --sender ig456
    python mock_webhook.py --type messenger --ad-referral --text "From ad" --sender ad789
"""

import argparse
import hashlib
import hmac
import json
import requests
import time
from datetime import datetime
from typing import Dict, Any, Optional


class MockWebhookSender:
    """Mock Webhook 發送器"""
    
    def __init__(self, base_url: str = 'http://localhost:5000', app_secret: str = None):
        self.base_url = base_url.rstrip('/')
        self.webhook_url = f"{self.base_url}/api/v1/webhook"
        self.app_secret = app_secret or 'test_app_secret'  # 預設測試 secret
        
    def _generate_signature(self, payload: str) -> str:
        """生成 HMAC SHA256 簽名"""
        return 'sha256=' + hmac.new(
            self.app_secret.encode(),
            payload.encode(),
            hashlib.sha256
        ).hexdigest()
    
    def send_messenger_text(
        self, 
        sender_id: str, 
        text: str, 
        message_id: str = None,
        ad_referral: Optional[Dict[str, str]] = None
    ) -> requests.Response:
        """發送 Messenger 文字訊息"""
        if not message_id:
            message_id = f"msg_{int(time.time() * 1000)}"
        
        message_obj = {
            'mid': message_id,
            'text': text
        }
        
        # 添加 ad referral 如果有
        if ad_referral:
            message_obj['referral'] = ad_referral
        
        payload = {
            'object': 'page',
            'entry': [{
                'id': 'test_page_id',
                'time': int(datetime.now().timestamp()),
                'messaging': [{
                    'sender': {'id': sender_id},
                    'recipient': {'id': 'test_page_id'},
                    'timestamp': int(datetime.now().timestamp() * 1000),
                    'message': message_obj
                }]
            }]
        }
        
        return self._send_webhook(payload)
    
    def send_messenger_image(
        self, 
        sender_id: str, 
        image_url: str = None,
        message_id: str = None
    ) -> requests.Response:
        """發送 Messenger 圖片訊息"""
        if not message_id:
            message_id = f"img_{int(time.time() * 1000)}"
        
        if not image_url:
            image_url = 'https://via.placeholder.com/300x300.png?text=Test+Image'
        
        payload = {
            'object': 'page',
            'entry': [{
                'id': 'test_page_id',
                'time': int(datetime.now().timestamp()),
                'messaging': [{
                    'sender': {'id': sender_id},
                    'recipient': {'id': 'test_page_id'},
                    'timestamp': int(datetime.now().timestamp() * 1000),
                    'message': {
                        'mid': message_id,
                        'attachments': [{
                            'type': 'image',
                            'payload': {
                                'url': image_url
                            }
                        }]
                    }
                }]
            }]
        }
        
        return self._send_webhook(payload)
    
    def send_instagram_text(
        self, 
        sender_id: str, 
        text: str,
        message_id: str = None
    ) -> requests.Response:
        """發送 Instagram DM 文字訊息"""
        if not message_id:
            message_id = f"ig_msg_{int(time.time() * 1000)}"
        
        payload = {
            'object': 'instagram',
            'entry': [{
                'id': 'test_ig_page_id',
                'time': int(datetime.now().timestamp()),
                'changes': [{
                    'field': 'messages',
                    'value': {
                        'from': {'id': sender_id},
                        'to': {'id': 'test_ig_page_id'},
                        'message': {
                            'mid': message_id,
                            'text': text
                        },
                        'timestamp': int(datetime.now().timestamp() * 1000)
                    }
                }]
            }]
        }
        
        return self._send_webhook(payload)
    
    def send_instagram_image(
        self, 
        sender_id: str, 
        image_url: str = None,
        message_id: str = None
    ) -> requests.Response:
        """發送 Instagram DM 圖片訊息"""
        if not message_id:
            message_id = f"ig_img_{int(time.time() * 1000)}"
        
        if not image_url:
            image_url = 'https://via.placeholder.com/400x400.jpg?text=IG+Test+Image'
        
        payload = {
            'object': 'instagram',
            'entry': [{
                'id': 'test_ig_page_id',
                'time': int(datetime.now().timestamp()),
                'changes': [{
                    'field': 'messages',
                    'value': {
                        'from': {'id': sender_id},
                        'to': {'id': 'test_ig_page_id'},
                        'message': {
                            'mid': message_id,
                            'attachments': [{
                                'type': 'image',
                                'payload': {
                                    'url': image_url
                                }
                            }]
                        },
                        'timestamp': int(datetime.now().timestamp() * 1000)
                    }
                }]
            }]
        }
        
        return self._send_webhook(payload)
    
    def _send_webhook(self, payload: Dict[str, Any]) -> requests.Response:
        """發送 webhook 請求"""
        payload_str = json.dumps(payload, ensure_ascii=False)
        signature = self._generate_signature(payload_str)
        
        headers = {
            'Content-Type': 'application/json',
            'X-Hub-Signature-256': signature,
            'User-Agent': 'Mock-Webhook-Sender/1.0'
        }
        
        print(f"📤 發送 webhook 到 {self.webhook_url}")
        print(f"📦 Payload: {payload_str}")
        print(f"🔐 Signature: {signature}")
        
        try:
            response = requests.post(
                self.webhook_url,
                data=payload_str,
                headers=headers,
                timeout=10
            )
            
            print(f"✅ 回應: {response.status_code} {response.reason}")
            if response.text:
                print(f"📄 內容: {response.text}")
            
            return response
            
        except requests.exceptions.RequestException as e:
            print(f"❌ 請求失敗: {e}")
            raise
    
    def test_health_check(self) -> requests.Response:
        """測試健康檢查端點"""
        health_url = f"{self.base_url}/api/health"
        
        print(f"🏥 檢查健康狀態: {health_url}")
        
        try:
            response = requests.get(health_url, timeout=5)
            print(f"✅ 健康檢查回應: {response.status_code}")
            
            if response.headers.get('content-type', '').startswith('application/json'):
                data = response.json()
                print(f"📊 狀態: {data.get('status', 'unknown')}")
                if 'checks' in data:
                    for check_name, check_data in data['checks'].items():
                        status = check_data.get('status', 'unknown')
                        message = check_data.get('message', '')
                        print(f"  - {check_name}: {status} {message}")
            
            return response
            
        except requests.exceptions.RequestException as e:
            print(f"❌ 健康檢查失敗: {e}")
            raise


def main():
    """主要執行函數"""
    parser = argparse.ArgumentParser(description='MUSE CRM Mock Webhook 工具')
    
    # 基本參數
    parser.add_argument('--url', default='http://localhost:5000', help='Flask 應用 URL')
    parser.add_argument('--secret', help='Meta App Secret（預設: test_app_secret）')
    parser.add_argument('--sender', required=True, help='發送者 ID')
    
    # 訊息類型
    parser.add_argument('--type', choices=['messenger', 'instagram'], default='messenger', help='平台類型')
    parser.add_argument('--text', help='文字訊息內容')
    parser.add_argument('--image', action='store_true', help='發送圖片訊息')
    parser.add_argument('--image-url', help='圖片 URL（可選）')
    
    # Ad Referral
    parser.add_argument('--ad-referral', action='store_true', help='包含廣告轉介資訊')
    parser.add_argument('--ad-id', default='mock_ad_12345', help='廣告 ID')
    parser.add_argument('--campaign', default='Mock Campaign 2026', help='廣告活動名稱')
    
    # 測試選項
    parser.add_argument('--health', action='store_true', help='只執行健康檢查')
    parser.add_argument('--repeat', type=int, default=1, help='重複發送次數（測試冪等性）')
    
    args = parser.parse_args()
    
    # 建立 webhook 發送器
    sender = MockWebhookSender(args.url, args.secret)
    
    # 只執行健康檢查
    if args.health:
        sender.test_health_check()
        return
    
    # 準備廣告轉介資訊
    ad_referral = None
    if args.ad_referral:
        ad_referral = {
            'ref': f'test_ref_{int(time.time())}',
            'ad_id': args.ad_id,
            'campaign_name': args.campaign,
            'source': 'ADS',
            'type': 'OPEN_THREAD'
        }
    
    # 發送訊息
    for i in range(args.repeat):
        if args.repeat > 1:
            print(f"\n🔄 第 {i+1}/{args.repeat} 次發送")
        
        try:
            if args.image:
                # 發送圖片
                if args.type == 'messenger':
                    response = sender.send_messenger_image(
                        args.sender, 
                        args.image_url
                    )
                else:
                    response = sender.send_instagram_image(
                        args.sender, 
                        args.image_url
                    )
            else:
                # 發送文字
                text = args.text or f"Test message {i+1} at {datetime.now().strftime('%H:%M:%S')}"
                
                if args.type == 'messenger':
                    response = sender.send_messenger_text(
                        args.sender, 
                        text, 
                        ad_referral=ad_referral
                    )
                else:
                    response = sender.send_instagram_text(
                        args.sender, 
                        text
                    )
            
            if response.status_code != 200:
                print(f"⚠️ 非預期狀態碼: {response.status_code}")
                
        except Exception as e:
            print(f"❌ 發送失敗: {e}")
            break
        
        # 多次發送時增加間隔
        if i < args.repeat - 1:
            time.sleep(0.5)
    
    print(f"\n✅ 完成 {args.repeat} 次發送")


if __name__ == '__main__':
    main()