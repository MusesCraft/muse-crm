# [17] Telegram 完整功能性研究與 BBCRM 對話功能差距比對

產出時間：2026-05-28
專案：`/Users/muse/Developer/muse-crm`
研究範圍：Telegram Bot API、Telegram MTProto/User Client、Telegram 原生對話功能、BBCRM 現有 Inbox/Channel 架構。

---

## 1. 結論摘要

BBCRM 目前**沒有 Telegram 渠道實作**。現有對話系統支援 Messenger / Instagram / LINE 的共同抽象，但抽象層仍停留在「文字、圖片、少量附件/貼圖」等低階能力；若要接 Telegram，第一版可以用 Bot API 做客服訊息渠道，但若目標是接近 Telegram 原生對話體驗，必須引入 MTProto user-client 或 TDLib/GramJS bridge。

最重要差距：

1. `ChannelRegistry` 未註冊 Telegram adapter。
2. `ChannelEvent` 的 event/message model 太窄，無法完整承載 Telegram 的 replies、edits、deletes、reactions、read receipts、typing、forum topics、albums、poll、dice、contact、location、voice/video notes、story、pin 等事件。
3. `Message` model 的 DB constraint 只允許 `text/image/sticker/attachment/referral`，和 `ChannelEvent` 宣告的 `audio/video/file/location` 也不一致。
4. `/inbox/conversations/:id/send` 目前只支援 `text | image`，Telegram outbound 大部分原生能力都無法送。
5. 前端 MessageBubble 只渲染 image/sticker/attachment/text，Telegram 多數訊息類型會退化或丟失語意。
6. Telegram 原生通話/視訊不能靠 Bot API 在 BBCRM Web 內接聽；可做「來電事件偵測 + 開 Telegram App 接聽 + CRM 紀錄」，完整 web 內嵌接聽要另做 MTProto + VoIP media gateway spike。

---

## 2. BBCRM 現況證據

### 2.1 Channel 抽象

`backend/app/channels/base.py`

- `ChannelEvent.channel` 註解只有 `messenger | instagram | line`。
- `event_type` 註解只有 `message | follow | unfollow | postback`。
- `message_type` 註解列出 `text | image | sticker | audio | video | file | location`。
- `ChannelAdapter` 只有：
  - `verify_signature`
  - `parse_events`
  - `get_user_profile`
  - `send_message`
  - `send_reply`
  - `send_image`

不足：沒有 send/edit/delete/reaction/read/typing/pin/topic/file/contact/location/poll 等方法。

### 2.2 Registry

`backend/app/channels/registry.py`

目前只註冊：

```python
channel_registry.register(MetaAdapter())
channel_registry.register(LineAdapter())
```

沒有 Telegram。

### 2.3 Message DB model

`backend/app/models/message.py`

DB constraint：

```python
CheckConstraint("message_type IN ('text', 'image', 'sticker', 'attachment', 'referral')", name='ck_message_type')
```

這會阻擋 Telegram 的 audio/video/file/location/contact/poll/dice/voice_note/video_note/story 等原生類型。

### 2.4 Outbound send API

`backend/app/api/inbox.py`

`POST /inbox/conversations/<conversation_id>/send` 文件與實作只接受：

- `message_type='text'`
- `message_type='image'`

渠道分支只有：

- messenger / instagram：`meta_api.send_message/send_image`
- line：`line_adapter.send_message/send_image`

沒有 Telegram outbound。

### 2.5 Frontend composer/rendering

`frontend/src/app/(app)/inbox/send-bar.tsx`

- 輸入文字
- 圖片上傳
- 內部備註
- 快捷回覆圖片附件

沒有 Telegram native composer。

`frontend/src/app/(app)/inbox/message-bubble.tsx`

只渲染：

- image
- sticker placeholder
- attachment placeholder
- text
- read check icon

沒有 Telegram 多媒體、互動訊息、thread/topic、reply quote、reaction、poll 等 UI。

---

## 3. Telegram 功能完整分類

### A. 基礎身份與對話

