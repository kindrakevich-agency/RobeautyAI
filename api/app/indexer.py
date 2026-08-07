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


# ---------- наскрізний шаблон сайту ----------
#
# Меню, підвал, телефони, банер доставки й години роботи стоять на 133–147
# сторінках зі 155 — це 20% усього тексту. У векторі вони дають спільну
# складову для всіх сторінок, тож косинуси тиснуться у вузьку смугу
# (заміряно: 0.59–0.66 на всіх питаннях) і пошук перестає розрізняти
# товари. Тому фрагменти, що трапляються більш ніж на BOILER_MIN_PAGES
# сторінках, вирізаються з тіла — а те з них, що справді потрібне клієнту
# (доставка, оплата, контакти), збирається в один окремий документ.

BOILER_MIN_PAGES = 5

SERVICE_RE = re.compile(
    r"доставк|оплат|контакт|графік|телефон|повернен|гаранті|нова пошта|"
    r"замовлен|політик|dostaw|płatnoś|kontakt", re.I)

_SENT_RE = re.compile(r"(?<=[.!?…])\s+|(?<=\S)\s*(?=[А-ЯІЇЄA-Z][а-яіїєa-z]{4,})")


def _fragments(body: str) -> list[str]:
    """Тіло сторінки — на фрагменти речення-довжини."""
    body = re.sub(r"\s+", " ", body or "").strip()
    return [x.strip() for x in _SENT_RE.split(body) if x.strip()]


def boilerplate(bodies: list[str]) -> set[str]:
    """Фрагменти, які повторюються більш ніж на BOILER_MIN_PAGES сторінках."""
    from collections import Counter
    c: Counter = Counter()
    for b in bodies:
        for f in set(_fragments(b)):
            if len(f) > 20:
                c[f] += 1
    return {f for f, n in c.items() if n >= BOILER_MIN_PAGES}


def strip_boilerplate(body: str, boiler: set[str]) -> str:
    return " ".join(f for f in _fragments(body) if f not in boiler)


def service_document(boiler: set[str]) -> str:
    """Один документ із сервісної інформації, вирізаної з шаблону.

    Без нього питання «скільки коштує доставка» лишилося б без джерела:
    відповідь лежить рівно в тому тексті, який ми щойно прибрали.
    """
    picked = sorted({f for f in boiler if SERVICE_RE.search(f)}, key=len, reverse=True)
    return "Доставка, оплата й контакти RoBeauty\n" + "\n".join(picked[:40])


def split_page(body: str) -> list[str]:
    """Ріжемо по межах фрагментів, а не посеред слова.

    Раніше зріз ішов рівно на 1500 символів, тож чанки починалися з
    «ся по всьому світу» і «ори в Т-зоні» — такий початок псує і вектор,
    і те, що бачить суддя.
    """
    frags = _fragments(body)
    if not frags:
        return []
    out: list[str] = []
    cur: list[str] = []
    size = 0
    for f in frags:
        if size + len(f) > CHUNK_CHARS and cur:
            out.append(" ".join(cur))
            # перекриття теж по межі фрагмента
            tail, t = [], 0
            for x in reversed(cur):
                if t + len(x) > OVERLAP:
                    break
                tail.insert(0, x); t += len(x)
            cur, size = tail, t
        cur.append(f); size += len(f) + 1
    if cur:
        out.append(" ".join(cur))
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
        boiler = boilerplate([pg.body_text or "" for pg in pages])
        stripped = 0
        for pg in pages:
            clean = strip_boilerplate(pg.body_text or "", boiler)
            stripped += len(pg.body_text or "") - len(clean)
            for piece in split_page(clean):
                texts.append((pg.title or "") + "\n" + piece)
                metas.append(("page", pg.id, "uk"))
        print(f"шаблонних фрагментів: {len(boiler)}; вирізано {stripped} симв.",
              file=sys.stderr)

        # Сервісна довідка одним документом — прив'язуємо до першої сторінки,
        # щоб у джерелах було коректне посилання.
        if pages:
            texts.append(service_document(boiler))
            metas.append(("page", pages[0].id, "uk"))

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
