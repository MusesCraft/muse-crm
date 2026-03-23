# LINE Messaging API 技術研究

> CRM-009 | MUSE CRM 多渠道擴充 — LINE 渠道接入前期研究

---

## 1. LINE Messaging API Webhook 格式

### 1.1 事件結構

LINE Webhook 採用 **envelope → events array** 結構：

```json
{
  "destination": "Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "events": [
    {
      "type": "message",
      "message": {
        "type": "text",
        "id": "468XXXXXX",
        "text": "你好"
      },
      "webhookEventId": "01HXXXXXXXXXXXXXXXXXXXXXXXX",
      "deliveryContext": {
        "isRedelivery": false
      },
      "timestamp": 1704067200000,
      "source": {
        "type": "user",
        "userId": "Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      },
      "replyToken": "nHuyWiB7yP5Zw52FIkcQobQuGDXCTA",
      "mode": "active"
    }
  ]
}
```

- `destination`：接收此事件的 Bot Channel ID（U 開頭）
- `events`：事件陣列，一次 webhook 可包含多個事件
- 每個事件都有 `webhookEventId`（可用於冪等性檢查）和 `deliveryContext.isRedelivery`（是否為重送）

### 1.2 事件類型

| 事件類型 | 說明 | 觸發時機 |
|---------|------|---------|
| `message` | 使用者發送訊息 | 傳送文字、圖片、影片等 |
| `follow` | 使用者加入好友 | 加好友或解除封鎖 |
| `unfollow` | 使用者封鎖/刪除好友 | 封鎖 Bot |
| `postback` | Postback 動作 | 點擊 Postback 按鈕 |
| `join` | Bot 加入群組/聊天室 | 被邀請進群組 |
| `leave` | Bot 離開群組/聊天室 | 被踢出群組 |

### 1.3 Message 事件 Sub-types

| 訊息類型 | type 值 | 特殊欄位 |
|---------|---------|---------|
| 文字 | `text` | `text`, `emojis[]`, `mention` |
| 圖片 | `image` | `contentProvider` (line/external) |
| 影片 | `video` | `contentProvider`, `duration` |
| 音訊 | `audio` | `contentProvider`, `duration` |
| 檔案 | `file` | `fileName`, `fileSize` |
| 位置 | `location` | `title`, `address`, `latitude`, `longitude` |
| 貼圖 | `sticker` | `packageId`, `stickerId`, `stickerResourceType` |

圖片/影片/音訊的二進位內容需透過 Content API 下載：
```
GET https://api-data.line.me/v2/bot/message/{messageId}/content
Authorization: Bearer {channel access token}
```

### 1.4 Signature 驗證方式

LINE 使用 `X-Line-Signature` header 進行驗證：

```python
import base64
import hashlib
import hmac

channel_secret = 'your_channel_secret'
body = request.get_data(as_text=True)

# 計算簽名
hash_value = hmac.new(
    channel_secret.encode('utf-8'),
    body.encode('utf-8'),
    hashlib.sha256
).digest()
signature = base64.b64encode(hash_value).decode('utf-8')

# 與 header 比對
assert signature == request.headers['X-Line-Signature']
```

重點：LINE 簽名是 HMAC-SHA256 後做 **Base64 編碼**，而非 hex 格式。

---

## 2. 與 Meta Webhook 差異對照表

