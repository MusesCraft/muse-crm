"""
MUSE CRM — Maintenance Tasks

定期維護任務（資料健康檢查等）。
"""

import logging

from .. import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name='app.tasks.maintenance_tasks.periodic_data_health_check')
def periodic_data_health_check():
    """
    定期資料健康檢查（每 6 小時執行一次）。
    自動偵測並修復常見資料問題。
    """
    from ..services.data_health_service import DataHealthService

    logger.info("開始定期資料健康檢查...")

    try:
        result = DataHealthService.run_full_check()
        logger.info(
            f"定期資料健康檢查完成: "
            f"found={result['issues_found']}, fixed={result['issues_fixed']}"
        )
        return result
    except Exception as e:
        logger.error(f"定期資料健康檢查失敗: {e}", exc_info=True)
        raise
