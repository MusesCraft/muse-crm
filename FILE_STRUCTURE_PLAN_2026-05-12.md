# 檔案結構整理計畫

> 根據 [PRD_2026-05-12_對話驅動CRM重構.md](PRD_2026-05-12_對話驅動CRM重構.md) 制定
> 本文件僅為**規劃**，不含實際刪除 / 新增動作。執行前需經人工確認。

| 項目 | 內容 |
|------|------|
| 版本 | v1.0 |
| 建立日期 | 2026-05-12 |
| 對應 PRD | v1.0 |
| 變更類型 | 大幅重構（含資料表下線、頁面下線、新增模組） |

---

## 0. 圖例與處置方式定義

| 標記 | 處置 | 說明 |
|------|------|------|
| 🗑️ | **DROP** | 整檔刪除 |
| ✏️ | **MODIFY** | 保留檔案，內容大幅修改 |
| 🆕 | **NEW** | 新增檔案 |
| 🔧 | **MINOR** | 微調（移除少數函式 / 路由） |
| ✅ | **KEEP** | 完全不動 |
| 📦 | **ARCHIVE** | 移到 `archive/` 目錄保留作為唯讀備份 |

---

## 1. 變更總覽

| 類別 | 移除 | 修改 | 新增 | 不變 |
|------|------|------|------|------|
| Backend Models | 2 | 6 | 3 | 9 |
| Backend API | 3 | 5 | 4 | 11 |
| Backend Services | 1 | 3 | 4 | 7 |
| Backend Tasks | 1 | 1 | 2 | 2 |
| Frontend Pages | 1 目錄 | 6 | 1 目錄 | 2 |
| Frontend Components | 0 | 3 | 7 | 多 |
| Database | — | schema.sql | 5 migration | — |

---

## 2. Backend 檔案處置

### 2.1 Models（`backend/app/models/`）

| 檔案 | 處置 | 說明 |
|------|------|------|
| `tag.py` | 🗑️ DROP | Tag 系統全面下線，無保留必要 |
| `broadcast.py` | 🗑️ DROP | Broadcast 功能下線 |
| `contact.py` | ✏️ MODIFY | 移除 `intent`, `budget_range`, `preferred_products`, Tag 關聯；新增 `customer_identity`, `sales_stage` |
| `conversation.py` | ✏️ MODIFY | 擴充 `status` enum；新增 `current_handler_id`, `supervisor_id`, `watchers[]`, `escalated_at`, `escalation_reason` |
| `message.py` | ✏️ MODIFY | 新增 `is_internal`（內部備註）、`mentions[]` |
| `analysis.py` | ✏️ MODIFY | 新增 `risk_flags[]`（流失/投訴/高金額預警） |
| `action.py` | ✏️ MODIFY | `conversation_id` 改為 NOT NULL |
| `role.py` | 🔧 MINOR | 新增系統角色 seed：`agent`, `supervisor`, `admin` |
| `user.py` | ✅ KEEP | — |
| `quick_reply.py` | ✅ KEEP | — |
| `product.py` | ✅ KEEP | — |
| `quote.py` | ✅ KEEP | — |
| `notification_preference.py` | ✅ KEEP | 後續擴充類別由 enum 處理 |
| `llm_usage_log.py` | ✅ KEEP | — |
| `llm_fallback_event.py` | ✅ KEEP | — |
| `system_setting.py` | ✅ KEEP | — |
| `__init__.py` | ✏️ MODIFY | 移除 `Tag`, `Broadcast` import；新增 `KnowledgeBase`, `ConversationEvent`, `ReplySuggestion` |
| `knowledge_base.py` | 🆕 NEW | KB 條目：title, content, category, embedding (pgvector) |
| `conversation_event.py` | 🆕 NEW | 對話狀態變更 audit log |
| `reply_suggestion.py` | 🆕 NEW | AI 生成的回覆草稿（用於採用率統計） |

### 2.2 API（`backend/app/api/`）