| 項目 | Meta (Messenger/Instagram) | LINE |
|------|---------------------------|------|
| **Webhook 結構** | `object` → `entry[]` → `messaging[]` | `destination` + `events[]` |
| **簽名 Header** | `X-Hub-Signature-256` | `X-Line-Signature` |
| **簽名演算法** | HMAC-SHA256 (hex) | HMAC-SHA256 (Base64) |
| **簽名前綴** | `sha256=` 前綴 | 無前綴，純 Base64 |
| **User ID 格式** | PSID/ASID（純數字） | U 開頭 + 32 字元 hex（共 33 字元） |
| **User ID 範例** | `1234567890` | `U1234567890abcdef1234567890abcdef` |
| **回覆機制** | Send API（隨時可發） | Reply Token（30 秒限時）+ Push API |
| **Reply Token** | 無此概念 | 每個事件附帶，用完即失效 |
| **主動推送** | Send API（無限制） | Push API（可能計費） |
| **Profile 取得** | Graph API `/{user-id}` | `GET /v2/bot/profile/{userId}` |
| **跨渠道身份** | ASID / id_match | 無原生支援，需用 email 等外部比對 |
| **Webhook 驗證** | GET challenge-response | 無（在 LINE Console 設定 URL） |
| **冪等性** | `mid`（Message ID） | `webhookEventId` + `isRedelivery` |
| **附件取得** | URL 在 payload 中直接提供 | 需用 Content API 額外下載 |
| **免費額度** | 免費（僅限 API 呼叫次數） | 免費訊息數有限（依方案） |
| **SDK** | 無官方 Python SDK | `line-bot-sdk` 官方支援 |

---

## 3. 用戶 Profile 取得方式

### API Endpoint

```
GET https://api.line.me/v2/bot/profile/{userId}
Authorization: Bearer {channel access token}
```

### Response

```json
{
  "displayName": "LINE 暱稱",
  "userId": "Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "pictureUrl": "https://profile.line-scdn.net/...",
  "statusMessage": "狀態訊息",
  "language": "zh-TW"
}
```

### 欄位對應到 MUSE CRM Contact

| LINE Profile 欄位 | CRM Contact 欄位 | 說明 |
|-------------------|-----------------|------|
| `displayName` | `display_name` | 使用者暱稱 |
| `pictureUrl` | `avatar_url` | 大頭貼 URL |
| `language` | `locale` | 語言設定（BCP 47） |
| `userId` | `ChannelIdentifier.external_id` | LINE User ID |

### 注意事項
- 只能取得已加好友的使用者 profile
- `pictureUrl` 可能為空（使用者未設大頭貼）
- `language` 不一定存在
- 群組中的使用者需用不同 API：`/v2/bot/group/{groupId}/member/{userId}`

---

## 4. 回覆訊息 vs 推送訊息

### Reply API（回覆訊息）

```
POST https://api.line.me/v2/bot/message/reply
Authorization: Bearer {channel access token}
Content-Type: application/json

{
  "replyToken": "nHuyWiB7yP5Zw52FIkcQobQuGDXCTA",
  "messages": [
    {
      "type": "text",
      "text": "Hello!"
    }
  ]
}
```

- **免費**：不計入訊息費用
- **限制**：Reply Token 在收到 webhook 後約 **30 秒**內有效
- **限制**：每個 token 只能用一次
- **限制**：最多一次回覆 5 則訊息
- **適用場景**：即時回覆使用者訊息（如自動回覆、chatbot 回應）

### Push API（推送訊息）

```
POST https://api.line.me/v2/bot/message/push
Authorization: Bearer {channel access token}
Content-Type: application/json

{
  "to": "Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "messages": [
    {
      "type": "text",
      "text": "主動通知！"
    }
  ]
}
```

- **計費**：計入每月免費訊息額度（超額付費）
- **無時間限制**：隨時可發送
- **適用場景**：主動推播、通知、行銷訊息

### CRM 使用策略

1. **Webhook 收到訊息時**：若需要即時回覆，優先使用 Reply API（免費）
2. **CRM 人員手動回覆**：使用 Push API（有延遲，Reply Token 已過期）
3. **自動通知/提醒**：使用 Push API

---

## 5. LINE SDK for Python 用法

### 安裝

```bash
pip install line-bot-sdk
```

目前穩定版本：`line-bot-sdk>=3.0`（v3 為最新大版本，使用非同步架構）

### 基本設定

