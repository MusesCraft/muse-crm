# MUSE CRM 功能架構文件（PM 視角）

| 項目 | 內容 |
|------|------|
| 版本 | v1.0 |
| 建立日期 | 2026-05-14 |
| 文件性質 | 功能盤點 / 模組地圖（依據實際 codebase 與 PRD 校準） |
| 對應 PRD | PRD_2026-05-12_對話驅動CRM重構.md v1.0 |
| 對應檔案規劃 | FILE_STRUCTURE_PLAN_2026-05-12.md v1.0 |
| 部署環境 | Railway（backend / frontend / postgres / redis 四 service） |
| 目標產業 | 石材建材（石英石、人造石、岩板） |

> 本文件用於回答三個 PM 層級問題：**「我們現在提供哪些功能？」、「誰來用、怎麼用？」、「下一步該做什麼？」**
> 文件以模組（Feature Module）為主軸組織，每個模組同時列出前端入口、後端能力、資料模型與目前實作狀態。

---

## 1. 產品概述

### 1.1 一句話定位
> **建材業的「對話驅動」客戶溝通中台**：把 Messenger / Instagram / LINE 三個渠道整合成單一收件匣，並用 AI 副駕駛協助第一線客服回得快、回得對；同時讓主管能即時看到團隊狀況、必要時介入指導。

### 1.2 核心命題（為什麼是這個產品）
| 命題 | 說明 |
|------|------|
| 高客單、長決策 | 建材一筆 10 萬以上、決策週期 2-4 週，1-on-1 對話 ROI 遠高於群發廣播 |
| 多渠道分散 | 客戶可能同時來自 IG DM、Messenger、LINE，需要被整合為「同一個人」 |
| AI 能補資訊不對稱 | 客服不一定每款規格都熟，AI 可即時撈知識庫、生成草稿 |
| 主管時間有限 | 主管不可能每通對話都看；產品需主動標出「需要注意」的對話 |

### 1.3 北極星與輔助指標
| 指標類型 | 指標 | 現況/目標 |
|---------|------|----------|
| 北極星 | 對話 30 天轉換率（對話 → 報價 / 訂單） | 目標相對提升 +15% |
| 速度 | P50 首次回覆時間 | 目標 < 5 分鐘 |
| 速度 | P90 首次回覆時間 | 目標 < 30 分鐘 |
| 結案 | 對話解決率 | 目標 ≥ 75% |
| 求援 | 客服求援平均回應時間 | 目標 < 3 分鐘 |
| AI | 草稿採用率 | 目標 ≥ 30% |
| AI | 草稿編輯率（採用後修改） | 目標 ≤ 50% |

KPI 端點已實裝於 `dashboard.py`：`/dashboard/first-response-time`、`/dashboard/resolution-rate`、`/dashboard/escalation-rate`、`/dashboard/conversation-status`。

---

## 2. 使用者角色

| 角色 (DB role) | 對外稱呼 | 核心職責 | 進入點 |
|---------------|---------|---------|-------|
| `admin` | 管理員 | 帳號、權限、AI 設定、系統健康度 | `/settings`、`/dashboard` |
| `manager` | 主管 | 分配對話、培訓客服、處理升級案件、追蹤團隊 KPI | `/dashboard`、`/inbox`（團隊視圖） |
| `user`（=agent） | 客服 | 回覆客戶、求援、結案、建立報價 | `/inbox`（我的對話） |

> ⚠️ **角色現況注意**：DB 仍使用 `admin / manager / user` 三級命名（`User.role` CheckConstraint）；PRD v1.0 想改為 `admin / supervisor / agent`，目前 API 已可同時接受兩套命名，但 schema 尚未遷移。

### 2.1 權限矩陣（依 PRD §9.1 + 實際 conversation_ops 端點）
| 動作 | agent (user) | manager | admin |
|------|-------------|---------|-------|
| 看自己的對話 | ✅ | ✅ | ✅ |
| 看所有對話 | ❌ | ✅ | ✅ |
| 認領待認領對話 | ✅ | ✅ | ✅ |
| 分配對話給他人 | ❌ | ✅ | ✅ |
| 旁聽 / 取消旁聽 | ❌ | ✅ | ✅ |
| 接管 Take Over | ❌ | ✅ | ✅ |
| 強制接管 | ❌ | ❌ | ✅ |
| 客服求援 escalate | ✅ | ❌ | ❌ |
| 標記已解決 | ✅（自己的） | ✅ | ✅ |
| 重啟對話 | ✅ | ✅ | ✅ |
| 看儀表板 KPI | 受限 | ✅ | ✅ |
| 管理使用者 / 角色 | ❌ | ❌ | ✅ |
| 管理知識庫 | 唯讀 | ✅ | ✅ |
| 修改 AI 設定 | ❌ | ❌ | ✅ |

