# QA [17] RBAC / 主管儀表板權限映射測試

時間：2026-05-28
環境：production frontend `https://frontend-production-0866.up.railway.app` + backend `https://backend-production-5171.up.railway.app/api/v1`
測試帳號：臨時建立 `manager` / `user` 角色帳號，測後已停用；臨時 role probe 已刪除。密碼與 token 不寫入報告。

## 結論

**FAIL / NO-GO for RBAC correctness.** 主管儀表板與權限映射目前不是一致的「角色權限系統」：後端有部分 decorator，但 Dashboard/KPI、roles read、user roles read 與前端路由/側欄沒有正確限制。

最嚴重問題：**一般 user 可以打開 `主管儀表板`，且所有主管 KPI API 都回 200。**

## 測試覆蓋

- 角色：`admin`、`manager`、`user`
- API：Dashboard/KPI、Users、Roles、Quotes、Actions、Quick Replies、Products、Conversation supervisor ops
- UI：`/dashboard`、`/settings`、`/contacts`、`/inbox`、`/quotes`、`/actions`、`/inventory`、`/knowledge-base`
- 證據：
  - API matrix：`qa-output-17/rbac-api-matrix.json`
  - UI result：`qa-output-17/rbac-ui-results.json`
  - Admin UI result：`qa-output-17/rbac-ui-admin-results.json`
  - Screenshots：`qa-output-17/rbac-ui/*.png`

## API 測試摘要

API matrix 共發現 **10 個權限映射失敗**。

| Role | Endpoint | Actual | Expected |
|---|---|---:|---|
| user | GET /dashboard/stats | 200 | expected admin_manager_only |
| user | GET /dashboard/first-response-time | 200 | expected admin_manager_only |
| user | GET /dashboard/resolution-rate | 200 | expected admin_manager_only |
| user | GET /dashboard/escalation-rate | 200 | expected admin_manager_only |
| user | GET /dashboard/conversation-status | 200 | expected admin_manager_only |
| user | GET /dashboard/today-conversations | 200 | expected admin_manager_only |
| manager | GET /roles | 200 | expected admin_only |
| user | GET /roles | 200 | expected admin_only |
| manager | GET /users/e9faf5c8-baf0-43be-9eaf-ecca9840a695/roles | 200 | expected admin_only |
| user | GET /users/e9faf5c8-baf0-43be-9eaf-ecca9840a695/roles | 200 | expected admin_only |

### API 缺陷

#### RBAC-API-01 — 一般 user 可讀主管儀表板與 KPI

一般 user 對以下 endpoint 全部得到 `200`：

- `GET /dashboard/stats`
- `GET /dashboard/first-response-time`
- `GET /dashboard/resolution-rate`
- `GET /dashboard/escalation-rate`
- `GET /dashboard/conversation-status`
- `GET /dashboard/today-conversations`

根因：`backend/app/api/dashboard.py` 使用 `@login_required`，沒有 `@require_role('admin', 'manager')`。部分 overview 使用 scope，但 PR-7 主管 KPI 多數直接查全域資料，並未套用 `apply_contact_scope / apply_conversation_scope`。

#### RBAC-API-02 — `/roles` 列表對 manager/user 開放

- `GET /roles`：manager/user 皆 `200`

若身份組與 permissions 屬於管理設定，這應是 admin-only 或至少 manager-only。當前 `list_roles()` 只有 `@login_required`。

#### RBAC-API-03 — `/users/<id>/roles` 對 manager/user 開放

- `GET /users/<manager_id>/roles`：manager/user 皆 `200`

這會讓非 admin 查詢他人的身份組資訊。當前 `get_user_roles()` 只有 `@login_required`，沒有 self-or-admin / admin-only 檢查。

## UI / Playwright 測試摘要

