# [17] Codex 接入 BBCRM AI 語意分析研究

產出時間：2026-05-28
專案：`/Users/muse/Developer/muse-crm`
範圍：後端 AI 語意分析、LLM service、Celery analysis tasks、AI Copilot、成本/用量紀錄、接入 Codex 的可行路線。

---

## 1. 結論摘要

若「Codex」指的是 **OpenAI Codex CLI / coding agent**：不建議也不應作為 production runtime 的語意分析引擎。Codex CLI 適合幫工程師改程式、寫測試、做 code review，不適合讓 CRM 每次客戶訊息進來時呼叫一個互動式 coding agent。

若「Codex」指的是 **OpenAI 提供的 codex/code-optimized model**：可以透過 OpenAI-compatible API 或 OpenRouter model id 接進現有 `LLMService`，但我不建議把它作為客戶語意分析主模型。原因是 BBCRM 的語意分析任務是客服對話理解、摘要、需求萃取、下一步動作與風險判斷，這不是 code-specialized model 的強項。

最穩健策略：

1. 保留現有 `LLMService` 作為統一抽象。
2. 將模型選擇改成環境變數 / SystemSetting 可配置。
3. 新增 provider adapter：`openrouter`、`openai`，而不是把 Codex 硬寫死。
4. Codex 只放在「可選實驗模型 / fallback / 離線評測」路徑，不作為 P0 production 主模型。
5. 真正要提升語意分析品質，應導入「語意分析 schema + golden dataset + A/B eval」，再比較 Codex、GPT、Claude、Gemini 的結果。

---

## 2. 現有 AI 語意分析架構

### 2.1 核心服務

檔案：`backend/app/services/llm_service.py`

目前設計：

- 使用 OpenRouter Chat Completions endpoint：
  - `https://openrouter.ai/api/v1/chat/completions`
- API key：`OPENROUTER_API_KEY`
- 主要模型常數：
  - `MODEL_PRIMARY = "anthropic/claude-3.5-sonnet"`
  - `MODEL_FALLBACK = "openai/gpt-4"`
  - `LLM_MODEL_CHAIN = ["anthropic/claude-3.5-sonnet", "openai/gpt-4", "google/gemini-2.0-flash-001"]`
  - `TRIAGE_MODEL = "google/gemini-2.0-flash-lite-001"`
- 已有 retry / fallback / timeout / JSON parse。
- 已有 `response_format={'type': 'json_object'}` 的部分支援。

目前高階方法：

- `analyze_intent()`
- `extract_entities()`
- `summarize_conversation()`
- `suggest_actions()`
- `quick_triage()`
- `full_analysis()`
- `generate_reply_suggestions()`
- `detect_risks()`

### 2.2 背景任務

檔案：`backend/app/tasks/analysis_tasks.py`

目前語意分析入口：

- `quick_triage_message(message_id)`
  - 單訊息快速分類：intent + identity。
  - 寫回 `messages.quick_intent / quick_identity / quick_analyzed_at`。

- `analyze_message(message_id)`
  - 單訊息 intent + entity extraction。

- `analyze_conversation(conversation_id, trigger_type)`
  - 整段對話 `full_analysis()`。
  - 寫入 `analyses`。
  - 透過 `ActionService.create_from_analysis()` 自動建立待辦。
  - 發 WebSocket `analysis_complete`。

- `batch_analyze_pending()` / `process_analysis_queue()` / `retry_failed_analysis()`
  - 分析佇列與重試。

### 2.3 Prompt 層

檔案：`backend/app/services/prompts.py`

現有 prompts 均要求 JSON 輸出，任務包括：

- 意圖辨識
- 實體萃取
- 對話摘要
- 建議動作
- 綜合分析
- 快速分類
- 回覆建議
- 風險偵測

這代表 Codex 接入的主要挑戰不是 prompt 缺失，而是 provider/model 選擇與輸出穩定性。

### 2.4 用量與成本

檔案：`backend/app/models/llm_usage_log.py`

現有：

