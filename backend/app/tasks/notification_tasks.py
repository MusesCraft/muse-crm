"""
MUSE CRM — Notification Tasks

通知相關的 Celery 背景任務。

Tasks:
1. check_due_actions() — 檢查即將到期的待辦動作並發送提醒
"""

import logging
from datetime import datetime, timedelta, timezone

from .. import celery, db
from ..models import Action, Contact
from ..models.system_setting import SystemSetting
from ..services.notification_service import NotificationService

logger = logging.getLogger(__name__)


@celery.task(bind=True, name='crm.tasks.check_due_actions')
def check_due_actions(self):
    """
    檢查即將到期的待辦動作並發送提醒通知。

    邏輯：
    - 查詢 status=pending 且 due_date 在未來 N 小時內的 Action
    - N 從 SystemSetting 'action_reminder_hours' 讀取（預設 24）
    - 高優先級（high）提前 2 倍時間提醒
    - 已發送過提醒（reminder_sent_at 非 NULL）的跳過
    - 使用 NotificationService 發送 Discord / LINE 通知

    Returns:
        處理結果字典
    """
    try:
        logger.info("[check_due_actions] 開始檢查即將到期的待辦動作")

        if not SystemSetting.get_bool('notification_enabled', default=True):
            logger.debug("[check_due_actions] 通知功能已停用，跳過")
            return {"success": True, "skipped": True, "reason": "notification_disabled"}

        reminder_hours = SystemSetting.get_int('action_reminder_hours', default=24)
        now = datetime.now(timezone.utc)

        # 查詢所有 pending 且尚未提醒、有 due_date 的 Action
        pending_actions = (
            Action.query
            .filter(
                Action.status == 'pending',
                Action.due_date.isnot(None),
                Action.reminder_sent_at.is_(None),
            )
            .limit(500)
            .all()
        )

        sent_count = 0

        for action in pending_actions:
            try:
                # 計算提醒窗口：高優先級提前 2 倍
                effective_hours = reminder_hours * 2 if action.priority == 'high' else reminder_hours
                reminder_threshold = now + timedelta(hours=effective_hours)

                # due_date 是 date 類型，轉換為 datetime 做比較（當天 23:59:59）
                due_datetime = datetime.combine(action.due_date, datetime.max.time())

                if due_datetime > reminder_threshold:
                    # 還沒到提醒時間
                    continue

                # 取得客戶名稱
                contact = db.session.get(Contact, action.contact_id)
                contact_name = contact.display_name if contact else '未知客戶'

                # 組裝通知內容並發送
                _send_action_reminder(action, contact_name)

                # 標記已提醒
                action.reminder_sent_at = datetime.now(timezone.utc)
                sent_count += 1

            except Exception as e:
                logger.error(f"[check_due_actions] 處理 Action {action.id} 失敗: {e}")
                continue

        if sent_count > 0:
            db.session.commit()
            logger.info(f"[check_due_actions] 已發送 {sent_count} 個待辦提醒")
        else:
            logger.info("[check_due_actions] 無需發送提醒")

        return {
            "success": True,
            "sent_count": sent_count,
            "checked_count": len(pending_actions),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    except Exception as e:
        logger.error(f"[check_due_actions] 任務失敗: {e}", exc_info=True)
        db.session.rollback()
        return {
            "success": False,
            "error": str(e),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


def _send_action_reminder(action: Action, contact_name: str) -> None:
    """
    發送待辦動作提醒通知。

    Args:
        action: Action 物件
        contact_name: 客戶名稱
    """
    priority_label = {'high': '🔴 高', 'medium': '🟡 中', 'low': '🟢 低'}.get(action.priority, action.priority)
    due_str = action.due_date.isoformat() if action.due_date else '未設定'

    # Discord Embed
    discord_payload = {
        'embeds': [{
            'title': '⏰ 待辦即將到期',
            'description': (
                f"**動作描述**: {action.description}\n"
                f"**客戶名稱**: {contact_name}\n"
                f"**到期日**: {due_str}\n"
                f"**優先級**: {priority_label}"
            ),
            'color': 15158332 if action.priority == 'high' else 16776960,  # 紅色 / 黃色
            'timestamp': datetime.now(timezone.utc).isoformat() + 'Z',
        }]
    }
    NotificationService.send_discord_webhook(discord_payload)

    # LINE Notify
    line_message = (
        f"\n⏰ 待辦即將到期\n"
        f"動作: {action.description}\n"
        f"客戶: {contact_name}\n"
        f"到期日: {due_str}\n"
        f"優先級: {priority_label}"
    )
    NotificationService.send_line_notify(line_message)
