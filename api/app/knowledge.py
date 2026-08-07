"""Шар експертизи бренду.

Навіщо. Заміряно на золотому наборі: на питання «чи можна поєднувати
ніацинамід з кислотами» пошук повертав п'ять карток товарів із ніацинамідом
і жодної відповіді на саме питання. У базі знань лежать сторінки товарів,
але немає того, що знає консультант: як діє складник, з чим його не
поєднують, у якому порядку йде догляд, що брати під тип шкіри.

Звідки береться. Нічого не вигадуємо. Джерела рівно два:
  * структуровані поля товарів (`details`), витягнуті на етапі M0 —
    активи, тип шкіри, проблеми, застосування, сумісність, застереження;
  * описи товарів того ж бренду.
Агрегація детермінована; LLM лише переказує наданий текст і має пряму
заборону додавати факти, яких у ньому немає. Порожнє поле краще за
правдоподібне припущення — на демо-стенді вигадана порада про сумісність
активів коштувала б довіри до всієї системи.

Картки лягають у таблицю `pages` з посиланням на реальну сторінку бренду,
тож у «Джерелах» під відповіддю вони клікабельні.

Запуск: python -m app.knowledge
"""

from __future__ import annotations

import re
import sys
from collections import defaultdict

from sqlalchemy import delete, select

from . import db, llm
from .models import Page, Product, ProductI18n

KB_PREFIX = "#kb-"

EXPLAIN = """Ти пишеш довідку для консультанта косметичного бренду RoBeauty.

Складник: {name}

Нижче — ВЛАСНІ тексти бренду про засоби з цим складником. Спираючись
ВИКЛЮЧНО на них, напиши коротку довідку.

ЖОРСТКЕ ПРАВИЛО: не додавай жодного факту, якого немає в текстах нижче.
Не бери знання «із загального». Якщо про щось не сказано — просто не пиши
про це. Краще коротка довідка, ніж правдоподібна вигадка.

Тексти бренду:
{texts}

Поверни ТІЛЬКИ JSON:
{{"what": "1-2 речення: що це і на що діє — лише з текстів",
  "for_whom": "кому підходить за текстами, або порожній рядок",
  "how": "як застосовувати за текстами, або порожній рядок"}}"""


def _slug(s: str) -> str:
    s = re.sub(r"[^\w\s-]", "", s.lower()).strip()
    return re.sub(r"[\s_]+", "-", s)[:40] or "kb"


# Латиниця й кирилиця — це той самий складник, але різні рядки, тож без
# зведення виходили дві половинчасті картки замість однієї повної.
# Тут лише транслітерації назв, жодних змістовних припущень.
ALIASES = {
    "niacinamide": "ніацинамід", "niacynamid": "ніацинамід",
    "retinol": "ретинол", "retinal": "ретинол",
    "hydroxypinacolone retinoate": "ретинол",
    "bakuchiol": "бакучіол",
    "squalane": "сквалан", "squalan": "сквалан",
    "ceramide": "кераміди", "ceramides": "кераміди",
    "ceramide complex": "кераміди", "ceramide complex+": "кераміди",
    "hyaluronic acid": "гіалуронова кислота",
    "sodium hyaluronate": "гіалуронова кислота",
    "panthenol": "пантенол", "d-panthenol": "пантенол",
    "centella asiatica": "центела", "centella": "центела",
    "ectoin": "ектоїн", "ectoine": "ектоїн",
    "vitamin c": "вітамін c", "ascorbic acid": "вітамін c",
    "vitamin e": "вітамін e", "tocopherol": "вітамін e",
    "acetyl hexapeptide-8": "argireline",
    "argireline®": "argireline", "argirelin": "argireline",
    "peptide": "пептиди", "peptides": "пептиди",
    "allantoin": "алантоїн", "urea": "сечовина",
    "salicylic acid": "саліцилова кислота", "bha": "саліцилова кислота",
    "glycolic acid": "гліколева кислота", "aha": "фруктові кислоти",
    "collagen": "колаген", "glycerin": "гліцерин",
}


