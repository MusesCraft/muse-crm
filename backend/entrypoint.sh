#!/bin/bash
set -e

echo "🔱 MUSE CRM 啟動中..."
echo "🚀 啟動 gunicorn..."
exec gunicorn --bind 0.0.0.0:${PORT:-5000} --workers 1 --threads 4 --timeout 120 wsgi:app
