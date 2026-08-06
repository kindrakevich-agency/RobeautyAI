"""Агент 1: підтвердження замовлень.

Мета — зняти з людини обдзвін «підтвердіть замовлення». Правила детерміновані
й пояснювані; LLM формулює людське пояснення рішення, але САМЕ рішення
приймає код — так його можна аудитувати.

Правила:
- постійний клієнт (3+ замовлень, pickup_rate ≥ 0.8) АБО оплата карткою
  → auto-confirm;
- новий клієнт + накладений платіж > 2000 ₴ → дзвінок;
- pickup_rate < 0.7 → дзвінок (історія невикупів);
- решта → auto-confirm з поміткою.
"""

from __future__ import annotations

from sqlalchemy import select

from .. import db
from ..models import Customer, Order


def score_order(o: Order, c: Customer) -> tuple[str, str]:
    if o.payment == "card":
        return "auto", "оплачено карткою — ризику невикупу немає"
    if c.orders_count >= 3 and c.pickup_rate >= 0.8:
        return "auto", (f"постійний клієнт: {c.orders_count} замовлень, "
                        f"викуп {int(c.pickup_rate * 100)}%")
    if c.pickup_rate < 0.7:
        return "call", (f"низький викуп ({int(c.pickup_rate * 100)}%) — "
                        f"варто підтвердити голосом")
    if c.orders_count <= 1 and o.payment == "cod" and o.total > 2000:
        return "call", (f"новий клієнт, накладений платіж {int(o.total)} ₴ — "
                        f"підтвердити перед відправкою")
    return "auto", "типовий профіль без ризик-факторів"


def run() -> dict:
    with db.get_session() as s:
        pending = s.execute(
            select(Order, Customer)
            .join(Customer, Customer.id == Order.customer_id)
            .where(Order.status == "pending",
                   Customer.name != "__seed_marker__")
        ).all()
        auto = calls = 0
        for o, c in pending:
            decision, reason = score_order(o, c)
            o.confirm_decision = decision
            o.confirm_reason = reason
            o.status = "confirmed" if decision == "auto" else "call_queue"
            auto += decision == "auto"
            calls += decision == "call"
        s.commit()
    return {"processed": len(pending), "auto": auto, "calls": calls,
            "auto_pct": round(auto / len(pending) * 100) if pending else 0}
