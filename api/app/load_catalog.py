"""Завантаження data/catalog.json у Postgres. Ідемпотентно: upsert по SKU/URL.

Запуск: python -m app.load_catalog
"""

from __future__ import annotations

import json

from sqlalchemy import select

from . import config, db
from .models import Page, Product, ProductI18n


def main() -> None:
    catalog = json.loads((config.DATA_DIR / "catalog.json").read_text(encoding="utf-8"))
    with db.get_session() as s:
        for p in catalog["products"]:
            row = s.scalar(select(Product).where(Product.sku == p["sku"]))
            if row is None:
                row = Product(sku=p["sku"])
                s.add(row)
            row.landing_url = p.get("landing_url")
            row.source = p.get("source", "api")
            row.price = p.get("price") or 0
            row.old_price = p.get("old_price")
            row.upsell_price = p.get("upsell_price")
            row.volume = p.get("volume")
            row.variant_label = p.get("variant_label")
            row.images = [i for i in (p.get("images") or []) if i]
            row.category = p.get("category")
            row.details = p.get("details")
            row.extraction_confidence = p.get("extraction_confidence")
            row.raw = {"attrs_api": p.get("attrs_api"), "raw_uid": p.get("raw_uid")}
            s.flush()
            i18n = s.scalar(select(ProductI18n).where(
                ProductI18n.product_id == row.id, ProductI18n.lang == "uk"))
            if i18n is None:
                i18n = ProductI18n(product_id=row.id, lang="uk", status="source",
                                   title="", description="")
                s.add(i18n)
            i18n.title = p.get("title") or p["sku"]
            i18n.description = p.get("text_api") or p.get("descr_api") or ""
        for pg in catalog["pages"]:
            row = s.scalar(select(Page).where(Page.url == pg["url"]))
            if row is None:
                row = Page(url=pg["url"])
                s.add(row)
            row.title = pg.get("title")
            row.body_text = pg.get("body_text") or ""
        s.commit()
        from sqlalchemy import func
        n_p = s.scalar(select(func.count()).select_from(Product))
        n_pg = s.scalar(select(func.count()).select_from(Page))
    print(f"каталог завантажено: products={n_p}, pages={n_pg}")


if __name__ == "__main__":
    main()
