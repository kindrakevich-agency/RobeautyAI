"""Очищення описів від HTML.

Store API віддає опис товару разом із розміткою: `<strong>`, `<br />`,
`&nbsp;`. Вона протікала всюди — в адмінку, де читалася як «верх дибілізму»
дослівними тегами, і в базу знань, тобто модель отримувала `<strong>` як
частину тексту й витрачала на нього контекст.

Перетворюємо на звичайний текст: розриви рядків зберігаємо, решту тегів
прибираємо, HTML-сутності розкодовуємо.

Запуск разової чистки наявних записів: python -m app.textclean
"""

from __future__ import annotations

import html
import re
import sys

BLOCK_END = re.compile(r"</(p|div|li|h[1-6]|tr)\s*>", re.I)
BR = re.compile(r"<br\s*/?>", re.I)
LI = re.compile(r"<li[^>]*>", re.I)
TAG = re.compile(r"<[^>]+>")


def html_to_text(src: str | None) -> str:
    if not src:
        return ""
    t = BR.sub("\n", src)
    t = BLOCK_END.sub("\n", t)
    t = LI.sub("• ", t)
    t = TAG.sub("", t)
    t = html.unescape(t)
    t = t.replace(" ", " ")
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return "\n".join(line.strip() for line in t.split("\n")).strip()


def main() -> None:
    from sqlalchemy import select

    from . import db
    from .models import ProductI18n

    changed = 0
    with db.get_session() as s:
        for row in s.scalars(select(ProductI18n)).all():
            clean = html_to_text(row.description)
            if clean != (row.description or ""):
                row.description = clean
                changed += 1
        s.commit()
    print(f"очищено описів: {changed}", file=sys.stderr)
    print(changed)


if __name__ == "__main__":
    main()
