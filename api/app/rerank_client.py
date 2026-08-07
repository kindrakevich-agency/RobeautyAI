"""Переранжування кандидатів через bge-reranker-v2-m3 (TEI).

Навіщо. Вектор і повнотекст дають кандидатів «схожих загалом»: питання
«чи можна ніацинамід з кислотами» витягує всі картки з ніацинамідом
однаково добре. Реранкер — крос-енкодер: він читає пару «питання ↔ текст»
разом і оцінює, чи цей текст справді відповідає на це питання. Тому він
бачить різницю там, де вектор її не бачить.

Ціна — один додатковий виклик на запит. Модель уже піднята на цьому ж
сервері, тож мережі назовні немає.

Якщо сервіс недоступний, порядок лишається як був: пошук не має падати
через необов'язкове покращення.
"""

from __future__ import annotations

import os
import sys

import httpx

RERANK_URL = os.environ.get("RERANK_URL", "").rstrip("/")
TIMEOUT = float(os.environ.get("RERANK_TIMEOUT", "8"))


def available() -> bool:
    return bool(RERANK_URL)


def rerank(query: str, texts: list[str], top_n: int) -> list[int] | None:
    """Повертає індекси texts у новому порядку або None, якщо не вдалося."""
    if not RERANK_URL or not texts:
        return None
    try:
        r = httpx.post(f"{RERANK_URL}/rerank",
                       json={"query": query[:1000],
                             "texts": [t[:2000] for t in texts],
                             "raw_scores": False},
                       timeout=TIMEOUT)
        r.raise_for_status()
        rows = r.json()
    except (httpx.HTTPError, ValueError) as e:
        print(f"    реранкер недоступний, лишаю початковий порядок: {str(e)[:90]}",
              file=sys.stderr)
        return None
    try:
        order = [int(x["index"]) for x in
                 sorted(rows, key=lambda x: float(x["score"]), reverse=True)]
    except (KeyError, TypeError, ValueError):
        print(f"    реранкер повернув несподівану форму: {str(rows)[:120]}",
              file=sys.stderr)
        return None
    return order[:top_n]