- `LlmUsageLog.record()`
- `MODEL_PRICING`
- 月度成本/token budget check：`LLMService.check_budget()`

缺口：

- `MODEL_PRICING` 沒有 Codex / 新 OpenAI 模型價格。
- 未知模型會用 Claude 3.5 Sonnet 價格保守估算，會造成成本報表失真。

---

## 3. Codex 接入的三種定義

### A. Codex CLI / coding agent 接入

不建議用於 production 語意分析。

原因：

- Codex CLI 是互動式 coding agent，不是低延遲 API inference service。
- 需要 git repo / PTY / sandbox / session 管理。
- 每次客戶訊息都啟動 agent 成本和延遲都不可控。
- 輸出不一定是穩定 JSON。
- 安全邊界錯：客服資料會被交給 coding agent 上下文處理，不適合作為線上請求路徑。

可用場景：

- 離線改進 prompt。
- 自動產生 eval cases。
- 分析失敗樣本並提出修正 PR。
- 做語意分析系統的 code review / regression test generator。

### B. OpenAI Codex/code-specialized model 作為 LLM model id

可接，但不建議作主模型。

接法：

- 如果 OpenRouter 有相應 model id：把 model id 加入 `LLM_MODEL_CHAIN` 或 SystemSetting。
- 如果走 OpenAI 官方 API：新增 OpenAI provider adapter，使用 OpenAI API key 與 OpenAI-compatible endpoint。

風險：

- code-specialized model 對客服語意分析未必比通用 instruction model 好。
- 可能對 JSON schema 遵循不如專門的 structured-output 模型穩。
- 成本、速率、上下文限制要重新評估。

### C. 「Codex」作為 OpenAI runtime provider 的泛稱

如果實際意思是「改用 OpenAI 模型」而不是 Codex coding agent，建議不要叫 Codex，應明確接：

- `openai/gpt-4.1-mini` / `gpt-4o-mini` 類模型做 quick triage。
- 高階模型做 full_analysis / reply suggestion。
- 保留 OpenRouter 兼容層或新增 official OpenAI provider。

---

## 4. 推薦架構

### 4.1 不要直接改 `LLMService` 成 Codex-only

目前 `LLMService` 已經是全專案 AI 語意分析核心。如果把模型寫死成 Codex，會造成：

- fallback chain 失效或難以維護。
- quick triage 成本可能暴增。
- prompt / JSON parser / usage log 無法按任務選模型。
- 後續要切回 Claude/Gemini/OpenAI 會痛。

### 4.2 新增 provider/model 設定層

建議新增可配置欄位：

環境變數：

```env
LLM_PROVIDER=openrouter
LLM_PRIMARY_MODEL=anthropic/claude-3.5-sonnet
LLM_FALLBACK_MODELS=openai/gpt-4,google/gemini-2.0-flash-001
LLM_TRIAGE_MODEL=google/gemini-2.0-flash-lite-001
LLM_CODEX_MODEL=openai/codex-mini-latest   # 僅實驗，不作預設
OPENAI_API_KEY=...
OPENROUTER_API_KEY=...
```

SystemSetting：

```text
llm_provider
llm_primary_model
llm_fallback_models
llm_triage_model
llm_reply_model
llm_full_analysis_model
llm_experimental_codex_enabled
```

讀取優先序：

```text
SystemSetting > env > code default
```

### 4.3 Provider adapter 化

建議新增：

```text
backend/app/services/llm_providers/base.py
backend/app/services/llm_providers/openrouter_provider.py
backend/app/services/llm_providers/openai_provider.py
```

介面：

```python
class LLMProvider(Protocol):
    def chat_completion(
        self,
        messages: list[dict],
        model: str,
        temperature: float,
        max_tokens: int,
        response_format: dict | None = None,
    ) -> tuple[dict, dict]:
        ...
```

`LLMService` 保留業務方法，只把 `_make_request()` 委派給 provider。

---

## 5. Codex 若要接，應放在哪裡

### 不建議放

