"""Агент аналізу діалогів — працює над УСІМА каналами однаково.

Веб-чат, Instagram, Telegram, Viber — розмова лежить в одній таблиці, тож
аналіз каналонезалежний: тема, намір, тональність, згадані товари, результат
(відповіли / ескалація / втрачений інтерес). Результат — у conversations.analysis,
адмінка показує його поруч із перепискою і агрегує по каналах.
"""

from __future__ import annotations

import datetime as dt

from sqlalchemy import select

from .. import db, llm
from ..models import Conversation, Message

PROMPT = """Проаналізуй діалог клієнта з консультантом бренду косметики.
Поверни ТІЛЬКИ JSON:
{{
 "topic": "коротка тема 3-6 слів",
 "intent": "purchase"|"advice"|"complaint"|"delivery"|"other",
 "sentiment": "positive"|"neutral"|"negative",
 "satisfaction": 1-5,
 "products_mentioned": ["назви товарів, якщо були"],
 "outcome": "answered"|"escalated"|"lost_interest"|"lead_left",
 "summary": "1-2 речення підсумку українською"
}}

Діалог ({channel}):
{dialog}"""


def analyze_conversation(conv_id: int) -> dict | None:
    with db.get_session() as s:
        conv = s.get(Conversation, conv_id)
        if conv is None:
            return None
        msgs = s.scalars(select(Message).where(
            Message.conversation_id == conv_id).order_by(Message.id)).all()
        if not msgs:
            return None
        dialog = "\n".join(f"[{m.role}] {m.content[:400]}" for m in msgs[:40])
        out = llm.chat_json(
            [{"role": "user",
              "content": PROMPT.format(channel=conv.channel, dialog=dialog)}],
            purpose="dialog-analysis", max_tokens=600)
        conv.analysis = out
        conv.analyzed_at = dt.datetime.now(dt.timezone.utc)
        s.commit()
        return out


def analyze_pending(limit: int = 50) -> int:
    """Аналізує розмови без аналізу (нові або з новими повідомленнями)."""
    with db.get_session() as s:
        ids = s.scalars(select(Conversation.id).where(
            Conversation.analysis.is_(None)).limit(limit)).all()
    done = 0
    for cid in ids:
        try:
            if analyze_conversation(cid):
                done += 1
        except Exception:  # noqa: BLE001 — один фейл не зупиняє пакет
            continue
    return done
