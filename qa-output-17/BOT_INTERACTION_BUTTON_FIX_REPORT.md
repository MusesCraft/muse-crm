# [17] Bot Interaction Button Fix Report

產出時間：2026-05-28
專案：`/Users/muse/Developer/muse-crm`

## 結論

已完成「直面對話中的機器人互動按鈕失效」最小可交付修復。

本次修復重點不是實作完整 Telegram adapter，而是先讓 BBCRM 對話層能安全承載、序列化、顯示 bot interactive message，並避免 unsupported outbound `message_type` 進 DB 後觸發 constraint 造成 500。

## Root Cause

1. `POST /api/v1/inbox/conversations/:id/send` 未先驗證 outbound `message_type`，導致 `callback_query` / `interactive` / `button` 等 unsupported type 會一路進入 Message insert。
2. `messages.message_type` DB constraint 只允許 `text/image/sticker/attachment/referral`，unsupported type 進 DB 後會變成 database constraint error，也就是 production 看到的 500。
3. Message serialization 沒有明確暴露 interactive payload 給前端。
4. Frontend `MessageBubble` 只支援 image / sticker / attachment / text，遇到 interactive/callback 類型無法呈現 bot button context。

## 修改檔案

Backend:

- `backend/app/api/inbox.py`
  - outbound send 明確只允許 `text` / `image`
  - unsupported type 直接回 `400 {"error":"不支援的訊息類型"}`

- `backend/app/models/message.py`
  - `message_type` constraint 擴充 inbound 可承載類型：
    - `interactive`
    - `callback_query`
    - `button`
  - `to_dict()` 新增：
    - `metadata`
    - `message_metadata`
    - `interactive_payload`

- `backend/migrations/versions/o3d4e5f6a7b8_crm_030_expand_message_interactive_types.py`
  - migration 重建 `ck_message_type` constraint，避免 production 舊 constraint 阻擋 interactive records。

- `backend/tests/test_bot_interaction_messages.py`
  - regression：unsupported outbound type 回 400，不產生 Message。
  - regression：conversation detail 可 serialize interactive message payload。

Frontend:

- `frontend/src/lib/api.ts`
  - Message type 擴充 interactive/callback/button。
  - Message 型別加入 `metadata` / `message_metadata` / `interactive_payload`。

- `frontend/src/app/(app)/inbox/message-bubble.tsx`
  - 新增「機器人互動」MVP renderer。
  - 支援 `buttons`、`reply_markup.inline_keyboard`、`inline_keyboard`、callback data 顯示。
  - 按鈕以 disabled 樣式呈現，只展示與紀錄，不假裝送出 callback。

- `frontend/src/app/(app)/inbox/conversation-list.tsx`
  - last message fallback 顯示 `[機器人互動]`。

- `frontend/scripts/check-message-bubble-interactive.mjs`
  - 最低限度靜態檢查 MessageBubble/API 是否保留 interactive rendering 與 payload 能力。

## 測試結果

Backend:

```bash
cd backend
source venv/bin/activate
python -m py_compile app/models/message.py app/api/inbox.py migrations/versions/o3d4e5f6a7b8_crm_030_expand_message_interactive_types.py
python -m pytest tests/test_bot_interaction_messages.py -q
```

結果：`2 passed`

```bash
python -m pytest tests/test_bot_interaction_messages.py tests/test_webhook.py -q
```

結果：`11 passed`

Frontend:

```bash
cd frontend
node scripts/check-message-bubble-interactive.mjs
npm run lint
npm run build
```

結果：全部通過。

## 尚未完成事項

以下不屬於本次 MVP 修復範圍，需另開後續任務：

- 真正 Telegram adapter / Bot API webhook ingestion。
- Telegram callback_query webhook parse、acknowledge、dispatch 與狀態更新。
- Outbound inline keyboard / reply markup 發送。
- Telegram native button click 後的業務流程處理。
- MTProto / TDLib / Telegram 原生通話與完整原生對話能力。
