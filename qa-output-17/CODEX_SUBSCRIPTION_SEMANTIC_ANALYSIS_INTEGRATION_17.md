# [17] Codex 訂閱帳號接入 BBCRM 語意分析 — 實作方式

產出時間：2026-05-28
專案：`/Users/muse/Developer/muse-crm`
目標：使用已登入的 ChatGPT/Codex 訂閱帳號，讓 BBCRM 後端語意分析呼叫 `chatgpt.com/backend-api/codex`。

---

## 1. 現況確認

### 1.1 BBCRM 目前語意分析入口

核心檔案：

```text
backend/app/services/llm_service.py
backend/app/tasks/analysis_tasks.py
backend/app/models/llm_usage_log.py
```

目前 `LLMService` 寫死使用 OpenRouter：

```python
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY")
```

`analysis_tasks.py` 呼叫路徑：

```text
quick_triage_message() -> get_llm_service().quick_triage()
analyze_conversation() -> get_llm_service().full_analysis()
```

因此要讓 Codex 訂閱帳號進入語意分析，主要改 `LLMService`，不需要改前端。

### 1.2 本機 Codex 訂閱帳號狀態

已確認：

```text
Hermes provider: openai-codex
base_url: https://chatgpt.com/backend-api/codex
auth_mode: chatgpt
token_present: true
/models status: 200
可見模型：gpt-5.5, gpt-5.4, gpt-5.4-mini, gpt-5.3-codex, gpt-5.3-codex-spark, gpt-5.2, codex-auto-review
```

這表示訂閱帳號 OAuth 已可用。問題只剩：BBCRM 如何取得 token 並用 Responses API 格式呼叫。

---

## 2. 關鍵結論

BBCRM 不能只把 `OPENROUTER_API_URL` 換成 Codex URL，因為兩者 API 格式不同：

| 項目 | OpenRouter 現況 | Codex 訂閱帳號 |
|---|---|---|
| Endpoint | `/api/v1/chat/completions` | `https://chatgpt.com/backend-api/codex/responses` |
| Auth | `OPENROUTER_API_KEY` | ChatGPT OAuth access token |
| Request body | Chat Completions `{messages: [...]}` | Responses API `{instructions, input, ...}` |
| Response | `choices[0].message.content` | `output[]` / `output_text` |
| Token refresh | API key 不需 refresh | access token 會過期，需 refresh |

所以接入方式應該是新增一個 Codex provider branch，而不是覆蓋 OpenRouter branch。

---

## 3. 最小可行實作方案

### 3.1 新增環境變數

`backend/.env` 或部署環境新增：

```env
LLM_PROVIDER=codex
CODEX_BASE_URL=https://chatgpt.com/backend-api/codex
CODEX_MODEL=gpt-5.5
CODEX_TRIAGE_MODEL=gpt-5.4-mini
CODEX_AUTH_SOURCE=hermes
HERMES_AUTH_PATH=/Users/muse/.hermes/auth.json
```

若要避免 BBCRM 讀 Hermes token store，也可以改成直接注入短期 token：

```env
LLM_PROVIDER=codex
CODEX_ACCESS_TOKEN=<ChatGPT Codex OAuth access token>
CODEX_REFRESH_TOKEN=<ChatGPT Codex OAuth refresh token>
```

但不建議手動維護 token，因為 access token 會過期。

---

## 4. Token 接入方式

### 4.1 本機/單機部署：直接重用 Hermes auth store

BBCRM 後端可以用 Hermes 已有的 helper 取得可用 token：

```python
from hermes_cli.auth import resolve_codex_runtime_credentials

creds = resolve_codex_runtime_credentials(refresh_if_expiring=True)
access_token = creds["api_key"]
base_url = creds["base_url"]  # https://chatgpt.com/backend-api/codex
```

優點：

- 已支援 refresh。
- 不需要複製 token。
- 本機已驗證可取得模型列表。

限制：

- production container 需要能 import `hermes_cli`，且讀得到 `~/.hermes/auth.json`。
- 若部署在 Railway，通常讀不到本機 Hermes auth store；需要改走 4.2。

### 4.2 Railway/正式部署：做一個 token broker 或直接設定 service credential

正式部署建議不要讓 BBCRM container 直接吃個人桌機的 `~/.hermes/auth.json`。

兩條路：

#### 路線 A：內部 token broker

在有 Hermes auth 的機器跑一個只內網可用的小服務：

```text
GET /internal/codex-token
-> 回傳短期 access_token + base_url + expires_at
```

BBCRM 設：

```env
CODEX_TOKEN_BROKER_URL=https://internal.example.com/internal/codex-token
CODEX_TOKEN_BROKER_SECRET=...
```

BBCRM 每次 token 快過期時向 broker 取新 token。

#### 路線 B：部署環境直接保存 OAuth tokens

