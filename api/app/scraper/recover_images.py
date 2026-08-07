"""Відновлення фото для товарів, у яких Store API віддав логотип.

Проблема. Для 44 товарів зі 179 Tilda Store API не має власного зображення
й повертає замість нього логотип бренду (`robeauty-logo.svg`). У каталозі
й у чаті це виглядало як картка товару з логотипом на тлі.

Чому не можна просто взяти всі картинки з лендінга. На сторінках товарів
стоять апсел-блоки з фото ІНШИХ товарів — саме через них у попередньому
проєкті картки отримали чужі зображення.

Правило. Зображення належить цьому товару, якщо воно зустрічається лише
на його сторінці. Апсели за визначенням повторюються на багатьох сторінках,
тож рахуємо, на скількох сторінках трапляється кожен URL, і лишаємо
унікальні. Той самий принцип, що й для наскрізного шаблону тексту.

Запуск: python -m app.scraper.recover_images [--dry]
"""

from __future__ import annotations

import re
import sys
import time
from collections import Counter

import httpx
from sqlalchemy import select

from .. import config, db
from ..models import Product

JUNK = re.compile(r"logo|placeholder|\bicon\b|/icons?/|sprite", re.I)
THUMB = re.compile(r"-\d{2,3}x\d{2,3}\.")
IMG_RE = re.compile(
    r"""(?:data-original|data-img|src)=["'](https://[^"']+?\.(?:jpg|jpeg|png|webp))""",
    re.I)


def page_images(html: str) -> list[str]:
    """URL зображень у порядку появи, без дублів і мініатюр."""
    out, seen = [], set()
    for m in IMG_RE.finditer(html):
        u = m.group(1)
        if u in seen or JUNK.search(u) or THUMB.search(u):
            continue
        seen.add(u)
        out.append(u)
    return out


def fetch_all(urls: list[str]) -> dict[str, list[str]]:
    res: dict[str, list[str]] = {}
    with httpx.Client(timeout=40, follow_redirects=True,
                      headers={"User-Agent": config.USER_AGENT}) as c:
        for i, u in enumerate(urls, 1):
            try:
                r = c.get(u)
                if r.status_code == 200:
                    res[u] = page_images(r.text)
            except httpx.HTTPError as e:
                print(f"    {u}: {str(e)[:60]}", file=sys.stderr)
            if i % 25 == 0:
                print(f"    {i}/{len(urls)}", file=sys.stderr)
            time.sleep(0.15)  # не тиснемо на чужий сайт
    return res


def main() -> None:
    dry = "--dry" in sys.argv
    with db.get_session() as s:
        products = s.scalars(select(Product)).all()
        need = [p for p in products
                if not p.images or all(JUNK.search(i) for i in p.images)]
        urls = sorted({p.landing_url for p in products if p.landing_url})

    print(f"товарів без справжнього фото: {len(need)}; сторінок до обходу: {len(urls)}",
          file=sys.stderr)

    by_url = fetch_all(urls)

    # На скількох сторінках трапляється кожне зображення.
    df: Counter = Counter()
    for imgs in by_url.values():
        for u in set(imgs):
            df[u] += 1

    fixed = 0
    with db.get_session() as s:
        for p in s.scalars(select(Product)).all():
            if not (not p.images or all(JUNK.search(i) for i in p.images)):
                continue
            imgs = by_url.get(p.landing_url or "", [])
            own = [u for u in imgs if df[u] == 1][:8]
            if not own:
                continue
            print(f"  {p.sku}: {len(own)} фото  {own[0][:70]}")
            if not dry:
                p.images = own
                fixed += 1
        if not dry:
            s.commit()

    print(f"\nвідновлено фото у {fixed} товарів"
          + (" (пробний запуск, нічого не записано)" if dry else ""))


if __name__ == "__main__":
    main()
