"""
MUSE CRM — Media Storage Utility

下載外部媒體（Meta/LINE CDN）並儲存至本地 uploads 目錄，
產生永久 URL 取代臨時 CDN 連結。
"""

import logging
import os
import uuid
from typing import Optional
from urllib.parse import urlparse

import requests
from flask import current_app

logger = logging.getLogger(__name__)

# Content-Type → 副檔名對應
_EXT_MAP = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'audio/mpeg': '.mp3',
    'audio/ogg': '.ogg',
}

DOWNLOAD_TIMEOUT = 15  # 秒


def download_and_store(external_url: str) -> Optional[str]:
    """
    從外部 URL 下載媒體檔案並存入本地 uploads 目錄。

    Args:
        external_url: Meta/LINE CDN 的臨時 URL

    Returns:
        永久的本地 URL（如 https://host/uploads/abc123.jpg），失敗回傳 None
    """
    if not external_url:
        return None

    try:
        resp = requests.get(external_url, timeout=DOWNLOAD_TIMEOUT, stream=True)
        resp.raise_for_status()

        # 從 Content-Type 推斷副檔名
        content_type = resp.headers.get('Content-Type', '').split(';')[0].strip()
        ext = _EXT_MAP.get(content_type)

        # Content-Type 不明時，從 URL 路徑推斷
        if not ext:
            path = urlparse(external_url).path
            url_ext = os.path.splitext(path)[1].lower()
            if url_ext in ('.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mp3'):
                ext = url_ext
            else:
                ext = '.jpg'  # 預設

        # 讀取內容（限 20MB）
        data = resp.content
        if len(data) > 20 * 1024 * 1024:
            logger.warning(f"[media] 檔案過大，跳過下載：{len(data)} bytes")
            return None

        # 儲存
        filename = f"{uuid.uuid4().hex}{ext}"
        upload_dir = os.path.join(current_app.root_path, '..', 'uploads')
        os.makedirs(upload_dir, exist_ok=True)

        filepath = os.path.join(upload_dir, filename)
        with open(filepath, 'wb') as f:
            f.write(data)

        # 產生永久 URL
        api_base = os.environ.get('API_BASE_URL', '').rstrip('/')
        if not api_base:
            api_base = 'http://localhost:5000'
        permanent_url = f"{api_base}/uploads/{filename}"

        logger.info(f"[media] 已下載並儲存：{filename} ({len(data)} bytes)")
        return permanent_url

    except requests.RequestException as e:
        logger.warning(f"[media] 下載失敗：{e}")
        return None
    except Exception as e:
        logger.error(f"[media] 儲存失敗：{e}", exc_info=True)
        return None
