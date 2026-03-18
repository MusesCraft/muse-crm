# MUSE CRM

**Meta Business 對話驅動客戶分析平台**

一個基於 Meta Business 平台（Messenger、Instagram）的 CRM 系統，透過 LLM 自動分析客戶對話，提供結構化的客戶洞察和待辦動作建議。

## 🏗️ 技術棧

### 後端
- **框架**: Flask 3.0 + SQLAlchemy
- **資料庫**: PostgreSQL 15
- **佇列**: Celery + Redis  
- **LLM**: OpenRouter (Claude/GPT)
- **部署**: Fly.io Tokyo

### 前端
- **框架**: Next.js 14 + TypeScript
- **樣式**: Tailwind CSS + shadcn/ui
- **狀態管理**: React Hooks

### 基礎設施
- **容器**: Docker Compose
- **資料庫遷移**: Flask-Migrate (Alembic)
- **監控**: 內建錯誤追蹤

## 🚀 本機開發設定

### 1. 複製專案
```bash
git clone https://github.com/kiresakura/muse-crm.git
cd muse-crm
```

### 2. 後端設定
```bash
cd backend

# 建立虛擬環境
python3 -m venv venv
source venv/bin/activate  # macOS/Linux
# venv\Scripts\activate   # Windows

# 安裝依賴
pip install -r requirements.txt

# 複製環境變數
cp ../.env.example .env
# 編輯 .env 設定必要的 API keys
```

### 3. 資料庫設定
```bash
# 啟動 PostgreSQL + Redis
docker compose up postgres redis -d

# 等待服務就緒，然後初始化資料庫
flask db upgrade
```

### 4. 前端設定
```bash
cd ../frontend

# 安裝 Node.js 依賴（稍後建立）
npm install
```

### 5. 啟動服務

#### 方法 1: Docker Compose（推薦）
```bash
# 啟動完整開發環境
docker compose --profile dev up -d

# 查看日誌
docker compose logs -f backend celery
```

#### 方法 2: 手動啟動
```bash
# Terminal 1: Flask API
cd backend
source venv/bin/activate
flask run --debug

# Terminal 2: Celery Worker
cd backend
source venv/bin/activate
celery -A app.celery worker --loglevel=info

# Terminal 3: Next.js (稍後)
cd frontend
npm run dev
```

## 📖 API 文件

### 核心端點

| 端點 | 方法 | 說明 |
|------|------|------|
| `/api/health` | GET | 健康檢查 |
| `/api/webhook` | GET/POST | Meta Webhook |
| `/api/inbox/conversations` | GET | 對話列表 |
| `/api/contacts` | GET | 客戶列表 |
| `/api/actions` | GET | 待辦動作 |
| `/api/dashboard/overview` | GET | Dashboard 統計 |
| `/api/tags` | GET | 標籤管理 |

### Webhook 設定

在 Meta 開發者後台設定 Webhook URL：
```
https://your-domain.com/api/webhook
```

驗證 Token: 使用 `.env` 中的 `META_VERIFY_TOKEN`

## 🗄️ 資料庫結構

### 核心表格
- **contacts**: 客戶主表
- **channel_identifiers**: 跨渠道身份（PSID/ASID）
- **conversations**: 對話 Session
- **messages**: 原始訊息
- **analyses**: LLM 分析結果
- **actions**: 待辦動作
- **tags**: 標籤系統

### 關聯圖
```
Contact (1) ←→ (N) ChannelIdentifier
   ↓ (1:N)
Conversation ←→ Message
   ↓ (1:N)      ↓ (N:1)
Analysis    ←→ Contact ←→ Action
              ↓ (M:N)
             ContactTag ←→ Tag
```

## 🔄 開發階段進度

### ✅ Phase 0: 基礎建設（已完成）
- [x] GitHub repo 建立
- [x] 專案目錄結構
- [x] PostgreSQL Schema DDL  
- [x] Flask app factory + SQLAlchemy models
- [x] 從 MusesAI-CS 移植核心模組
- [x] Docker Compose 開發環境
- [x] Celery 佇列配置

### 🔄 Phase 1: Webhook 接收（進行中）
- [x] Meta Webhook 簽名驗證
- [x] 訊息去重機制
- [x] 客戶自動建檔
- [ ] 跨渠道客戶合併（ASID）
- [ ] Mock Webhook 測試工具

### 🔮 Phase 2: 對話 Session 管理
- [ ] Session 自動建立/關閉
- [ ] Session 逾時處理
- [ ] Ad Referral 解析
- [ ] 觸發 LLM 分析

### 🔮 Phase 3: LLM 分析管線
- [ ] OpenRouter API 整合
- [ ] 萃取 Prompt 設計
- [ ] 分析佇列 + 重試機制
- [ ] 自動打標 + Action 建立

### 🔮 Phase 4-6: 前端開發
- [ ] Next.js 專案建立
- [ ] Inbox + 客戶 360 頁面
- [ ] Dashboard + 圖表
- [ ] 整合測試

## 🛠️ 常用指令

### 資料庫遷移
```bash
# 建立新的遷移檔案
flask db migrate -m "Add new table"

# 執行遷移
flask db upgrade

# 回退遷移
flask db downgrade
```

### Celery 管理
```bash
# 啟動 Worker
celery -A app.celery worker --loglevel=info

# 啟動 Beat（定時任務）
celery -A app.celery beat --loglevel=info

# 監控工具
celery -A app.celery flower
```

### 測試
```bash
# 執行所有測試
pytest

# 帶覆蓋率報告
pytest --cov=app tests/

# 特定測試
pytest tests/test_webhook.py -v
```

## 🔧 環境變數說明

| 變數 | 說明 | 範例 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 連線字串 | `postgresql://user:pass@host:5432/db` |
| `REDIS_URL` | Redis 連線字串 | `redis://localhost:6379/0` |
| `OPENROUTER_API_KEY` | OpenRouter API Key | `sk-or-...` |
| `META_APP_SECRET` | Meta App Secret | `abc123...` |
| `META_PAGE_TOKEN` | Meta Page Access Token | `EAAG...` |

## 🤝 開發指南

### Git 工作流程
1. 從 `main` 建立功能分支
2. 開發 + 測試
3. 提交 Pull Request
4. Code Review + CI 通過後合併

### 程式碼規範
- Python: PEP 8 + Type Hints
- 所有 API 端點需要測試
- 資料庫變更需要遷移檔案
- 錯誤需要適當的日誌記錄

## 📞 技術支援

- **GitHub Issues**: [問題回報](https://github.com/kiresakura/muse-crm/issues)
- **技術文件**: 參考 `docs/` 目錄
- **架構決策**: 參考 ADR (Architecture Decision Records)

---

**開發者**: 時七技術團隊 | **授權**: Private License | **版本**: v1.0.0-alpha