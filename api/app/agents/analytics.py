"""Агент 7: аналітика людською мовою → SQL → відповідь.

Захист за шарами, бо LLM-SQL без огорожі — це дірка:
- тільки SELECT (регекс + заборонені слова);
- whitelist таблиць;
- EXPLAIN перед виконанням (валідність без виконання);
- statement_timeout 5 с і LIMIT 200.
"""

from __future__ import annotations

import re

from sqlalchemy import text as sql

from .. import db, llm

ALLOWED_TABLES = {
    "products", "product_i18n", "orders", "customers", "shipments",
    "conversations", "messages", "tickets", "sync_log", "unanswered",
    "api_usage", "chunks",
}
FORBIDDEN = re.compile(
    r"\b(insert|update|delete|drop|alter|create|grant|truncate|copy|;)\b", re.I)

SCHEMA_HINT = """Таблиці (PostgreSQL):
products(id, sku, price, old_price, upsell_price, category, volume)
product_i18n(product_id, lang, title, status)
customers(id, name, city, orders_count, pickup_rate, ltv)
orders(id, number, customer_id, items jsonb, total, payment, status,
       confirm_decision, created_at)
shipments(id, order_id, np_status, days_waiting)
conversations(id, channel, lang, escalated, analysis jsonb, started_at)
messages(id, conversation_id, role, content, created_at)
tickets(id, source, category, sentiment, priority, status, created_at)
sync_log(id, direction, sku, action, status, detail)
unanswered(id, question, lang, resolved)
api_usage(purpose, model, input_tokens, output_tokens, cost_usd, created_at)

Примітки: клієнт-маркер name='__seed_marker__' виключати з підрахунків.
«Невикупи» = shipments, де np_status містить 'відділення' і days_waiting >= 2."""

GEN = """Ти пишеш ОДИН SELECT-запит PostgreSQL за питанням користувача.
{schema}

Питання ({lang}): {q}

Поверни ТІЛЬКИ JSON: {{"sql": "SELECT ...", "explain": "що рахує запит, одним реченням, мовою питання"}}
Без крапки з комою. Обмеж результат LIMIT 200, якщо це список."""


def ask(question: str, lang: str = "uk") -> dict:
    out = llm.chat_json([{"role": "user", "content": GEN.format(
        schema=SCHEMA_HINT, lang=lang, q=question[:400])}],
        purpose="sql-analytics", max_tokens=700)
    query = (out.get("sql") or "").strip().rstrip(";")

    if not query.lower().startswith("select") or FORBIDDEN.search(query):
        return {"error": "запит відхилено: дозволені лише SELECT"}
    used = set(re.findall(r"(?:from|join)\s+([a-z_]+)", query, re.I))
    if not used or used - ALLOWED_TABLES:
        return {"error": f"таблиці поза дозволеним переліком: {used - ALLOWED_TABLES}"}

    try:
        with db.engine.connect() as conn:
            conn.execute(sql("SET statement_timeout = '5s'"))
            conn.execute(sql(f"EXPLAIN {query}"))  # валідність без виконання
            rows = conn.execute(sql(query)).mappings().all()
    except Exception as e:  # noqa: BLE001
        return {"error": f"помилка виконання: {str(e)[:200]}", "sql": query}

    data = [dict(r) for r in rows[:200]]
    summary = llm.chat([{"role": "user", "content":
        f"Питання: {question}\nРезультат SQL (перші рядки): {str(data[:10])[:1500]}\n"
        f"Сформулюй відповідь одним-двома реченнями мовою питання, з конкретною "
        f"цифрою, без переліку всіх рядків."}],
        purpose="sql-analytics", max_tokens=300)
    return {"sql": query, "explain": out.get("explain"),
            "rows": data, "answer": summary}