| 檔案 | 處置 | 說明 |
|------|------|------|
| `tags.py` | 🗑️ DROP | 全部端點下線 |
| `broadcast.py` | 🗑️ DROP | 全部端點下線 |
| `import_contacts.py` | ✏️ MODIFY | 移除標籤匯入邏輯，保留客戶基本欄位匯入；新增 `customer_identity`, `sales_stage` 欄位支援 |
| `contacts.py` | ✏️ MODIFY | 移除 `/tags` 子端點與 tag 篩選參數；新增 `customer_identity`, `sales_stage` 篩選 |
| `inbox.py` | ✏️ MODIFY | 對話列表加 `view`/`handler_id`/`escalated` 篩選；訊息端點加 `is_internal`, `mentions[]` 欄位 |
| `dashboard.py` | ✏️ MODIFY | 移除 `tag-distribution` 端點；新增 `first-response-time`, `resolution-rate`, `escalation-rate` 端點 |
| `actions.py` | 🔧 MINOR | `conversation_id` 改為必填 |
| `__init__.py` | ✏️ MODIFY | 移除 tags / broadcast blueprint；新增 conversation_ops / ai_copilot / knowledge_base blueprint |
| `auth.py` | ✅ KEEP | — |
| `users.py` | ✅ KEEP | — |
| `roles.py` | ✅ KEEP | — |
| `webhook.py` | ✅ KEEP | — |
| `quick_replies.py` | ✅ KEEP | — |
| `notification_preferences.py` | ✅ KEEP | — |
| `health_check.py` | ✅ KEEP | — |
| `llm_usage.py` | ✅ KEEP | — |
| `ocr.py` | ✅ KEEP | — |
| `products.py` | ✅ KEEP | — |
| `quotes.py` | ✅ KEEP | — |
| `inventory_proxy.py` | ✅ KEEP | — |
| `upload.py` | ✅ KEEP | — |
| `sync.py` | ✅ KEEP | — |
| `conversation_ops.py` | 🆕 NEW | 對話分配 / 接管 / 求援 / 旁聽 / 解決 / 重啟（PRD §6.3 對話分配與接管 9 個端點） |
| `ai_copilot.py` | 🆕 NEW | 草稿生成、對話摘要、知識檢索（PRD §6.3 AI Copilot 4 個端點） |
| `knowledge_base.py` | 🆕 NEW | 知識庫 CRUD + import（PRD §6.3 KB 端點） |
| `conversation_events.py` | 🆕 NEW | 對話 audit log 查詢端點 |

### 2.3 Services（`backend/app/services/`）

| 檔案 | 處置 | 說明 |
|------|------|------|
| `auto_tagger.py` | 🗑️ DROP | 自動打標籤邏輯隨 Tag 系統下線 |
| `llm_service.py` | ✏️ MODIFY | 加入串流（SSE）介面、`generate_reply_suggestions()`、`detect_risks()` |
| `prompts.py` | ✏️ MODIFY | 新增 reply_suggestion / risk_detection / summary prompts；移除 tag_suggestion prompt |
| `notification_service.py` | ✏️ MODIFY | 新增 escalation / mention / take_over 通知類型 |
| `contact_service.py` | ✅ KEEP | — |
| `merge_service.py` | ✅ KEEP | — |
| `action_service.py` | ✅ KEEP | — |
| `session_service.py` | ✅ KEEP | — |
| `history_sync_service.py` | ✅ KEEP | — |
| `data_health_service.py` | ✅ KEEP | — |
| `ocr_service.py` | ✅ KEEP | — |
| `assignment_service.py` | 🆕 NEW | 自動分配規則：沿用上次負責人 → AI 路由 → 輪詢 → 降級為待認領 |
| `escalation_service.py` | 🆕 NEW | 客服求援、主管接管、強制接管、歸還、旁聽核心邏輯 |
| `knowledge_base_service.py` | 🆕 NEW | KB CRUD、embedding 生成、向量檢索、re-rank |
| `copilot_service.py` | 🆕 NEW | 整合 LLM + KB + 對話上下文，生成回覆草稿 |

### 2.4 Tasks（`backend/app/tasks/`）