| Telegram 功能 | Bot API | MTProto/User Client | BBCRM 現況 | 差距 |
|---|---:|---:|---|---|
| 私訊收發 | 可 | 可 | 無 Telegram adapter | 缺 |
| 群組/超級群組訊息 | 可 | 可 | 無 | 缺 |
| Channel 訊息 | 部分 | 完整 | 無 | 缺 |
| Forum topic/thread | 部分 | 完整 | 無 topic model/UI | 缺 |
| 使用者 profile/username/photo/language | 可 | 可 | ChannelIdentifier 可存 profile_data | adapter 缺 |
| phone/contact card | 收/發 contact 可 | 完整 | 無 message type | 缺 |
| 多帳號/多 bot/token | 可設計 | 可設計 | 無 account/channel config | 缺 |

### B. 訊息收發與內容型態

| Telegram 原生訊息型態 | Bot API | MTProto/User Client | BBCRM 現況 | 差距 |
|---|---:|---:|---|---|
| Text | 可 | 可 | 可，但無 TG | adapter 缺 |
| Entities: bold/link/mention/code/custom emoji | 可 | 完整 | content plain text | 缺 entities model/render |
| Photo | 可 | 可 | image 可 | adapter/下載缺 |
| Video | 可 | 可 | DB constraint 不允許 video | 缺 |
| Animation/GIF | 可 | 可 | 無 | 缺 |
| Audio/music | 可 | 可 | DB constraint 不允許 audio | 缺 |
| Voice note | 可 | 可 | 無 voice_note | 缺 |
| Video note/round video | 可 | 可 | 無 video_note | 缺 |
| Document/file | 可 | 可 | 只泛稱 attachment | 缺 file metadata/download/send |
| Sticker/static/animated/video | 可 | 可 | 只有 placeholder | 缺 sticker media/render/send |
| Location | 可 | 可 | ChannelEvent 有，DB 不允許 | 缺 |
| Live location | 可 | 可 | 無 lifecycle | 缺 |
| Venue | 可 | 可 | 無 | 缺 |
| Contact | 可 | 可 | 無 | 缺 |
| Poll/quiz | 可 | 可 | 無 | 缺 |
| Dice/game emoji | 可 | 可 | 無 | 缺 |
| Story reference | 有限制 | 較完整 | 無 | 缺 |
| Invoice/payment | 可 | 可 | 無 | 視業務需求 |
| WebApp button | 可 | 可 | 無 | 可列 Phase 3 |

### C. 對話操作

| 功能 | Bot API | MTProto/User Client | BBCRM 現況 | 差距 |
|---|---:|---:|---|---|
| Reply to message | 可 | 可 | 無 reply_to model/UI | 缺 |
| Quote selected text | 新版支援有限 | 完整 | 無 | 缺 |
| Forward | 可 | 可 | 無 | 缺 |
| Copy message | 可 | 可 | 無 | 缺 |
| Edit outbound message | 可編 bot 自己訊息 | 完整 | 無 | 缺 |
| Delete message | 可刪一定範圍 | 完整 | 無 | 缺 |
| Reaction | 可收/設部分 | 完整 | 無 reaction model/UI | 缺 |
| Read receipt / mark read | 有限制 | 完整 | 只有本地 is_read | 缺平台同步 |
| Typing/chat action | 可 sendChatAction | 可 | 無 | 缺 |
| Pin/unpin message | 可 | 完整 | 無 | 缺 |
| Search chat history | 有限制 | 完整 | 只搜尋 CRM 已存 | 缺歷史同步/索引 |
| Scheduled messages | Bot API 不等同 native | 可 | 無 | 可選 |
| Albums/media group | 可 | 可 | 無 grouped_id | 缺 |
| Message edit/delete inbound sync | 可收到部分 update | 完整 | 無 event type | 缺 |

### D. 群組、topic、管理