def _norm(x: str) -> str:
    """«Niacinamide 6%», «ніацинамід» → один ключ."""
    x = re.sub(r"\d+([.,]\d+)?\s*%", "", x or "").strip(" ,.;·—-")
    x = re.sub(r"\s+", " ", x).lower()
    return ALIASES.get(x, x)


def _load() -> tuple[list[Product], dict[int, ProductI18n]]:
    with db.get_session() as s:
        products = s.scalars(select(Product)).all()
        titles = {r.product_id: r for r in s.scalars(
            select(ProductI18n).where(ProductI18n.lang == "uk"))}
        for p in products:
            _ = p.details, p.landing_url, p.sku, p.price, p.volume
    return products, titles


def _card(title: str, url: str, body: str) -> dict:
    return {"title": title, "url": url, "body": body}


# ---------- 1. складники ----------

def ingredient_cards(products, titles, use_llm: bool) -> list[dict]:
    """Одна картка на активний складник, що трапляється мінімум у двох засобах."""
    by_ing: dict[str, list] = defaultdict(list)
    display: dict[str, str] = {}
    for p in products:
        for raw in (p.details or {}).get("active_ingredients") or []:
            k = _norm(raw)
            if len(k) < 3:
                continue
            display.setdefault(k, raw.strip())
            by_ing[k].append(p)

    cards = []
    for k, items in sorted(by_ing.items(), key=lambda x: -len(x[1])):
        if len(items) < 2:
            continue
        name = display[k]
        lines = [f"{name}: довідка бренду RoBeauty"]

        # Правила — дослівно з полів товарів, без переказу.
        rules: dict[str, set[str]] = defaultdict(set)
        for p in items:
            d = p.details or {}
            for field, label in (("when_to_use", "Коли застосовувати"),
                                 ("how_to_use", "Як застосовувати"),
                                 ("contraindications", "Застереження")):
                v = d.get(field)
                if isinstance(v, str) and v.strip():
                    rules[label].add(v.strip())
            for field, label in (("combine_with", "Поєднується з"),
                                 ("do_not_combine_with", "НЕ поєднувати з")):
                for v in d.get(field) or []:
                    if isinstance(v, str) and v.strip():
                        rules[label].add(v.strip())

        if use_llm:
            texts = "\n---\n".join(
                (titles[p.id].title if p.id in titles else p.sku) + ": "
                + (titles[p.id].description if p.id in titles else "")[:900]
                for p in items[:6])
            try:
                out = llm.chat_json([{"role": "user", "content": EXPLAIN.format(
                    name=name, texts=texts[:6000])}],
                    purpose="knowledge", max_tokens=500)
                for key, label in (("what", "Що це"), ("for_whom", "Кому підходить"),
                                   ("how", "Як застосовувати")):
                    v = (out or {}).get(key)
                    if isinstance(v, str) and v.strip():
                        lines.append(f"{label}: {v.strip()}")
            except Exception as e:  # noqa: BLE001
                print(f"    довідка «{name}» не вдалася: {str(e)[:80]}", file=sys.stderr)

        for label in ("Коли застосовувати", "Як застосовувати",
                      "Поєднується з", "НЕ поєднувати з", "Застереження"):
            if rules.get(label):
                lines.append(f"{label}: " + "; ".join(sorted(rules[label])[:6]))

        lines.append("Засоби бренду з цим складником: " + ", ".join(
            (titles[p.id].title if p.id in titles else p.sku) for p in items[:10]))

        url = next((p.landing_url for p in items if p.landing_url), None)
        if not url:
            continue
        cards.append(_card(f"{name} — довідка", url + KB_PREFIX + _slug(k),
                           "\n".join(lines)))
    return cards


# ---------- 2. тип шкіри й проблема ----------

