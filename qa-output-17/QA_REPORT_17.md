# QA Report [17] — MUSE BBCRM

環境：local `http://localhost:3017` frontend + `http://localhost:5000/api/v1` backend
帳號：`qa-admin@muse.local`
測試方式：Playwright browser QA + API event capture + DB spot-check + repo gates
證據：`qa-output-17/qa-results.json`、`qa-output-17/screenshots/`

## Executive summary

**結論：不建議 3/3 直接部署。** 核心 Inbox/Contacts/Quotes/Dashboard/Actions/Knowledge Base/Settings 可操作，但仍有 deployability blocker / high risk：Inventory API 503、live backend DB mismatch/login failure、live UI 內部備註路徑尚未重新認證。

> 2026-05-27 補測更新：續測報告已輸出到 `qa-output-17/QA_CONTINUATION_17.md`。補測結果：backend pytest 已轉綠（`12 passed`）、內部備註 backend API/DB path 在 isolated testing env 通過；但 live frontend 目前登入失敗（`Database Error`）、backend health degraded、Inventory upstream 仍不可用，因此 release verdict 仍為 **no-go**。

## QA result summary

- Browser QA steps: 26
- PASS: 23
- WARN: 2
- FAIL: 1（runner wait condition 誤抓 `/messages`；實際 API event 有 `/send` 200，見下）
- API 4xx/5xx: 6（全部 Inventory 503）
- Console/page errors: 9（hydration mismatch + dialog aria warnings + inventory 503 resource errors）

## Requested checks

### 王設計師對話：按「發送」

| 項目 | 結果 | 證據 |
|---|---:|---|
| 訊息是否送出 | PASS | API events 有 `POST /api/v1/inbox/conversations/<id>/send` status 200 |
| UI 是否 append | PASS | `QA 測試回覆：請提供尺寸，我們會提供正式報價。` 由 0 → 1 筆可見 |
| API 是否成功 | PASS | `qa-results.json` lines 268-270：`POST .../send` 200；DB spot-check 有 1 筆 business message |
| console 是否有錯 | WARN/FAIL | 有 React hydration mismatch、Dialog aria warning、Inventory 503 resource errors |

### Inbox flows

| Flow | 結果 | 備註 |
|---|---:|---|
| 內部備註模式 | FAIL | UI 顯示文字可見，但 DB spot-check：`QA 內部備註...` 的 `is_internal=False`，且操作時仍出現「確定要發送這則訊息？」confirm；代表沒有真正進 internal send path，或測試點擊被錯誤目標吃掉。需修。 |
| 預存語錄 | PASS | 面板開啟，fixture quick replies 可見，選擇後 composer 插入「您好，我們可以先確認尺寸與材質後提供正式報價。」 |
| 求援 | WARN | 求援 dialog/panel 可開；runner 未精準抓到 escalate response，需補 selector/API assertion；畫面狀態可見求援相關 copy。 |
| 標記已解決 | PASS with UX issue | API 200，狀態成功；但 Playwright 一度被右側 panel/header intercept pointer，需檢查 UI overlay/z-index/click target。 |
| 待認領 → 林屋主 | PASS | 待認領 view 出現林屋主 |
| 團隊視圖 / 已求援 → 陳建材行 | PASS | team view + status escalated + channel Instagram + search 陳 都可找到陳建材行 |
| 狀態 / 渠道 / 搜尋 | PASS | 對應 API query status/channel/search 皆 200 |

### Pages rerun

| Page | 結果 | API/Console |
|---|---:|---|
| Contacts (2/3) | PASS | list + 王設計師/林屋主 detail smoke OK |
| Quotes | PASS | `QT-QA-0001` 可見 |
| Dashboard | PASS | dashboard metrics API 全 200 |
| Actions | PASS | `QA 待辦` 可見 |
| Inventory | FAIL | 頁面 shell 可開，但 `/inventory/overview`、`/products/size-specs`、`/products` 全部 503 |
| Knowledge Base | PASS | API 200 |
| Settings | PASS | 頁面可開 |

## Bugs / risks found

### P0/P1 deploy blockers

1. **Inventory API 503**
   - Failing endpoints:
     - `GET /api/v1/inventory/overview` → 503
     - `GET /api/v1/inventory/products/size-specs` → 503
     - `GET /api/v1/inventory/products?page=1&limit=500` → 503
   - Likely cause: CRM proxy depends on external inventory service (`INVENTORY_API_URL`, default `http://localhost:3003/api`) and it is unavailable/misconfigured locally or in deploy env.
   - Deployability impact: Inventory page cannot be certified.

2. **Backend tests fail**
   - First run without `PYTHONPATH` failed import collection (`ModuleNotFoundError: app`).
   - Corrected run `PYTHONPATH=. pytest -q`: `3 passed, 9 failed`.
   - Root failure: `test_webhook.py` setup deletes `contacts` while `quotes.contact_id` FK still references seeded contact (`quotes_contact_id_fkey`). Subsequent tests cascade into aborted transaction errors.
   - Deployability impact: backend regression suite is red.