| 功能 | Bot API | MTProto/User Client | BBCRM 現況 | 差距 |
|---|---:|---:|---|---|
| 加入群組/讀群消息 | 可，受 privacy mode 影響 | 可 | 無 | 缺 |
| Forum topic list/filter | 可部分 | 完整 | 無 topic model/UI | 缺 |
| Topic create/edit/close/reopen | 可 | 完整 | 無 | 缺 |
| 群成員/管理員資訊 | 可 | 完整 | 無 | 缺 |
| Ban/unban/restrict/promote | 可 | 完整 | 無 | 視需求 |
| Channel post/admin log | 部分 | 完整 | 無 | 視需求 |
| Invite links | 可 | 完整 | 無 | 視需求 |

### E. 通話 / 視訊

| 功能 | Bot API | MTProto/User Client | BBCRM 現況 | 判斷 |
|---|---:|---:|---|---|
| Telegram native voice call event | 不支援 | raw updates/RPC 可碰 | 無 | 可做 Tier 2 spike |
| Telegram native video call event | 不支援 | raw updates/RPC 可碰 | 無 | 可做 Tier 2 spike |
| CRM 內接聽原生 voice/video | 不支援 | 需要 VoIP media bridge | 無 | 高風險 R&D |
| 打開 Telegram App 接聽/撥打 | N/A | N/A | 無 | 推薦 MVP |
| CRM 通話紀錄 | N/A | N/A | 無 call_session | 建議新增 |

結論：Telegram 原生通話/視訊不是 Bot API 功能；若要求在 BBCRM Web 內直接接聽，必須做 Telegram user client + VoIP/media gateway，不屬一般「API 串接」。

---

## 4. BBCRM 目前已實現的對話能力

| 能力 | 實現狀態 | 備註 |
|---|---|---|
| 多渠道基礎抽象 | 部分 | Meta + LINE |
| inbound text | 有 | Meta/LINE |
| inbound image | 有 | Meta/LINE，部分永久化 |
| inbound sticker | 部分 | LINE parsing；UI placeholder |
| inbound audio/video/file/location | 抽象宣告有，但 DB/UI 不完整 | Message constraint 不允許 |
| outbound text | 有 | Meta/LINE |
| outbound image | 有 | Meta/LINE |
| internal note | 有 | 不對外發送 |
| @mention | 部分 | mentions 欄位與內部備註 |
| quick replies | 有 | 文字 + 圖片附件 |
| conversation assignment/escalation/watch/takeover | 有 | CRM 流程功能 |
| search/filter conversations | 有 | channel/status/search |
| realtime refresh | 部分 | WebSocket/輪詢 |

---

## 5. Telegram 對話功能缺口清單

### P0 — 接 Telegram 必須先做

1. Telegram channel adapter / bridge
   - Bot API adapter 或 MTProto bridge 二選一先落地。
   - 註冊到 `ChannelRegistry`。
   - 新增 webhook 或 bridge event ingestion。

2. DB schema 擴充
   - `messages.message_type` 放寬或 enum 擴充：`video/audio/file/location/contact/poll/dice/voice_note/video_note/animation/story/service`。
   - `meta_message_id` 改名或新增 `platform_message_id`，避免只綁 Meta 語意。
   - 新增 `reply_to_message_id`、`edited_at`、`deleted_at`、`platform_created_at`、`grouped_id`、`topic_id`、`entities`、`reply_markup`、`reactions`。

3. ChannelEvent 擴充
   - event_type：`message/edit/delete/reaction/read/typing/pinned/unpinned/member/topic/call`。
   - message metadata 不應只塞 attachments，要有 typed metadata。

4. Outbound API 擴充
   - `sendMessage` 不只 text/image。
   - 增加 file upload/send、reply、edit、delete、reaction、typing、pin、poll/contact/location 等能力。

5. 前端 MessageBubble 擴充
   - 影片、音訊、voice note、file、location、contact、poll、dice、sticker media、reply preview、edited/deleted badge、reaction bar。

### P1 — 原生 Telegram 體驗

