"""
MUSE CRM — Auto Tagger Service

根據 LLM 分析結果自動為 Contact 加標籤。

規則引擎：
1. 根據 LLM suggested_tags 直接打標
2. 根據對話內容中的關鍵字匹配系統標籤
3. 根據意圖辨識結果打標（如 pricing → 詢價）
4. 不重複打標（同一個 contact + tag 組合只建一次）
"""

import logging
from typing import Dict, Any, List, Optional, Set

from .. import db
from ..models import Tag, ContactTag, Contact

logger = logging.getLogger(__name__)


# ============================================================
# 關鍵字 → 標籤 對應規則
# ============================================================

KEYWORD_TAG_RULES: List[Dict[str, Any]] = [
    # === 身份類（identity）===
    {
        "keywords": ["設計師", "設計", "室內設計", "interior design"],
        "tag_name": "設計師",
        "category": "identity",
    },
    {
        "keywords": ["屋主", "自己的房子", "家裡裝修", "自住"],
        "tag_name": "屋主",
        "category": "identity",
    },
    {
        "keywords": ["建材行", "材料行", "經銷", "代理"],
        "tag_name": "建材行",
        "category": "identity",
    },
    {
        "keywords": ["工班", "師傅", "施工", "安裝"],
        "tag_name": "工班",
        "category": "identity",
    },
    {
        "keywords": ["建商", "建設公司", "開發商"],
        "tag_name": "建商",
        "category": "identity",
    },
    # === 產品興趣類（interest）===
    {
        "keywords": ["電視牆", "TV牆", "電視背牆"],
        "tag_name": "電視牆",
        "category": "interest",
    },
    {
        "keywords": ["一體盆", "洗手台", "面盆", "浴室盆"],
        "tag_name": "一體盆",
        "category": "interest",
    },
    {
        "keywords": ["檯面", "廚房檯面", "吧台", "中島"],
        "tag_name": "檯面",
        "category": "interest",
    },
    {
        "keywords": ["熱彎", "弧形", "曲面"],
        "tag_name": "熱彎",
        "category": "interest",
    },
    {
        "keywords": ["岩板", "sintered stone", "大板"],
        "tag_name": "岩板",
        "category": "interest",
    },
    {
        "keywords": ["石英石", "quartz"],
        "tag_name": "石英石",
        "category": "interest",
    },
    # === 狀態類（status）===
    {
        "keywords": ["投訴", "抱怨", "品質問題", "瑕疵", "裂縫"],
        "tag_name": "投訴者",
        "category": "status",
    },
]

# 意圖 → 標籤 映射
INTENT_TAG_MAP: Dict[str, str] = {
    "pricing": "詢價",
    "visit": "預約參觀",
    "complaint": "投訴者",
    "order": "下單中",
}


