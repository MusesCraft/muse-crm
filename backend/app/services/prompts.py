"""
MUSE CRM — LLM Prompt Templates

所有 LLM 分析所需的 Prompt 模板。
每個 Prompt 強制要求 JSON 輸出格式。

Prompt 類別：
1. 意圖辨識 (Intent Classification)
2. 實體萃取 (Entity Extraction)
3. 對話摘要 (Conversation Summary)
4. 建議動作 (Suggested Actions)
"""

from typing import List, Dict, Any


# ============================================================
# 1. 意圖辨識 Prompt
# ============================================================

INTENT_CLASSIFICATION_SYSTEM = """你是一位專業的客戶服務分析師，專門服務建材/石材產業。
你的任務是分析客戶訊息的意圖（intent）。

可能的意圖分類：
- pricing: 詢問價格、報價、費用相關
- spec: 詢問產品規格、材質、尺寸、花色等技術細節
- visit: 要求/安排參觀展間、看樣品、拜訪
- complaint: 投訴、抱怨、品質問題、售後問題
- greeting: 打招呼、問好、初次接觸
- order: 下單、訂購、確認訂單
- followup: 追蹤進度、催貨、詢問狀態
- other: 無法歸類的其他意圖

你必須以 JSON 格式回覆，不得包含任何其他文字。"""

INTENT_CLASSIFICATION_USER = """分析以下客戶訊息的意圖：

---
{message_content}
---

請以以下 JSON 格式回覆：
{{
    "intent": "pricing|spec|visit|complaint|greeting|order|followup|other",
    "confidence": 0.0到1.0之間的浮點數,
    "reasoning": "簡短說明判斷理由（一句話）"
}}"""


# ============================================================
# 2. 實體萃取 Prompt
# ============================================================

ENTITY_EXTRACTION_SYSTEM = """你是一位專業的 NER（命名實體識別）分析師，專門服務建材/石材產業。
你的任務是從客戶對話中萃取關鍵實體資訊。

需要萃取的實體：
- customer_name: 客戶姓名（如 "王先生"、"陳設計師"）
- company: 公司/事務所名稱
- phone: 電話號碼
- email: Email 地址
- products_interested: 感興趣的產品列表（如 電視牆、一體盆、檯面、洗手台等）
- project_info: 專案資訊（如地點、用途、規模）
- budget_hint: 預算相關線索
- timeline: 時間需求（如 "下個月要用"）

你必須以 JSON 格式回覆，不得包含任何其他文字。
如果某個欄位無法從對話中萃取，請設為 null。"""

ENTITY_EXTRACTION_USER = """從以下對話中萃取關鍵實體：

---
{conversation_text}
---

請以以下 JSON 格式回覆：
{{
    "customer_name": "客戶姓名或null",
    "company": "公司名稱或null",
    "phone": "電話號碼或null",
    "email": "Email或null",
    "products_interested": ["產品1", "產品2"],
    "project_info": "專案描述或null",
    "budget_hint": "預算線索或null",
    "timeline": "時間需求或null"
}}"""


# ============================================================
# 3. 對話摘要 Prompt
# ============================================================

CONVERSATION_SUMMARY_SYSTEM = """你是一位專業的客服摘要撰寫員，專門服務建材/石材產業。
你的任務是為客服對話生成簡潔但完整的摘要。

摘要要求：
- 用繁體中文撰寫
- 控制在 100 字以內
- 包含：客戶需求、討論的產品、目前進展
- 語氣專業客觀

你必須以 JSON 格式回覆，不得包含任何其他文字。"""

CONVERSATION_SUMMARY_USER = """為以下對話生成摘要：

---
{conversation_text}
---

請以以下 JSON 格式回覆：
{{
    "summary": "對話摘要（100字以內）",
    "key_points": ["重點1", "重點2", "重點3"],
    "customer_sentiment": "positive|neutral|negative",
    "urgency": "high|medium|low"
}}"""


# ============================================================
# 4. 建議動作 Prompt
# ============================================================

SUGGESTED_ACTION_SYSTEM = """你是一位專業的銷售策略顧問，專門服務建材/石材產業。
你的任務是根據客服對話內容，建議下一步應該採取的行動。

可能的動作類型：
- follow_up: 主動聯絡客戶追蹤進度
- quote: 提供正式報價單
- visit: 安排客戶參觀展間或安排業務拜訪
- call: 打電話給客戶進一步了解需求
- sample: 寄送樣品
- resolve_complaint: 處理投訴/售後問題
- escalate: 升級給主管處理
- none: 暫時不需要動作

你必須以 JSON 格式回覆，不得包含任何其他文字。"""

SUGGESTED_ACTION_USER = """根據以下對話，建議下一步行動：

---
{conversation_text}
---

客戶基本資訊：
- 來源渠道：{channel}
- 對話狀態：{status}
- 訊息數量：{message_count}

請以以下 JSON 格式回覆：
{{
    "actions": [
        {{
            "type": "follow_up|quote|visit|call|sample|resolve_complaint|escalate|none",
            "priority": "high|medium|low",
            "description": "具體描述應該做什麼",
            "due_days": 建議幾天內完成（整數）
        }}
    ],
    "reasoning": "簡短說明建議理由"
}}"""


# ============================================================
# 5. 綜合分析 Prompt（單次呼叫完成所有分析）
# ============================================================

FULL_ANALYSIS_SYSTEM = """你是一位專業的客戶服務分析師，專門服務建材/石材產業（如石英石、人造石、岩板等）。
你的任務是對客服對話進行全面分析，萃取 6 個結構化欄位。

你必須以 JSON 格式回覆，不得包含任何其他文字。"""

