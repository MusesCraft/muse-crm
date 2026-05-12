# MUSE CRM

Meta Business 對話驅動客戶分析平台，整合 Messenger、Instagram、LINE 多頻道訊息，透過 LLM 自動分析客戶意圖與行為。目標產業：石材建材（石英石、人造石、岩板）。

## 架構

```
backend/           Flask 3.1 API + Celery（Python）
frontend/          Next.js 16 App Router（TypeScript, React 19）
database/          PostgreSQL 15 schema（schema.sql）
docker-compose.yml 僅供參考，實際開發和測試都在 Railway 上進行
```

## 部署環境（Railway）

所有開發、測試、驗證都直接在 Railway 進行，不使用本地環境。

**Railway 專案**：`Muses-CRM-edit`（單一 monorepo 專案，含 4 個 services；2026-05-12 重建）

| Service | 用途 | URL |
|---------|------|-----|
| `backend` | Flask API + Celery | https://backend-production-5171.up.railway.app |
| `frontend` | Next.js 前端 | https://frontend-production-0866.up.railway.app |
| `postgres` | PostgreSQL 15 + uuid-ossp | （internal: postgres.railway.internal:5432）|
| `redis` | Redis 8（含 AOF 持久化） | （internal: redis.railway.internal:6379）|

GitHub 連動：`MusesCraft/muse-crm` `main` 分支 push 自動觸發 backend/frontend 部署。

### 部署指令

```bash
# 多數情況不需手動：git push 後 Railway 會自動部署
# 手動觸發（CLI 用 Project Token）：
RAILWAY_TOKEN=<project-token> railway up --detach

# 查看部署日誌
railway logs --service backend
railway logs --service frontend

# 查看服務狀態
railway status
```

### 健康檢查

```bash
# 輕量檢查（無需認證）
curl https://backend-production-5171.up.railway.app/api/health

# 完整檢查（含 DB/Redis/Meta 狀態）
curl https://backend-production-5171.up.railway.app/api/v1/health
```

### 資料庫操作

```bash
# 連接 Railway PostgreSQL（需 psql，PATH 含 /opt/homebrew/opt/libpq/bin）
export PATH="/opt/homebrew/opt/libpq/bin:/opt/homebrew/bin:$PATH"

# 方式一：透過 Railway CLI（需先 link）
echo "SELECT * FROM users;" | railway connect postgres

# 方式二：用 TCP proxy（postgres TCP proxy 已開啟）
# DATABASE_URL 範例（密碼存於本地 .railway-pg-password，已 gitignore）
psql "postgresql://postgres:<password>@yamabiko.proxy.rlwy.net:27856/railway" -c "SELECT * FROM users;"

# Schema 目前由 backend 啟動時 db.create_all() 統一建立
# Alembic migration 暫未啟用（schema.sql 已過時、不再使用）
# 後續若要重啟 migration：先標記 alembic_version 為最新 head，再 flask db migrate
```

## 常用指令

```bash
# 後端
flask db migrate -m "描述"          # 建立 migration（本地產生檔案）
npm run lint                        # 前端 ESLint
npm run build                       # 前端建置檢查
```

## API 慣例

- 所有端點前綴 `/api/v1`（Blueprint 於 `backend/app/api/__init__.py`）
- JWT 認證：Access Token 24h + Refresh Token 30d
- 登入 rate limit：5/minute
- Token 黑名單：Redis（JTI-based）
- WebSocket：Flask-SocketIO
- 錯誤回應格式：`{ "error": "訊息" }`（繁體中文）

## 環境變數

所有敏感設定透過環境變數注入（`backend/app/config.py`）。
Railway 上已配置完成，不需本地 `.env`。
Production 必須設定：`SECRET_KEY`, `JWT_SECRET`, `META_APP_SECRET`, `META_PAGE_TOKEN`

查看 Railway 環境變數：`railway variables list`

## 開發 → 部署 → 驗證 流程

### 修改後端 API
1. 先看 `app/api/` 對應檔案了解現有端點
2. 業務邏輯放 `app/services/`，API 層只做參數驗證和回傳
3. 如需新 model，在 `app/models/` 建立 — 啟動時 `db.create_all()` 自動建表
4. 修改完 `git push origin main`，Railway 自動部署
5. 用 `curl` 打 Railway API 端點驗證

### 修改前端頁面
1. 頁面在 `src/app/(app)/` 下，對應路由名稱
2. API 呼叫統一透過 `lib/api.ts`，不要直接 fetch
3. UI 元件優先用 shadcn/ui（`npx shadcn add <component>`）
4. `npm run lint` + `npm run build` 確認無錯誤
5. `git push` 後 Railway 自動部署 frontend service

### 驗證步驟
1. 部署後先 `curl /api/health` 確認服務存活
2. 用 `curl /api/v1/health` 確認 DB/Redis 正常
3. 前端開啟 https://frontend-production-0866.up.railway.app 實際操作

## Railway CLI 備忘

```bash
# Project Token 模式（推薦，免 keychain 互動）
RAILWAY_TOKEN=<project-token> railway status
RAILWAY_TOKEN=<project-token> railway service backend   # link
RAILWAY_TOKEN=<project-token> railway logs --service backend
RAILWAY_TOKEN=<project-token> railway variables --service backend --json

# Account Token 模式（GraphQL API，可管理 service / domain / database）
curl -X POST https://backboard.railway.com/graphql/v2 \
  -H "Authorization: Bearer <account-token>" \
  -H "Content-Type: application/json" \
  -d '{"query":"query { projects { edges { node { id name } } } }"}'
```

## 語言

專案文件、註解、commit message 以繁體中文撰寫。
