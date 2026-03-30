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

| 服務 | Railway 專案 | URL |
|------|-------------|-----|
| Backend API | muse-crm-backend | https://inspiring-strength-production-a8ca.up.railway.app |
| Frontend | muse-crm-frontend | https://miraculous-flow-production-e93d.up.railway.app |

### 部署指令

```bash
# 後端部署
cd backend && railway up --detach

# 查看部署日誌
railway logs

# 查看服務狀態
railway service status --all
```

### 健康檢查

```bash
# 輕量檢查（無需認證）
curl https://inspiring-strength-production-a8ca.up.railway.app/api/health

# 完整檢查（含 DB/Redis/Meta 狀態）
curl https://inspiring-strength-production-a8ca.up.railway.app/api/v1/health
```

### 資料庫操作

```bash
# 連接 Railway PostgreSQL（需 psql，PATH 含 /opt/homebrew/opt/libpq/bin）
export PATH="/opt/homebrew/opt/libpq/bin:/opt/homebrew/bin:$PATH"
echo "SELECT * FROM users;" | railway connect Postgres-g1oi

# Migration（透過 Railway 環境執行）
railway run -- flask db upgrade
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
3. 如需新 model，在 `app/models/` 建立後跑 `flask db migrate`
4. 修改完 commit → `cd backend && railway up --detach` 部署
5. 用 `curl` 打 Railway API 端點驗證

### 修改前端頁面
1. 頁面在 `src/app/(app)/` 下，對應路由名稱
2. API 呼叫統一透過 `lib/api.ts`，不要直接 fetch
3. UI 元件優先用 shadcn/ui（`npx shadcn add <component>`）
4. `npm run lint` + `npm run build` 確認無錯誤
5. 前端部署需從 Railway Dashboard 或 link 到 muse-crm-frontend 專案後 `railway up`

### 驗證步驟
1. 部署後先 `curl /api/health` 確認服務存活
2. 用 `curl /api/v1/health` 確認 DB/Redis 正常
3. 前端開啟 https://miraculous-flow-production-e93d.up.railway.app 實際操作

## Railway CLI 備忘

```bash
railway whoami                     # 確認登入狀態
railway list                       # 列出所有專案
railway link -p "muse-crm-backend" -s "inspiring-strength"  # Link 後端
railway up --detach                # 部署（不等待完成）
railway logs                       # 查看即時日誌
railway variables list             # 查看環境變數
railway connect Postgres-g1oi      # 連接 DB（需 psql）
```

## 語言

專案文件、註解、commit message 以繁體中文撰寫。
