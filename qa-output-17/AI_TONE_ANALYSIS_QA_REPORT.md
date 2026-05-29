# [17] BBCRM AI 語氣／情緒分析 QA 報告

測試時間：2026-05-28
測試目標：完整驗證 AI 語氣／情緒分析的 API、資料持久化、前端顯示與生產環境可用性。
測試環境：Railway production

- Frontend: https://frontend-production-0866.up.railway.app
- Backend: https://backend-production-5171.up.railway.app/api/v1
- 測試 conversation: `6fb8aec0-03a5-407f-844a-aed67a44d092`（王設計師，4 則訊息，狀態 escalated）

## 結論

**AI 語氣／情緒分析未通過完整 QA。**

通過項目：LLM service 單元測試、前端 lint/build、Railway health、登入 API、Inbox UI 載入與目標 conversation 選取。
未通過主因：`POST /inbox/conversations/:id/analyze` 可回 202，但 60 秒內沒有任何 analysis persisted；前端「深度分析」按鈕存在，但 browser click 未捕捉到 `/analyze` POST，且未顯示可驗證的情緒分析結果。

## 驗證結果

### 1. 靜態範圍確認

已確認 AI 語氣分析鏈路：

- Prompt schema: `backend/app/services/prompts.py`
  - `sentiment: positive|neutral|negative`
  - `urgency: high|medium|low`
- LLM provider: `backend/app/services/llm_service.py`
  - OpenRouter / Codex provider
- 背景任務: `backend/app/tasks/analysis_tasks.py`
  - manual trigger 進入 Celery task
- DB model: `backend/app/models/analysis.py`
  - `sentiment` 有 enum check constraint
- API: `POST /api/v1/inbox/conversations/<conversation_id>/analyze`
- Frontend: `frontend/src/app/(app)/inbox/customer-sidebar.tsx`
- Badge: `frontend/src/components/badges.tsx`

### 2. 自動化測試

#### Backend targeted tests

Command:

```bash
PYTHONPATH=. /tmp/muse-crm-qa-venv/bin/pytest -q tests/test_llm_service.py tests/test_analysis_tasks.py
```

Result:

```text
9 passed in 2.98s
```

#### Frontend lint

Command:

```bash
npm run lint
```

Result: PASS

#### Frontend production build

Command:

```bash
npm run build
```

Result: PASS

### 3. Production smoke

- `/login`: HTTP 200
- `/api/v1/health`: `status: ok`
  - database ok
  - redis ok
  - meta_config ok
  - activity ok
- `/api/v1/auth/login`: PASS，admin login 成功（token 未記錄於報告）
- `/api/v1/inbox/conversations?view=team`: PASS，取得 4 筆 conversation
- `/api/v1/inbox/conversations/:id`: PASS，目標 conversation 有 4 則 messages，初始 analyses=0

### 4. Manual analysis API

Command path:

```http
POST /api/v1/inbox/conversations/6fb8aec0-03a5-407f-844a-aed67a44d092/analyze
```

Result:

```json
{
  "message": "分析任務已提交",
  "conversation_id": "6fb8aec0-03a5-407f-844a-aed67a44d092",
  "task_id": "dad628ae-d2c0-4ec6-8b5c-2f3f4c212d84",
  "trigger_type": "manual"
}
```

HTTP status: 202

後續輪詢：

- 20 秒：analyses 仍為 0
- 延長 60 秒：analyses 仍為 0

判定：**task accepted，但分析結果沒有進入 API 可讀取狀態。**

### 5. Browser QA

已用 Playwright 驗證：

- `/inbox` 可載入
- admin token session 可用
- 可切換「團隊視圖」
- 可選取王設計師 conversation，且停留於 `/inbox`，不是誤進 `/contacts/:id`
- 右側 AI / 客戶情報區可見
- `深度分析` 按鈕存在

但：

- 點擊深度分析後，未捕捉到 `/analyze` POST response
- UI 未顯示可驗證的 `正面 / 中性 / 負面` 情緒結果
- 因 API 層也沒有 persisted analysis，無法確認 UI 與後端一致性

## 缺陷清單

### QA-17-AI-01 — Manual analysis accepted but no persisted analysis

- Severity: High
- Category: Functional / Data persistence / Background job
- Evidence:
  - API trigger 回 202
  - task_id: `dad628ae-d2c0-4ec6-8b5c-2f3f4c212d84`
  - 同 conversation 20s 與 60s 輪詢後 `analyses=0`
- Expected:
  - Celery task 完成後 `GET /inbox/conversations/:id` 應回傳新的 analysis row，且 `sentiment` 為 `positive|neutral|negative`
