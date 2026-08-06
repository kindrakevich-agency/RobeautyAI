"""Агент 2: невикупи — персональні нагадування про посилку у відділенні.

День 2 і день 4 очікування: коротке людяне повідомлення мовою клієнта,
згенероване з контексту замовлення (що всередині, скільки зберігається).
У демо надсилання симульоване — повідомлення лягає в reminders відправлення.
"""

from __future__ import annotations

import datetime as dt

from sqlalchemy import select

from .. import db, llm
from ..models import Customer, Order, Shipment

PROMPT = """Склади коротке (2-3 речення) дружнє нагадування клієнту, що його
посилка чекає у відділенні Нової Пошти. Без тиску й знижок, тон «наука +
турбота». Згадай, що в замовленні, і що зберігання безкоштовне 5 днів.
Мова: українська.

Клієнт: {name}
Замовлення: {items}, разом {total} ₴
Днів у відділенні: {days}
Поверни JSON: {{"message": "..."}}"""


def run() -> dict:
    sent = 0
    at_risk = 0.0
    with db.get_session() as s:
        rows = s.execute(
            select(Shipment, Order, Customer)
            .join(Order, Order.id == Shipment.order_id)
            .join(Customer, Customer.id == Order.customer_id)
        ).all()
        for sh, o, c in rows:
            if "відділення" not in sh.np_status and "поштомат" not in sh.np_status:
                continue
            at_risk += o.total
            existing_days = {r.get("day") for r in (sh.reminders or [])}
            for day in (2, 4):
                if sh.days_waiting >= day and day not in existing_days:
                    items = ", ".join(i["sku"] for i in (o.items or [])[:3])
                    out = llm.chat_json([{"role": "user", "content": PROMPT.format(
                        name=c.name.split()[0], items=items,
                        total=int(o.total), days=sh.days_waiting)}],
                        purpose="reminder", max_tokens=300)
                    sh.reminders = (sh.reminders or []) + [{
                        "day": day, "text": out.get("message", ""),
                        "at": dt.datetime.now(dt.timezone.utc).isoformat()}]
                    sent += 1
        s.commit()
    return {"reminders_sent": sent, "uah_at_risk": round(at_risk)}