將 ChatGPT/Codex OAuth `refresh_token` 安全放入 Railway secret，BBCRM 自行 refresh。

需要複製 Hermes 的 refresh 邏輯，來源可參考：

```text
/Users/muse/.hermes/hermes-agent/hermes_cli/auth.py
resolve_codex_runtime_credentials()
refresh_codex_oauth_pure()
```

---

## 5. `LLMService` 需要怎麼改

### 5.1 保留現有 OpenRouter，新增 provider dispatch

在 `backend/app/services/llm_service.py`：

```python
LLM_PROVIDER = os.environ.get("LLM_PROVIDER", "openrouter")
CODEX_BASE_URL = os.environ.get("CODEX_BASE_URL", "https://chatgpt.com/backend-api/codex")
CODEX_MODEL = os.environ.get("CODEX_MODEL", "gpt-5.5")
CODEX_TRIAGE_MODEL = os.environ.get("CODEX_TRIAGE_MODEL", "gpt-5.4-mini")
```

`__init__` 加：

```python
self.provider = os.environ.get("LLM_PROVIDER", "openrouter").lower()
if self.provider == "codex":
    self.base_url = os.environ.get("CODEX_BASE_URL", "https://chatgpt.com/backend-api/codex").rstrip("/")
    self.api_key = self._resolve_codex_access_token()
else:
    self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY")
```

### 5.2 新增 token resolver

```python
def _resolve_codex_access_token(self) -> str:
    token = os.environ.get("CODEX_ACCESS_TOKEN")
    if token:
        return token

    if os.environ.get("CODEX_AUTH_SOURCE", "hermes") == "hermes":
        try:
            from hermes_cli.auth import resolve_codex_runtime_credentials
            creds = resolve_codex_runtime_credentials(refresh_if_expiring=True)
            self.base_url = creds.get("base_url", self.base_url).rstrip("/")
            return creds["api_key"]
        except Exception as e:
            raise LLMServiceError(f"Codex OAuth token 取得失敗: {e}")

    raise LLMServiceError("CODEX_ACCESS_TOKEN 未設定，且無法使用 Hermes auth store")
```

### 5.3 `_make_request()` 依 provider 分流

```python
def _make_request(...):
    if self.provider == "codex":
        return self._make_codex_request(messages, model, temperature, max_tokens, response_format)
    return self._make_openrouter_request(messages, model, temperature, max_tokens, response_format)
```

把原本 `_make_request()` 內容改名為 `_make_openrouter_request()`。

---

## 6. Codex Responses API request 格式

### 6.1 messages 轉 Responses input

簡化轉換：

```python
def _messages_to_codex_payload(self, messages):
    instructions = ""
    input_items = []

    for m in messages:
        role = m.get("role")
        content = m.get("content") or ""
        if role == "system":
            instructions += content + "\n"
        elif role in {"user", "assistant"}:
            input_items.append({
                "role": role,
                "content": [{"type": "input_text" if role == "user" else "output_text", "text": content}],
            })

    return instructions.strip(), input_items
```

### 6.2 呼叫 `/responses`

```python
def _make_codex_request(self, messages, model, temperature, max_tokens, response_format):
    instructions, input_items = self._messages_to_codex_payload(messages)

    payload = {
        "model": model or os.environ.get("CODEX_MODEL", "gpt-5.5"),
        "instructions": instructions,
        "input": input_items,
        "store": False,
        "reasoning": {"effort": "medium", "summary": "auto"},
        "include": ["reasoning.encrypted_content"],
    }

    # Codex backend 不一定接受 max_output_tokens；保守起見先不送。
    # JSON 穩定性靠 prompt 要求與既有 _parse_json_response()。

    start_time = time.time()
    response = self._session.post(
        f"{self.base_url}/responses",
        json=payload,
        headers={
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "session_id": "bbcrm-semantic-analysis",
            "x-client-request-id": "bbcrm-semantic-analysis",
        },
        timeout=self.timeout,
    )
```

### 6.3 解析 Codex response

Codex response 需從 `output` 抽文字：

```python
def _extract_codex_text(self, data: dict) -> str:
    if isinstance(data.get("output_text"), str):
        return data["output_text"]

    parts = []
    for item in data.get("output", []) or []:
        if not isinstance(item, dict):
            continue
        if item.get("type") == "message":
            for c in item.get("content", []) or []:
                if isinstance(c, dict):
                    text = c.get("text") or c.get("output_text")
                    if isinstance(text, str):
                        parts.append(text)
    return "\n".join(parts).strip()
```

然後沿用現有：

```python
parsed_content = self._parse_json_response(content)
```

usage mapping：

```python
usage_data = data.get("usage", {}) or {}
usage_info = {
    "model_used": data.get("model", model),
    "tokens_used": usage_data.get("total_tokens", 0),
    "prompt_tokens": usage_data.get("input_tokens", usage_data.get("prompt_tokens", 0)),
    "completion_tokens": usage_data.get("output_tokens", usage_data.get("completion_tokens", 0)),
    "processing_time_ms": elapsed_ms,
}
```

