#!/usr/bin/env bash
# Повна стартова послідовність: із нуля до робочого стенда без ручних кроків.
set -e

echo "→ чекаю на сервіс ембедінгів…"
until curl -sf "${EMBEDDINGS_URL:-http://tei:80}/info" >/dev/null 2>&1; do sleep 3; done

echo "→ міграції бази"
python -m alembic upgrade head

# Каталог замовника НЕ зберігається в git — збирається скрапером при
# першому старті й далі живе в PostgreSQL. data/ — лише локальний кеш.
if [ ! -f /repo/data/catalog.json ]; then
  echo "→ каталогу немає — збираю з robeauty.me (1 rps, ~10 хв)"
  python -m app.scraper.run || echo "  скрапер завершився з помилкою, продовжую"
fi
python -m app.load_catalog || true

CHUNKS=$(python - <<'PY'
from app import db
try:
    with db.engine.connect() as c:
        print(c.exec_driver_sql("SELECT count(*) FROM chunks").scalar())
except Exception:
    print(0)
PY
)
if [ "${CHUNKS:-0}" -lt 10 ]; then
  echo "→ індексація (чанків зараз: ${CHUNKS:-0})"
  python -m app.indexer || echo "  індексація не вдалась, стартую без неї"
else
  echo "→ індекс на місці: $CHUNKS чанків"
fi

echo "→ демо-дані"
python -m app.seed_demo || true

echo "→ API на :8110"
exec uvicorn app.main:app --host 0.0.0.0 --port 8110
