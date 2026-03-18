# Phase 2 Verification — 對話 Session 管理 + 分析觸發 Stubs

**完成日期**: 2026-03-18  
**Phase**: 2 of 5

---

## ✅ 完成項目

### 1. 對話 Session 超時邏輯

| 項目 | 狀態 | 說明 |
|------|------|------|
| 超時時間調整 | ✅ | `timeout_minutes` 預設值從 1440 (24h) 改為 **240 (4h)** |
| Model 層 | ✅ | `Conversation.is_expired` property 使用 `timeout_minutes` 判斷超時 |
| Schema 同步 | ✅ | `database/schema.sql` 同步更新 `DEFAULT 240` |
| Webhook 處理 | ✅ | `SessionService.get_or_create_conversation()` 在收到訊息時檢查 `is_expired`，超時則關閉舊對話、建立新對話 |
| 關閉方法修正 | ✅ | `close_conversation()` 使用 `datetime.utcnow()` 而非 `func.now()` 避免 ORM 層問題 |

### 2. 對話狀態管理

| 項目 | 狀態 | 說明 |
|------|------|------|
| 自動關閉邏輯 | ✅ | `SessionService.cleanup_expired_conversations()` 批量關閉超時對話 |
| Celery 定時任務 | ✅ | `cleanup_expired_sessions` 任務透過 **Celery Beat** 每小時執行 |
| Beat 配置 | ✅ | `app/__init__.py` 中配置 `beat_schedule`，含 cleanup + retry 兩個定時任務 |
| 對話重開機制 | ✅ | closed 對話不會重開，`get_or_create_conversation()` 只查 `status='active'`，客戶重新發訊息會建立新對話 |

**Celery Beat 定時任務清單：**
- `cleanup-expired-sessions` — 每 3600 秒（1 小時）
- `retry-failed-analysis` — 每 1800 秒（30 分鐘）

### 3. 觸發 LLM 分析

| 項目 | 狀態 | 說明 |
|------|------|------|
| `analyze_message` task | ✅ | `app/tasks/session_tasks.py` 新增 per-message 分析觸發任務 |
| Webhook 整合 | ✅ | 訊息儲存成功後呼叫 `analyze_message.delay(str(message.id))` |
| 委託機制 | ✅ | `analyze_message` → 驗證訊息存在 → 呼叫 `trigger_analysis_task` → 加入 `analysis_queue` → 觸發 `process_analysis_queue` |
| 重試機制 | ✅ | `max_retries=3`，指數退避 (30s, 60s, 120s) |
| Tasks 匯出 | ✅ | `app/tasks/__init__.py` 已更新匯出 `analyze_message` |

### 4. 跨渠道客戶合併基礎

| 項目 | 狀態 | 說明 |
|------|------|------|
| `MergeService` | ✅ | `app/services/merge_service.py` — 完整的 service 層 |
| 自動檢測 | ✅ | `check_and_merge_on_message()` — webhook 觸發時可呼叫的合併檢測 |
| Meta id_match | ✅ stub | `query_id_match()` — Phase 3 實作 API 呼叫 |
| ASID 取得 | ✅ stub | `_fetch_asid_from_meta()` — Phase 3 實作 |
| 批量掃描 | ✅ | `scan_for_merge_candidates()` — 可用於定期合併掃描 |
| 合併歷史 | ✅ | `get_merge_history()` — 查詢客戶的合併紀錄 |
| Services 匯出 | ✅ | `app/services/__init__.py` 已更新匯出 `MergeService` |

---

## 修改的檔案清單

| 檔案 | 修改類型 | 說明 |
|------|----------|------|
| `backend/app/__init__.py` | 修改 | 加入 Celery Beat schedule 配置 |
| `backend/app/models/conversation.py` | 修改 | timeout_minutes 預設 240；close_conversation 使用 datetime.utcnow() |
| `backend/app/services/session_service.py` | 修改 | timeout_minutes 參數預設 240 |
| `backend/app/api/webhook.py` | 修改 | import 和呼叫 `analyze_message` 取代 `trigger_analysis_task` |
| `backend/app/tasks/__init__.py` | 修改 | 匯出 `analyze_message` |
| `backend/app/tasks/session_tasks.py` | 修改 | 新增 `analyze_message` task |
| `backend/app/services/merge_service.py` | **新增** | 跨渠道合併服務層 |
| `backend/app/services/__init__.py` | 修改 | 匯出 `MergeService` |
| `database/schema.sql` | 修改 | timeout_minutes DEFAULT 240 |

---

## 驗證方式

### 自動驗證（已通過）

```bash
# 語法檢查 — 所有 8 個修改的檔案通過 AST 解析
python3 -c "import ast; ..."  # ✅ All files syntax OK

# 模組導入驗證
python3 -c "from app import create_app; ..."
# ✅ App created successfully
# ✅ Conversation default timeout: 240
# ✅ Tasks imported: analyze_message, trigger_analysis_task, cleanup_expired_sessions
# ✅ MergeService imported
# ✅ Celery Beat schedules: ['cleanup-expired-sessions', 'retry-failed-analysis']
```

### 手動測試（用 mock_webhook.py）

```bash
# 啟動 Flask
cd backend && flask run

# 測試基本訊息流（會觸發 analyze_message）
python scripts/mock_webhook.py --sender test_user_1 --text "Hello" --type messenger

# 測試 Session 超時（4 小時後新訊息應建立新對話）
# 需要手動修改 DB 中的 last_message_at 往前推 5 小時，再發送新訊息

# 啟動 Celery Beat（驗證定時任務）
celery -A app.celery beat --loglevel=info
celery -A app.celery worker --loglevel=info
```

---

## Phase 3 待辦（下一階段）

1. **LLM 分析實作** — `analyze_message` 加入即時 NLP 分析（意圖偵測、情感分析）
2. **Meta id_match API** — 實作 `MergeService.query_id_match()` 和 `_fetch_asid_from_meta()`
3. **合併自動觸發** — 在 webhook handler 中呼叫 `MergeService.check_and_merge_on_message()`
4. **OpenRouter LLM 整合** — `_analyze_conversation()` 改用真實 LLM 替代 mock
