# RoBeauty AI Operations — демо-стенд

Демонстраційний стенд операційних AI-агентів для D2C-бренду косметики:
двомовний (UA/PL) консультант поверх реального каталогу robeauty.me
та адмінка семи агентів — від підтвердження замовлень до SQL-аналітики
людською мовою.

🌐 **Демо:** robeauty.kindrakevich.com

> **Дисклеймер.** Це портфоліо-демо для демонстрації підходу. Стенд не
> афілійований з RoBeauty. Дані каталогу — з публічного сайту robeauty.me.
> Замовлення, клієнти та статуси доставки — синтетичні.

## Складові

| Частина | Технології |
|---|---|
| `api/` | Python 3.12 · FastAPI · SQLAlchemy 2 · Alembic · PostgreSQL + pgvector |
| `web/` | React 18 · TypeScript · Vite · Tailwind · react-i18next (uk/pl) |
| Embeddings | TEI + bge-m3 (self-hosted, один векторний простір для UA і PL) |
| LLM | OpenAI API (моделі в env) |

## Запуск

```bash
cp .env.example .env    # додати OPENAI_API_KEY
docker compose up -d --build
```

Скрапер каталогу: `python -m app.scraper.run` (кешує сирі дані в `data/raw/`,
повторний запуск не б'є по сайту; 1 rps, чесний User-Agent).
