"""
MUSE CRM — Action Service

根據 LLM 建議動作，自動在 actions 表建立待辦事項。

功能：
1. 根據分析結果自動建立 Action
2. 設定 priority 和 due_date
3. 去重機制：同一 contact + type 的 pending action 不重複建立
"""

import logging
from datetime import date, timedelta
from typing import Any, Dict, List, Optional

from .. import db
from ..models import Action

logger = logging.getLogger(__name__)

# ============================================================
# 動作類型配置
# ============================================================

ACTION_TYPE_CONFIG: Dict[str, Dict[str, Any]] = {
    "follow_up": {
        "default_priority": "medium",
        "default_due_days": 3,
        "description_template": "跟進客戶：{detail}",
    },
    "quote": {
        "default_priority": "high",
        "default_due_days": 2,
        "description_template": "提供報價：{detail}",
    },
    "visit": {
        "default_priority": "medium",
        "default_due_days": 5,
        "description_template": "安排參觀/拜訪：{detail}",
    },
    "call": {
        "default_priority": "high",
        "default_due_days": 1,
        "description_template": "致電客戶：{detail}",
    },
    "sample": {
        "default_priority": "medium",
        "default_due_days": 3,
        "description_template": "寄送樣品：{detail}",
    },
    "resolve_complaint": {
        "default_priority": "high",
        "default_due_days": 1,
        "description_template": "處理投訴：{detail}",
    },
    "escalate": {
        "default_priority": "high",
        "default_due_days": 1,
        "description_template": "升級處理：{detail}",
    },
}

# 不需要建立 Action 的類型
SKIP_TYPES = {"none", "greeting"}


