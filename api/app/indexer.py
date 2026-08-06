"""M3: чанкування та індексація.

Products: одна картка = один чанк — назва + опис + розгорнуті details
(активи, тип шкіри, проблеми, застосування, сумісність) + ціна/об'єм.
Pages: секції по ~1500 символів з перекриттям.

Для кожної мови — окремі чанки: uk завжди, pl — з approved-перекладів.
tsvector рахується конфігом simple + unaccent (діакритика PL).

Запуск: python -m app.indexer
"""

from __future__ import annotations

import re
import sys

from sqlalchemy import delete, select, text as sql

from . import db, embeddings_client
from .models import Chunk, Page, Product, ProductI18n

CHUNK_CHARS = 1500
OVERLAP = 200


def render_product(p: Product, title: str, description: str) -> str:
    parts = [title]
    if p.variant_label:
        parts.append(p.variant_label)
    if p.volume:
        parts.append(f"Об'єм: {p.volume}")
    parts.append(f"Ціна: {int(p.price)} грн" + (
        f" (акційна {int(p.upsell_price)} грн у наборах)" if p.upsell_price else ""))
    if description:
        parts.append(description)
    d = p.details or {}
    if d.get("active_ingredients"):
        parts.append("Активні складники: " + ", ".join(d["active_ingredients"][:12]))
    if d.get("skin_type"):
        parts.append("Тип шкіри: " + ", ".join(d["skin_type"]))
    if d.get("skin_concerns"):
        parts.append("Проблеми: " + ", ".join(d["skin_concerns"][:12]))
    if d.get("how_to_use"):
        parts.append("Застосування: " + d["how_to_use"])
    if d.get("when_to_use"):
        parts.append("Коли: " + d["when_to_use"])
    if d.get("combine_with"):
        parts.append("Поєднується з: " + ", ".join(d["combine_with"][:8]))
    if d.get("do_not_combine_with"):
        parts.append("Не поєднувати з: " + ", ".join(d["do_not_combine_with"][:8]))
    if d.get("contraindications"):
        parts.append("Застереження: " + d["contraindications"])
    for f in (d.get("faq") or [])[:6]:
        parts.append(f"Питання: {f.get('q')} Відповідь: {f.get('a')}")
    return "\n".join(str(x) for x in parts if x)


def split_page(body: str) -> list[str]:
    body = re.sub(r"\s+", " ", body).strip()
    if len(body) <= CHUNK_CHARS:
        return [body] if body else []
    out, start = [], 0
    while start < len(body):
        end = min(len(body), start + CHUNK_CHARS)
        out.append(body[start:end])
        if end == len(body):
            break
        start = end - OVERLAP
    return out


def main() -> None:
    with db.get_session() as s:
        s.execute(delete(Chunk))

        texts: list[str] = []
        metas: list[tuple[str, int, str]] = []  # (ref_type, ref_id, lang)

        products = s.scalars(select(Product)).all()
        i18n = {(r.product_id, r.lang): r for r in s.scalars(select(ProductI18n))}
        for p in products:
            uk = i18n.get((p.id, "uk"))
            if uk and uk.title:
                texts.append(render_product(p, uk.title, uk.description))
                metas.append(("product", p.id, "uk"))
            pl = i18n.get((p.id, "pl"))
            if pl and pl.status == "approved" and pl.title:
                texts.append(render_product(p, pl.title, pl.description))
                metas.append(("product", p.id, "pl"))

        pages = s.scalars(select(Page)).all()
        for pg in pages:
            for piece in split_page(pg.body_text):
                texts.append((pg.title or "") + "\n" + piece)
                metas.append(("page", pg.id, "uk"))

        print(f"чанків до індексації: {len(texts)}", file=sys.stderr)
        vectors = embeddings_client.embed(texts)

        for (ref_type, ref_id, lang), text_, vec in zip(metas, texts, vectors):
            s.add(Chunk(ref_type=ref_type, ref_id=ref_id, lang=lang,
                        text=text_, embedding=vec))
        s.commit()

        # tsvector обома конфігами; unaccent прибирає діакритику для PL
        s.execute(sql(
            "UPDATE chunks SET tsv_uk = to_tsvector('simple', unaccent(text)) "
            "WHERE lang = 'uk'"))
        s.execute(sql(
            "UPDATE chunks SET tsv_pl = to_tsvector('simple', unaccent(text)) "
            "WHERE lang = 'pl'"))
        s.commit()

        from sqlalchemy import func
        by_lang = dict(s.execute(
            select(Chunk.lang, func.count()).group_by(Chunk.lang)).all())
        print(f"проіндексовано: {by_lang}")


if __name__ == "__main__":
    main()
