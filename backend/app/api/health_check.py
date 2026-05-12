"""
MUSE CRM — Data Health Check API

資料健康檢查與自動修復端點。
"""

import logging

from flask import jsonify

from . import api_bp
from ..utils.auth import login_required
from ..utils.permissions import require_role
from ..services.data_health_service import DataHealthService

logger = logging.getLogger(__name__)


@api_bp.route('/admin/data-health', methods=['POST'])
@login_required
@require_role('admin')
def data_health_check():
    """
    全面資料健康檢查 + 自動修復。

    Returns:
        {issues_found, issues_fixed, details: [...]}
    """
    try:
        result = DataHealthService.run_full_check()
        logger.info(f"資料健康檢查完成: {result['issues_found']} issues found, {result['issues_fixed']} fixed")
        return jsonify({'data': result}), 200
    except Exception as e:
        logger.error(f"資料健康檢查失敗: {e}", exc_info=True)
        return jsonify({'error': f'健康檢查失敗：{str(e)}'}), 500


@api_bp.route('/admin/fix-names', methods=['POST'])
@login_required
@require_role('admin')
def fix_names():
    """修復 display_name 為 None 的 contacts"""
    try:
        fixed = DataHealthService.fix_missing_names()
        return jsonify({'data': {'fixed': fixed}}), 200
    except Exception as e:
        logger.error(f"fix-names 失敗: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


@api_bp.route('/admin/fix-counts', methods=['POST'])
@login_required
@require_role('admin')
def fix_counts():
    """重新計算所有 conversation 的 message_count"""
    try:
        fixed = DataHealthService.fix_message_counts()
        return jsonify({'data': {'fixed': fixed}}), 200
    except Exception as e:
        logger.error(f"fix-counts 失敗: {e}", exc_info=True)
        return jsonify({'error': str(e)}), 500


