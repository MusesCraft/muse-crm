"""MUSE CRM — Inventory Proxy API

Proxies requests to the muse-inventory (NestJS) system.
CRM frontend calls these endpoints; they forward to the inventory backend.
"""

import logging
from flask import jsonify, request
from . import api_bp
from ..utils.auth import login_required
from ..utils.permissions import require_role
from ..utils.inventory_client import inventory_client

logger = logging.getLogger(__name__)


_ALLOWED_LIST_PARAMS = {'page', 'per_page', 'limit', 'offset', 'search', 'category', 'status', 'sort', 'order'}


def _proxy_response(resp):
    """Convert inventory API response to Flask response."""
    if resp is None:
        return jsonify({'error': '進銷存系統無法連線'}), 503
    try:
        return jsonify(resp.json()), resp.status_code
    except Exception:
        return jsonify({'error': '進銷存系統回應格式錯誤'}), 502


def _safe_params():
    """Filter request.args to allowed parameters only."""
    return {k: v for k, v in request.args.to_dict().items() if k in _ALLOWED_LIST_PARAMS}


# ── Products ──

@api_bp.route('/inventory/products', methods=['GET'])
@login_required
def inventory_products():
    """Proxy: 取得進銷存產品列表"""
    resp = inventory_client.get('/products', params=_safe_params())
    return _proxy_response(resp)


@api_bp.route('/inventory/products/<product_id>', methods=['GET'])
@login_required
def inventory_product_detail(product_id):
    """Proxy: 取得單一產品"""
    resp = inventory_client.get(f'/products/{product_id}')
    return _proxy_response(resp)


@api_bp.route('/inventory/products/size-specs', methods=['GET'])
@login_required
def inventory_size_specs():
    """Proxy: 取得尺碼規格"""
    resp = inventory_client.get('/products/size-specs')
    return _proxy_response(resp)


# ── Inventory Operations ──

@api_bp.route('/inventory/overview', methods=['GET'])
@login_required
def inventory_overview():
    """Proxy: 庫存總覽"""
    resp = inventory_client.get('/inventory/overview')
    return _proxy_response(resp)


@api_bp.route('/inventory/logs', methods=['GET'])
@login_required
def inventory_logs():
    """Proxy: 進銷紀錄"""
    resp = inventory_client.get('/inventory/logs', params=_safe_params())
    return _proxy_response(resp)


@api_bp.route('/inventory/inbound', methods=['POST'])
@login_required
@require_role('admin', 'manager')
def inventory_inbound():
    """Proxy: 進貨"""
    resp = inventory_client.post('/inventory/inbound', json=request.get_json())
    return _proxy_response(resp)


@api_bp.route('/inventory/outbound', methods=['POST'])
@login_required
@require_role('admin', 'manager')
def inventory_outbound():
    """Proxy: 銷貨"""
    resp = inventory_client.post('/inventory/outbound', json=request.get_json())
    return _proxy_response(resp)


@api_bp.route('/inventory/outbound/batch', methods=['POST'])
@login_required
@require_role('admin', 'manager')
def inventory_outbound_batch():
    """Proxy: 批次銷貨"""
    resp = inventory_client.post('/inventory/outbound/batch', json=request.get_json())
    return _proxy_response(resp)


@api_bp.route('/inventory/reserve', methods=['POST'])
@login_required
@require_role('admin', 'manager')
def inventory_reserve():
    """Proxy: 庫存預留"""
    resp = inventory_client.post('/inventory/reserve', json=request.get_json())
    return _proxy_response(resp)


@api_bp.route('/inventory/reservations', methods=['GET'])
@login_required
def inventory_reservations():
    """Proxy: 預留清單"""
    resp = inventory_client.get('/inventory/reservations', params=_safe_params())
    return _proxy_response(resp)


@api_bp.route('/inventory/pending', methods=['GET'])
@login_required
@require_role('admin', 'manager')
def inventory_pending():
    """Proxy: 待審核清單"""
    resp = inventory_client.get('/inventory/pending', params=_safe_params())
    return _proxy_response(resp)


@api_bp.route('/inventory/approve', methods=['POST'])
@login_required
@require_role('admin')
def inventory_approve():
    """Proxy: 審核進銷單"""
    resp = inventory_client.post('/inventory/approve', json=request.get_json())
    return _proxy_response(resp)


# ── Health Check ──

@api_bp.route('/inventory/health', methods=['GET'])
@login_required
def inventory_health():
    """Check if inventory system is reachable."""
    resp = inventory_client.get('/inventory/overview')
    if resp and resp.status_code == 200:
        return jsonify({'status': 'connected', 'data': resp.json()})
    return jsonify({'status': 'disconnected', 'error': '進銷存系統無法連線'}), 503