```python
from linebot.v3 import WebhookHandler
from linebot.v3.messaging import (
    Configuration,
    ApiClient,
    MessagingApi,
    ReplyMessageRequest,
    PushMessageRequest,
    TextMessage,
)

# Webhook 簽名驗證
handler = WebhookHandler(channel_secret='YOUR_CHANNEL_SECRET')

# Messaging API 客戶端
configuration = Configuration(access_token='YOUR_CHANNEL_ACCESS_TOKEN')
```

### Webhook 簽名驗證

```python
from linebot.v3.exceptions import InvalidSignatureError

@app.route('/webhook/line', methods=['POST'])
def line_webhook():
    signature = request.headers['X-Line-Signature']
    body = request.get_data(as_text=True)

    try:
        handler.handle(body, signature)
    except InvalidSignatureError:
        abort(403)

    return 'OK'
```

### 手動驗證（不用 SDK handler）

```python
import base64, hashlib, hmac

def verify_line_signature(body: bytes, signature: str, channel_secret: str) -> bool:
    hash_value = hmac.new(
        channel_secret.encode('utf-8'),
        body,
        hashlib.sha256
    ).digest()
    expected = base64.b64encode(hash_value).decode('utf-8')
    return hmac.compare_digest(expected, signature)
```

### 回覆訊息

```python
with ApiClient(configuration) as api_client:
    messaging_api = MessagingApi(api_client)
    messaging_api.reply_message(
        ReplyMessageRequest(
            reply_token='REPLY_TOKEN',
            messages=[TextMessage(text='收到您的訊息！')]
        )
    )
```

### 推送訊息

```python
with ApiClient(configuration) as api_client:
    messaging_api = MessagingApi(api_client)
    messaging_api.push_message(
        PushMessageRequest(
            to='USER_ID',
            messages=[TextMessage(text='這是主動推送的訊息')]
        )
    )
```

### 取得用戶 Profile

```python
with ApiClient(configuration) as api_client:
    messaging_api = MessagingApi(api_client)
    profile = messaging_api.get_profile(user_id='Uxxxx...')
    print(profile.display_name)
    print(profile.picture_url)
    print(profile.language)
```

### MUSE CRM 整合建議

1. **不直接依賴 SDK handler**：我們有自己的 ChannelAdapter 架構，手動驗證簽名即可
2. **使用 SDK 的 Messaging API client**：發送訊息和取得 profile 可善用 SDK
3. **自行解析 webhook payload**：保持與 Meta adapter 一致的 ChannelEvent 格式
4. **Reply Token 管理**：在 ChannelEvent 中保留 reply_token，讓業務層決定是否使用

---

## 6. 與 MUSE CRM 整合摘要

### 資料流

```
LINE Platform → Webhook POST /api/v1/webhook/line
    → 驗證 X-Line-Signature
    → LineAdapter.parse_events() → List[ChannelEvent]
    → _handle_webhook_message() (複用現有邏輯)
        → ContactService.get_or_create_contact(channel='line')
        → SessionService.get_or_create_conversation(channel='line')
        → Message 存儲
        → Quick Triage / 通知
```

### 環境變數

```bash
LINE_CHANNEL_SECRET=xxx      # LINE Channel Secret（簽名驗證用）
LINE_CHANNEL_ACCESS_TOKEN=xxx # LINE Channel Access Token（API 呼叫用）
```

### ChannelIdentifier 對應

- `channel`: `'line'`
- `external_id`: LINE User ID（U 開頭 32 hex）
- `asid`: 不適用（LINE 無 ASID 概念）
- `profile_data`: `{ displayName, pictureUrl, language }`

### 需注意的差異處理

1. **Reply Token 時效性**：收到 webhook 後需在 30 秒內決定是否使用
2. **附件下載**：LINE 不直接提供 URL，需用 Content API 下載後存儲
3. **跨渠道合併**：LINE 無 ASID，需透過其他方式（如 email、手動合併）
4. **冪等性**：使用 `webhookEventId` 而非 `mid`，需對應到 `meta_message_id` 欄位
