# MUSE CRM 日報 — 2026/04/01

## 摘要

今日完成三大批次工作：

**上午**：修復 6 項 UX 問題 + 清理 mock data 殘留 + 移除 MOCK_USER 機制 + 前日深度掃描 19 項 bug 部署。

**下午**：實作 **7 項全新功能**，包含 3 個全新子系統（庫存管理、品相管理、Discord 式權限系統）和 4 項前端增強。同時完成儀表板數據全面整合（3,739 筆客戶）。

**晚間**：修復 2 項線上 bug（Quick Replies API 500、Contact Search 搜尋不完整）。

全日合計：3 commits + **25+ 個未提交檔案**，新增 5 個 DB 表。全部已部署至 Railway 並驗證。

---

## 一、UX 問題修復（6 項）

| # | 問題 | 修復 |
|---|------|------|
| UX-1 | 長對話不自動 Scroll to Bottom | 雙 RAF + `instant` 首次載入 + `prevMsgCountRef` 重設 |
| UX-2 | 對話 Header 排版混亂 | 手機隱藏元數據（`hidden sm:flex`） |
| UX-3 | 對話列表無最後訊息預覽 | 依 `message_type` 顯示 `[圖片]`/`[貼圖]`/`[附件]` |
| UX-4 | 過期圖片無替代操作 | 新增「重新載入」按鈕 |
| UX-5 | 搜尋後右側對話不清除 | debounce 觸發時 `setSelectedId(null)` |
| UX-6 | 「深度分析」vs「深入分析」不一致 | 統一為「深度分析」 |

---

## 二、Mock Data 清理

| 檔案 | 清理內容 |
|------|---------|
| `inbox/page.tsx` | 移除 `mockConversations` import 和 fallback |
| `conversation-detail.tsx` | `AiSuggestionCard` 改用真實 `conv.analyses` |
| `send-bar.tsx` | 移除 `mockQuickReplies` fallback，全面使用 API |
| `customer-sidebar.tsx` | 移除 mock imports，改用 API 資料 |
| `auth.tsx` | 移除 `MOCK_USER` 定義和 7 處引用 |

---

## 三、儀表板數據全面整合

### 問題
Dashboard 缺少 3,739 筆客戶的關鍵分布數據；部分卡片內容誤導。

### 新增數據面板

| 卡片 | 資料 |
|------|------|
| 渠道分布 | Messenger 3,062 / Instagram 371 / LINE 264 / 其他 42 |
| 客戶跟進狀態 | 跟進中 3,460 / 新客 115 / 已流失 106 / 已成交 48 / 已報價 10 |
| 購買意向 | 瀏覽中 3,306 / 準備購買 365 / 已購買 47 / 有興趣 15 |
| 轉換漏斗 | 全部 3,739 → 跟進 3,518 → 報價 58 → 成交 48（1.28%）|
| 平均回覆時間 | 44.8 小時 |
| 30 天訊息活動 | 帶 tooltip 長條圖 |
| 熱門對話 Top 5 | 按訊息數排名 |
| 5 個 KPI 卡片 | 總客戶 / 總訊息 / 對話數 / 待辦 / 平均回覆 |

移除誤導性的「來源分析」（全部 organic）和「活躍 vs 沉默」（僅 6 筆對話）。

### Bug 修復
- `dashboard.py` 缺少 `from sqlalchemy import desc` → 500 錯誤，已修復

---

## 四、7 項新功能實作（5 Agent 平行執行）

### Feature 1: CSV 報表匯入 UI
| 項目 | 說明 |
|------|------|
| 新檔案 | `contacts/import-dialog.tsx` |
| 功能 | Google Sheets URL → 匯入進度 → 結果顯示（成功/失敗筆數 + 錯誤列表）|
| 權限 | 僅 admin 可見 |
| API | `adminApi.importCsv()` → `POST /admin/import-csv` |

### Feature 2: Discord 自訂身份組權限系統
| 項目 | 說明 |
|------|------|
| 新 DB 表 | `roles`（name, color, permissions JSONB, position, is_system）|
| | `user_roles`（user_id, role_id 多對多）|
| 新後端 | `models/role.py` + `api/roles.py`（7 個 CRUD 端點）|
| 新前端 | `settings/roles-tab.tsx`（角色管理 UI + 權限 checkbox）|
| 系統角色 | 管理員 🔴（12 權限）/ 主管 🟡（10 權限）/ 使用者 🟣（5 權限）|
| 12 項權限 | contacts.read/write, inbox.read/send, actions.manage, tags.manage, settings.view/admin, broadcast.send, users.manage, inventory.read/write |

### Feature 3: 聯絡人快速預覽彈窗
| 項目 | 說明 |
|------|------|
| 新檔案 | `components/contact-preview.tsx` |
| 功能 | 點擊名稱顯示 Popover：頭像、姓名、渠道、電話、Email、狀態、標籤 |
| 效能 | `Map` 快取避免重複請求 |
| 整合 | Contacts 表格 + Actions 卡片 |

### Feature 4+5: 庫存管理 + 品相管理
| 項目 | 說明 |
|------|------|
| 新 DB 表 | `product_categories` / `products` / `stock_logs`（3 個）|
| 新後端 | `models/product.py`（3 model）+ `api/products.py`（8 端點）|
| 新前端 | `inventory/page.tsx`（列表）+ `inventory/[id]/page.tsx`（詳情）|
| 庫存列表 | 9 欄位表格 + 搜尋 + 4 組篩選 + 欄位排序 + 分頁 + 新增 Dialog |
| 品相系統 | A 級（綠）/ B 級（黃）/ C 級（橙）/ D 級（紅）|
| 庫存調整 | 加減數量 + 原因選擇 + 備註 → 自動記錄異動歷史 |
| 庫存警示 | 0=紅色 / <10=琥珀色 / ≥10=綠色 |
| 產品分類 | 石英石、人造石、岩板、大理石、花崗石、其他 |
| Sidebar | 新增「庫存」導航項 |