| 檔案 | 處置 | 說明 |
|------|------|------|
| `broadcast_tasks.py` | 🗑️ DROP | 廣播任務下線（含 `check_scheduled_broadcasts`, `execute_broadcast`） |
| `analysis_tasks.py` | ✏️ MODIFY | `analyze_conversation` 新增 risk_flags 輸出；新增「對話開啟時觸發摘要」 task |
| `maintenance_tasks.py` | ✅ KEEP | — |
| `notification_tasks.py` | ✅ KEEP | — |
| `session_tasks.py` | ✅ KEEP | — |
| `assignment_tasks.py` | 🆕 NEW | 處理「客服離線時對話自動回到待認領池」 |
| `kb_embedding_tasks.py` | 🆕 NEW | 異步生成 KB 條目的 embedding |

### 2.5 Utils / Channels / Realtime（其他）

| 檔案 | 處置 | 說明 |
|------|------|------|
| `realtime/events.py` | ✏️ MODIFY | 新增 `conversation.assigned`, `conversation.escalated`, `conversation.taken_over`, `conversation.returned`, `conversation.resolved`, `ai.suggestion.ready`, `ai.risk.detected`, `notification.mention` 事件 |
| `realtime/emitter.py` | 🔧 MINOR | `emit_scoped` 支援新事件 |
| `utils/scope.py` | ✏️ MODIFY | 加入「supervisor 接管中對話」與「watcher 旁聽中對話」可見性規則 |
| `utils/permissions.py` | 🔧 MINOR | 新增 `take_over`, `escalate`, `manage_kb`, `force_take_over` 權限 |
| `channels/*` | ✅ KEEP | 全數維持 |
| `utils/auth.py` | ✅ KEEP | — |
| `utils/meta_api.py` | ✅ KEEP | — |
| `utils/media_storage.py` | ✅ KEEP | — |
| `utils/inventory_client.py` | ✅ KEEP | — |
| `utils/error_handler.py` | ✅ KEEP | — |
| `config.py` | 🔧 MINOR | 新增 KB 相關設定（embedding model、re-rank 開關、pgvector 連線） |

---

## 3. Frontend 檔案處置

### 3.1 Pages（`frontend/src/app/`）

| 路徑 | 處置 | 說明 |
|------|------|------|
| `(app)/broadcast/` | 🗑️ DROP | 整個目錄移除 |
| `(app)/inbox/page.tsx` | ✏️ MODIFY | 三欄式 layout（視圖切換 + 對話流 + AI Copilot） |
| `(app)/inbox/conversation-list.tsx` | ✏️ MODIFY | 新增三種視圖切換、AI 標記、求援徽章 |
| `(app)/inbox/conversation-detail.tsx` | ✏️ MODIFY | 新增主管接管橫幅、求援按鈕、內部備註輸入切換 |
| `(app)/inbox/customer-sidebar.tsx` | ✏️ MODIFY | 移除標籤區塊；新增客戶身份、銷售階段；新增「此對話的 Action」清單 |
| `(app)/inbox/message-bubble.tsx` | 🔧 MINOR | 新增內部備註樣式（黃底框）、@mention 渲染 |
| `(app)/inbox/send-bar.tsx` | ✏️ MODIFY | 新增「內部備註」切換、「求援」按鈕、@mention 自動完成 |
| `(app)/contacts/page.tsx` | ✏️ MODIFY | 移除標籤篩選；新增客戶身份、銷售階段篩選 |
| `(app)/contacts/[id]/page.tsx` | ✏️ MODIFY | 移除標籤區塊；新增銷售階段、結構化身份 |
| `(app)/contacts/import-dialog.tsx` | 🔧 MINOR | 移除標籤匯入；保留客戶基本欄位匯入 |
| `(app)/dashboard/page.tsx` | ✏️ MODIFY | 整頁重新設計（PRD §F10）：首次回覆時間、解決率、求援率、AI 採用率 |
| `(app)/actions/page.tsx` | 🔧 MINOR | Action 卡片新增「來源對話」連結 |
| `(app)/settings/page.tsx` | ✏️ MODIFY | 移除標籤管理頁籤；新增「AI 設定」、「知識庫管理」、「自動分配規則」頁籤 |
| `(app)/settings/roles-tab.tsx` | 🔧 MINOR | 新增系統預設角色說明 |
| `(app)/knowledge-base/` | 🆕 NEW | KB 管理頁面（列表、編輯、批量匯入） |
| `(app)/knowledge-base/page.tsx` | 🆕 NEW | 列表頁 |
| `(app)/knowledge-base/[id]/page.tsx` | 🆕 NEW | 編輯頁 |
| `(app)/quotes/*` | ✅ KEEP | — |
| `(app)/inventory/*` | ✅ KEEP | — |
| `(app)/layout.tsx` | 🔧 MINOR | 側邊欄移除「廣播」、「標籤」連結；新增「知識庫」連結 |
| `login/page.tsx` | ✅ KEEP | — |

