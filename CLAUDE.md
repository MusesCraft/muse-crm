# MUSE CRM

Meta Business 對話驅動客戶分析平台，整合 Messenger、Instagram、LINE 多頻道訊息，透過 LLM 自動分析客戶意圖與行為。

## 架構

- **backend/** — Flask 3.1 API + Celery 非同步任務（Python 3.11）
- **frontend/** — Next.js 16 App Router（TypeScript, React 19）
- **database/** — PostgreSQL 15 schema 定義
- **docker-compose.yml** — 本地開發環境（PostgreSQL, Redis, Backend, Celery Worker/Beat）

## 開發環境

```bash
# 啟動基礎設施（PostgreSQL + Redis）
docker compose up postgres redis -d

# 啟動後端（擇一）
docker compose --profile dev up backend celery celery-beat  # Docker
cd backend && flask run                                       # 本地

# 啟動前端
cd frontend && npm run dev
```

本地開發預設連線：
- PostgreSQL: `postgresql://muse:muse_dev@localhost:5432/muse_crm`
- Redis: `redis://localhost:6379/0`
- Backend API: `http://localhost:5000`
- Frontend: `http://localhost:3000`

## 常用指令

```bash
# 後端
cd backend
flask run                           # 啟動 dev server
flask db migrate -m "描述"          # 建立 migration
flask db upgrade                    # 執行 migration
pytest --cov                        # 跑測試
celery -A app.celery worker -l info # 啟動 worker

# 前端
cd frontend
npm run dev    # 開發
npm run build  # 建置
npm run lint   # ESLint
```

## API 慣例

- 所有 API 端點前綴 `/api/v1`（Blueprint 掛載於 `backend/app/api/__init__.py`）
- 輕量健康檢查 `/api/health`，詳細版 `/api/v1/health`
- JWT 認證，Token 放 Authorization header
- WebSocket 即時通訊透過 Flask-SocketIO

## 環境變數

所有敏感設定透過環境變數注入，詳見 `backend/app/config.py`。開發環境有安全預設值，Production 必須設定：`SECRET_KEY`, `JWT_SECRET`, `META_APP_SECRET`, `META_PAGE_TOKEN`。

## 語言

專案文件、註解、commit message 以繁體中文撰寫。
