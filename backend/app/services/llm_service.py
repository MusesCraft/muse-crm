"""
MUSE CRM — LLM Service (OpenRouter API)

透過 OpenRouter API 呼叫 LLM 進行分析。
支援 Claude 3.5 Sonnet 作為主要模型，GPT-4 作為 fallback。

功能：
1. chat_completion() — 通用聊天補全
2. analyze_intent() — 意圖辨識
3. extract_entities() — 實體萃取
4. summarize_conversation() — 對話摘要
5. suggest_actions() — 建議動作
6. full_analysis() — 綜合分析（一次呼叫）
"""

import json
import logging
import os
import time
from typing import Any, Dict, List, Optional, Tuple

import requests

from .prompts import (
    build_intent_prompt,
    build_entity_extraction_prompt,
    build_summary_prompt,
    build_action_prompt,
    build_full_analysis_prompt,
    build_quick_triage_prompt,
    format_conversation_for_prompt,
)

logger = logging.getLogger(__name__)

# ============================================================
# 常數
# ============================================================

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

# 模型優先順序：主要 → fallback
MODEL_PRIMARY = "anthropic/claude-3.5-sonnet"
MODEL_FALLBACK = "openai/gpt-4"

# 輕量分類模型（per-message triage，成本 <0.001 USD/message）
TRIAGE_MODEL = "google/gemini-2.0-flash-lite-001"

# 請求設定
DEFAULT_TIMEOUT = 30  # 秒
MAX_RETRIES = 3
INITIAL_BACKOFF = 2  # 秒（指數退避基數）

# Token 限制
MAX_TOKENS_RESPONSE = 2048


class LLMServiceError(Exception):
    """LLM 服務通用錯誤"""
    pass


class LLMTimeoutError(LLMServiceError):
    """LLM 請求超時"""
    pass


class LLMRateLimitError(LLMServiceError):
    """LLM API 被限速"""
    pass


class LLMResponseParseError(LLMServiceError):
    """LLM 回應解析失敗"""
    pass