### 3.2 Components（`frontend/src/components/`）

| 檔案 | 處置 | 說明 |
|------|------|------|
| `sidebar.tsx` | ✏️ MODIFY | 導航項目調整（移除 broadcast，新增 knowledge-base） |
| `badges.tsx` | ✏️ MODIFY | 新增對話狀態徽章（unassigned / escalated / supervisor_taken / resolved） |
| `status-badge.tsx` | 🔧 MINOR | 新增新狀態樣式 |
| `avatar.tsx` | ✅ KEEP | — |
| `channel-icon.tsx` | ✅ KEEP | — |
| `loading.tsx` | ✅ KEEP | — |
| `skeletons.tsx` | ✅ KEEP | — |
| `contact-preview.tsx` | ✅ KEEP | — |
| `column-visibility.tsx` | ✅ KEEP | — |
| `resize-handle.tsx` | ✅ KEEP | — |
| `ui/*.tsx`（shadcn 元件） | ✅ KEEP | — |
| `copilot/copilot-panel.tsx` | 🆕 NEW | AI Copilot 側欄主元件 |
| `copilot/intent-card.tsx` | 🆕 NEW | 即時意圖與情緒卡片 |
| `copilot/summary-card.tsx` | 🆕 NEW | 對話摘要卡片 |
| `copilot/reply-suggestion.tsx` | 🆕 NEW | 回覆草稿卡片（含串流動畫） |
| `copilot/kb-card.tsx` | 🆕 NEW | 知識庫條目卡片 |
| `copilot/risk-alert.tsx` | 🆕 NEW | 風險預警橫幅 |
| `inbox/escalation-button.tsx` | 🆕 NEW | 求援按鈕 + 表單彈窗 |
| `inbox/take-over-banner.tsx` | 🆕 NEW | 主管接管橫幅（含歸還按鈕） |
| `inbox/internal-note-bubble.tsx` | 🆕 NEW | 內部備註訊息泡泡 |
| `inbox/assign-menu.tsx` | 🆕 NEW | 分配 / 重新指派下拉選單 |

### 3.3 Lib（`frontend/src/lib/`）

| 檔案 | 處置 | 說明 |
|------|------|------|
| `api.ts` | ✏️ MODIFY | 移除 tags / broadcasts API client；新增 conversation_ops / ai_copilot / kb client |
| `hooks.ts` | ✏️ MODIFY | 移除 tag 相關 hooks；新增 `useConversationAssignment`, `useEscalation`, `useAISuggestions`, `useKnowledgeSearch` |
| `mock-data.ts` | ✏️ MODIFY | 移除標籤 / 廣播 mock；新增對話狀態 / KB / 草稿 mock |
| `auth.tsx` | ✅ KEEP | — |
| `theme.tsx` | ✅ KEEP | — |
| `format.ts` | ✅ KEEP | — |
| `utils.ts` | ✅ KEEP | — |
| `use-column-visibility.ts` | ✅ KEEP | — |
| `ws.ts` | 🆕 NEW | WebSocket 客戶端（封裝 SocketIO，supervisor 接管、AI 串流） |
| `sse.ts` | 🆕 NEW | Server-Sent Events 客戶端（AI 回覆草稿串流） |

---

