# [17] 快速回覆功能 QA / 實作研究

日期：2026-05-28
範圍：BBCRM 快速回覆（預存語錄）資料模型、API、前端入口、圖片附件與 UX 擴充方案。

## 1. 現況盤點

### 後端資料模型

- 檔案：`backend/app/models/quick_reply.py`
- Table：`quick_replies`
- 欄位：
  - `id`：UUID primary key
  - `category`：分類，indexed
  - `title`：語錄標題
  - `content`：文字內容
  - `trigger_keywords`：JSONB 關鍵字陣列
  - `priority`：`must | contextual | conditional | template`
  - `attachments`：JSONB，現有前端型別支援 image attachments
  - `is_system`：系統內建語錄
  - `created_by`：建立者 UUID
  - `created_at / updated_at`

### 種子資料

- 檔案：`backend/data/scripted_responses.json`
- 總數：48 條
- 分類分布：
  - `dm`: 7
  - `visit`: 6
  - `basin`: 5
  - `hot_bend`: 5
  - `material`: 5
  - `general`: 4
  - `identity`: 4
  - `dimension`: 3
  - `needs`: 3
  - `project_info`: 3
  - `store`: 2
  - `follow_up`: 1
- priority 分布：`contextual` 24、`template` 13、`must` 8、`conditional` 3
- 含附件語錄：9 條

### 後端 API

- 檔案：`backend/app/api/quick_replies.py`
- 已有端點：
  - `GET /api/v1/quick-replies?category=&limit=`：列表 + categories
  - `GET /api/v1/quick-replies/search?q=&category=&limit=`：搜尋 title/content/trigger_keywords
  - `GET /api/v1/quick-replies/<id>`：單筆
  - `POST /api/v1/quick-replies`：新增，admin/manager
  - `PUT /api/v1/quick-replies/<id>`：更新，admin/manager
  - `DELETE /api/v1/quick-replies/<id>`：刪除；系統語錄只有 admin 可刪
  - `POST /api/v1/quick-replies/seed`：重匯系統語錄，admin
- 既有 schema drift guard：`attachments`、`created_by` 會以 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 補欄。

### 前端 API client

- 檔案：`frontend/src/lib/api.ts`
- 型別：
  - `QuickReplyAttachment { type: 'image'; url; label? }`
  - `QuickReplyItem { id,title,category,priority,trigger_keywords,content,attachments?,is_system?,created_by?,created_at?,updated_at? }`
- client：`quickRepliesApi.getAll/search/getById/create/update/delete`
- create/update 已支援 `attachments` payload，但目前管理 UI 沒有附件欄位。

### 前端入口一：Inbox send-bar

- 檔案：`frontend/src/app/(app)/inbox/send-bar.tsx`
- 入口：輸入列左側 `Zap` icon，title `預存語錄`。
- Panel：
  - 開啟時 `quickRepliesApi.getAll()`
  - 搜尋輸入 debounce 300ms 呼叫 `/quick-replies/search`
  - 以 category 分組展示
  - 點選語錄後將 `content` 填入 textarea，並把 image attachments 放入 `pendingAttachments`
  - 送出時先送文字/手動圖片，再逐一呼叫 `inboxSendApi.sendMessage(..., 'image', att.url)` 發送語錄附件
- 已有圖片附件預覽：語錄列表縮圖最多 3 張，輸入列顯示 pending attachments。

### 前端入口二：Settings 快捷回覆管理

- 檔案：`frontend/src/app/(app)/settings/page.tsx`
- Tab：`quick-replies`，label `快捷回覆`，icon `Zap`
- 現有功能：
  - 載入全部語錄與分類
  - 以分類 `<select>` 篩選
  - 新增/編輯/刪除語錄
- 缺口：
  - 新增/編輯表單只處理 `category/title/content`
  - 未管理 `trigger_keywords`
  - 未管理 `priority`
  - 未管理 `attachments`
  - 分類只能從既有 categories 下拉選，不能直接新增新分類

## 2. 驗證結果

### PASS

- `PYTHONPATH=. pytest tests/test_quick_reply_schema.py -q`
  - 結果：2 passed
  - 覆蓋：quick reply schema guard、legacy seed ID UUID guard
- `npm run lint -- 'src/app/(app)/inbox/send-bar.tsx' 'src/app/(app)/settings/page.tsx' 'src/lib/api.ts'`
  - 結果：exit code 0
  - 覆蓋：快速回覆主要前端入口與 API client lint

### 注意

- 一開始直接跑 `pytest tests/test_quick_reply_schema.py -q` 失敗，根因是測試環境未設定 `PYTHONPATH=.`，非產品缺陷。
- 一開始使用舊式 `eslint --file` 參數失敗，根因是 ESLint flat config 不支援該參數，改用直接傳檔案路徑後通過。
- 本輪未完成 live browser E2E；背景 Flask process 已結束，且之前 `/api/v1/health` 回 503。從程式碼看，503 會由 database/redis/activity check 任何一項 exception 導致，需重啟 live stack 後取完整 health JSON 才能判斷是哪一項。

## 3. UX / 實作建議

### A. Icon 入口

建議保留 send-bar 的 `Zap` 作為快速回覆主入口，但補三項：