- 不建議接 `quick_triage()`：每則訊息都跑，成本/延遲敏感，Codex 不適合。
- 不建議接 `generate_reply_suggestions()`：客服話術需要自然語言與品牌語氣，不是 coding model 主場。
- 不建議接 OCR：無 vision 能力或不適合。

### 可評估放

1. `full_analysis()` 的實驗 fallback
   - 只在 primary/fallback 失敗時用。
   - 或只對特定測試樣本開 feature flag。

2. 離線 eval worker
   - 對歷史 conversation 產生 Codex 分析結果。
   - 不寫入正式 `analyses`，寫入 `analysis_eval_runs` 或 JSON 檔。
   - 與現有模型比較。

3. Prompt/code 改善 agent
   - Codex CLI 定期分析 LLM 失敗 log，提出 prompt/schema/test 修改建議。
   - 這是 Codex 的正確用途。

---

## 6. 具體實作方案

### Phase 1 — 模型設定可配置化

修改：`backend/app/services/llm_service.py`

將常數改為：

```python
MODEL_PRIMARY = os.environ.get("LLM_PRIMARY_MODEL", "anthropic/claude-3.5-sonnet")
MODEL_FALLBACK = os.environ.get("LLM_FALLBACK_MODEL", "openai/gpt-4")
TRIAGE_MODEL = os.environ.get("LLM_TRIAGE_MODEL", "google/gemini-2.0-flash-lite-001")

def _get_model_chain():
    raw = os.environ.get("LLM_MODEL_CHAIN")
    if raw:
        return [x.strip() for x in raw.split(",") if x.strip()]
    return [MODEL_PRIMARY, MODEL_FALLBACK, "google/gemini-2.0-flash-001"]
```

並在 `__init__` 中讀 SystemSetting 覆蓋。

驗收：

- 設 `LLM_PRIMARY_MODEL=xxx` 後 `full_analysis()` 使用新模型。
- `LlmUsageLog.model` 正確記錄新模型。
- fallback event 仍可記錄。

### Phase 2 — 新增 OpenAI provider adapter

若不想完全依賴 OpenRouter，可以新增 official OpenAI path。

新增：

```text
backend/app/services/llm_providers/openai_provider.py
```

使用 OpenAI-compatible chat completions 或 Responses API。

注意：

- 若使用 Responses API，需要包裝成目前 `LLMService` 期待的 `content + usage` 格式。
- JSON schema 最好使用 strict structured output，而不是只靠 prompt 要 JSON。

驗收：

- `LLM_PROVIDER=openai` 時能跑 `quick_triage/full_analysis`。
- `LLM_PROVIDER=openrouter` 時原功能不變。

### Phase 3 — Codex experimental model flag

新增：

```env
LLM_CODEX_ENABLED=false
LLM_CODEX_MODEL=<實際可用 model id>
```

接入方式：

```python
if task_type == "full_analysis" and SystemSetting.get_bool("llm_codex_experiment_enabled", False):
    model = SystemSetting.get("llm_codex_model")
```

不要直接進 production 寫正式分析結果。先寫 eval artifact：

```text
qa-output-17/codex-analysis-eval/*.json
```

或新增 DB：

```text
analysis_eval_runs
analysis_eval_results
```

### Phase 4 — Golden dataset / A/B 評測

新增測試資料：

```text
backend/tests/fixtures/semantic_analysis_cases.json
```

每筆包含：

```json
{
  "id": "case-001",
  "messages": [
    {"sender": "customer", "content": "請問岩板檯面一米多少？"}
  ],
  "expected": {
    "intent": "pricing",
    "urgency": "medium",
    "mentioned_products_contains": ["岩板", "檯面"]
  }
}
```

評測指標：

- JSON parse success rate。
- intent accuracy。
- entity recall。
- suggested action usefulness。
- hallucination rate。
- latency p50/p95。
- cost per 100 conversations。

只有 Codex 在這些指標上勝出，才考慮提升到 fallback 或 primary。

---

## 7. 需要修改的檔案清單

### 必改

