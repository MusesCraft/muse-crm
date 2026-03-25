"""
MUSE CRM — File Upload API

簡易檔案上傳端點（圖片）。
"""

import logging
import os
import uuid

from flask import jsonify, request, current_app

from . import api_bp
from ..utils.auth import login_required
from ..utils.permissions import require_role

logger = logging.getLogger(__name__)

ALLOWED_CONTENT_TYPES = {
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB


@api_bp.route('/upload', methods=['POST'])
@login_required
@require_role('admin', 'manager', 'user')
def upload_file():
    """
    上傳檔案（目前僅支援圖片）

    Request: multipart/form-data
        - file: 圖片檔案

    Response:
        { url: string }
    """
    if 'file' not in request.files:
        return jsonify({'error': '請提供檔案'}), 400

    file = request.files['file']

    if not file.filename:
        return jsonify({'error': '檔案名稱為空'}), 400

    # 檢查 content type
    if file.content_type not in ALLOWED_CONTENT_TYPES:
        return jsonify({
            'error': f'不支援的檔案類型: {file.content_type}，'
                     f'僅支援 JPEG, PNG, GIF, WebP',
        }), 400

    # 讀取並檢查大小
    data = file.read()
    if len(data) > MAX_FILE_SIZE:
        return jsonify({'error': '檔案過大，上限為 5MB'}), 400

    # 產生唯一檔名
    ext_map = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
    }
    ext = ext_map.get(file.content_type, '.bin')
    filename = f"{uuid.uuid4().hex}{ext}"

    # 儲存到 uploads 目錄
    upload_dir = os.path.join(
        current_app.root_path, '..', 'uploads'
    )
    os.makedirs(upload_dir, exist_ok=True)

    filepath = os.path.join(upload_dir, filename)
    with open(filepath, 'wb') as f:
        f.write(data)

    # 產生 URL — 使用後端 base URL
    # 在 production 環境中應透過 reverse proxy 提供 static files
    api_base = os.environ.get('API_BASE_URL', request.host_url.rstrip('/'))
    url = f"{api_base}/uploads/{filename}"

    logger.info(f"檔案已上傳: {filename} ({len(data)} bytes)")

    return jsonify({'url': url, 'filename': filename})