## 4. Database 處置

### 4.1 `database/schema.sql`
✏️ MODIFY — 對應下列 migration 後同步更新（作為單一真實來源）。

### 4.2 新 Migration（依執行順序）

| 序 | 檔名範例 | 內容 |
|----|---------|------|
| 1 | `j8e9f0a1b2c3_crm_025_add_knowledge_base_pgvector.py` | 啟用 pgvector 擴充；建立 `knowledge_base` 表 |
| 2 | `k9f0a1b2c3d4_crm_026_add_conversation_events.py` | 建立 `conversation_events` 表 |
| 3 | `l0a1b2c3d4e5_crm_027_add_reply_suggestions.py` | 建立 `reply_suggestions` 表 |
| 4 | `m1b2c3d4e5f6_crm_028_refactor_contact_conversation.py` | Contact 增減欄位 + Conversation 接管欄位 + Message internal/mentions + Analysis risk_flags |
| 5 | `n2c3d4e5f6a7_crm_029_drop_tags_broadcasts.py` | 下線 tags / contact_tags / broadcasts 三表（含資料備份步驟） |

### 4.3 資料下線備份策略
在 migration 5 執行前，於應用程式內提供 admin-only 端點 `POST /api/v1/admin/archive-legacy`，將 `tags`、`contact_tags`、`broadcasts` 三表內容 export 成 JSON 落地至 S3 / Railway Volume，作為唯讀備份。

---

## 5. 目標檔案樹（重構後）

