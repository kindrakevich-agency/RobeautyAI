#!/usr/bin/env bash
# Деплой на сервер: код → залежності → міграції → фронт → рестарт.
#
# Каталог замовника не в репозиторії, тож деплой його не чіпає: дані вже
# лежать у PostgreSQL і переживають будь-яке оновлення коду.
set -e

ROOT="/www/wwwroot/robeauty.kindrakevich.com"
cd "$ROOT"

echo "→ код"
git fetch --quiet origin main
git reset --hard --quiet origin/main

echo "→ залежності"
api/.venv/bin/pip install -q -r api/requirements.txt

echo "→ міграції"
cd api && set -a && . ../.env && set +a && .venv/bin/python -m alembic upgrade head
cd "$ROOT"

echo "→ фронтенд"
cd web && npm ci --silent 2>/dev/null || npm install --silent
npm run build
cd "$ROOT"

echo "→ рестарт"
systemctl restart robeauty-api
sleep 4
curl -sf http://127.0.0.1:8111/api/health && echo " — сервіс живий"
nginx -s reload
echo "готово"
