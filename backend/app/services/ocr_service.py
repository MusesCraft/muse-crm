"""
MUSE CRM — 名片 OCR 辨識服務

透過 OpenRouter Vision LLM 辨識名片圖片，回傳結構化聯絡資訊。
使用 google/gemini-2.0-flash-001（支援 vision，成本低）。
"""

import json
import logging
import os
from typing import Any, Dict, Optional

import requests

logger = logging.getLogger(__name__)

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
OCR_MODEL = "google/gemini-2.0-flash-001"
OCR_TIMEOUT = 30


class BusinessCardOCR:
    """名片 OCR 辨識服務，透過 Vision LLM 解析名片圖片。"""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("OPENROUTER_API_KEY")
        if not self.api_key:
            logger.warning("OPENROUTER_API_KEY 未設定，OCR 服務將無法使用")

    def analyze_image(self, image_url: str) -> Optional[Dict[str, Any]]:
        """
        用 Vision LLM 辨識名片圖片，回傳結構化資料。

        Args:
            image_url: 名片圖片 URL（Meta attachment URL 等）

        Returns:
            辨識結果字典 {name, company, title, phone, email, address, line_id, confidence}
            或 None（辨識失敗）
        """
        if not self.api_key:
            logger.error("OPENROUTER_API_KEY 未設定，無法執行 OCR")
            return None

        prompt = (
            "請辨識這張名片上的資訊，以 JSON 格式回傳：\n"
            '{"name": "姓名", "company": "公司名稱", "title": "職稱", '
            '"phone": "電話號碼", "email": "電子郵件", "address": "地址", '
            '"line_id": "LINE ID", "other_info": "其他資訊"}\n\n'
            "規則：\n"
            "- 如果欄位無法辨識，填空字串\n"
            "- phone 請包含國碼（如有）\n"
            "- 如果圖片不是名片，回傳所有欄位為空字串\n"
            "- 只回傳 JSON，不要有其他文字"
        )

        payload = {
            "model": OCR_MODEL,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": image_url}},
                    ],
                }
            ],
            "temperature": 0.1,
            "max_tokens": 1024,
        }

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://muse-crm.local",
            "X-Title": "MUSE CRM",
        }

        try:
            resp = requests.post(
                OPENROUTER_API_URL,
                json=payload,
                headers=headers,
                timeout=OCR_TIMEOUT,
            )

            if resp.status_code != 200:
                logger.error(f"OCR API 回應錯誤：{resp.status_code} {resp.text[:200]}")
                return None

            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            result = self._parse_json(content)

            if result is None:
                return None

            # 計算 confidence
            filled = sum(
                1 for k in ("name", "company", "title", "phone", "email")
                if result.get(k)
            )
            result["confidence"] = round(filled / 5, 2)

            logger.info(
                f"📇 名片辨識完成：name={result.get('name')}, "
                f"company={result.get('company')}, confidence={result['confidence']}"
            )
            return result

        except requests.Timeout:
            logger.error("OCR API 請求超時")
            return None
        except Exception as e:
            logger.error(f"OCR 辨識失敗：{e}", exc_info=True)
            return None

    @staticmethod
    def _parse_json(content: str) -> Optional[Dict[str, Any]]:
        """解析 LLM 回應中的 JSON。"""
        text = content.strip()

        # 直接解析
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            pass

        # 從 markdown code block 中提取
        if "```" in text:
            start = text.find("```")
            end = text.rfind("```")
            if start != end:
                code = text[start + 3:end]
                # 移除語言標識（如 json）
                if code.startswith("json"):
                    code = code[4:]
                code = code.strip()
                try:
                    return json.loads(code)
                except json.JSONDecodeError:
                    pass

        # 嘗試找 JSON 物件邊界
        brace_start = text.find("{")
        brace_end = text.rfind("}")
        if brace_start != -1 and brace_end > brace_start:
            try:
                return json.loads(text[brace_start:brace_end + 1])
            except json.JSONDecodeError:
                pass

        logger.warning(f"OCR JSON 解析失敗：{text[:200]}")
        return None
