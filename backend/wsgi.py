"""
MUSE CRM — WSGI Entry Point

Production 環境的應用入口檔案。
"""

import os
import sys
from pathlib import Path

# 將 app 目錄加入 Python Path
app_dir = Path(__file__).parent
sys.path.insert(0, str(app_dir))

from app import create_app

# 從環境變數取得配置
config_name = os.environ.get('FLASK_ENV', 'production')

# 建立 Flask 應用
application = create_app(config_name)

if __name__ == "__main__":
    application.run()