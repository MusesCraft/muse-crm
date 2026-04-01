# MUSE CRM 日報 — 2026/04/01

## 摘要

修復 6 項 UX 問題 + 清理 4 個檔案的 mock data 殘留 + 移除 auth.tsx 的 MOCK_USER 機制。加上前日深度掃描的 19 項 bug 修復，共修改 **22 個檔案**、**221 行新增**、**264 行刪除**。Frontend build 通過。

---

## 一、已確認已修復（2 項）

| # | 問題 | 狀態 |
|---|------|------|
| W-8 | Refresh token 黑名單 | `auth_refresh` 端點已有 `is_token_blacklisted(jti)` 檢查（`auth.py:177-180`），確認已修復 |
| m-7 | schema.sql FK 順序 | `assigned_to` 已用 `ALTER TABLE` 在檔案末尾建立（`schema.sql:279-280`），確認已修復 |

---

## 二、UX 問題修復（6 項）

### UX-1 🔴 長對話不自動 Scroll to Bottom
**檔案：** `conversation-detail.tsx`
**根因：** `prevMsgCountRef.current` 在 `requestAnimationFrame` 回呼執行前就被更新為非零值，導致 `behavior` 永遠是 `'smooth'`。211 則訊息從頂部平滑滾動到底部耗時極長。
**修復：** 在更新 ref 前先捕捉 `isInitialLoad` 旗標，首次載入用 `'instant'`（瞬間跳到底部），後續新訊息才用 `'smooth'`。加入雙 RAF 確保長列表 DOM 完整渲染。

### UX-2 🟡 對話 Header 資訊排版混亂
**檔案：** `conversation-detail.tsx`
**修復：** 日期和訊息數改為 `hidden sm:flex`，手機窄螢幕隱藏元數據，只保留操作按鈕。訊息數文字簡化為「N 則」。

### UX-3 🟡 部分對話列表無最後訊息預覽
**檔案：** `conversation-list.tsx`
**根因：** `last_message.content` 為 null（圖片/貼圖/附件訊息），`truncate(null)` 回傳空字串。
**修復：** 依 `message_type` 顯示 `[圖片]`、`[貼圖]`、`[附件]` 替代文字。

### UX-4 🟡 過期圖片無替代操作
**檔案：** `message-bubble.tsx`
**修復：** 「圖片已過期」灰塊新增說明文字「或無法載入」+ 「重新載入」按鈕（重設 `imgError` state 觸發重試）。

### UX-5 ⚪ 搜尋後右側對話不清除
**檔案：** `page.tsx`
**修復：** 搜尋 debounce 觸發時 `setSelectedId(null)`；狀態/渠道篩選變更時同步清除 `selectedId`。

### UX-6 ⚪ 「深度分析」vs「深入分析」文字不一致
**檔案：** `customer-sidebar.tsx`
**修復：** 統一為「深度分析」。

---

## 三、Mock Data 清理

| 檔案 | 清理內容 |
|------|---------|
| `inbox/page.tsx` | 移除 `mockConversations` import 和 fallback 查詢 |
| `inbox/conversation-detail.tsx` | 移除 `getConversationAnalysis` import；`AiSuggestionCard` 改用真實 `conv.analyses` 資料 |
| `inbox/send-bar.tsx` | 移除 `mockQuickReplies` import 和 fallback 邏輯，全面使用 API 資料 |
| `inbox/customer-sidebar.tsx` | 移除 `mockContactEntities`、`mockConversations` import；基本資訊改用 `contact.phone`/`contact.email`（API 資料）；對話歷史和分析結果改用 `contact.conversations`/`contact.analyses` |
| `lib/auth.tsx` | 移除 `MOCK_USER` 定義和所有 `mock-demo-token` 邏輯（7 處），簡化初始化流程 |
| `lib/api.ts` | `ContactDetail` 介面新增 `phone`、`email`、`notes_text` 欄位；transformer 補充對應映射 |

---

## 四、前日深度掃描修復（承接 3/31）

16 個後端檔案的 bug 修復已包含在本次變更中，詳見 3/31 日報第四節。

---

## 影響範圍

```
backend/   13 檔案
  api/         contacts.py, inbox.py, llm_usage.py, sync.py, tags.py
  models/      analysis.py, conversation.py, notification_preference.py, quick_reply.py
  services/    action_service.py, contact_service.py, session_service.py
  channels/    meta_adapter.py

frontend/   9 檔案
  app/(app)/   inbox/ (5 檔: page, conversation-detail, conversation-list,
                       customer-sidebar, message-bubble, send-bar)
               contacts/page.tsx
  lib/         api.ts, auth.tsx
```

## 驗證結果

- Frontend: `npm run build` 成功、TypeScript 零錯誤
- Python: 全部 `.py` 語法檢查通過
- 未部署（待確認後執行 `railway up`）

## 待辦

- [ ] 部署後端 + 前端至 Railway
- [ ] 驗證 UX-1：開啟 211 則訊息的對話，確認自動滾到底部
- [ ] 驗證 UX-3：確認圖片訊息在列表中顯示「[圖片]」
- [ ] 驗證 mock data 移除後，sidebar 基本資訊正確顯示 phone/email
- [ ] 排後續：docker-compose 整理、前後端測試覆蓋、merge candidates 效能優化