```
muse-crm/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── __init__.py                  ✏️
│   │   │   ├── actions.py                   🔧
│   │   │   ├── ai_copilot.py                🆕
│   │   │   ├── auth.py
│   │   │   ├── contacts.py                  ✏️
│   │   │   ├── conversation_events.py       🆕
│   │   │   ├── conversation_ops.py          🆕
│   │   │   ├── dashboard.py                 ✏️
│   │   │   ├── health_check.py
│   │   │   ├── import_contacts.py           ✏️
│   │   │   ├── inbox.py                     ✏️
│   │   │   ├── inventory_proxy.py
│   │   │   ├── knowledge_base.py            🆕
│   │   │   ├── llm_usage.py
│   │   │   ├── notification_preferences.py
│   │   │   ├── ocr.py
│   │   │   ├── products.py
│   │   │   ├── quick_replies.py
│   │   │   ├── quotes.py
│   │   │   ├── roles.py
│   │   │   ├── sync.py
│   │   │   ├── upload.py
│   │   │   ├── users.py
│   │   │   └── webhook.py
│   │   ├── channels/                        ✅ 無變動
│   │   ├── models/
│   │   │   ├── __init__.py                  ✏️
│   │   │   ├── action.py                    ✏️
│   │   │   ├── analysis.py                  ✏️
│   │   │   ├── contact.py                   ✏️
│   │   │   ├── conversation.py              ✏️
│   │   │   ├── conversation_event.py        🆕
│   │   │   ├── knowledge_base.py            🆕
│   │   │   ├── llm_fallback_event.py
│   │   │   ├── llm_usage_log.py
│   │   │   ├── message.py                   ✏️
│   │   │   ├── notification_preference.py
│   │   │   ├── product.py
│   │   │   ├── quick_reply.py
│   │   │   ├── quote.py
│   │   │   ├── reply_suggestion.py          🆕
│   │   │   ├── role.py                      🔧
│   │   │   ├── system_setting.py
│   │   │   └── user.py
│   │   ├── realtime/
│   │   │   ├── emitter.py                   🔧
│   │   │   └── events.py                    ✏️
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── action_service.py
│   │   │   ├── assignment_service.py        🆕
│   │   │   ├── contact_service.py
│   │   │   ├── copilot_service.py           🆕
│   │   │   ├── data_health_service.py
│   │   │   ├── escalation_service.py        🆕
│   │   │   ├── history_sync_service.py
│   │   │   ├── knowledge_base_service.py    🆕
│   │   │   ├── llm_service.py               ✏️
│   │   │   ├── merge_service.py
│   │   │   ├── notification_service.py      ✏️
│   │   │   ├── ocr_service.py
│   │   │   ├── prompts.py                   ✏️
│   │   │   └── session_service.py
│   │   ├── tasks/
│   │   │   ├── __init__.py
│   │   │   ├── analysis_tasks.py            ✏️
│   │   │   ├── assignment_tasks.py          🆕
│   │   │   ├── kb_embedding_tasks.py        🆕
│   │   │   ├── maintenance_tasks.py
│   │   │   ├── notification_tasks.py
│   │   │   └── session_tasks.py
│   │   ├── utils/
│   │   │   ├── auth.py
│   │   │   ├── error_handler.py
│   │   │   ├── inventory_client.py
│   │   │   ├── media_storage.py
│   │   │   ├── meta_api.py
│   │   │   ├── permissions.py               🔧
│   │   │   └── scope.py                     ✏️
│   │   ├── __init__.py
│   │   └── config.py                        🔧
│   └── migrations/
│       └── versions/
│           ├── ...（既有 migrations 全數保留）
│           ├── j8e9f0a1b2c3_crm_025_add_knowledge_base_pgvector.py    🆕
│           ├── k9f0a1b2c3d4_crm_026_add_conversation_events.py        🆕
│           ├── l0a1b2c3d4e5_crm_027_add_reply_suggestions.py          🆕
│           ├── m1b2c3d4e5f6_crm_028_refactor_contact_conversation.py  🆕
│           └── n2c3d4e5f6a7_crm_029_drop_tags_broadcasts.py           🆕
├── database/
│   └── schema.sql                           ✏️
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── (app)/
│       │   │   ├── actions/page.tsx         🔧
│       │   │   ├── contacts/
│       │   │   │   ├── [id]/page.tsx        ✏️
│       │   │   │   ├── import-dialog.tsx    🔧
│       │   │   │   └── page.tsx             ✏️
│       │   │   ├── dashboard/page.tsx       ✏️
│       │   │   ├── inbox/
│       │   │   │   ├── conversation-detail.tsx  ✏️
│       │   │   │   ├── conversation-list.tsx    ✏️
│       │   │   │   ├── customer-sidebar.tsx     ✏️
│       │   │   │   ├── message-bubble.tsx       🔧
│       │   │   │   ├── send-bar.tsx             ✏️
│       │   │   │   └── page.tsx                 ✏️
│       │   │   ├── inventory/                   ✅
│       │   │   ├── knowledge-base/              🆕
│       │   │   │   ├── [id]/page.tsx            🆕
│       │   │   │   └── page.tsx                 🆕
│       │   │   ├── quotes/                      ✅
│       │   │   ├── settings/
│       │   │   │   ├── ai-tab.tsx               🆕
│       │   │   │   ├── assignment-rules-tab.tsx 🆕
│       │   │   │   ├── page.tsx                 ✏️
│       │   │   │   └── roles-tab.tsx            🔧
│       │   │   └── layout.tsx                   🔧
│       │   ├── login/page.tsx                   ✅
│       │   ├── layout.tsx
│       │   └── page.tsx
│       ├── components/
│       │   ├── copilot/                         🆕
│       │   │   ├── copilot-panel.tsx
│       │   │   ├── intent-card.tsx
│       │   │   ├── kb-card.tsx
│       │   │   ├── reply-suggestion.tsx
│       │   │   ├── risk-alert.tsx
│       │   │   └── summary-card.tsx
│       │   ├── inbox/                           🆕
│       │   │   ├── assign-menu.tsx
│       │   │   ├── escalation-button.tsx
│       │   │   ├── internal-note-bubble.tsx
│       │   │   └── take-over-banner.tsx
│       │   ├── ui/                              ✅ shadcn 元件保留
│       │   ├── avatar.tsx
│       │   ├── badges.tsx                       ✏️
│       │   ├── channel-icon.tsx
│       │   ├── column-visibility.tsx
│       │   ├── contact-preview.tsx
│       │   ├── loading.tsx
│       │   ├── resize-handle.tsx
│       │   ├── sidebar.tsx                      ✏️
│       │   ├── skeletons.tsx
│       │   └── status-badge.tsx                 🔧
│       └── lib/
│           ├── api.ts                           ✏️
│           ├── auth.tsx
│           ├── format.ts
│           ├── hooks.ts                         ✏️
│           ├── mock-data.ts                     ✏️
│           ├── sse.ts                           🆕
│           ├── theme.tsx
│           ├── use-column-visibility.ts
│           ├── utils.ts
│           └── ws.ts                            🆕
├── archive/                                     🆕
│   └── 2026-05-12_legacy_tags_broadcasts/
│       ├── README.md                            （說明備份來源與時間）
│       ├── tags_export.json
│       ├── contact_tags_export.json
│       └── broadcasts_export.json
├── PRD_2026-05-12_對話驅動CRM重構.md
├── FILE_STRUCTURE_PLAN_2026-05-12.md
├── CLAUDE.md
└── docker-compose.yml
```

