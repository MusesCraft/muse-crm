"""
MUSE CRM — Realtime Module

WebSocket 即時推送模組，使用 Flask-SocketIO。
"""

from flask_socketio import SocketIO

# 全局 SocketIO 實例（在 create_app 中初始化）
socketio = SocketIO()