def facet_cards(products, titles, field: str, kind: str) -> list[dict]:
    """Картка «що бренд пропонує під X» — чиста агрегація, без LLM."""
    by: dict[str, list] = defaultdict(list)
    display: dict[str, str] = {}
    for p in products:
        for raw in (p.details or {}).get(field) or []:
            k = _norm(raw)
            if len(k) < 3:
                continue
            display.setdefault(k, raw.strip())
            by[k].append(p)

    cards = []
    for k, items in by.items():
        if len(items) < 2:
            continue
        name = display[k]
        head = (f"Догляд для типу шкіри «{name}» у каталозі RoBeauty"
                if kind == "skin" else
                f"Що бренд RoBeauty пропонує при проблемі «{name}»")
        lines = [head]
        for p in sorted(items, key=lambda x: x.price)[:14]:
            t = titles[p.id].title if p.id in titles else p.sku
            bits = [t, f"{int(p.price)} грн"]
            if p.volume:
                bits.append(str(p.volume))
            acts = (p.details or {}).get("active_ingredients") or []
            if acts:
                bits.append("активи: " + ", ".join(acts[:3]))
            lines.append(" — ".join(bits))
        url = next((p.landing_url for p in items if p.landing_url), None)
        if not url:
            continue
        cards.append(_card(head, url + KB_PREFIX + kind + "-" + _slug(k),
                           "\n".join(lines)))
    return cards


# ---------- 3. рутини з наборів ----------

SET_RE = re.compile(r"набір|набор|крок|BEAUTYBOX|комплекс|протокол|рутин|"
                    r"zestaw|krok", re.I)


def routine_cards(products, titles) -> list[dict]:
    """Набори бренду — це і є готові рутини, розписані ним самим."""
    cards = []
    for p in products:
        t = titles[p.id].title if p.id in titles else p.sku
        d = p.details or {}
        is_set = bool(SET_RE.search(t)) or (p.volume or "").strip().lower() in {
            "набір", "набор", "zestaw"}
        if not is_set or not p.landing_url:
            continue
        lines = [f"Готова рутина RoBeauty: {t}",
                 f"Ціна набору: {int(p.price)} грн"]
        desc = (titles[p.id].description if p.id in titles else "") or ""
        if desc.strip():
            lines.append(desc.strip()[:1200])
        for field, label in (("skin_type", "Для типу шкіри"),
                             ("skin_concerns", "Вирішує"),
                             ("active_ingredients", "Активи")):
            v = d.get(field)
            if v:
                lines.append(f"{label}: " + ", ".join(v[:8]))
        for field, label in (("how_to_use", "Порядок застосування"),
                             ("when_to_use", "Коли"),
                             ("contraindications", "Застереження")):
            v = d.get(field)
            if isinstance(v, str) and v.strip():
                lines.append(f"{label}: {v.strip()}")
        if len(lines) < 4:
            continue
        cards.append(_card(f"Рутина: {t}",
                           p.landing_url + KB_PREFIX + "routine",
                           "\n".join(lines)))
    return cards


# ---------- запуск ----------

def main() -> None:
    use_llm = "--no-llm" not in sys.argv
    products, titles = _load()
    print(f"товарів: {len(products)}", file=sys.stderr)

    cards = []
    cards += facet_cards(products, titles, "skin_type", "skin")
    cards += facet_cards(products, titles, "skin_concerns", "concern")
    cards += routine_cards(products, titles)
    print(f"агреговані картки: {len(cards)}", file=sys.stderr)
    cards += ingredient_cards(products, titles, use_llm)
    print(f"усього карток: {len(cards)}", file=sys.stderr)

    with db.get_session() as s:
        # Перегенерація ідемпотентна: старі картки прибираємо за міткою в URL.
        old = s.scalars(select(Page).where(Page.url.contains(KB_PREFIX))).all()
        if old:
            s.execute(delete(Page).where(Page.url.contains(KB_PREFIX)))
            s.commit()
            print(f"прибрано старих карток: {len(old)}", file=sys.stderr)
        seen = set()
        for c in cards:
            if c["url"] in seen:
                continue
            seen.add(c["url"])
            s.add(Page(url=c["url"], title=c["title"], body_text=c["body"],
                       lang="uk"))
        s.commit()
    print(f"записано карток знань: {len(seen)}")


if __name__ == "__main__":
    main()
