"""Агент 4: розбір звернень — категорія, тональність, пріоритет, чернетка
відповіді мовою звернення. Плюс тижневий дайджест для керівника.
"""

from __future__ import annotations

import random

from sqlalchemy import select

from .. import db, llm
from ..models import Ticket

CLASSIFY = """Проаналізуй звернення клієнта косметичного бренду.
Поверни ТІЛЬКИ JSON:
{{
 "category": "скарга"|"питання"|"повернення"|"подяка"|"доставка",
 "sentiment": "positive"|"neutral"|"negative",
 "priority": "high"|"normal"|"low",
 "draft_reply": "чернетка відповіді МОВОЮ звернення, 2-4 речення, тон «наука+турбота», без обіцянок компенсацій — їх затверджує людина"
}}

Звернення ({lang}): {text}"""

SAMPLE_INBOX = [
    ("uk", "Крем чудовий, шкіра нарешті не лущиться, дякую!"),
    ("uk", "Замовлення прийшло без одного товару, оплачувала все разом. Що робити?"),
    ("uk", "Сироватка викликала почервоніння, хочу повернути кошти."),
    ("uk", "Скільки їде доставка в Луцьк?"),
    ("uk", "Чи буде знижка на набори до свят?"),
    ("pl", "Świetne serum, widzę różnicę po dwóch tygodniach!"),
    ("pl", "Paczka idzie już 10 dni, gdzie moje zamówienie?"),
    ("pl", "Czy krem z bakuchiolem można stosować latem?"),
    ("uk", "Кришка тоніка тріснула при доставці, прошу заміну."),
    ("uk", "Ваш консультант порадив чудовий догляд, шкіра сяє!"),
    ("uk", "Не можу застосувати промокод із розсилки."),
    ("pl", "Jak długo można używać kremu po otwarciu?"),
    ("uk", "Замовила не той відтінок, можна обміняти?"),
    ("uk", "Посилка загубилась на пошті, допоможіть знайти."),
    ("uk", "Дуже довго відповідає менеджер у вайбері!"),
]


def generate_inbox() -> int:
    """Кнопка «Згенерувати вхідні» в адмінці: 15 синтетичних звернень."""
    rng = random.Random()
    with db.get_session() as s:
        for lang, text in SAMPLE_INBOX:
            s.add(Ticket(source=rng.choice(["form", "review"]), lang=lang,
                         status="new", payload={"text": text}))
        s.commit()
    return len(SAMPLE_INBOX)


def run() -> dict:
    done = 0
    with db.get_session() as s:
        rows = s.scalars(select(Ticket).where(
            Ticket.category.is_(None), Ticket.status == "new")).all()
        for t in rows:
            text = (t.payload or {}).get("text") or (t.payload or {}).get("question")
            if not text:
                t.category = "handoff"
                continue
            try:
                out = llm.chat_json([{"role": "user", "content": CLASSIFY.format(
                    lang=t.lang, text=text[:1500])}],
                    purpose="ticket-triage", max_tokens=500)
                t.category = out.get("category")
                t.sentiment = out.get("sentiment")
                t.priority = out.get("priority")
                t.draft_reply = out.get("draft_reply")
                t.status = "triaged"
                done += 1
            except Exception:  # noqa: BLE001
                continue
        s.commit()
    return {"triaged": done}


def weekly_digest() -> str:
    """Зведення по всіх зверненнях одним викликом — для COO."""
    with db.get_session() as s:
        rows = s.scalars(select(Ticket).order_by(Ticket.created_at.desc())
                         .limit(60)).all()
        lines = [f"- [{t.category or 'new'}/{t.sentiment or '?'}] "
                 f"{((t.payload or {}).get('text') or '')[:120]}"
                 for t in rows]
    return llm.chat([{"role": "user", "content":
        "Склади короткий тижневий дайджест звернень для керівника операцій "
        "українською: топ-теми, що горить, що хвалять, 1-2 рекомендації. "
        "До 150 слів.\n\nЗвернення:\n" + "\n".join(lines)}],
        purpose="digest", max_tokens=700)
