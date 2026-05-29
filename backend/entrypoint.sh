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

if [ "${START_CELERY_WORKER:-1}" = "1" ]; then
    echo "🧠 啟動 Celery worker..."
    celery -A celery_app.celery worker \
        --loglevel="${CELERY_LOGLEVEL:-INFO}" \
        --concurrency="${CELERY_CONCURRENCY:-1}" &
    CELERY_PID=$!
else
    echo "⏭️  START_CELERY_WORKER=0，略過 Celery worker"
    CELERY_PID=""
fi

echo "🚀 啟動 gunicorn..."
gunicorn --bind 0.0.0.0:${PORT:-5000} --workers 1 --threads 4 --timeout 120 wsgi:app &
WEB_PID=$!

shutdown() {
    echo "🛑 收到停止訊號，關閉服務..."
    kill -TERM "$WEB_PID" 2>/dev/null || true
    if [ -n "$CELERY_PID" ]; then
        kill -TERM "$CELERY_PID" 2>/dev/null || true
    fi
    wait || true
}

trap shutdown TERM INT

if [ -n "$CELERY_PID" ]; then
    wait -n "$WEB_PID" "$CELERY_PID"
else
    wait "$WEB_PID"
fi
EXIT_CODE=$?
shutdown
exit "$EXIT_CODE"