| Role | Route | Title | Final URL | API statuses |
|---|---|---|---|---|
| admin | /dashboard | 主管儀表板 | https://frontend-production-0866.up.railway.app/dashboard | 200 |
| admin | /settings | 設定 | https://frontend-production-0866.up.railway.app/settings | 200 |
| admin | /contacts | 客戶管理 | https://frontend-production-0866.up.railway.app/contacts | 200 |
| admin | /inbox | 收件匣 | https://frontend-production-0866.up.railway.app/inbox | 200 |
| admin | /quotes | 報價管理 | https://frontend-production-0866.up.railway.app/quotes | 200 |
| admin | /actions | 待辦事項 | https://frontend-production-0866.up.railway.app/actions | 200 |
| admin | /inventory | 庫存管理 | https://frontend-production-0866.up.railway.app/inventory | 200 |
| admin | /knowledge-base | 知識庫 | https://frontend-production-0866.up.railway.app/knowledge-base | 200 |
| admin | /dashboard | MUSE CRM | https://frontend-production-0866.up.railway.app/login | - |
| admin | /settings | MUSE CRM | https://frontend-production-0866.up.railway.app/login | - |
| admin | /contacts | MUSE CRM | https://frontend-production-0866.up.railway.app/login | - |
| admin | /inbox | MUSE CRM | https://frontend-production-0866.up.railway.app/login | - |
| admin | /quotes | MUSE CRM | https://frontend-production-0866.up.railway.app/login | - |
| admin | /actions | MUSE CRM | https://frontend-production-0866.up.railway.app/login | - |
| admin | /inventory | MUSE CRM | https://frontend-production-0866.up.railway.app/login | - |
| admin | /knowledge-base | MUSE CRM | https://frontend-production-0866.up.railway.app/login | - |
| manager | /dashboard | 主管儀表板 | https://frontend-production-0866.up.railway.app/dashboard | 200 |
| manager | /settings | 設定 | https://frontend-production-0866.up.railway.app/settings | 200 |
| manager | /contacts | 客戶管理 | https://frontend-production-0866.up.railway.app/contacts | 200 |
| manager | /inbox | 收件匣 | https://frontend-production-0866.up.railway.app/inbox | 200 |
| manager | /quotes | 報價管理 | https://frontend-production-0866.up.railway.app/quotes | 200 |
| manager | /actions | 待辦事項 | https://frontend-production-0866.up.railway.app/actions | 200 |
| manager | /inventory | 庫存管理 | https://frontend-production-0866.up.railway.app/inventory | 200 |
| manager | /knowledge-base | 知識庫 | https://frontend-production-0866.up.railway.app/knowledge-base | 200 |
| user | /dashboard | 主管儀表板 | https://frontend-production-0866.up.railway.app/dashboard | 200 |
| user | /settings | 設定 | https://frontend-production-0866.up.railway.app/settings | 200 |
| user | /contacts | 客戶管理 | https://frontend-production-0866.up.railway.app/contacts | 200 |
| user | /inbox | 收件匣 | https://frontend-production-0866.up.railway.app/inbox | 200 |
| user | /quotes | 報價管理 | https://frontend-production-0866.up.railway.app/quotes | 200 |
| user | /actions | 待辦事項 | https://frontend-production-0866.up.railway.app/actions | 200 |
| user | /inventory | 庫存管理 | https://frontend-production-0866.up.railway.app/inventory | 200 |
| user | /knowledge-base | 知識庫 | https://frontend-production-0866.up.railway.app/knowledge-base | 200 |

### UI 缺陷

#### RBAC-UI-01 — 側欄沒有依角色過濾

`frontend/src/components/sidebar.tsx` 的 `navItems` 是固定列表，未使用 `user.role` 或 permissions 過濾。manager/user 都看到：

- 收件匣
- 客戶
- 報價
- 儀表板
- 待辦事項
- 庫存
- 知識庫
- 設定

#### RBAC-UI-02 — 前端 app layout 只檢查登入，不檢查角色

`frontend/src/app/(app)/layout.tsx` 只處理 `isAuthenticated`，沒有 route-level role guard。結果 user 可直接進 `/dashboard`、`/settings`、`/quotes`、`/inventory` 等頁面。

#### RBAC-UI-03 — 一般 user 可看見「主管儀表板」頁

Playwright 實測：user 進 `/dashboard`，標題為 `主管儀表板`，頁面呼叫 9 個 API 全部 200。

## 已通過項目

以下 API 權限邊界符合目前 decorator 設計：

- `GET/POST/PATCH/DELETE /users*`：admin-only mutation/list 基本有效。
- `POST /roles`、`PUT /roles/<id>`、`DELETE /roles/<id>`、assign/remove user roles：admin-only mutation 基本有效。
- `POST /quotes`、`POST /actions`、`POST /quick-replies`、`POST /products`：user 被擋 403；admin/manager 可進入業務驗證流程。
- supervisor conversation ops：`take-over/watch/assign` 對 user 被擋 403，admin/manager 可進入後續 404/validation 流程。

## 建議修正方向

1. 定義單一權限矩陣，例如：
   - dashboard supervisor KPI：`admin`, `manager`
   - settings/users/roles：`admin`
   - quotes create/update/delete：`admin`, `manager`
   - inbox send：`admin`, `manager`, `user`
   - inventory read/write：分開 `inventory.read` / `inventory.write`
2. 後端 Dashboard PR-7 KPI endpoint 加 `@require_role('admin', 'manager')`，或明確拆成：
   - `/dashboard/my`：user scoped dashboard
   - `/dashboard/supervisor/*`：manager/admin only
3. 所有 Dashboard aggregate query 必須套用 scope，否則 manager/user 會讀到全域數據。
4. `/roles` 與 `/users/<id>/roles` 補 admin-only 或 self-or-admin 檢查。
5. 前端新增 route guard / permission map，不只依賴後端 403：
   - Sidebar 依 role 顯示選單
   - route-level guard 擋直接輸入 URL
   - 無權限頁顯示 403，不應只渲染錯誤卡片或空頁
6. 補 regression tests：
   - backend pytest parametrized RBAC matrix
   - Playwright：admin/manager/user 各自登入，驗證 sidebar、direct URL、API 403/200。

## Release 判定

**RBAC 權限 QA 未通過。** 若主管儀表板定位是 manager/admin 專用，現在 user 可以看見主管 KPI 與全域統計，屬於高風險資料外洩。建議修正後再部署。
