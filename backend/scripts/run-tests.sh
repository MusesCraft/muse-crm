#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-muse_dev}"
export TEST_DATABASE_URL="${TEST_DATABASE_URL:-postgresql://muse:${POSTGRES_PASSWORD}@localhost:5432/muse_crm_test}"
export FLASK_ENV=testing

cd "$ROOT_DIR"

if command -v docker >/dev/null 2>&1; then
  # Unit tests only require PostgreSQL; Redis is intentionally not started here
  # because developer machines often already have port 6379 allocated.
  docker compose up -d postgres >/dev/null
  echo "Waiting for local PostgreSQL..."
  for _ in {1..30}; do
    if docker compose exec -T postgres pg_isready -U muse -d muse_crm >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  docker compose exec -T postgres psql -U muse -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'muse_crm_test'" | grep -q 1 \
    || docker compose exec -T postgres createdb -U muse muse_crm_test
fi

cd "$BACKEND_DIR"
source venv/bin/activate
python -m pytest "$@"
