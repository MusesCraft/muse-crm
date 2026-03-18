#!/usr/bin/env python3
"""
MUSE CRM — Flask Application Entry Point

開發用的 Flask 應用啟動檔案。
"""

import os
from app import create_app, db

# 建立 Flask 應用
app = create_app()

@app.shell_context_processor
def make_shell_context():
    """為 Flask shell 提供上下文變數"""
    from app.models import Contact, ChannelIdentifier, Conversation, Message, Analysis, Action, Tag, User
    
    return {
        'db': db,
        'Contact': Contact,
        'ChannelIdentifier': ChannelIdentifier,
        'Conversation': Conversation,
        'Message': Message,
        'Analysis': Analysis,
        'Action': Action,
        'Tag': Tag,
        'User': User
    }

if __name__ == '__main__':
    # 開發模式啟動
    app.run(debug=True, host='0.0.0.0', port=5000)