---

## 6. PR 拆分建議

> 依 PRD 的 4 個 Phase 對齊，每個 PR 範圍可控制在 < 1500 LOC，便於 review。

### PR-1：基礎重構 — Tag/Broadcast 下線
**Scope**：Phase 1 前置
- DROP backend models：`tag.py`, `broadcast.py`
- DROP backend api：`tags.py`, `broadcast.py`
- DROP backend tasks：`broadcast_tasks.py`
- DROP backend services：`auto_tagger.py`
- DROP frontend page：`(app)/broadcast/`
- MODIFY 相關 `__init__.py`、`sidebar.tsx`、`api.ts`、`hooks.ts`
- MIGRATION：`crm_029_drop_tags_broadcasts`（含資料備份至 `archive/`）

**驗收**：tests 通過 / Railway 部署成功 / 不再有 tag/broadcast UI 進入點。

### PR-2：Contact / Conversation 結構調整
**Scope**：Phase 1 中段
- MODIFY models：`contact.py`, `conversation.py`, `message.py`, `analysis.py`, `action.py`
- MIGRATION：`crm_028_refactor_contact_conversation`
- MODIFY api：`contacts.py`, `inbox.py`, `import_contacts.py`
- MODIFY 前端：customer-sidebar、contacts pages

**驗收**：客戶詳情顯示新欄位 / 對話狀態 enum 已擴充。

### PR-3：對話分配與接管（後端）
**Scope**：Phase 2 後端
- NEW models：`conversation_event.py`
- NEW api：`conversation_ops.py`, `conversation_events.py`
- NEW services：`assignment_service.py`, `escalation_service.py`
- NEW tasks：`assignment_tasks.py`
- MIGRATION：`crm_026_add_conversation_events`
- MODIFY：`realtime/events.py`, `realtime/emitter.py`, `utils/scope.py`, `utils/permissions.py`

**驗收**：9 個對話操作端點全部可用 / WebSocket 事件可推播。

