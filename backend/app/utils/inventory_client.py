"""MUSE CRM — Inventory System API Client

Proxy client for the muse-inventory (NestJS) system.
Handles authentication, request forwarding, and error handling.
"""

import logging
import requests
from flask import current_app

logger = logging.getLogger(__name__)


class InventoryClient:
    """Client for muse-inventory API."""

    def __init__(self):
        self._token = None
        self._session = requests.Session()

    @property
    def base_url(self):
        return current_app.config.get('INVENTORY_API_URL', 'http://localhost:3003/api')

    @property
    def token(self):
        if not self._token:
            self._token = current_app.config.get('INVENTORY_API_TOKEN', '')
        return self._token

    def _headers(self):
        h = {'Content-Type': 'application/json'}
        if self.token:
            h['Authorization'] = f'Bearer {self.token}'
        return h

    def _request(self, method, path, **kwargs):
        """Make a request to the inventory API."""
        # 驗證 path 不含路徑穿越
        if '..' in path or path.startswith('//'):
            logger.error(f'Inventory API invalid path: {path}')
            return None
        url = f'{self.base_url}{path}'
        timeout = kwargs.pop('timeout', 10)
        try:
            resp = self._session.request(method, url, headers=self._headers(), timeout=timeout, **kwargs)
            if resp.status_code >= 400:
                logger.warning(f'Inventory API {method} {path}: {resp.status_code} {resp.text[:200]}')
            return resp
        except requests.ConnectionError:
            logger.error(f'Inventory API unreachable: {url}')
            return None
        except requests.Timeout:
            logger.error(f'Inventory API timeout: {url}')
            return None

    def get(self, path, params=None):
        return self._request('GET', path, params=params)

    def post(self, path, json=None):
        return self._request('POST', path, json=json)

    def patch(self, path, json=None):
        return self._request('PATCH', path, json=json)

    def delete(self, path):
        return self._request('DELETE', path)


inventory_client = InventoryClient()
