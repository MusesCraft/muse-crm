#!/bin/bash
set -e

echo "🔱 MUSE CRM 啟動中..."

# 初始化 DB schema（用原始 SQL，支援 GIN index 等 PostgreSQL 特有語法）
if [ -n "$DATABASE_URL" ] && [ -f /app/schema.sql ]; then
    echo "📦 初始化資料庫 schema..."
    python -c "
import psycopg2
import os
try:
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    conn.autocommit = True
    cur = conn.cursor()
    # 檢查是否已建表
    cur.execute(\"SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='contacts')\")
    if not cur.fetchone()[0]:
        with open('/app/schema.sql', 'r') as f:
            cur.execute(f.read())
        print('✅ DB schema 已建立')
    else:
        print('✅ DB tables 已存在，跳過初始化')
    cur.close()
    conn.close()
except Exception as e:
    print(f'⚠️ DB init: {e}')
" 2>&1
fi

echo "🚀 啟動 gunicorn..."
exec gunicorn --bind 0.0.0.0:${PORT:-5000} --workers 1 --threads 4 --timeout 120 wsgi:app