### Feature 6: 表格行點擊
| 項目 | 說明 |
|------|------|
| Contacts | `<tr>` 加 `cursor-pointer` + `onClick` → `/contacts/:id` |
| Actions | 卡片點擊 → `/contacts/:contact_id` |
| 防衝突 | 互動元素 `e.stopPropagation()` |

### Feature 7: 可見欄位切換
| 項目 | 說明 |
|------|------|
| 新檔案 | `lib/use-column-visibility.ts` + `components/column-visibility.tsx` |
| 功能 | Popover + Checkbox 切換欄位顯示/隱藏 |
| 持久化 | `localStorage`（key: `muse_contacts_columns`）|
| 可切換欄位 | 渠道、狀態、意向、標籤、最後活躍、對話數（「客戶」永遠可見）|

---

## 五、新增 shadcn/ui 元件（3 個）

```
popover, checkbox, dropdown-menu
```
供 Feature 2/3/7 使用（Radix 原生無障礙支援）。

---

## 六、資料庫變更

### 新增 5 個表（Railway PostgreSQL）

| 表名 | 用途 |
|------|------|
| `roles` | 身份組定義（含 JSONB 權限）|
| `user_roles` | 使用者-角色多對多 |
| `product_categories` | 產品分類 |
| `products` | 產品庫存（含品相、價格、狀態）|
| `stock_logs` | 庫存異動記錄 |

### 種子資料
- 3 個系統角色（管理員/主管/使用者）+ 既有用戶自動遷移
- 6 個產品分類（石英石/人造石/岩板/大理石/花崗石/其他）

### 資料庫現況：**23 個表**

---

## 八、線上 Bug 修復（2 項）

### BUG-1 🔴 Quick Replies API 500 — Database Error

**端點：** `GET /api/v1/quick-replies`
**根因：** 前日現代化 QuickReply model 時，將 `id` 欄位從 `String(36)` 改為 `UUID(as_uuid=True)`，但資料庫表仍為 `VARCHAR(36)`（migration 未變更欄位型別）。SQLAlchemy 嘗試將 VARCHAR 值反序列化為 `uuid.UUID` 物件時失敗。
**修復：** `models/quick_reply.py` — `id` 改回 `String(36)` + lambda default，保留其他現代化改動（`Mapped`/`mapped_column`/`func.now()`）。移除未使用的 `UUID` import。

### BUG-2 🟡 Contact Search 搜尋範圍不足

**端點：** `GET /api/v1/contacts/search?q=陳` 回 0 筆
**根因：** 搜尋只查 `display_name` 和 `notes`，未涵蓋 `phone`/`email`。部分客戶資料可能儲存在這些欄位中。此外 `/contacts/search` 端點缺少 scope 過濾和 priority 計算。
**修復（`api/contacts.py`）：**
- `list_contacts` 搜尋新增 `phone`/`email` 欄位
- `search_contacts` 搜尋新增 `phone`/`email` 欄位
- `search_contacts` 加入 `apply_contact_scope()` 權限過濾
- `search_contacts` 回傳資料加入 `infer_contact_priority()` 計算

---

## 九、部署狀態

| 服務 | 狀態 |
|------|------|
| Backend | Health OK ✅ |
| Frontend | 所有 12 個路由 200 ✅ |

### 前端路由

```
/login          ○ Static
/dashboard      ○ Static
/contacts       ○ Static
/contacts/[id]  ƒ Dynamic
/inbox          ○ Static
/inventory      ○ Static     ← 新增
/inventory/[id] ƒ Dynamic    ← 新增
/actions        ○ Static
/broadcast      ○ Static
/settings       ○ Static
```

---

## 十、影響範圍

```
backend/   18 檔案（6 修改 + 4 新建 + 8 承接前日）
  api/         contacts, dashboard, inbox, llm_usage, sync, tags, products(新), roles(新)
  models/      analysis, conversation, notification_preference, quick_reply, user, product(新), role(新)
  services/    action_service, contact_service, session_service
  channels/    meta_adapter

frontend/  21 檔案（6 修改 + 9 新建 + 6 承接前日）
  app/(app)/   contacts/(page + import-dialog), actions/page, dashboard/page,
               inbox/(page, conversation-detail, conversation-list, customer-sidebar,
                      message-bubble, send-bar),
               inventory/(page + [id]/page)(新), settings/(page + roles-tab)(新)
  components/  sidebar, contact-preview(新), column-visibility(新),
               ui/(popover, checkbox, dropdown-menu)(新)
  lib/         api, auth, use-column-visibility(新)

database/  5 新表 + 9 筆種子資料
```

## 十一、全日統計

| 類別 | 數量 |
|------|------|
| UX 修復 | 6 項 |
| Mock data 清理 | 5 個檔案 |
| 線上 Bug 修復 | 2 項（BUG-1 500 錯誤 + BUG-2 搜尋不全）|
| 前日 Bug 部署 | 19 項（3 critical + 4 high + 9 medium + 3 low）|
| 新功能 | 7 項（3 子系統 + 4 增強）|
| 儀表板整合 | 8 個新數據面板 |
| 新 DB 表 | 5 個 |
| 後端檔案 | 18 個 |
| 前端檔案 | 21 個 |
