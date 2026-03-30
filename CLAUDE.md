# MUSE CRM

Meta Business 對話驅動客戶分析平台，整合 Messenger、Instagram、LINE 多頻道訊息，透過 LLM 自動分析客戶意圖與行為。目標產業：石材建材（石英石、人造石、岩板）。

## 架構

```
backend/           Flask 3.1 API + Celery（Python）
frontend/          Next.js 16 App Router（TypeScript, React 19）
database/          PostgreSQL 15 schema（schema.sql）
docker-compose.yml 本地開發環境（PostgreSQL, Redis, Backend, Celery）
```

## 開發環境

```bash
# 啟動基礎設施
docker compose up postgres redis -d

# 後端（擇一）
docker compose --profile dev up backend celery celery-beat
cd backend && flask run

# 前端
cd frontend && npm run dev
```

| 服務 | 位址 |
|------|------|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5000 |
| PostgreSQL | localhost:5432（muse / muse_dev / muse_crm） |
| Redis | localhost:6379 |

## 常用指令

```bash
# 後端
flask run                           # dev server
flask db migrate -m "描述"          # 建立 migration
flask db upgrade                    # 執行 migration
pytest --cov                        # 測試
celery -A app.celery worker -l info # worker

# 前端
npm run dev                         # 開發
npm run build                       # 建置
npm run lint                        # ESLint
```

## 部署（Railway）

- **muse-crm-backend** — 後端 API（Dockerfile + gunicorn）
- **muse-crm-frontend** — 前端（Dockerfile + standalone Next.js）
- 部署指令：`cd backend && railway up --detach`
- 健康檢查：`/api/health`（輕量）、`/api/v1/health`（含 DB/Redis）

## API 慣例

- 所有端點前綴 `/api/v1`（Blueprint 於 `backend/app/api/__init__.py`）
- JWT 認證：Access Token 24h + Refresh Token 30d
- 登入 rate limit：5/minute
- Token 黑名單：Redis（JTI-based）
- WebSocket：Flask-SocketIO
- 錯誤回應格式：`{ "error": "訊息" }`（繁體中文）

## 環境變數

所有敏感設定透過環境變數注入（`backend/app/config.py`）。Production 必須設定：
`SECRET_KEY`, `JWT_SECRET`, `META_APP_SECRET`, `META_PAGE_TOKEN`

## 開發工作流程指引

### 修改後端 API
1. 先看 `app/api/` 對應檔案了解現有端點
2. 業務邏輯放 `app/services/`，API 層只做參數驗證和回傳
3. 如需新 model，在 `app/models/` 建立後跑 `flask db migrate`
4. 修改完用 `pytest` 驗證

### 修改前端頁面
1. 頁面在 `src/app/(app)/` 下，對應路由名稱
2. API 呼叫統一透過 `lib/api.ts`，不要直接 fetch
3. UI 元件優先用 shadcn/ui（`npx shadcn add <component>`）
4. 修改完用 `npm run lint` 檢查

### 跨前後端功能
1. 後端先建 API 並測試
2. 前端在 `lib/api.ts` 加對應方法
3. 頁面元件調用 API 方法

## 語言

專案文件、註解、commit message 以繁體中文撰寫。
