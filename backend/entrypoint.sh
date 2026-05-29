#!/bin/bash
set -e

echo "🔱 MUSE CRM 啟動中..."

# 啟用 pgvector 擴充（KB embedding 用，失敗也不阻塞）
if [ -n "$DATABASE_URL" ]; then
    python -c "
import psycopg2, os
try:
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    conn.autocommit = True
    conn.cursor().execute('CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"')
    conn.close()
    print('✅ uuid-ossp extension ready')
except Exception as e:
    print(f'⚠️ extension init: {e}')
" 2>&1
fi

# Schema 由 app/__init__.py 的 db.create_all() 處理（PR-2 後 schema.sql 已不完整）

echo "🚀 啟動 gunicorn..."
exec gunicorn --bind 0.0.0.0:${PORT:-5000} --workers 1 --threads 4 --timeout 120 wsgi:app