### PR-4：對話分配與接管（前端）
**Scope**：Phase 2 前端
- NEW components：inbox/escalation-button, take-over-banner, internal-note-bubble, assign-menu
- MODIFY pages：inbox/* 全部
- MODIFY components：badges, sidebar
- MODIFY lib：ws.ts, hooks.ts

**驗收**：模擬完整接管流程通過 e2e。

### PR-5：AI Copilot 基礎建設
**Scope**：Phase 3 前置
- NEW models：`knowledge_base.py`, `reply_suggestion.py`
- NEW api：`knowledge_base.py`
- NEW services：`knowledge_base_service.py`, `copilot_service.py`
- NEW tasks：`kb_embedding_tasks.py`
- MIGRATION：`crm_025_add_knowledge_base_pgvector`, `crm_027_add_reply_suggestions`
- NEW frontend page：`(app)/knowledge-base/*`
- MODIFY：`llm_service.py`, `prompts.py`, `config.py`

**驗收**：KB 可建立、檢索；pgvector 可用。

### PR-6：AI Copilot 串流 UI
**Scope**：Phase 3 後段
- NEW api：`ai_copilot.py`（含 SSE 串流端點）
- NEW components：copilot/*
- NEW lib：`sse.ts`
- MODIFY：inbox/send-bar.tsx、conversation-detail.tsx 整合 Copilot panel
- MODIFY：`analysis_tasks.py` 增加風險預警輸出

**驗收**：3 則回覆草稿可串流顯示 / 採用率可追蹤。

### PR-7：儀表板與設定改版
**Scope**：Phase 4
- MODIFY：`dashboard.py` (api)、`dashboard/page.tsx`
- NEW：`settings/ai-tab.tsx`, `settings/assignment-rules-tab.tsx`
- MODIFY：`settings/page.tsx`

**驗收**：主管儀表板可看 KPI / AI 設定可調整。

### PR-8：Hardening & e2e
**Scope**：Phase 4 收尾
- 補測試
- Sentry 整合
- 成本 metric / 告警
- README / CHANGELOG 更新

---

## 7. 執行順序原則

1. **先下線、再重構、最後新增**：先做 PR-1 把不要的東西砍掉，避免重構時被舊邏輯絆住。
2. **資料庫變更分散在多個 PR**：每個 migration 必須可獨立執行、可回滾。
3. **後端先於前端 1-2 個 PR**：後端 API 穩定後，前端對接才不會頻繁返工。
4. **AI 功能放最後**：等核心對話流程穩定，再疊上 Copilot。
5. **每個 PR 必須附 e2e 測試**：對話狀態變更、接管、求援等是高風險邏輯。

---

## 8. 影響檔案總清單（快速核對表）

### 8.1 將被刪除（共 6 檔 + 1 目錄）
- `backend/app/models/tag.py`
- `backend/app/models/broadcast.py`
- `backend/app/api/tags.py`
- `backend/app/api/broadcast.py`
- `backend/app/services/auto_tagger.py`
- `backend/app/tasks/broadcast_tasks.py`
- `frontend/src/app/(app)/broadcast/`（整個目錄）

### 8.2 將被新增（共 31 檔 + 3 目錄）
**Backend**：
- `models/`: knowledge_base.py, conversation_event.py, reply_suggestion.py
- `api/`: conversation_ops.py, conversation_events.py, ai_copilot.py, knowledge_base.py
- `services/`: assignment_service.py, escalation_service.py, knowledge_base_service.py, copilot_service.py
- `tasks/`: assignment_tasks.py, kb_embedding_tasks.py
- `migrations/versions/`: 5 個新 migration

**Frontend**：
- `app/(app)/knowledge-base/`：page.tsx, [id]/page.tsx
- `components/copilot/`：6 檔
- `components/inbox/`：4 檔
- `app/(app)/settings/`：ai-tab.tsx, assignment-rules-tab.tsx
- `lib/`: ws.ts, sse.ts

### 8.3 將被修改（核心檔案 30+ 檔）
參見 §2、§3 各表，標記 ✏️ 與 🔧 者。

---

## 9. 風險提醒

| 風險 | 緩解 |
|------|------|
| Tag / Broadcast 下線造成生產資料遺失 | 強制執行 archive export 後才能跑 migration |
| Conversation 狀態 enum 變更影響既有資料 | migration 內含資料轉換腳本（既有 active/closed → 新狀態） |
| pgvector 在 Railway 上未驗證 | PR-5 前需獨立 spike，必要時改用外部向量 DB |
| 前端三欄式 inbox 影響行動裝置體驗 | 響應式設計：< 1024px 時 AI Copilot 變抽屜（drawer） |
| AI 串流端點長連線壓力 | 限制單一使用者並發 SSE 連線數，超出降級為非串流模式 |

---

## 10. 下一步行動

1. **確認本計畫**：審閱後確認移除清單與新增清單是否合理。
2. **建立 GitHub Issue / Linear**：將 PR-1 ~ PR-8 各自開單。
3. **進行 pgvector spike**：在 Railway 測試環境驗證可用性。
4. **動工 PR-1**：從刪除入手是風險最低的起點。

> 確認進入執行階段後，我可以從 PR-1（Tag/Broadcast 下線）開始實作。