1. 增加 `aria-label="預存語錄"`，目前只有 title。
2. Panel 標題旁增加管理捷徑：`管理語錄` link/button 指向 `/settings?tab=quick-replies` 或支援 tab deep-link。
3. 在輸入框聚焦時支援 `/` 或 `#` quick command：例如輸入 `/報價` 觸發同一個搜尋 panel，提升鍵盤效率。

### B. 圖片插入

現有資料與 send-bar 已能插入 image attachments；缺的是管理 UI。

建議在 Settings 表單新增「圖片附件」repeatable section：

- 欄位：`url`、`label`
- 支援新增/移除多張
- 顯示縮圖預覽
- 驗證：URL 必填且 type 固定為 `image`
- 儲存 payload：`attachments: [{ type: 'image', url, label }]`

後續可再接 `uploadApi.uploadImage`，讓管理者可直接上傳，不必手貼 URL。

### C. 下拉搜尋 / 分類 UX

建議把 Settings 中原生 `<select>` 升級為可搜尋 combobox：

- 適用位置：分類篩選、表單分類、priority/type
- 現有元件：`frontend/src/components/ui/select.tsx` 是 Radix Select，沒有搜尋輸入；若分類數量持續增加，應新增 `Combobox` 元件而非硬塞 Select。
- 分類 UX：
  - 顯示中文 label + 原始 key，例如 `材質說明 · material`
  - 允許輸入新分類 key，避免只能用既有分類
  - 新分類 key 建議 normalize：小寫、底線、長度限制、禁止空白

### D. 類型 / priority UX

目前 API 的 `priority` 實際是語錄類型，建議 UI 顯示為「語錄類型」：

- `must`：必問/必覆
- `contextual`：情境建議
- `conditional`：條件式提醒
- `template`：一般模板

Settings 管理表單應新增類型下拉；Inbox panel 應可依類型篩選或用 badge 顯示，搜尋排序可沿用後端 `_PRIORITY_RANK`。

## 4. 風險與缺口

1. **Migration 不一致**：migration 檔仍是 `String(36)` / `created_by String(36)`，model 已是 UUID；目前靠 runtime schema guard 補欄，但長期應補正式 migration，避免新環境/既有環境差異。
2. **搜尋空結果時不清空舊結果**：`send-bar.tsx` 搜尋 API 若回 `data=[]`，目前不更新列表，可能讓使用者看到舊結果。建議無論是否為空都 `setApiReplies(res.data || [])`，並在清空搜尋時還原 getAll 結果。
3. **Settings 無 attachments/priority/keywords 管理**：資料層已支援但 UI 不完整，造成系統能力被隱藏。
4. **圖片附件發送流程是多筆訊息**：文字與多張圖片會拆成多個 outbound calls；產品上要明確標示「會一併送出 N 張附件」。

## 5. 建議分工 prompt

### 給 Poseidon / 前端

```text
你是波賽頓，請實作 BBCRM 快速回覆管理 UI 擴充。範圍：frontend/src/app/(app)/settings/page.tsx、frontend/src/app/(app)/inbox/send-bar.tsx，必要時新增 frontend/src/components/ui/combobox.tsx。要求：
1. Settings 快捷回覆新增/編輯表單支援 trigger_keywords、priority、attachments。
2. attachments 支援多張 image URL + label，顯示縮圖、可新增/移除，payload 使用 [{ type:'image', url, label }]。
3. category 改為可搜尋/可新增分類的 combobox；顯示中文 label 與 key。
4. priority 顯示為「語錄類型」下拉：must/contextual/conditional/template，並在列表以 badge 顯示。
5. Inbox 預存語錄 panel 搜尋空結果必須清空列表；清空搜尋時恢復全部語錄；新增 aria-label；顯示附件數與語錄類型 badge。
6. 不改 API contract；保持現有 create/update/delete 相容。
驗證：npm run lint -- 'src/app/(app)/settings/page.tsx' 'src/app/(app)/inbox/send-bar.tsx' 'src/lib/api.ts'，並提供 Playwright 或手動截圖證據。
```

### 給 Hephaestus / 後端

```text
你是赫菲斯托斯，請整理 BBCRM quick_replies 後端 schema 與 API 驗證。範圍：backend/app/models/quick_reply.py、backend/app/api/quick_replies.py、migrations、tests。要求：
1. 補正式 Alembic migration，讓 quick_replies schema 與 model 一致：id UUID、attachments JSON/JSONB default []、created_by UUID、必要 index。
2. create/update 驗證 trigger_keywords 必須為 string array，attachments 必須為 image attachment array，priority 必須在 must/contextual/conditional/template。
3. 保留 runtime schema guard 或加註 sunset 條件，避免 Railway 舊 DB 漏欄。
4. search API 空 q 維持 400；limit 上限維持；搜尋排序不可退化。
5. 補測試：invalid attachments、invalid priority、create/update attachments round-trip、search empty result。
驗證：PYTHONPATH=. pytest tests/test_quick_reply_schema.py tests/<新增測試> -q。
```

## 6. 建議下一步

1. 先做前端 Settings UI，因資料層/API client 已具備 attachments/priority 基礎。
2. 同步補後端 payload validation，避免 UI 送錯資料污染 JSONB。
3. 重啟 live stack 後做 browser E2E：登入 → settings quick replies CRUD → inbox 搜尋/插入 → 發送文字 + 圖片附件 → 檢查訊息列表與 API response。
