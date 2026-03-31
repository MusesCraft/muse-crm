# MUSE CRM 日報 — 2026/03/30

## 摘要

全面 bug 掃描與修復，涵蓋安全漏洞、效能問題、前端穩定性、資料完整性。共修改 **51 個檔案**、**1,078 行新增**、**280 行刪除**，修復 **64 項問題**。已部署至 Railway 並完成驗證。

---

## 一、安全修復（16 項）

### 認證與授權
| 修復 | 說明 |
|------|------|
| IDOR 防護 | inbox（5 端點）和 contacts（4 端點）加入 scope 權限檢查 |
| Quick Replies 認證 | 3 個端點補上 `@login_required` |
| 登入限速 | 新增 Flask-Limiter，登入限制 5 次/分鐘 |
| 登出 + Token 黑名單 | 新增 `/auth/logout` 端點，JWT 加入 JTI，Redis 黑名單機制 |
| `send_image` 角色檢查 | 補上缺失的 `@require_role` |

### 安全強化
| 修復 | 說明 |
|------|------|
| Webhook 簽名繞過 | Meta/LINE adapter 未配置 secret 時改為拒絕（原本直接放行） |
| Timing attack | Webhook verify_token 改用 `hmac.compare_digest()` |
| XSS 防護 | 前端 `innerHTML` 改為 React 狀態渲染 |
| CORS 收斂 | 預設從 `*` 改為 localhost + Railway 自動偵測 |
| LLM Prompt injection | 新增 `_sanitize_user_input()` 跳脫大括號，6 個 prompt 函式套用 |
| 無限 Thread | Webhook 改用 `ThreadPoolExecutor(max_workers=20)` |

---

## 二、資料一致性修復（8 項）

| 修復 | 說明 |
|------|------|
| `datetime.utcnow()` 全面替換 | 18 個檔案改為 `datetime.now(timezone.utc)` |
| `func.now()` 賦值錯誤 | `action.py` 的 `complete()` 改為 Python datetime |
| `== False` NULL 問題 | contacts.py 5 處改為 `.is_(False)` |
| LlmUsageLog FK 約束 | `conversation_id`、`message_id` 加入外鍵（含 migration） |
| Email NOT NULL | `users.email` 改為 `nullable=False` |
| Tag 大小寫重複 | 加入 `@validates('name')` 自動 lowercase |
| 無限重試迴圈 | `retry_failed_analysis` 修正未遞增 `retry_count` |
| 任務卡死 | 分析任務失敗時先 rollback 再 `mark_as_failed()` |

---

## 三、效能修復（4 項）

| 修復 | 說明 |
|------|------|
| N+1 查詢（sync） | `selectinload(Conversation.messages)` 取代迴圈內 query |
| N+1 查詢（inbox） | `joinedload(Contact.tags).joinedload(ContactTag.tag)` |
| Layout 輪詢 | 500ms `setInterval` 改為 `sidebar-toggle` 事件驅動 |
| 無邊界查詢 | `days` 參數限制 1–365、pending actions 加 `.limit(500)` |

---

## 四、前端穩定性修復（14 項）

| 修復 | 說明 |
|------|------|
| `.map is not a function` | 新增 `ensureArray()` 防禦函式，修復 4 個 API 方法 |
| 圖片重複發送 | `allMessages` 加入 `useMemo` ID 去重 + server 同步後清除 local |
| Interval 洩漏 | Polling deps 移除 `conv?.messages?.length`，改用 ref |
| 發送 race condition | 加入 `sendingRef` 即時互鎖 |
| 401 未清 token | API 層 401 時清除 localStorage + dispatch `auth-expired` |
| setTimeout 洩漏 × 3 | OCR toast、settings copy、customer-sidebar 加入 ref 清理 |
| OCR useCallback 重建 | 用 `ocrLoadingRef` 取代 deps 中的 `ocrLoading` |
| URL.createObjectURL 洩漏 | 組件卸載時 revoke |
| Stale closure | inbox page polling 用 `totalRef` + `pollingRef` |
| Mock data 型別錯誤 | 補齊 `Tag.name`、`Action.source`、`Note.author_id` |
| Frontend build 失敗 | 修復上述型別問題後 build 通過 |

---

## 五、圖片發送功能修復（7 項）

| 修復 | 說明 |
|------|------|
| 靜默失敗 → 回報錯誤 | 後端回傳 `api_error` 欄位，前端顯示警告 |
| Channel 路由 | 依 conversation.channel 分別呼叫 Meta API 或 LINE adapter |
| LINE 圖片發送 | 新增 `LineAdapter.send_image()` 方法 |
| Base adapter | 新增 `send_image()` 預設方法 |
| `is_reusable` 修正 | 改為 `False`，避免 Meta 快取過期 URL |
| 前端 URL 驗證 | 上傳後檢查 `mediaUrl` 非空 |
| 前端錯誤顯示 | 檢查 `api_error` 並顯示平台送達失敗提示 |

---

## 六、Railway 部署修復（5 項）

| 修復 | 說明 |
|------|------|
| CORS 阻擋 | Railway 環境自動偵測 `RAILWAY_ENVIRONMENT`，允許前端域名 |
| `API_BASE_URL` | 設定為 Railway 後端公開 URL，圖片 URL 可被 Meta 存取 |
| `META_PAGE_TOKEN` | 驗證並轉換為永久 Page Token（Never expires） |
| 依賴衝突 | `packaging` 降版至 24.2 解決 Flask-Limiter 相容問題 |
| DB Migration | 建立並執行 `f4a5b6c7d8e9`（FK 約束 + email NOT NULL） |

---

## 七、新增功能

| 功能 | 說明 |
|------|------|
| `POST /auth/logout` | JWT 登出端點，Token 黑名單存 Redis |
| Rate Limiting | Flask-Limiter 整合，登入 5 次/分鐘限制 |
| `ensureArray()` | API client 防禦性函式，防止 `.map()` 崩潰 |
| `_sanitize_user_input()` | LLM prompt injection 防護 |
| `LineAdapter.send_image()` | LINE 渠道圖片發送支援 |
| Message 去重 | 前端 `useMemo` + ID 去重，消除 polling 導致的重複訊息 |

---

## 影響範圍

```
backend/   37 檔案修改（api, models, services, tasks, channels, utils, config）
frontend/  14 檔案修改（api, auth, hooks, pages, components, mock-data）
database/  1 個新 migration（FK + NOT NULL）
railway/   3 個環境變數設定（API_BASE_URL, META_PAGE_TOKEN, CORS）
```

## 驗證結果

- Backend: 所有 API 端點測試通過
- Frontend: TypeScript 零錯誤、Production build 成功
- Railway: 前後端部署完成、CORS 正常、Health OK
- Meta API: Page Token 永久有效、權限齊全