> 🔴 **產品方向修正中**：依使用者 2026-05-12 反饋，主管角色應收斂為「**監看 + 指導**」，不直接下場回覆客戶。take-over 端點目前仍在 codebase 中，但中期應由「nudge / 內部備註指導 / @提及」取代。對應 git 歷史有相關嘗試與 revert（commit `a27a0a1` revert PRD v1.1）。

---

## 3. 功能模組地圖（Feature Modules）

> 共識：以「能交付一個用戶價值」為一個模組單位，每個模組對應一組頁面、一組 API、一組資料表。

```
┌─────────────────────────────────────────────────────────────────┐
│  M1 訊息接收層（Webhook + Channel Adapter）                       │
│      ↓                                                          │
│  M2 統一收件匣 Inbox（核心頁面）                                   │
│      ├── M3 對話狀態機 & 分配 / 接管 / 求援                       │
│      ├── M4 AI Copilot（草稿、摘要、KB 檢索、風險預警）            │
│      ├── M5 內部協作（內部備註、@ 提及）                          │
│      └── M6 客戶側欄（客戶資料、跨渠道歷史）                       │
│                                                                 │
│  M7 客戶管理 Contacts（含 CSV 匯入、合併、銷售階段）              │
│  M8 待辦動作 Actions（與對話強綁定）                              │
│  M9 知識庫 Knowledge Base                                       │
│  M10 報價 Quote / 產品 Product / 庫存 Inventory                  │
│  M11 快速回覆 Quick Replies（預存語錄）                          │
│  M12 儀表板 Dashboard / KPI                                     │
│  M13 通知系統 Notification（WebSocket + Discord/Email/LINE）     │
│  M14 設定 Settings（個人 / 團隊 / AI / 分配規則 / 角色）           │
│  M15 認證與權限 Auth / RBAC                                     │
│  M16 觀測與成本 LLM Usage / Health / Audit Log                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. 模組詳述

### M1 訊息接收層 — Webhook & Channel Adapter

| 屬性 | 內容 |
|------|------|
| 用戶價值 | 客戶從任一管道發訊息，2 秒內進入收件匣 |
| 前端入口 | （無 UI，純後端） |
| 後端 API | `POST /webhook`（Meta）、`POST /webhook/line` |
| 後端模組 | `app/channels/meta_adapter.py`、`line_adapter.py`、`registry.py` |
| 核心能力 | 簽名驗證 / 事件解析 / Profile 拉取 / 訊息發送 / 去重（`meta_message_id`） |
| 資料表 | `channel_identifiers`（PSID / ASID / LINE UID）、`messages` |
| 支援渠道 | Messenger / Instagram DM / LINE |
| 狀態 | ✅ 已上線 |

> ASID 用於 Meta 跨平台客戶識別，是「同一個人在 IG 與 Messenger」自動合併的依據。

---

### M2 統一收件匣 Inbox（產品核心頁面）

| 屬性 | 內容 |
|------|------|
| 用戶價值 | 一個畫面回覆所有渠道，AI 在右側即時提供協助 |
| 前端頁面 | `/inbox`（三欄式：視圖切換 + 對話流 + AI Copilot 側欄）|
| 前端元件 | `conversation-list.tsx`、`conversation-detail.tsx`、`customer-sidebar.tsx`、`message-bubble.tsx`、`send-bar.tsx`、`copilot/*` |
| 後端 API | `GET /inbox/conversations`、`GET/POST /inbox/conversations/{id}`、`POST /inbox/conversations/{id}/send`、`POST /inbox/conversations/{id}/analyze`、`/close` |
| 視圖 | 我的對話 / 待認領 / 團隊視圖（manager+） / 已解決 / 已關閉 |
| 篩選 | 狀態、渠道、負責人（manager+）、全文搜尋 |
| 即時更新 | 10 秒輪詢 + WebSocket 事件即時刷新 |
| 響應式 | 桌面三欄 / 平板雙欄 / 手機抽屜（Copilot drawer）|
| 狀態 | ✅ 已上線 |

#### 對話狀態機（M3 強相關）

```
   [新訊息進入]
       │
       ▼
   ┌────────────┐  自動分配規則  ┌──────────┐
   │ unassigned │ ────────────▶ │  active  │
   └────────────┘                └──────────┘
                                  ▲   │   │
                          求援/接管│   │   │ 客服已回
                                  │   ▼   ▼
                              ┌──────────────────────┐
                              │ escalated            │
                              │ supervisor_taken     │
                              │ waiting_customer     │
                              └──────────────────────┘
                                       │
                                  「標記已解決」
                                       ▼
                                  ┌─────────┐
                                  │resolved │
                                  └─────────┘
                                       │ 手動或 24h 無新訊息
                                       ▼
                                  ┌─────────┐
                                  │ closed  │  ← 客戶再次來訊則 reopen
                                  └─────────┘
```

DB 已加 CheckConstraint：`status IN ('unassigned','active','waiting_customer','escalated','supervisor_taken','resolved','closed')`。

---

### M3 對話分配 / 接管 / 求援 / 旁聽

| 屬性 | 內容 |
|------|------|
| 用戶價值 | 對話有人接、棘手有人罩、客戶不漏 |
| 前端入口 | 收件匣對話頂端控制列、求援按鈕、接管 Banner |
| 後端 API | `POST /inbox/conversations/{id}/assign`、`/escalate`、`/take-over`、`/return`、`/watch`、`DELETE /watch`、`/resolve`、`/reopen`、`GET /events` |
| 後端服務 | `assignment_service.py`、`escalation_service.py` |
| 資料表 | `conversations`（current_handler_id / supervisor_id / watchers[] / escalated_at / escalation_reason）、`conversation_events`（audit log） |
| 自動分配規則 | 沿用上次負責人（30 天）→ 輪詢 → 降級為 unassigned |
| 求援限制 | reason 必填且 ≤ 200 字 |
| 強制接管 | admin only，必留 audit log |
| 狀態 | ✅ 已上線；🟡 「主管監看 + nudge」方向待補（目前以 take-over 為主） |

---

### M4 AI Copilot（即時副駕駛）

| 子能力 | 用戶價值 | 模型 | API | 狀態 |
|--------|---------|------|-----|------|
| 即時意圖分類 | 訊息進來自動標 pricing/spec/visit/complaint... | Gemini Flash Lite | `analysis_tasks.quick_triage` | ✅ |
| 對話摘要 | 主管 30 秒掌握脈絡 | claude-haiku | `GET /ai/summary` | 🟡 stub（簡單拼接最後 5 則） |
| 智能回覆草稿 | 3 則 AI 建議回覆 | claude-sonnet-4-6 | `GET /ai/suggestions`（含 SSE 串流參數） | 🟡 路由完成、LLM 串流尚未接 |
| 知識庫檢索（RAG） | 客戶提到產品 → 自動撈卡片 | text-embedding-3-small | `GET /ai/knowledge-search` | 🟡 目前用 PG LIKE，pgvector 未實裝 |
| 風險預警 | 流失 / 投訴 / 高金額預警 | Gemini Flash Lite | analysis_tasks 寫入 `analyses.risk_flags` | 🟡 schema 就緒，prompt 待補 |
| 草稿採用率追蹤 | 衡量 AI 真實價值 | — | `POST /ai/suggestions/{id}/used` | ✅ |

**前端元件**：`copilot/copilot-panel.tsx`、`intent-card.tsx`、`summary-card.tsx`、`reply-suggestion.tsx`、`kb-card.tsx`、`risk-alert.tsx`

**成本控制**：`llm_usage_log` 表追蹤每次呼叫，`llm_fallback_event` 表記錄降級事件，`/llm/usage/summary` 可查詢預算。

---

### M5 內部協作 — 內部備註 & @ 提及

| 屬性 | 內容 |
|------|------|
| 用戶價值 | 對話中可以「私下討論」，不打擾客戶 |
| 機制 | `Message.is_internal=true` 不會送 Meta/LINE，僅顯示給團隊（黃底） |
| @ 提及 | `Message.mentions[]` 存被提及 user UUID，觸發 WebSocket 通知 |
| API | `POST /inbox/conversations/{id}/send` body 帶 `is_internal`、`mentions` |
| 狀態 | ✅ 已上線（前端 send-bar 切換、後端 inbox.py 已整合） |

---

### M6 客戶側欄（Customer Sidebar）

| 屬性 | 內容 |
|------|------|
| 位置 | Inbox 右下方（與 AI Copilot 共用側邊） |
| 顯示 | 基本資料、客戶身份（designer/homeowner/dealer/contractor）、銷售階段、負責客服、跨渠道對話歷史、此對話的待辦動作 |
| 編輯 | 客服可即時更新銷售階段、客戶身份 |
| 跨渠道歷史 | 同一個 Contact 在 IG/FB/LINE 的所有對話列表 |
| 狀態 | ✅ 已上線 |

---

### M7 客戶管理 Contacts

| 屬性 | 內容 |
|------|------|
| 用戶價值 | 跨渠道客戶單一視圖，可標註身份、跟單階段、合併重複 |
| 前端頁面 | `/contacts`（列表 + 篩選）、`/contacts/[id]`（詳情）、`import-dialog.tsx` |
| 後端 API | `GET/POST/PATCH /contacts`、`/contacts/merge`、`/contacts/search`、`POST /admin/import-csv` |
| 結構化欄位 | `customer_identity`、`sales_stage`、`assigned_to`、`phone`、`email`、`visit_date`、`referral_source` |
| 渠道綁定 | 一個 Contact 可對應多個 `channel_identifiers`（PSID/ASID/LINE UID） |
| 合併功能 | `is_merged` + `merged_into_id` 保留歷史鏈，不真正刪除 |
| 批量匯入 | CSV / Google Sheets 匯入（PR-2 後不再支援標籤匯入） |
| 狀態 | ✅ 已上線；⚠️ 舊欄位 `intent` / `budget_range` / `preferred_products` 尚保留，待清理 |

---

### M8 待辦動作 Actions

| 屬性 | 內容 |
|------|------|
| 用戶價值 | 對話結束後不漏掉跟進（7 天回訪、報價跟催等） |
| 前端頁面 | `/actions` 列表（含「來源對話」連結） |
| 後端 API | `GET/POST /actions`、`PATCH /actions/{id}/status` |
| 狀態流轉 | pending → assigned → in_progress → completed |
| 屬性 | description、priority（high/medium/low）、due_date、assigned_to、conversation_id |
| 自動建立 | LLM 分析對話後可建議 Actions（`analysis.suggested_actions`） |
| 到期通知 | Celery beat `check-due-actions` 每小時掃描 |
| 設計約束 | PRD 要求 `conversation_id` NOT NULL（與對話強耦合） |
| 狀態 | ✅ 已上線 |

---

### M9 知識庫 Knowledge Base

| 屬性 | 內容 |
|------|------|
| 用戶價值 | 客服即時查到產品規格、FAQ，AI 也用它做 RAG |
| 前端頁面 | `/knowledge-base`（列表 + 搜尋）、`/knowledge-base/[id]`（編輯） |
| 後端 API | `GET/POST/PATCH/DELETE /knowledge-base`、`POST /knowledge-base/import`（CSV）、`GET /ai/knowledge-search` |
| 後端服務 | `knowledge_base_service.py`、`tasks/kb_embedding_tasks.py` |
| 資料表 | `knowledge_base`（title、content、category、tags、source_url、embedding、is_active） |
| 檢索方式 | 目前：PG LIKE 全文比對；未來：pgvector + Re-rank |
| 權限 | agent 唯讀，manager/admin 可寫 |
| 狀態 | 🟡 CRUD 完成、pgvector 未實裝 |

---

### M10 報價 / 產品 / 庫存

| 子模組 | 前端 | 後端 API | 主要能力 | 狀態 |
|--------|------|---------|---------|------|
| 報價 Quote | `/quotes`、`/quotes/create`、`/quotes/[id]` | `GET/POST/PUT /quotes`、`PATCH /quotes/{id}/status` | 報價單編號 QT-YYYYMMDD-NNN、明細、折扣、狀態（draft/sent/accepted/rejected） | ✅ |
| 產品 Product | （在報價內挑選） | `GET/POST /products`、`POST /products/{id}/stock` | SKU、材質、分級（A/B/C/D）、庫存、停售 | ✅ |
| 庫存 Inventory | `/inventory`、`/inventory/[id]` | `/inventory/*` proxy 至外部 NestJS 系統 | 外部進銷存系統的代理層 | ✅ |

> 對話內可一鍵「插入產品卡片」/「開立報價單」（PRD §F9，前端整合點待補）。

---

### M11 快速回覆 Quick Replies（預存語錄）

| 屬性 | 內容 |
|------|------|
| 用戶價值 | 常見問答模板化，按一鍵即填入輸入框 |
| 後端 API | `GET/POST /quick-replies`、`/quick-replies/search` |
| 屬性 | category、title、content、trigger_keywords、priority（must/contextual/conditional/template）、is_system（系統內建 vs 使用者自訂） |
| 狀態 | ✅ 已上線（前端整合在 send-bar） |

---

### M12 儀表板 Dashboard / KPI

| 子端點 | 用途 | 對應 KPI |
|--------|------|---------|
| `/dashboard/overview` | 客戶/對話/動作/分析總覽 | 量級概覽 |
| `/dashboard/stats` | 完整版（首頁用） | 含轉換漏斗、回覆時間、活動趨勢 |
| `/dashboard/trends` | 對話量按日 | 流量趨勢 |
| `/dashboard/channels` | 渠道分布 | 流量來源 |
| `/dashboard/first-response-time` | P50/P90 首次回覆時間 | 速度核心 KPI |
| `/dashboard/resolution-rate` | 解決率 | 結案核心 KPI |
| `/dashboard/escalation-rate` | 求援率 | 主管介入頻率 |
| `/dashboard/conversation-status` | 各狀態現量 | 即時負載 |
| `/dashboard/today-conversations` | 今日新對話 vs 昨日 | 趨勢 |
| `/dashboard/actions/completion` | 待辦完成率 | 跟進品質 |
| `/dashboard/activity` | 30 天訊息活動 | 工作量 |
| `/dashboard/export` | CSV 匯出 | 🟡 501 待實作 |

前端頁面：`/dashboard/page.tsx`（PRD §F10 三屏式 — 主管 KPI / 客服在線 / 銷售漏斗）

---

### M13 通知系統 Notification

| 通道 | 觸發事件 | 機制 |
|------|---------|------|
| WebSocket | `conversation.assigned`、`.escalated`、`.taken_over`、`.returned`、`.resolved`、`ai.suggestion.ready`、`ai.risk.detected`、`notification.mention`、`new_message`、`action.due_soon` | `realtime/events.py` + `emitter.py`，依 `user_{id}` / `role_{role}` / `team_{id}` room 分發 |
| Discord | 求援、@ 提及、Action 到期 | `notification_service.py` + plugin |
| LINE Notify | 同上（可選） | `notification_service.py` |
| Email | 每日早晨 Action 摘要 | `notification_service.py` |
| 桌面通知 | 分配、求援、@ 提及 | 前端 Browser Notifications API |

**通知偏好**：`notification_preferences` 表（per-user，可設定靜音時段、各通道開關）。前端入口在 `/settings`。

---

### M14 設定 Settings

| 分頁 | 內容 | 權限 | 狀態 |
|------|------|------|------|
| 個人偏好 | 主題、通知偏好 | 全員 | ✅ |
| 團隊管理 / 角色 | 使用者列表、角色指派、停用、邀請（settings/roles-tab） | admin | ✅ |
| AI 設定 | 主模型 / 兜底模型 / 預算上限 / 品牌語氣（settings/ai-tab） | admin | 🟡 UI 在 |
| 知識庫管理 | 連到 `/knowledge-base` | manager+ | ✅ |
| 自動分配規則 | 沿用上次負責人 / 輪詢開關（settings/assignment-rules-tab） | admin | 🟡 UI 在 |

---

### M15 認證與權限 Auth / RBAC

| 屬性 | 內容 |
|------|------|
| 後端 API | `POST /auth/login`、`/auth/refresh`、`/auth/logout`、`/auth/change-password`、`/auth/register` |
| Access Token | 24h（含 JTI） |
| Refresh Token | 30d |
| 登入限制 | 5/minute（Flask-Limiter + Redis backend） |
| 登出黑名單 | Redis `token_blacklist:{jti}`，TTL = 剩餘存活時間 |
| Scope 機制 | `utils/scope.py`：agent 只看自己的，manager 看 team_id，admin 看全部 |
| 前端 | `lib/auth.tsx`（AuthContext）+ `lib/api.ts`（401 自動 refresh + 重試） |
| 自動跳轉 | refresh 失敗 → 廣播 `auth-expired` event → 跳 `/login` |
| 狀態 | ✅ 已上線 |

---

### M16 觀測與成本

| 子能力 | 端點 / 資料表 | 用途 |
|--------|--------------|------|
| Health Check | `GET /api/health`（輕量）、`GET /api/v1/health`（DB/Redis/Meta） | LB 探針、運維儀表 |
| LLM 用量 | `llm_usage_log` 表 + `/llm/usage/summary` + `/llm/budget` | 每次呼叫的 model / tokens / cost 全紀錄 |
| LLM 降級 | `llm_fallback_event` 表 | 主模型失敗時降級到兜底模型的事件 |
| 對話 Audit | `conversation_events` 表 + `GET /inbox/conversations/{id}/events` | 誰、什麼時候、做了什麼操作 |
| 資料健康 | `/admin/data-health`、`/admin/fix-names`、`/admin/fix-counts` + Celery beat 6 小時 | 自動偵測孤立訊息、重複客戶並修復 |
| 歷史同步 | `/sync/meta-history`、`/sync/backfill-names` | Meta 歷史對話批次拉回 |

---

## 5. 資料模型總覽

| 表 | 用途 | 關鍵欄位 | 備註 |
|----|------|---------|------|
| `users` | 帳號 | name, email, role, team_id, password_hash | role 限 admin/manager/user |
| `roles` / `user_roles` | RBAC 擴展角色（除 users.role 外的 N:M） | name, color | 與 users.role 並存 |
| `contacts` | 跨渠道客戶 | display_name, customer_identity, sales_stage, assigned_to, is_merged | 含舊欄位 intent/budget_range 待清理 |
| `channel_identifiers` | 渠道帳號 | channel, external_id (PSID/ASID/LINE UID), profile_data | unique(channel, external_id) |
| `conversations` | 對話 Session | contact_id, channel, status, current_handler_id, supervisor_id, watchers[], escalation_reason | 狀態機 7 種 |
| `messages` | 訊息 | sender_type, message_type, content, media_url, meta_message_id, is_internal, mentions[] | `is_internal` 隔離客戶可見性 |
| `analyses` | LLM 分析結果 | intent, extracted_entities[], summary, suggested_actions, risk_flags[] | 由 Celery 寫入 |
| `actions` | 待辦 | conversation_id, description, status, priority, due_date | 與對話強耦合 |
| `quotes` | 報價 | quote_number, status, subtotal, total | 含明細 line items |
| `products` | 產品 | sku, material_type, grade, stock_quantity | |
| `quick_replies` | 預存語錄 | category, trigger_keywords, priority, is_system | |
| `knowledge_base` | 知識庫條目 | title, content, category, embedding, is_active | embedding 欄位待 pgvector |
| `conversation_events` | 對話 audit log | event_type, actor_id, target_id, metadata | 7 種事件類型 |
| `reply_suggestions` | AI 草稿紀錄 | suggestions(JSONB), used_suggestion_index, edited_before_send | 用於採用率分析 |
| `notification_preferences` | 通知偏好 | discord_enabled, line_enabled, quiet_hours_start/end | |
| `llm_usage_log` / `llm_fallback_event` | LLM 觀測 | model, prompt_tokens, estimated_cost_usd | |
| `system_setting` | 全站設定 | key, value (JSONB) | AI 預算、品牌語氣等 |
| `user_notes` | 客戶詳情頁備註 | contact_id, author_id, content | 與「對話內 internal note」不同 |

> Tag / ContactTag / Broadcast 已完全下線。

---

## 6. 核心用戶情境（User Stories）

### S1：新訊息進線到客服回覆
1. 設計師從 IG DM 詢價 → Meta Webhook → `meta_adapter` 解析 → `messages` 寫入 → `conversations` 開新 / 沿用
2. Celery `quick_triage` 0.5 秒內標出意圖 = pricing、身份 = designer
3. `assignment_service.auto_assign` 依「沿用上次負責人 → 輪詢」分配給客服
4. WebSocket `conversation.assigned` 推到該客服，UI 紅點
5. 客服打開對話，右側 AI Copilot 載入 3 則回覆草稿（從 KB 撈相關產品卡片）
6. 客服採用其中一則並微調送出 → `reply_suggestions.used_suggestion_index` 記下

### S2：客服求援 → 主管指導
1. 客服遇到不確定的規格 → 點「🆘 求援」填寫 reason
2. `POST /escalate` → conversation 狀態變 `escalated`、reason 入庫、`conversation_events` 寫一筆
3. WebSocket 推 `conversation.escalated` 給所有 manager + admin
4. 主管在通知區點開：
   - 方案 A（目前）：點「接管」→ 狀態變 `supervisor_taken`，主管接手回覆
   - 方案 B（產品方向）：旁聽 + 留內部備註 + @ 提及客服指導（不下場）
5. 對話結案後客服點「標記已解決」→ 狀態變 `resolved`

### S3：客戶下單後 7 天回訪
1. 客服將對話標 `resolved`，AI 建議 Action「7 天後回訪確認施工狀況」
2. Action 進入 `actions` 表，due_date = today+7
3. Celery beat `check-due-actions` 每小時掃，到期前 1 天推 WebSocket + 早晨 Email
4. 客服在 `/actions` 看到提醒，點「來源對話」回到原 conversation，回訪客戶

### S4：跨渠道客戶合併
1. 同一個客戶在 IG 和 LINE 都有聊過 → 系統有兩筆 Contact
2. 後台 `/contacts` 列表發現重複，點「合併」
3. `merge_service` 把訊息 / 對話 / Actions 全部歸到主 Contact，副 Contact 標 `is_merged=true`、`merged_into_id=主.id`
4. 之後任一渠道訊息進來，透過 `channel_identifiers` 都會落到同一個 Contact

### S5：主管監看團隊狀況
1. 主管打開 `/dashboard`
2. 看 P50 / P90 首次回覆時間、解決率、求援率
3. 切到 `/inbox` 團隊視圖，看到 AI 標出「🔴 情緒負面」、「⚠️ 超時未回」的對話
4. 點開可疑對話旁聽，必要時留內部備註指導客服（或接管，視角色定位最終決定）

---

## 7. 整合的外部系統

| 系統 | 用途 | 整合方式 |
|------|------|---------|
| Meta Graph API | Messenger / IG DM 收發 | Webhook + REST，需 App Secret + Page Token |
| LINE Messaging API | LINE 對話 | Webhook + REST |
| OpenRouter | 統一 LLM gateway（Claude / Gemini） | HTTP，須開 zero-retention |
| 外部進銷存（NestJS） | 庫存查詢 | `inventory_proxy.py` 代理 |
| Discord | 主管通知頻道 | Bot Token，notification_service |
| LINE Notify | 員工個人通知 | （可選） |
| Sentry | 錯誤監控 | 後端 + 前端（PRD NFR 規劃） |

---

## 8. 技術棧速覽

| 層 | 技術 |
|----|------|
| 後端框架 | Flask 3.1 + Flask-SQLAlchemy + Flask-Migrate + Flask-SocketIO + Flask-Limiter + Celery |
| 資料庫 | PostgreSQL 15（uuid-ossp，pgvector 規劃中） |
| Cache / Queue | Redis 8（含 AOF），Celery broker + result backend |
| 前端 | Next.js 16（App Router）+ React 19 + TypeScript 5（strict）+ Tailwind CSS 4 + shadcn/ui |
| 部署 | Railway（backend / frontend / postgres / redis 四 service） |
| LLM | OpenRouter（主：claude-sonnet-4-6；兜底：gemini-flash-lite、claude-haiku） |
| 認證 | JWT（24h + 30d refresh，JTI 黑名單） |
| 實時 | SocketIO（Redis message_queue） |

---

## 9. 實作狀態總表

| 模組 | 狀態 | 備註 |
|------|------|------|
| M1 訊息接收 | ✅ | Messenger / IG / LINE 全上線 |
| M2 Inbox 三欄式 | ✅ | 含響應式 |
| M3 分配 / 接管 / 求援 | ✅ 功能在；🟡 主管角色定位需收斂為「監看」 |
| M4 AI Copilot | 🟡 | 路由 + Schema 完成；LLM 串流仍是 stub、pgvector 未實裝、風險預警 prompt 待補 |
| M5 內部備註 + @ 提及 | ✅ | |
| M6 客戶側欄 | ✅ | |
| M7 客戶管理 | ✅ | 舊欄位 intent/budget_range 待清理 |
| M8 待辦動作 | ✅ | |
| M9 知識庫 | 🟡 | CRUD + LIKE 檢索；待 pgvector |
| M10 報價 / 產品 / 庫存 | ✅ | 與 inbox 一鍵插入點待補 |
| M11 快速回覆 | ✅ | |
| M12 儀表板 KPI | ✅ | CSV 匯出 501 待實作 |
| M13 通知系統 | ✅ | |
| M14 設定 | ✅（UI）；🟡（AI tab / 分配規則 tab 後端配對） | |
| M15 認證 / RBAC | ✅ | |
| M16 觀測 / 成本 | ✅ | |

圖例：✅ 已上線、🟡 部分完成、🔴 尚未開始

---

## 10. 下一步建議（PM 視角）

### 10.1 短期（2 週內）— 收斂與補完
1. **主管角色定位收斂**：依 memory feedback，重新規劃 take-over → nudge + 內部備註指導路徑，更新 PRD 至 v1.1
2. **AI 串流接 OpenRouter SSE**：把 `/ai/suggestions` 從 stub 升級為真 LLM 串流，落實 TTFB < 1.5s
3. **pgvector spike**：在 Railway PG 驗證 pgvector 擴充能否使用，否則改外部 vector DB（Pinecone / Qdrant）
4. **舊欄位清理**：`contacts.intent`、`budget_range`、`preferred_products` 確認停用，產出 migration 移除

### 10.2 中期（1-2 個月）— Hardening 與商業價值
5. **風險預警 prompt 完整化**：把 PRD §F4.5「流失預警 / 投訴升級 / 高金額」prompt 寫到 `prompts.py`，串到 `analyses.risk_flags`，UI 加 risk-alert 橫幅
6. **CSV 匯出實作**：`/dashboard/export` 501 → 200，給主管下載周報
7. **AI Copilot KPI 上線**：把「草稿採用率 / 編輯率 / 平均回覆時間」做進主管儀表板，閉環驗證 AI 價值
8. **對話一鍵建立報價**：M10 與 M2 整合點，從對話側欄一鍵帶客戶資料開報價

### 10.3 長期（v2）— 待評估
- 客戶端自助選材 / 預約系統
- 多語系（英文、簡中）
- 銷售漏斗自動推進（依 sales_stage 觸發 action）
- AI 自動回覆（無客服介入模式）
- 客服績效 360 評估

---

## 11. 主要風險

| 風險 | 影響 | 緩解 |
|------|------|------|
| 主管角色定位反覆（PRD 改方向、commit revert） | 中 | 趁早凍結 v1.1 PRD，明確「主管 = 監看 + 指導」並一次性實作 |
| pgvector 在 Railway 不支援 | 中 | 先 spike；若不行改外部 vector DB |
| LLM 成本失控 | 中 | 已有 llm_usage_log / fallback；補上預算告警 + 80% / 95% 自動降級 |
| AI 草稿品質低 → 客服不採用 | 高 | 上線後立即觀測「採用率 / 編輯率」，prompt 持續優化；建立 A/B 機制 |
| Webhook 漏接 / 重複 | 高 | 已有 `meta_message_id` 去重，須加上 Sentry 告警 + 補單 endpoint |
| 客戶 PII 外流到 LLM | 高 | PRD §8.4 要求遮罩；目前未實裝，須補 PII 偵測層 |

---

## 12. 附錄

### 12.1 路由 / 端點完整索引
- **Auth**：`/api/v1/auth/{login,register,refresh,logout,change-password}`
- **Inbox**：`/api/v1/inbox/conversations`（含 `assign/escalate/take-over/return/watch/resolve/reopen/events/send/analyze/close`）
- **AI**：`/api/v1/ai/{suggestions,summary,knowledge-search}` + `/ai/suggestions/{id}/used`
- **KB**：`/api/v1/knowledge-base`（CRUD + import）
- **Contacts**：`/api/v1/contacts`（含 `merge/search`）+ `/api/v1/admin/import-csv`
- **Actions**：`/api/v1/actions`
- **Dashboard**：`/api/v1/dashboard/{overview,stats,trends,channels,first-response-time,resolution-rate,escalation-rate,conversation-status,today-conversations,activity,actions/completion,export}`
- **Quotes / Products / Inventory**：`/api/v1/{quotes,products,inventory}`
- **Quick Replies**：`/api/v1/quick-replies`（含 search）
- **Users / Roles**：`/api/v1/{users,roles}`
- **Sync / Upload / OCR**：`/api/v1/{sync,upload,ocr}`
- **LLM Usage**：`/api/v1/llm/{usage,budget}`
- **Health**：`/api/health`（輕量）、`/api/v1/health`（完整）
- **Webhook**：`/api/v1/webhook`、`/api/v1/webhook/line`

### 12.2 SocketIO 事件清單
- 對話：`conversation.assigned / .escalated / .taken_over / .returned / .resolved / .new_message`
- AI：`ai.suggestion.ready / ai.analysis.completed / ai.risk.detected`
- 通知：`notification.mention / action.due_soon`
- 連線：`connect / disconnect`（自動加入 `user_{id} / role_{role} / team_{id}` rooms）

### 12.3 相關文件
- `PRD_2026-05-12_對話驅動CRM重構.md` — 完整產品需求
- `FILE_STRUCTURE_PLAN_2026-05-12.md` — 檔案重構計畫與 PR 拆分
- `CLAUDE.md`（root / backend / frontend） — 開發指引
- `database/schema.sql` — 舊版 schema（已過時，目前 schema 以 `db.create_all()` 為主）

---

> **變更紀錄**
> | 版本 | 日期 | 變更 | 作者 |
> |------|------|------|------|
> | v1.0 | 2026-05-14 | 初版 — 依 codebase 校準 PRD 並產出 PM 視角功能盤點 | Claude（AI 產品經理） |
