#!/bin/bash
set -e

echo "🔱 MUSE CRM 啟動中..."

# 初始化 DB schema（如果表不存在的話）
if [ -n "$DATABASE_URL" ]; then
    echo "📦 檢查並初始化資料庫..."
    python -c "
from app import create_app, db
app = create_app('development')
with app.app_context():
    db.create_all()
    print('✅ 資料庫表已就緒')
" 2>&1 || echo "⚠️ DB 初始化警告（可能表已存在）"
fi

echo "🚀 啟動 gunicorn..."
exec gunicorn --bind 0.0.0.0:${PORT:-5000} --workers 1 --threads 4 --timeout 120 wsgi:app