3. **內部備註未確認為 internal**
   - UI copy appears, but DB spot-check found inserted note `is_internal=False` and `sender_type='business'`.
   - Internal note should not behave as customer outbound message.
   - Deployability impact: privacy/data-routing risk; must fix before release.

### P2 issues

4. **React hydration mismatch on login page**
   - Console/pageerror: server HTML differs from client (`<Suspense>` vs login root div). Not fatal, but should be cleaned before production.

5. **Dialog accessibility warnings**
   - `Missing Description or aria-describedby={undefined} for {DialogContent}` on dialogs.

6. **Resolve click target/overlay problem**
   - First run timed out because right aside header intercepted pointer events over `標記已解決` button. Force click/API succeeded, but manual UX may be fragile.

## Telegram parity gap list

**Core CRM workflow parity:** mostly green for fixture-based local CRM operations: auth, inbox list/detail, outbound text, quick replies, escalation/resolution, filters/search, contact/quote/dashboard/action/KB/settings smoke paths.

**Not certified / gaps vs native Telegram parity:**

1. Live Telegram inbound fixture not tested in this run.
2. Outbound native Telegram-specific payloads not tested: file, sticker, reaction, forward, edit/delete, quote replies.
3. Reactions/read receipts not tested.
4. Backfill/search/albums/buttons not tested.
5. Poll/contact/location/dice/story/voice/video-note inbound/outbound not tested.
6. Pinned messages/dialogs/folders/business profile/forum topics not tested.
7. Channel admin/calls/secret chats not supported/certified.
8. Media persistence / Telegram grouped album metadata not verified.
9. Full native Telegram app parity **not certified**; only core CRM workflow parity was exercised locally.

## Deployability diff report (3/3)

### Git/worktree status

Modified tracked files include:

- `.gitignore`
- `DAILY_REPORT_2026-04-01.md`
- `README.md`
- `backend/CLAUDE.md`
- `backend/app/api/inventory_proxy.py`
- `backend/app/api/quick_replies.py`
- `backend/app/api/webhook.py`
- `backend/app/config.py`
- `backend/requirements.txt`
- `backend/scripts/mock_webhook.py`
- `backend/tests/test_webhook.py`
- `e2e-test.ts`
- `frontend/CLAUDE.md`
- `frontend/src/app/login/page.tsx`

Untracked files include QA/debug artifacts and config-looking files:

- `.codex/`, `AGENTS.md`, `CLAUDE.karpathy.md`
- `.railway-pg-password` (**do not commit**)
- `backend/scripts/run-tests.sh`
- `backend/tests/test_inventory_routes.py`, `backend/tests/test_quick_reply_schema.py`
- `qa-bbcrm-runner*.js`, `qa-internal-note-focused.js`, `qa-output-17/`

### Diff safety

- `git diff --check`: PASS（無 whitespace error）
- `frontend npm run lint`: PASS
- Secret scan by grep found placeholders and `.railway-pg-password` untracked; must ensure no real secret is committed.

### Notable code diffs

1. `backend/app/config.py`
   - Railway CORS origin changed from `miraculous-flow-production-e93d...` to `frontend-production-0866...`.
   - Testing DB can be overridden by `TEST_DATABASE_URL`.
   - Risk: confirm production frontend domain before deploy.

2. `backend/app/api/quick_replies.py`
   - Adds runtime schema patching for `attachments` and `created_by` columns.
   - Handles legacy non-UUID seed IDs by allowing DB-generated UUID.
   - Risk: runtime `ALTER TABLE` on request path is a migration smell; acceptable short-term only if deployment lacks Alembic.

3. `backend/app/api/inventory_proxy.py`
   - Adds compatibility endpoint `/api/v1/inventory` proxying overview.
   - Risk: does not fix upstream 503.

4. `backend/app/api/webhook.py`
   - TESTING mode handles webhook synchronously.
   - Good for deterministic tests; production path remains background executor.

5. `frontend/src/app/login/page.tsx`
   - Adds password show/hide icon button and forgot-password mailto.
   - Current QA sees hydration mismatch on login page; inspect this file/route for SSR/client mismatch.

## Gate results

| Gate | Result |
|---|---:|
| Browser QA | FAIL for release: Inventory 503 + internal note risk + console errors |
| `frontend npm run lint` | PASS |
| `git diff --check` | PASS |
| `backend pytest -q` | FAIL collection if PYTHONPATH missing; with `PYTHONPATH=.` → 3 passed / 9 failed |
| Secret/deploy hygiene | WARN: `.railway-pg-password` untracked; must exclude |

## Recommendation

**No-go for 3/3 deploy until fixed:**

1. Fix Inventory upstream config/service or provide graceful local/prod fallback; rerun Inventory page and API assertions.
2. Fix internal note path so `is_internal=True`, no customer-send confirm, no external delivery.
3. Fix backend test cleanup/order for FK dependencies; rerun `PYTHONPATH=. pytest -q` to green.
4. Resolve login hydration mismatch and dialog aria warnings.
5. Remove/ignore QA artifacts and `.railway-pg-password` before any commit/deploy.