- Actual:
  - 無 analysis row 可讀取
- 可能根因方向:
  1. Celery worker 未執行或未連上相同 Redis queue
  2. LLM provider / API key / budget check 失敗但錯誤未回寫到 API 可見狀態
  3. task 有執行但 `_create_analysis_record` / commit / DB schema 發生錯誤
  4. API detail 查詢的 `conversation.analyses` 沒有刷新或排序問題，但 count=0 代表更像未寫入

### QA-17-AI-02 — Browser click on 深度分析 does not emit captured analyze POST

- Severity: Medium
- Category: Frontend / Interaction
- Evidence:
  - Playwright 可定位 `深度分析` button
  - `scrollIntoViewIfNeeded()` 後 click
  - 未捕捉到 `/api/v1/inbox/conversations/.../analyze` response
- Expected:
  - 點擊後應呼叫 analyze endpoint，並有 loading / success / failure 狀態
- Actual:
  - 無 response captured，UI 也無可驗證結果
- Artifact:
  - `/Users/muse/Developer/muse-crm/qa-output-17/screenshots-ai-tone/09-force-scroll-click-analysis.png`

### QA-17-AI-03 — CustomerSidebar implementation contains hard-coded mock result risk

- Severity: High candidate
- Category: Functional / Data correctness
- Evidence from code:
  - `frontend/src/app/(app)/inbox/customer-sidebar.tsx`
  - `handleAnalyze()` 呼叫 API 後使用 2 秒 `setTimeout` 寫入固定 result：
    - demand_summary: `客戶正在詢問產品規格與報價，有明確購買意向`
    - mentioned_products: `岩板`, `電視牆`, `Laminam`
    - sentiment: `positive`
    - urgency: `medium`
- Risk:
  - 即使後端分析未完成或失敗，前端也可能顯示假的 positive / medium 結果。
- Expected:
  - POST 後應輪詢 task/conversation detail，或透過 websocket/contact.updated 更新真實 analysis。

### QA-17-AI-04 — Codex model cost currently estimated as zero

- Severity: Medium / Product risk
- Category: Cost control
- Evidence:
  - `tests/test_analysis_tasks.py`
  - `LlmUsageLog.estimate_cost("gpt-5.5", 1000, 2000) == Decimal("0")`
- Risk:
  - 若 Codex provider 用於 production semantic analysis，成本/預算統計會低估或無法告警。

## 證據檔案

JSON results:

- `/Users/muse/Developer/muse-crm/qa-output-17/ai-tone-analysis-qa-results.json`
- `/Users/muse/Developer/muse-crm/qa-output-17/ai-tone-analysis-browser-focus-results.json`
- `/Users/muse/Developer/muse-crm/qa-output-17/ai-tone-analysis-final-browser-results.json`
- `/Users/muse/Developer/muse-crm/qa-output-17/ai-tone-analysis-force-click-results.json`

Screenshots:

- `/Users/muse/Developer/muse-crm/qa-output-17/screenshots-ai-tone/01-inbox-loaded.png`
- `/Users/muse/Developer/muse-crm/qa-output-17/screenshots-ai-tone/02-conversation-detail.png`
- `/Users/muse/Developer/muse-crm/qa-output-17/screenshots-ai-tone/07-inbox-conversation-selected-correct.png`
- `/Users/muse/Developer/muse-crm/qa-output-17/screenshots-ai-tone/08-inbox-after-deep-analysis.png`
- `/Users/muse/Developer/muse-crm/qa-output-17/screenshots-ai-tone/09-force-scroll-click-analysis.png`

## 建議修復順序

1. 先查 Railway backend / Celery logs，針對 task_id `dad628ae-d2c0-4ec6-8b5c-2f3f4c212d84` 定位 worker 是否執行、LLM 是否錯誤、DB commit 是否失敗。
2. 為 analysis task 增加可查詢狀態或錯誤回寫，避免 API 只有 202 但使用者不知道失敗原因。
3. 移除 `CustomerSidebar.handleAnalyze()` 的 hard-coded mock result，改成：
   - POST analyze
   - 顯示 loading
   - 輪詢 conversation detail / task status
   - 只顯示 persisted analysis
   - 失敗時顯示錯誤與 retry
4. 加 regression test：
   - manual analyze 202 後 worker 成功寫入 `Analysis.sentiment`
   - invalid sentiment 不可寫入
   - frontend 不得在 API 未回傳真實 analysis 時顯示固定 positive result
5. 明確決定 Codex provider usage cost：若是訂閱制也應標記 `pricing_source=subscription/unknown`，不要與免費成本混淆。
