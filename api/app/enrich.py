"""Заповнення структурованих полів товару (`details`) для наявного каталогу.

Навіщо окремий крок. Екстракція була частиною скрапера (крок 4/4), але в
базі `details` порожній у всіх 179 товарів — крок не відпрацював, і цього
ніхто не помітив, бо решта каталогу виглядала цілою. Наслідки серйозні:

  * товарні чанки збиралися без активів, типу шкіри, проблем, правил
    застосування й сумісності — тобто рівно без того, за чим шукають;
  * картки товару в чаті не показували складники;
  * шар експертизи (`app/knowledge.py`) не мав із чого будуватися й дав нуль карток.

Тут екстракція запускається окремо, по вже завантаженому каталогу, без
повторного скрапінгу: джерело — власний опис товару з бази плюс, якщо є,
текст його сторінки.

Запуск: python -m app.enrich [--limit N] [--only-empty]
"""

from __future__ import annotations

import sys
import time

import httpx
from sqlalchemy import select

from . import config, db
from .models import Page, Product, ProductI18n
from .scraper.extract import parse_landing
from .scraper.llm_extract import _call


def main() -> None:
    only_empty = "--only-empty" in sys.argv
    limit = None
    for i, a in enumerate(sys.argv):
        if a == "--limit" and i + 1 < len(sys.argv):
            limit = int(sys.argv[i + 1])

    with db.get_session() as s:
        products = s.scalars(select(Product)).all()
        titles = {r.product_id: r for r in s.scalars(
            select(ProductI18n).where(ProductI18n.lang == "uk"))}
        pages = {(pg.url or "").rstrip("/"): pg.body_text
                 for pg in s.scalars(select(Page)).all()}
        todo = [p for p in products if not (only_empty and p.details)]
        if limit:
            todo = todo[:limit]
        meta = [(p.id, p.landing_url,
                 titles[p.id].title if p.id in titles else p.sku,
                 titles[p.id].description if p.id in titles else "",
                 pages.get((p.landing_url or "").rstrip("/")),
                 p.volume, p.variant_label, (p.raw or {}).get("attrs_api") or {})
                for p in todo]

    # Сторінки товарів у базі не зберігаються (у `pages` лежать лише
    # нетоварні), а без їхнього тексту екстракція читає сам заголовок і
    # повертає порожні поля. Тому відсутні сторінки довантажуємо.
    need = [(i, url) for i, (_, url, *_rest) in enumerate(meta) if url and not _rest[2]]
    if need:
        print(f"довантажую сторінок: {len(need)}", file=sys.stderr)
        with httpx.Client(timeout=40, follow_redirects=True,
                          headers={"User-Agent": config.USER_AGENT}) as c:
            for k, (idx, url) in enumerate(need, 1):
                try:
                    r = c.get(url)
                    if r.status_code == 200:
                        body = parse_landing(url, r.text).body_text
                        m = list(meta[idx]); m[4] = body; meta[idx] = tuple(m)
                except httpx.HTTPError as e:
                    print(f"    {url}: {str(e)[:60]}", file=sys.stderr)
                if k % 25 == 0:
                    print(f"    {k}/{len(need)}", file=sys.stderr, flush=True)
                time.sleep(0.15)

    prepared = []
    for pid, _url, title, descr, page_text, volume, variant, attrs in meta:
        parts = [title]
        if volume:
            parts.append(f"Об'єм: {volume}")
        if variant:
            parts.append(variant)
        for k, v in attrs.items():
            parts.append(f"{k} {v}")
        if descr:
            parts.append(descr)
        if page_text:
            parts.append(page_text[:9000])
        prepared.append((pid, "\n".join(str(x) for x in parts if x)))

    print(f"товарів до обробки: {len(prepared)}", file=sys.stderr)
    ok = fail = 0
    t0 = time.monotonic()
    with httpx.Client() as client:
        for n, (pid, body) in enumerate(prepared, 1):
            try:
                d = _call(client, body).model_dump()
            except Exception as e:  # noqa: BLE001
                fail += 1
                print(f"  {pid}: {str(e)[:90]}", file=sys.stderr)
                continue
            conf = d.pop("extraction_confidence", "low")
            with db.get_session() as s:
                row = s.get(Product, pid)
                if row is not None:
                    row.details = d
                    row.extraction_confidence = conf
                    s.commit()
            ok += 1
            if n % 10 == 0:
                print(f"  {n}/{len(prepared)} ({time.monotonic() - t0:.0f} с)",
                      file=sys.stderr, flush=True)

    print(f"заповнено: {ok}, помилок: {fail}")


if __name__ == "__main__":
    main()
