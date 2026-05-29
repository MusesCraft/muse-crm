# QA Continuation [17] — MUSE BBCRM

時間：2026-05-27 15:27:47 CST
環境：local frontend `http://localhost:3017` + backend `http://localhost:5000/api/v1`
參考原報告：`qa-output-17/QA_REPORT_17.md`

## Continuation verdict

**仍不建議部署。** 本輪把前次未完成/不確定項補驗完成：backend regression suite 已轉綠、內部備註 API/DB path 在 isolated testing env 通過；但目前 live local backend 仍處於 degraded/DB mismatch 狀態，frontend 無法登入，Inventory upstream 仍不可用，因此 release gate 仍是 no-go。

## 本輪補驗結果

| 項目 | 結果 | 證據 / 備註 |
|---|---:|---|
| Live frontend login | FAIL | Playwright 手動登入 `qa-admin@muse.local` 顯示 `Database Error`；直接 `POST /auth/login` 回 500 `Database Error`。 |
| Live backend health | FAIL / degraded | `GET /api/v1/health` 回 503；activity check 顯示 `relation "messages" does not exist`。 |
| Backend test gate | PASS | `PYTHONPATH=. pytest -q -vv --tb=short` → `12 passed in 6.59s`。前報告中的 `3 passed / 9 failed` 已被本輪重新驗證推翻。 |
| Frontend lint | PASS | `npm run lint --prefix frontend` → exit 0。 |
| Diff whitespace gate | PASS | `git diff --check` → exit 0。 |
| Internal note API/DB path | PASS in isolated backend test | Flask testing app 建 user/contact/conversation 後呼叫 `/inbox/conversations/<id>/send` with `is_internal: true`：HTTP 200、response `data.is_internal=True`、DB `Message.is_internal=True`、mock platform send 未被呼叫。 |
| Internal note live UI path | BLOCKED | 目前 live frontend/backend 登入失敗，無法重新完成 browser-level internal-note click assertion。原 Playwright runner 的 FAIL 可降級為「runner/selector 或 live-state 不確定」，但 release 前仍須用可登入環境補跑。 |
| Inventory proxy graceful behavior | PARTIAL PASS | 在 authenticated isolated backend test 中：`/inventory/overview`、`/inventory/products` 回 503 JSON `進銷存系統無法連線`，代表 proxy 對 upstream unreachable 有 JSON fallback。 |
| Inventory functional availability | FAIL | `INVENTORY_API_URL` default 指向 `http://localhost:3003/api`；本機 3003 無 listener，inventory upstream 不可用。 |
| Inventory size-specs route | FAIL / route bug suspected | isolated test：`GET /api/v1/inventory/size-specs` 回 404 `{}`；程式實際 route 是 `/inventory/products/size-specs`，而前端/測試若呼叫 `/inventory/size-specs` 會失敗。 |

## 根因/風險更新

### 1. Live backend DB mismatch / degraded — blocker

現象：
- `GET /api/v1/health` 回 503 degraded。
- activity check 查詢 `messages` 表時報 `relation "messages" does not exist`。
- `POST /auth/login` 回 500 `Database Error`，導致 frontend 無法登入。

研判：
- 測試指令在 `testing` config 下可 `db.create_all()` 並通過 12 tests；代表程式碼/測試 schema 本身可在測試 DB 成立。
- live backend process 帶有 `DATABASE_URL=[REDACTED]`，疑似指向與本地預期不同或未完成 migration 的 DB。
- release 前必須確認 runtime `DATABASE_URL` 指向正確 DB，並完成 migrations/schema 初始化；不能只看 test DB 綠燈。

### 2. Internal note — API/DB 已補驗通過，但 UI E2E 仍需補跑

本輪 isolated backend test 結果：
- login 200。
- internal send 200。
- response flags：`sent_via_api=False`、`data.is_internal=True`。
- mocked platform send：未呼叫。
- DB message：存在、`is_internal=True`、`sender_type='business'`。

因此前報告的「內部備註一定寫成 `is_internal=False`」不再作為 confirmed backend bug；更精準說法是：**backend API path 通過，但 live UI E2E 因登入/DB 狀態阻塞尚未重新認證。**

### 3. Inventory — blocker 仍存在

程式位置：
- `backend/app/api/inventory_proxy.py`
- `backend/app/utils/inventory_client.py`

觀察：
- proxy default：`INVENTORY_API_URL` → `http://localhost:3003/api`。
- 本機 3003 無 service listener。
- authenticated isolated calls 回 503 JSON fallback，而非 crash。

結論：
- graceful failure 行為基本存在。
- functional availability 不存在；Inventory page/API 仍不可認證。
- 另需統一 size-specs endpoint：目前實作是 `/api/v1/inventory/products/size-specs`，若 UI 或 QA 呼叫 `/api/v1/inventory/size-specs` 會 404。

## 修正後應重跑的最小 release gate

1. 修 live backend `DATABASE_URL` / migration，使 `/api/v1/health` 不再 degraded，且 `/auth/login` 200。
2. 啟動或配置 inventory upstream service，使：
   - `/api/v1/inventory/overview` 200
   - `/api/v1/inventory/products?page=1&limit=1` 200
   - size-specs endpoint 路徑一致且 200
3. 在 live UI 補跑 Playwright internal note click path：
   - 點「切到內部備註」後按送出不得出現對外 confirm。
   - request payload 必須含 `is_internal: true`。
   - response/DB 必須 `is_internal=True`。
   - platform API 不得被呼叫。
4. 補跑：
   - `PYTHONPATH=. pytest -q`
   - `npm run lint --prefix frontend`
   - `git diff --check`
   - `node qa-bbcrm-runner2.js`

## 更新後 no-go reasons

1. **Live backend currently degraded / frontend login fails** — 新增/更高優先 blocker。
2. **Inventory upstream unavailable** — blocker 仍存在。
3. **Live browser-level internal-note path not certified** — backend isolated pass，但 release 前仍需 UI E2E pass。
4. **Console hydration / aria warnings** — P2，仍建議修。
