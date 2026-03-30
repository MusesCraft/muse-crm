# Backend — Flask API

## 架構概覽

App Factory Pattern，入口在 `app/__init__.py` 的 `create_app()`。

```
app/
├── api/          # Flask Blueprint 端點（每個檔案一個資源）
├── models/       # SQLAlchemy ORM model（每個檔案一個 table）
├── services/     # 業務邏輯層（不直接處理 HTTP request/response）
├── tasks/        # Celery 非同步任務
├── channels/     # 多頻道 adapter（Meta, LINE）
├── realtime/     # SocketIO 即時事件
├── utils/        # 工具函數（auth, error_handler, permissions）
└── config.py     # 環境配置（Development/Production/Testing）
```

## 分層職責

- **api/** — 接收 HTTP 請求、參數驗證、回傳 JSON。不放業務邏輯。
- **services/** — 核心業務邏輯。被 api 和 tasks 共用。
- **tasks/** — Celery 背景任務，在 Flask app context 內執行。分四類：analysis、session、notification、maintenance。
- **channels/** — 抽象多頻道訊息收發。`base.py` 定義介面，各 adapter 實作。透過 `registry.py` 查找。
- **models/** — 純資料定義，UUID 主鍵，TIMESTAMPTZ 時間欄位。

## 資料庫 Migration

使用 Alembic（透過 Flask-Migrate）：

```bash
flask db migrate -m "描述變更"   # 自動產生 migration
flask db upgrade                 # 套用到資料庫
flask db downgrade               # 回退一版
```

Migration 檔案在 `migrations/versions/`，命名含 CRM ticket 編號（如 `crm_023_`）。

## Celery 任務

Broker 和 Result Backend 都用 Redis。定時任務（Beat Schedule）定義在 `app/__init__.py` 的 `_configure_celery()`：
- `cleanup-expired-sessions` — 每小時清理過期 session
- `retry-failed-analysis` — 每 30 分鐘重試失敗分析
- `check-due-actions` — 每小時檢查到期待辦
- `periodic-data-health-check` — 每 6 小時資料健康檢查

時區設定 `Asia/Taipei`，啟用 UTC。

## LLM 整合

透過 OpenRouter API 呼叫（`services/llm_service.py`），預設模型 `anthropic/claude-3-haiku`。Prompt 模板集中在 `services/prompts.py`。

## 認證與授權

- JWT Token 產生與驗證在 `utils/auth.py`
- 權限檢查在 `utils/permissions.py`
- Token 有效期 24 小時（可透過 `JWT_EXPIRY_HOURS` 調整）

## 即時通訊

Flask-SocketIO，async_mode 為 threading，可選 Redis 作為 message queue（多 worker 同步）。事件處理在 `realtime/events.py`，廣播在 `realtime/emitter.py`。

## 測試

```bash
pytest --cov          # 執行測試並產生覆蓋率報告
```

測試在 `tests/` 目錄，使用 TestingConfig（獨立資料庫 `muse_crm_test`）。