class ActionService:
    """待辦動作服務"""

    @staticmethod
    def create_from_analysis(
        contact_id,
        conversation_id,
        analysis_result: Dict[str, Any],
    ) -> List[str]:
        """
        根據 LLM 分析結果自動建立 Action。

        Args:
            contact_id: Contact UUID
            conversation_id: Conversation UUID
            analysis_result: LLM 分析結果字典

        Returns:
            新建的 Action ID 列表（字串）
        """
        suggested_actions = analysis_result.get("suggested_actions", [])
        
        # 相容舊格式：如果是單一字串
        if isinstance(suggested_actions, str):
            suggested_actions = [{
                "type": "follow_up",
                "description": suggested_actions,
                "priority": "medium",
                "due_days": 3,
            }]

        if not suggested_actions:
            logger.debug(f"Contact {contact_id}: 無建議動作")
            return []

        created_ids: List[str] = []

        for action_data in suggested_actions:
            try:
                action_type = action_data.get("type", "follow_up")

                # 跳過不需要建立的類型
                if action_type in SKIP_TYPES:
                    continue

                action_id = ActionService._create_single_action(
                    contact_id=contact_id,
                    conversation_id=conversation_id,
                    action_type=action_type,
                    description=action_data.get("description", ""),
                    priority=action_data.get("priority"),
                    due_days=action_data.get("due_days"),
                )

                if action_id:
                    created_ids.append(action_id)

            except Exception as e:
                logger.error(
                    f"建立 Action 失敗 (contact={contact_id}, "
                    f"type={action_data.get('type')}): {e}"
                )
                continue

        if created_ids:
            logger.info(
                f"Contact {contact_id}: 建立 {len(created_ids)} 個 Action"
            )

        return created_ids

    @staticmethod
    def _create_single_action(
        contact_id,
        conversation_id,
        action_type: str,
        description: str,
        priority: Optional[str] = None,
        due_days: Optional[int] = None,
    ) -> Optional[str]:
        """
        建立單個 Action（含去重邏輯）。

        Args:
            contact_id: Contact UUID
            conversation_id: Conversation UUID
            action_type: 動作類型
            description: 動作描述
            priority: 優先級（覆蓋預設值）
            due_days: 到期天數（覆蓋預設值）

        Returns:
            新建的 Action ID 或 None（已存在時）
        """
        # 去重：同一個 contact + 相似類型，如果已有 pending 的就不重複建立
        existing = Action.query.filter(
            Action.contact_id == contact_id,
            Action.status.in_(["pending", "assigned"]),
            Action.description.ilike(f"%{action_type}%"),
        ).first()

        # 更精確的去重：檢查是否有描述相似的 pending action
        if not existing and description:
            # 取描述前 20 個字做模糊匹配
            desc_prefix = description[:20] if len(description) > 20 else description
            existing = Action.query.filter(
                Action.contact_id == contact_id,
                Action.status.in_(["pending", "assigned"]),
                Action.description.ilike(f"%{desc_prefix}%"),
            ).first()

        if existing:
            logger.debug(
                f"Action 已存在，跳過 (contact={contact_id}, type={action_type})"
            )
            return None

        # 取得配置
        config = ACTION_TYPE_CONFIG.get(action_type, {})

        # 決定 priority
        effective_priority = priority or config.get("default_priority", "medium")
        # 確保 priority 是合法值
        if effective_priority not in ("high", "medium", "low"):
            effective_priority = "medium"

        # 決定 due_date
        effective_due_days = due_days or config.get("default_due_days", 3)
        if not isinstance(effective_due_days, int) or effective_due_days < 0:
            effective_due_days = 3
        due_date = date.today() + timedelta(days=effective_due_days)

        # 決定 description
        if not description:
            template = config.get("description_template", "待辦：{detail}")
            description = template.format(detail=action_type)

        # 建立 Action
        action = Action(
            contact_id=contact_id,
            conversation_id=conversation_id,
            description=description,
            source="llm",
            status="pending",
            priority=effective_priority,
            due_date=due_date,
        )

        db.session.add(action)
        db.session.flush()  # 取得 ID

        logger.info(
            f"Action 已建立: {action.id} "
            f"(type={action_type}, priority={effective_priority}, "
            f"due={due_date})"
        )

        return str(action.id)

    @staticmethod
    def create_manual_action(
        contact_id,
        description: str,
        priority: str = "medium",
        due_days: int = 3,
        conversation_id=None,
        assigned_to: Optional[str] = None,
    ) -> Optional[str]:
        """
        手動建立 Action。

        Args:
            contact_id: Contact UUID
            description: 動作描述
            priority: 優先級
            due_days: 到期天數
            conversation_id: 相關對話 UUID（可選）
            assigned_to: 指派給誰（可選）

        Returns:
            新建的 Action ID
        """
        if priority not in ("high", "medium", "low"):
            priority = "medium"

        due_date = date.today() + timedelta(days=due_days)

        action = Action(
            contact_id=contact_id,
            conversation_id=conversation_id,
            description=description,
            source="manual",
            status="pending",
            priority=priority,
            due_date=due_date,
            assigned_to=assigned_to,
        )

        db.session.add(action)
        db.session.flush()

        logger.info(f"手動 Action 已建立: {action.id}")
        return str(action.id)

    @staticmethod
    def get_pending_actions(contact_id=None, limit: int = 50) -> List[Dict[str, Any]]:
        """
        取得待處理的 Action 列表。

        Args:
            contact_id: 篩選特定 Contact（可選）
            limit: 最大回傳數量

        Returns:
            Action 字典列表
        """
        query = Action.query.filter(
            Action.status.in_(["pending", "assigned"])
        ).order_by(
            # high > medium > low
            db.case(
                (Action.priority == "high", 1),
                (Action.priority == "medium", 2),
                (Action.priority == "low", 3),
                else_=4,
            ),
            Action.due_date.asc().nullslast(),
        )

        if contact_id:
            query = query.filter(Action.contact_id == contact_id)

        actions = query.limit(limit).all()
        return [a.to_dict() for a in actions]