---

## 7. quick triage / full analysis 模型指定

目前 `quick_triage()` 寫死 `TRIAGE_MODEL`：

```python
model=TRIAGE_MODEL
```

改成：

```python
model = CODEX_TRIAGE_MODEL if self.provider == "codex" else TRIAGE_MODEL
```

`full_analysis()` 走 `chat_completion()`，預設 primary model 要在 codex provider 下改為：

```python
primary = model or (CODEX_MODEL if self.provider == "codex" else self.primary_model)
```

fallback chain 在 Codex provider 下應避免混用 OpenRouter model id：

```python
if self.provider == "codex":
    models_to_try = [primary]
else:
    models_to_try = [primary] + existing_openrouter_chain
```

---

## 8. 用量紀錄要補

`backend/app/models/llm_usage_log.py` 的 `MODEL_PRICING` 沒有 Codex OAuth 模型。

若只想先接通，不阻擋語意分析，可先新增：

```python
'gpt-5.5': {'input': Decimal('0'), 'output': Decimal('0')},
'gpt-5.4-mini': {'input': Decimal('0'), 'output': Decimal('0')},
'gpt-5.3-codex': {'input': Decimal('0'), 'output': Decimal('0')},
'gpt-5.3-codex-spark': {'input': Decimal('0'), 'output': Decimal('0')},
```

原因：訂閱帳號不是按 OpenAI API token 價格計費，先避免用 Claude 價格誤算。

---

## 9. 最小測試方式

### 9.1 先測 token/model

```bash
cd /Users/muse/Developer/muse-crm/backend
python - <<'PY'
from hermes_cli.auth import resolve_codex_runtime_credentials
import requests
creds = resolve_codex_runtime_credentials(refresh_if_expiring=True)
r = requests.get(
    creds['base_url'] + '/models?client_version=1.0.0',
    headers={'Authorization': 'Bearer ' + creds['api_key']},
    timeout=15,
)
print(r.status_code)
print([m.get('slug') for m in r.json().get('models', [])])
PY
```

### 9.2 測 `LLMService.full_analysis()`

```bash
cd /Users/muse/Developer/muse-crm/backend
export LLM_PROVIDER=codex
export CODEX_AUTH_SOURCE=hermes
export CODEX_MODEL=gpt-5.5
python - <<'PY'
from app.services.llm_service import LLMService
llm = LLMService(timeout=60)
result, usage = llm.full_analysis([
    {'sender': 'customer', 'content': '請問岩板檯面一米多少？想約丈量', 'timestamp': '2026-05-28T00:00:00Z'},
], channel='line', status='active', message_count=1)
print(result)
print(usage)
PY
```

### 9.3 測 Celery task

```bash
export LLM_PROVIDER=codex
export CODEX_AUTH_SOURCE=hermes
# 啟動 backend + celery 後，用現有 conversation_id 呼叫：
python - <<'PY'
from app.tasks.analysis_tasks import analyze_conversation
print(analyze_conversation('<conversation_id>', 'manual'))
PY
```

---

## 10. 必改檔案清單

最小實作：

```text
backend/app/services/llm_service.py
backend/app/models/llm_usage_log.py
backend/.env.example
```

若要正式部署 token broker：

```text
backend/app/services/codex_auth_service.py
backend/app/services/llm_service.py
backend/.env.example
```

測試：

```text
backend/tests/test_llm_service.py
backend/tests/test_analysis_tasks.py
```

---

## 11. 實作順序

```text
1. LLMService 加 LLM_PROVIDER=codex 分流
2. 加 _resolve_codex_access_token()
3. 把原 _make_request 改名 _make_openrouter_request
4. 新增 _make_codex_request
5. 新增 _messages_to_codex_payload / _extract_codex_text
6. quick_triage / full_analysis 模型按 provider 選擇
7. LlmUsageLog 補 Codex model pricing = 0
8. backend/.env.example 補 Codex 變數
9. 寫單元測試 mock Codex responses
10. 用一筆實際 conversation 跑 analyze_conversation 驗證
```

---

## 12. 最短答案

要把訂閱帳號接進 BBCRM 語意分析：

1. 使用 Hermes 目前已登入的 `openai-codex` OAuth token。
2. BBCRM `LLMService` 新增 `LLM_PROVIDER=codex`。
3. 從 `hermes_cli.auth.resolve_codex_runtime_credentials()` 取得 `api_key/base_url`。
4. 對 `https://chatgpt.com/backend-api/codex/responses` 發 Responses API request。
5. 把 response output text 轉回現有 `_parse_json_response()` 可吃的 JSON。
6. `analysis_tasks.py` 不必大改，仍呼叫 `get_llm_service().quick_triage()` 與 `.full_analysis()`。