```text
backend/app/services/llm_service.py
backend/app/models/llm_usage_log.py
backend/app/models/system_setting.py
backend/app/tasks/analysis_tasks.py
backend/tests/test_llm_service.py
backend/tests/test_analysis_tasks.py
```

### 建議新增

```text
backend/app/services/llm_providers/__init__.py
backend/app/services/llm_providers/base.py
backend/app/services/llm_providers/openrouter_provider.py
backend/app/services/llm_providers/openai_provider.py
backend/app/services/llm_model_config.py
backend/tests/fixtures/semantic_analysis_cases.json
backend/tests/test_semantic_analysis_eval.py
```

### 若做 eval DB

```text
backend/app/models/analysis_eval.py
backend/migrations/versions/<rev>_add_analysis_eval_tables.py
```

---

## 8. 成本與記錄要補

`backend/app/models/llm_usage_log.py` 的 `MODEL_PRICING` 要新增實際使用模型價格。

現況未知模型會 fallback 到 Claude 3.5 Sonnet 價格：

```python
if not pricing:
    pricing = MODEL_PRICING['anthropic/claude-3.5-sonnet']
```

這對 Codex / OpenAI 新模型會造成成本估算失真。

建議改成：

1. 未知模型價格設為 0 並標記 `pricing_unknown=True`，或
2. `MODEL_PRICING` 從 SystemSetting / JSON config 載入，或
3. 在 usage log 增加 `provider`、`pricing_source`、`estimated_cost_confidence`。

---

## 9. 安全與資料治理

Codex/OpenAI 接入前要確認：

1. 客戶對話是否可傳至 OpenAI / OpenRouter。
2. 是否需要遮罩 phone/email/address。
3. prompt injection 防護目前只 escape `{}`，不足以處理完整對話注入。
4. 回覆建議要避免模型承諾價格/交期。
5. 所有 LLM output 寫 DB 前必須 schema validate。
6. full_analysis 自動建 Action 前需 validation，避免模型產生不合法 action type。

建議新增：

```text
backend/app/services/llm_output_schema.py
backend/app/services/pii_redaction.py
```

---

## 10. 不建議的做法

不要：

1. 在 request path 裡 shell out 呼叫 `codex exec`。
2. 把 `MODEL_PRIMARY` 直接改成 Codex model id 後上 production。
3. 讓 Codex 取代所有 quick triage。
4. 不做 eval 就宣稱 Codex 比現有模型好。
5. 忽略 `LlmUsageLog.MODEL_PRICING`。
6. 只改 backend，不更新前端顯示 `model_used` 與錯誤狀態。

---

## 11. 推薦落地路線

```text
Phase 1：LLM model/provider config 化
Phase 2：新增 OpenAI provider adapter
Phase 3：Codex 作 experimental full_analysis model，不寫正式結果
Phase 4：建立 golden dataset + eval runner
Phase 5：若 Codex 指標勝出，放入 fallback chain
Phase 6：若 production 穩定，再按任務類型精細分流
```

任務分流建議：

| 任務 | 推薦模型類型 | Codex 建議 |
|---|---|---|
| quick_triage | 低成本通用模型 | 不建議 |
| full_analysis | 高品質通用模型 | 可實驗 |
| reply_suggestions | 通用客服對話模型 | 不建議作主模型 |
| risk_detection | 穩定 JSON/分類模型 | 可實驗但需 eval |
| OCR | vision model | 不適合 |
| prompt/test/code 改善 | coding agent | 適合 |

---

## 12. 最終判斷

Codex 可以「接入」BBCRM 的 AI 語意分析架構，但不應直接作為 production 主引擎。正確方式是先把 `LLMService` 改成 provider/model 可配置，然後把 Codex 放進實驗與評測路徑，用 golden dataset 驗證品質、成本、延遲與 JSON 穩定性。

如果需求只是「想用 OpenAI 模型提升語意分析」，應接 OpenAI provider + 通用推理/對話模型；如果需求真的是「用 Codex」，它最適合做離線 prompt/test/code 改善，而不是線上客服語意分析。