1. Reply / quote reply / forward / copy。
2. Edit/delete outbound message。
3. Reactions 收發與同步。
4. Read receipt / mark read / unread sync。
5. Typing indicator。
6. Albums/grouped media。
7. Forum topics：topic list、topic filter、topic chip、topic send。
8. Sticker/custom emoji 完整渲染。
9. Telegram user profile/photo/username/phone 同步。
10. 歷史訊息 backfill 與 pagination。

### P2 — 管理與進階

1. 群組/頻道 admin action。
2. Pin/folder/dialog 管理。
3. Scheduled messages。
4. Bot commands、inline keyboard、callback query、WebApp button。
5. Payment/invoice。
6. Story reference/create。
7. Secret chat：不建議納入 CRM 主線。
8. Native calls：做來電偵測與 App handoff；Web 內嵌接聽列 R&D。

---

## 6. 建議技術路線

### 路線 A：Telegram Bot API MVP（最快）

適合做客服渠道第一版。

範圍：

- 私訊/群組 inbound text/photo/video/audio/document/voice/sticker/location/contact/poll。
- outbound text/photo/document/video/audio/voice/location/contact/poll。
- inline keyboard button。
- webhook 簽名/secret token。
- channel identifier 存 `telegram_user_id/chat_id/username`。

限制：

- 無法讀完整個人帳號私訊。
- 無法原生通話/視訊。
- 群組受 privacy mode 影響。
- 歷史同步有限。

### 路線 B：MTProto/TDLib/GramJS Bridge（原生度高）

適合要做接近 Telegram Desktop 的 CRM 對話台。

範圍：

- user account login/session/2FA。
- 私訊、群組、頻道、topic。
- edits/deletes/reactions/read/typing。
- 完整 media download/send。
- history backfill。
- native call event detection。

風險：

- 帳號風控、session 安全、2FA、多人共用帳號。
- 工程量大於 Bot API。
- 通話媒體仍不是簡單 API。

### 建議順序

1. Phase 1：Bot API 作 Telegram 客服渠道 MVP。
2. Phase 2：擴 DB/前端以承載 Telegram 常見 message types。
3. Phase 3：reply/edit/delete/reaction/read/typing/topic。
4. Phase 4：如需完整原生體驗，再導入 MTProto bridge 做 history/topic/native parity。
5. Phase 5：native call awareness + Telegram App handoff。
6. Phase 6：web 內嵌接聽通話/視訊另立 spike，不併入一般渠道開發。

---

## 7. 推薦下一步開發任務切分

### T1 — Capability schema migration

- 擴 `messages.message_type`。
- 新增：`platform`, `platform_message_id`, `platform_chat_id`, `reply_to_message_id`, `edited_at`, `deleted_at`, `entities`, `reply_markup`, `reactions`, `topic_id`, `grouped_id`, `media_metadata`。

### T2 — Telegram Bot adapter MVP

新增：

- `backend/app/channels/telegram_bot_adapter.py`
- `backend/app/api/telegram_webhook.py`
- config：`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`

### T3 — Frontend rendering MVP

擴：

- `message-bubble.tsx`
- `send-bar.tsx`
- `lib/api.ts`

支援：text/photo/video/audio/voice/document/location/contact/sticker。

### T4 — Advanced conversation operations

新增 endpoints：

- reply
- edit
- delete
- react
- mark-read
- typing
- pin
- topic send/filter

### T5 — Native call awareness spike

- MTProto/TDLib session。
- 監聽 `UpdatePhoneCall` 類事件。
- CRM toast + call_session。
- 按鈕打開 Telegram Desktop/App。

---

## 8. 最終判斷

若只問「Telegram 能不能接」：可以。

若問「要補齊 Telegram 對話功能」：目前 BBCRM 還差一層完整 message capability model。不能只加一個 `telegram_adapter.py`，否則 Telegram 大量原生訊息會被降級成 attachment 或直接存不進 DB。

若問「通話/視訊能不能像 Telegram 原生那樣在 CRM 內接」：短期不建議承諾。合理交付是「Telegram 來電偵測 + 開 Telegram App 接聽 + CRM 通話紀錄」；完整 web 內嵌接聽是另一個高風險 R&D 專案。
