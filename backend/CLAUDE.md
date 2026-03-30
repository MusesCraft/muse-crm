# Backend — Flask API

## 架構

App Factory Pattern，入口 `app/__init__.py` → `create_app()`。

```
app/
├── api/          # Blueprint 端點（每檔一資源，15 個模組）
├── models/       # SQLAlchemy ORM（每檔一 table，UUID 主鍵）
├── services/     # 業務邏輯（被 api/ 和 tasks/ 共用，不互相呼叫）
├── tasks/        # Celery 非同步任務（analysis, session, notification, maintenance）
├── channels/     # 多頻道 adapter（Meta, LINE）+ registry
├── realtime/     # SocketIO 事件處理 + 廣播
├── utils/        # auth, error_handler, permissions, meta_api, scope
└── config.py     # Development / Production / Testing 配置
```

## 分層規則

- **api/** — HTTP 請求處理、參數驗證、回傳 JSON。禁止放業務邏輯。
- **services/** — 核心邏輯。被 api 和 tasks 共用。Services 之間不互相呼叫。
- **tasks/** — Celery 背景任務，在 Flask app context 內執行。
- **channels/** — `base.py` 定義抽象介面，`meta_adapter.py` / `line_adapter.py` 實作，`registry.py` 查找。
- **models/** — 純資料定義。UUID 主鍵、TIMESTAMPTZ、JSONB。無 soft delete（用 `is_merged` 標記合併）。

## 認證系統

- **Access Token**：24h，含 JTI（唯一 ID）
- **Refresh Token**：30d，type='refresh'
- **登出黑名單**：Redis（`token_blacklist:{jti}`，TTL = token 剩餘時間）
- **Rate Limit**：登入 5/minute（Flask-Limiter，Redis backend）
- 相關檔案：`utils/auth.py`（middleware）、`api/auth.py`（端點）

## 資料庫

Alembic（Flask-Migrate）：
```bash
flask db migrate -m "描述"    # 本地產生 migration 檔案
railway run -- flask db upgrade   # 在 Railway 上執行 migration
```
Migration 檔命名含 CRM ticket（如 `crm_023_`）。

查詢 Railway DB：
```bash
export PATH="/opt/homebrew/opt/libpq/bin:/opt/homebrew/bin:$PATH"
echo "SQL語句" | railway connect Postgres-g1oi
```

關鍵 table 關係：
```
Contact 1──N ChannelIdentifier（PSID/ASID/LINE_UID）
Contact 1──N Conversation 1──N Message
Conversation 1──N Analysis
Contact 1──N Action
Contact M──N Tag（through contact_tags）
```

## Celery

Redis 為 broker + result backend。時區 `Asia/Taipei`。

Beat 定時任務（定義在 `app/__init__.py` → `_configure_celery()`）：
| 任務 | 頻率 |
|------|------|
| cleanup-expired-sessions | 每小時 |
| retry-failed-analysis | 每 30 分鐘 |
| check-due-actions | 每小時 |
| periodic-data-health-check | 每 6 小時 |

## LLM 整合

- OpenRouter API（`services/llm_service.py`），預設 `anthropic/claude-3-haiku`
- Prompt 模板集中於 `services/prompts.py`（強制 JSON 輸出）
- 用戶輸入必須經 `_sanitize_user_input()` 防注入（轉義大括號）
- 意圖分類：pricing, spec, visit, complaint, greeting, order, followup, other
- 客戶身份：設計師、屋主、建材行、工班

## 錯誤處理

- `utils/error_handler.py` 集中管理，`register_error_handlers(api_bp)` 註冊
- `ERROR_STRATEGIES` dict 定義各錯誤類型的重試策略（指數退避）
- 錯誤記錄到 PostgreSQL `error_logs` table（JSONB context）
- 所有錯誤回應為繁體中文

## SocketIO

async_mode='threading'，可選 Redis message queue。
- 事件處理：`realtime/events.py`
- 廣播：`realtime/emitter.py`

## 部署與驗證

部署到 Railway，不使用本地環境：
```bash
# 確認已 link
railway link -p "muse-crm-backend" -s "inspiring-strength"

# 部署
railway up --detach

# 驗證
curl -s https://inspiring-strength-production-a8ca.up.railway.app/api/v1/health

# 測試 API 端點（帶認證）
TOKEN=$(curl -s -X POST https://inspiring-strength-production-a8ca.up.railway.app/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@muse-crm.com","password":"Muse@2026!"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

curl -s https://inspiring-strength-production-a8ca.up.railway.app/api/v1/contacts \
  -H "Authorization: Bearer $TOKEN"
```

Production Dockerfile：gunicorn 1 worker / 4 threads / 120s timeout
`entrypoint.sh`：自動初始化 DB schema（psycopg2 直連）