FULL_ANALYSIS_USER = """對以下對話進行全面分析：

---
{conversation_text}
---

對話資訊：
- 來源渠道：{channel}
- 對話狀態：{status}
- 訊息數量：{message_count}

請萃取以下 6 個 MVP 欄位，以 JSON 格式回覆：
{{
    "customer_name": "從對話中辨識出的客戶真實姓名，如「王先生」「陳小姐」，無法辨識則為 null",
    "demand_summary": "客戶本次對話的核心需求概述，如「詢問 A 產品的報價與交期」",
    "mentioned_products": ["對話中提到的具體產品或服務項目列表"],
    "suggested_tags": ["基於語意判斷的客戶身份/類型標籤，如「潛在客戶」「設計師」「投訴者」"],
    "conversation_summary": "整段對話的精簡摘要（100字以內）",
    "suggested_next_action": "根據對話內容建議的跟進動作，如「週五前提供正式報價單」"
}}"""


# ============================================================
# Helper Functions
# ============================================================

# ============================================================
# 6. 快速分類 Prompt（輕量 per-message triage）
# ============================================================

QUICK_TRIAGE_SYSTEM = """你是建材/石材產業客服分類器。只輸出JSON，不要任何其他文字。"""

QUICK_TRIAGE_USER = """分類這則客戶訊息：
"{message_content}"

JSON格式回覆：
{{"intent":"pricing|spec|visit|complaint|greeting|order|followup|other","identity":"設計師|屋主|建材行|工班|unknown"}}"""


def build_quick_triage_prompt(message_content: str) -> List[Dict[str, str]]:
    """
    建構快速分類的 prompt messages（輕量模型用）。
    
    只做意圖分類 + 客戶身分辨識，要求極短 JSON 回覆。
    
    Args:
        message_content: 客戶訊息內容
        
    Returns:
        OpenAI-compatible messages 列表
    """
    return [
        {"role": "system", "content": QUICK_TRIAGE_SYSTEM},
        {"role": "user", "content": QUICK_TRIAGE_USER.format(
            message_content=message_content
        )}
    ]


def format_conversation_for_prompt(messages: List[Dict[str, Any]]) -> str:
    """
    將訊息列表格式化為 Prompt 可讀的對話文字。
    
    Args:
        messages: 訊息列表，每個訊息包含 sender, content, timestamp
        
    Returns:
        格式化後的對話文字
    """
    lines = []
    for msg in messages:
        sender = msg.get('sender', 'unknown')
        content = msg.get('content', '')
        timestamp = msg.get('timestamp', '')
        
        # 標記發送者角色
        role_label = {
            'customer': '客戶',
            'business': '客服',
            'system': '系統'
        }.get(sender, sender)
        
        lines.append(f"[{role_label}] {content}")
    
    return '\n'.join(lines)


def build_intent_prompt(message_content: str) -> List[Dict[str, str]]:
    """
    建構意圖辨識的完整 prompt messages。
    
    Args:
        message_content: 客戶訊息內容
        
    Returns:
        OpenAI-compatible messages 列表
    """
    return [
        {"role": "system", "content": INTENT_CLASSIFICATION_SYSTEM},
        {"role": "user", "content": INTENT_CLASSIFICATION_USER.format(
            message_content=message_content
        )}
    ]


def build_entity_extraction_prompt(conversation_text: str) -> List[Dict[str, str]]:
    """
    建構實體萃取的完整 prompt messages。
    
    Args:
        conversation_text: 格式化後的對話文字
        
    Returns:
        OpenAI-compatible messages 列表
    """
    return [
        {"role": "system", "content": ENTITY_EXTRACTION_SYSTEM},
        {"role": "user", "content": ENTITY_EXTRACTION_USER.format(
            conversation_text=conversation_text
        )}
    ]


def build_summary_prompt(conversation_text: str) -> List[Dict[str, str]]:
    """
    建構對話摘要的完整 prompt messages。
    
    Args:
        conversation_text: 格式化後的對話文字
        
    Returns:
        OpenAI-compatible messages 列表
    """
    return [
        {"role": "system", "content": CONVERSATION_SUMMARY_SYSTEM},
        {"role": "user", "content": CONVERSATION_SUMMARY_USER.format(
            conversation_text=conversation_text
        )}
    ]


def build_action_prompt(
    conversation_text: str,
    channel: str = 'unknown',
    status: str = 'active',
    message_count: int = 0
) -> List[Dict[str, str]]:
    """
    建構建議動作的完整 prompt messages。
    
    Args:
        conversation_text: 格式化後的對話文字
        channel: 對話渠道
        status: 對話狀態
        message_count: 訊息數量
        
    Returns:
        OpenAI-compatible messages 列表
    """
    return [
        {"role": "system", "content": SUGGESTED_ACTION_SYSTEM},
        {"role": "user", "content": SUGGESTED_ACTION_USER.format(
            conversation_text=conversation_text,
            channel=channel,
            status=status,
            message_count=message_count
        )}
    ]


def build_full_analysis_prompt(
    conversation_text: str,
    channel: str = 'unknown',
    status: str = 'active',
    message_count: int = 0
) -> List[Dict[str, str]]:
    """
    建構綜合分析的完整 prompt messages（一次呼叫完成所有分析）。
    
    Args:
        conversation_text: 格式化後的對話文字
        channel: 對話渠道
        status: 對話狀態
        message_count: 訊息數量
        
    Returns:
        OpenAI-compatible messages 列表
    """
    return [
        {"role": "system", "content": FULL_ANALYSIS_SYSTEM},
        {"role": "user", "content": FULL_ANALYSIS_USER.format(
            conversation_text=conversation_text,
            channel=channel,
            status=status,
            message_count=message_count
        )}
    ]
