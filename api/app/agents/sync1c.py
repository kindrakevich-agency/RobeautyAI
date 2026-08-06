"""Агент 5: розбір конфліктів синхронізації з 1С.

Журнал — мок (реальна інтеграція поза демо), але обробка винятків справжня:
для кожного конфлікту LLM пояснює, що сталося і що безпечно зробити, а
рішення (створити позицію / ігнорувати) застосовує людина кнопкою.
"""

from __future__ import annotations

from sqlalchemy import select

from .. import db, llm
from ..models import SyncLog

EXPLAIN = """Конфлікт синхронізації каталогу «сайт ↔ 1С»:
напрям: {direction}, дія: {action}, SKU: {sku}, деталь: {detail}

Поясни одним-двома реченнями українською, що сталося і який безпечний
наступний крок. Поверни JSON: {{"explanation": "...", "suggested": "create"|"ignore"|"manual"}}"""


def explain_conflicts() -> int:
    done = 0
    with db.get_session() as s:
        rows = s.scalars(select(SyncLog).where(
            SyncLog.status == "conflict", SyncLog.resolution.is_(None))).all()
        for r in rows:
            try:
                out = llm.chat_json([{"role": "user", "content": EXPLAIN.format(
                    direction=r.direction, action=r.action, sku=r.sku,
                    detail=r.detail)}], purpose="sync-1c", max_tokens=300)
                r.detail = (r.detail or "") + " || " + out.get("explanation", "")
                r.resolution = "suggested:" + out.get("suggested", "manual")
                done += 1
            except Exception:  # noqa: BLE001
                continue
        s.commit()
    return done


def resolve(log_id: int, action: str) -> bool:
    """Кнопка в адмінці: create | ignore."""
    with db.get_session() as s:
        r = s.get(SyncLog, log_id)
        if r is None:
            return False
        r.resolution = action
        r.status = "ok" if action in ("create", "ignore") else r.status
        s.commit()
        return True