class LLMService:
    """
    OpenRouter LLM 服務。
    
    使用方式：
        service = LLMService()
        result = service.analyze_intent("你好，我想問一下價格")
    """
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        primary_model: str = MODEL_PRIMARY,
        fallback_model: str = MODEL_FALLBACK,
        timeout: int = DEFAULT_TIMEOUT,
        max_retries: int = MAX_RETRIES,
    ):
        self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY")
        if not self.api_key:
            logger.warning("OPENROUTER_API_KEY 未設定，LLM 服務將無法使用")
        
        self.primary_model = primary_model
        self.fallback_model = fallback_model
        self.timeout = timeout
        self.max_retries = max_retries
        
        self._session = requests.Session()
        self._session.headers.update({
            "Content-Type": "application/json",
            "HTTP-Referer": "https://muse-crm.local",
            "X-Title": "MUSE CRM",
        })
    
    # ----------------------------------------------------------
    # 核心請求方法
    # ----------------------------------------------------------
    
    def chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.1,
        max_tokens: int = MAX_TOKENS_RESPONSE,
        response_format: Optional[Dict] = None,
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        呼叫 OpenRouter chat completion API。
        
        自帶 retry 機制（指數退避）和 fallback 模型。
        
        Args:
            messages: OpenAI-compatible messages 列表
            model: 指定模型（預設使用 primary_model）
            temperature: 溫度參數
            max_tokens: 最大回應 token 數
            response_format: 回應格式（如 {"type": "json_object"}）
            
        Returns:
            Tuple[回應內容字典, 使用資訊字典]
            
        Raises:
            LLMServiceError: API 呼叫失敗
        """
        if not self.api_key:
            raise LLMServiceError("OPENROUTER_API_KEY 未設定")
        
        models_to_try = [model or self.primary_model, self.fallback_model]
        last_error = None
        
        for current_model in models_to_try:
            try:
                result, usage = self._call_with_retry(
                    messages=messages,
                    model=current_model,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    response_format=response_format,
                )
                return result, usage
            except LLMRateLimitError as e:
                logger.warning(f"模型 {current_model} 被限速，嘗試 fallback: {e}")
                last_error = e
                continue
            except LLMTimeoutError as e:
                logger.warning(f"模型 {current_model} 超時，嘗試 fallback: {e}")
                last_error = e
                continue
            except LLMServiceError as e:
                logger.warning(f"模型 {current_model} 呼叫失敗，嘗試 fallback: {e}")
                last_error = e
                continue
        
        raise LLMServiceError(f"所有模型都失敗: {last_error}")
    
    def _call_with_retry(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: int,
        response_format: Optional[Dict],
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        帶有 retry 機制的 API 呼叫。
        
        Returns:
            Tuple[回應內容字典, 使用資訊字典]
        """
        last_error = None
        
        for attempt in range(self.max_retries):
            try:
                return self._make_request(
                    messages=messages,
                    model=model,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    response_format=response_format,
                )
            except LLMRateLimitError:
                # Rate limit 不重試，直接拋出讓外層 fallback
                raise
            except LLMTimeoutError as e:
                last_error = e
                backoff = INITIAL_BACKOFF * (2 ** attempt)
                logger.warning(
                    f"LLM 請求超時 (嘗試 {attempt + 1}/{self.max_retries})，"
                    f"{backoff}s 後重試"
                )
                time.sleep(backoff)
            except LLMServiceError as e:
                last_error = e
                backoff = INITIAL_BACKOFF * (2 ** attempt)
                logger.warning(
                    f"LLM 請求失敗 (嘗試 {attempt + 1}/{self.max_retries}): {e}，"
                    f"{backoff}s 後重試"
                )
                time.sleep(backoff)
        
        raise last_error or LLMServiceError("請求失敗，已用完所有重試次數")
    
    def _make_request(
        self,
        messages: List[Dict[str, str]],
        model: str,
        temperature: float,
        max_tokens: int,
        response_format: Optional[Dict],
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        執行單次 API 請求。
        
        Returns:
            Tuple[回應內容字典, 使用資訊字典]
        """
        payload: Dict[str, Any] = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        
        if response_format:
            payload["response_format"] = response_format
        
        start_time = time.time()
        
        try:
            response = self._session.post(
                OPENROUTER_API_URL,
                json=payload,
                headers={"Authorization": f"Bearer {self.api_key}"},
                timeout=self.timeout,
            )
        except requests.Timeout:
            raise LLMTimeoutError(f"請求超時 ({self.timeout}s)")
        except requests.ConnectionError as e:
            raise LLMServiceError(f"連線失敗: {e}")
        except requests.RequestException as e:
            raise LLMServiceError(f"請求失敗: {e}")
        
        elapsed_ms = int((time.time() - start_time) * 1000)
        
        # 處理 HTTP 狀態碼
        if response.status_code == 429:
            raise LLMRateLimitError("API 被限速 (429)")
        
        if response.status_code >= 500:
            raise LLMServiceError(
                f"OpenRouter 伺服器錯誤 ({response.status_code}): "
                f"{response.text[:200]}"
            )
        
        if response.status_code != 200:
            raise LLMServiceError(
                f"API 回應錯誤 ({response.status_code}): "
                f"{response.text[:200]}"
            )
        
        # 解析回應
        try:
            data = response.json()
        except (json.JSONDecodeError, ValueError) as e:
            raise LLMResponseParseError(f"回應 JSON 解析失敗: {e}")
        
        # 提取內容
        choices = data.get("choices", [])
        if not choices:
            raise LLMResponseParseError("API 回應中沒有 choices")
        
        content = choices[0].get("message", {}).get("content", "")
        if not content:
            raise LLMResponseParseError("API 回應中沒有內容")
        
        # 使用資訊
        usage_data = data.get("usage", {})
        usage_info = {
            "model_used": data.get("model", model),
            "tokens_used": (
                usage_data.get("total_tokens")
                or (usage_data.get("prompt_tokens", 0) + usage_data.get("completion_tokens", 0))
            ),
            "prompt_tokens": usage_data.get("prompt_tokens", 0),
            "completion_tokens": usage_data.get("completion_tokens", 0),
            "processing_time_ms": elapsed_ms,
        }
        
        # 嘗試解析 JSON 回應
        parsed_content = self._parse_json_response(content)
        
        return parsed_content, usage_info
    
    @staticmethod
    def _parse_json_response(content: str) -> Dict[str, Any]:
        """
        解析 LLM 回應中的 JSON。
        
        支援純 JSON 和 markdown code block 包裝的 JSON。
        
        Args:
            content: LLM 回應的原始文字
            
        Returns:
            解析後的字典
            
        Raises:
            LLMResponseParseError: JSON 解析失敗
        """
        text = content.strip()
        
        # 嘗試直接解析
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass
        
        # 嘗試從 markdown code block 中提取
        if "```" in text:
            # 找到第一個 ``` 和最後一個 ```
            start = text.find("```")
            end = text.rfind("```")
            if start != end:
                # 移除 ```json 或 ``` 標記
                code_block = text[start:end + 3]
                # 去掉開頭的 ```json 或 ```
                first_newline = code_block.find("\n")
                if first_newline != -1:
                    json_str = code_block[first_newline + 1:-3].strip()
                    try:
                        return json.loads(json_str)
                    except json.JSONDecodeError:
                        pass
        
        # 嘗試找到 JSON 物件的範圍
        brace_start = text.find("{")
        brace_end = text.rfind("}")
        if brace_start != -1 and brace_end != -1 and brace_end > brace_start:
            try:
                return json.loads(text[brace_start:brace_end + 1])
            except json.JSONDecodeError:
                pass
        
        raise LLMResponseParseError(
            f"無法從 LLM 回應中解析 JSON: {text[:200]}..."
        )
    
    # ----------------------------------------------------------
    # 高階分析方法
    # ----------------------------------------------------------
    
    def analyze_intent(self, message_content: str) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        分析單條訊息的意圖。
        
        Args:
            message_content: 訊息文字內容
            
        Returns:
            Tuple[意圖分析結果, 使用資訊]
        """
        messages = build_intent_prompt(message_content)
        return self.chat_completion(
            messages=messages,
            temperature=0.1,
            max_tokens=256,
        )
    
    def extract_entities(
        self, conversation_messages: List[Dict[str, Any]]
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        從對話中萃取實體。
        
        Args:
            conversation_messages: 訊息列表
            
        Returns:
            Tuple[實體萃取結果, 使用資訊]
        """
        conversation_text = format_conversation_for_prompt(conversation_messages)
        messages = build_entity_extraction_prompt(conversation_text)
        return self.chat_completion(
            messages=messages,
            temperature=0.1,
            max_tokens=512,
        )
    
    def summarize_conversation(
        self, conversation_messages: List[Dict[str, Any]]
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        生成對話摘要。
        
        Args:
            conversation_messages: 訊息列表
            
        Returns:
            Tuple[摘要結果, 使用資訊]
        """
        conversation_text = format_conversation_for_prompt(conversation_messages)
        messages = build_summary_prompt(conversation_text)
        return self.chat_completion(
            messages=messages,
            temperature=0.3,
            max_tokens=512,
        )
    
    def suggest_actions(
        self,
        conversation_messages: List[Dict[str, Any]],
        channel: str = "unknown",
        status: str = "active",
        message_count: int = 0,
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        建議下一步動作。
        
        Args:
            conversation_messages: 訊息列表
            channel: 對話渠道
            status: 對話狀態
            message_count: 訊息數量
            
        Returns:
            Tuple[動作建議結果, 使用資訊]
        """
        conversation_text = format_conversation_for_prompt(conversation_messages)
        messages = build_action_prompt(
            conversation_text=conversation_text,
            channel=channel,
            status=status,
            message_count=message_count,
        )
        return self.chat_completion(
            messages=messages,
            temperature=0.3,
            max_tokens=512,
        )
    
    def quick_triage(
        self, message_content: str
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        快速分類單條訊息（輕量模型，per-message 自動觸發）。
        
        只做意圖分類 + 客戶身分辨識，成本極低。
        使用輕量模型，timeout 10s，max_tokens 128。
        不走 fallback（失敗就算了，不嚴重）。
        
        Args:
            message_content: 訊息文字內容
            
        Returns:
            Tuple[分類結果 {"intent": ..., "identity": ...}, 使用資訊]
        """
        messages = build_quick_triage_prompt(message_content)
        
        # 直接呼叫 _call_with_retry，指定輕量模型，不走 fallback
        try:
            result, usage = self._call_with_retry(
                messages=messages,
                model=TRIAGE_MODEL,
                temperature=0.0,
                max_tokens=128,
                response_format=None,
            )
            return result, usage
        except LLMServiceError:
            # 輕量分析不走 fallback，直接拋出
            raise

    def full_analysis(
        self,
        conversation_messages: List[Dict[str, Any]],
        channel: str = "unknown",
        status: str = "active",
        message_count: int = 0,
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """
        綜合分析（一次呼叫完成所有分析）。
        
        這是最高效的分析方式，只呼叫一次 LLM 就完成所有分析。
        
        Args:
            conversation_messages: 訊息列表
            channel: 對話渠道
            status: 對話狀態
            message_count: 訊息數量
            
        Returns:
            Tuple[完整分析結果, 使用資訊]
        """
        conversation_text = format_conversation_for_prompt(conversation_messages)
        messages = build_full_analysis_prompt(
            conversation_text=conversation_text,
            channel=channel,
            status=status,
            message_count=message_count,
        )
        return self.chat_completion(
            messages=messages,
            temperature=0.2,
            max_tokens=MAX_TOKENS_RESPONSE,
        )


# ============================================================
# Module-level singleton（可選）
# ============================================================

_default_service: Optional[LLMService] = None


def get_llm_service() -> LLMService:
    """
    取得全域 LLMService 實例（lazy initialization）。
    
    Returns:
        LLMService 實例
    """
    global _default_service
    if _default_service is None:
        _default_service = LLMService()
    return _default_service