class AutoTagger:
    """自動打標服務"""

    @staticmethod
    def tag_from_analysis(
        contact_id,
        analysis_result: Dict[str, Any],
        conversation_text: Optional[str] = None,
    ) -> List[str]:
        """
        根據 LLM 分析結果自動打標。

        Args:
            contact_id: Contact UUID
            analysis_result: LLM 分析結果字典
            conversation_text: 對話全文（可選，用於關鍵字匹配）

        Returns:
            實際新增的標籤名稱列表
        """
        tags_to_add: Set[str] = set()

        # 1. LLM 直接建議的標籤
        suggested = analysis_result.get("suggested_tags", [])
        if suggested:
            tags_to_add.update(suggested)

        # 2. 從 entities.products_interested 加標籤
        entities = analysis_result.get("entities", {})
        products = entities.get("products_interested", [])
        if products:
            tags_to_add.update(products)

        # 3. 從 intent 加標籤
        intent_data = analysis_result.get("intent", {})
        if isinstance(intent_data, dict):
            intent = intent_data.get("primary", "")
        else:
            intent = str(intent_data) if intent_data else ""
        
        if intent in INTENT_TAG_MAP:
            tags_to_add.add(INTENT_TAG_MAP[intent])

        # 4. 從 customer_stage 加標籤
        summary = analysis_result.get("summary", {})
        if isinstance(summary, dict):
            stage = summary.get("customer_stage", "")
            stage_tag_map = {
                "new_lead": "潛在客戶",
                "ready_to_buy": "VIP",
                "existing_customer": "復購客戶",
            }
            if stage in stage_tag_map:
                tags_to_add.add(stage_tag_map[stage])

        # 5. 關鍵字匹配（如果有提供對話全文）
        if conversation_text:
            keyword_tags = AutoTagger._match_keywords(conversation_text)
            tags_to_add.update(keyword_tags)

        # 執行打標
        if not tags_to_add:
            logger.debug(f"Contact {contact_id}: 無需打標")
            return []

        added = AutoTagger._apply_tags(contact_id, tags_to_add)
        if added:
            logger.info(
                f"Contact {contact_id}: 自動打標完成，"
                f"新增 {len(added)} 個標籤: {added}"
            )
        return added

    @staticmethod
    def _match_keywords(text: str) -> Set[str]:
        """
        根據關鍵字規則匹配標籤。

        Args:
            text: 對話全文

        Returns:
            匹配到的標籤名稱集合
        """
        matched: Set[str] = set()
        text_lower = text.lower()

        for rule in KEYWORD_TAG_RULES:
            for keyword in rule["keywords"]:
                if keyword.lower() in text_lower:
                    matched.add(rule["tag_name"])
                    break  # 同一 rule 只需匹配一個 keyword

        return matched

    @staticmethod
    def _apply_tags(contact_id, tag_names: Set[str]) -> List[str]:
        """
        實際執行打標操作（含去重）。

        Args:
            contact_id: Contact UUID
            tag_names: 要打的標籤名稱集合

        Returns:
            實際新增的標籤名稱列表
        """
        added: List[str] = []

        for tag_name in tag_names:
            try:
                # 取得或建立標籤
                tag = Tag.query.filter_by(name=tag_name).first()
                if not tag:
                    # 自動建立新標籤
                    tag = Tag(
                        name=tag_name,
                        category=AutoTagger._guess_category(tag_name),
                        is_system=False,
                    )
                    db.session.add(tag)
                    db.session.flush()
                    logger.info(f"自動建立新標籤: {tag_name}")

                # 檢查是否已存在（去重）
                existing = ContactTag.query.filter_by(
                    contact_id=contact_id,
                    tag_id=tag.id,
                ).first()

                if not existing:
                    contact_tag = ContactTag(
                        contact_id=contact_id,
                        tag_id=tag.id,
                        source="llm",
                    )
                    db.session.add(contact_tag)
                    added.append(tag_name)

            except Exception as e:
                logger.error(f"打標失敗 (tag={tag_name}): {e}")
                continue

        # 不在這裡 commit，讓呼叫者控制事務
        return added

    @staticmethod
    def _guess_category(tag_name: str) -> Optional[str]:
        """
        根據標籤名稱猜測分類。

        Args:
            tag_name: 標籤名稱

        Returns:
            猜測的分類或 None
        """
        # 先從已知規則中查找
        for rule in KEYWORD_TAG_RULES:
            if rule["tag_name"] == tag_name:
                return rule["category"]

        # 從意圖標籤中查找
        if tag_name in INTENT_TAG_MAP.values():
            return "status"

        # 預設歸入 auto
        return "auto"

    @staticmethod
    def get_contact_tags(contact_id) -> List[Dict[str, Any]]:
        """
        取得 Contact 的所有標籤。

        Args:
            contact_id: Contact UUID

        Returns:
            標籤列表
        """
        contact_tags = ContactTag.query.filter_by(contact_id=contact_id).all()
        result = []
        for ct in contact_tags:
            tag = ct.tag
            result.append({
                "tag_id": str(tag.id),
                "name": tag.name,
                "category": tag.category,
                "source": ct.source,
                "created_at": ct.created_at.isoformat() if ct.created_at else None,
            })
        return result
