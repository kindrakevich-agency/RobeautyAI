"""Оркестратор M0: API + лендінги → злиття по SKU → data/catalog.json.

Запуск:  python -m app.scraper.run [--skip-llm]

Результат:
  data/raw/…        сирі відповіді API і HTML лендінгів (кеш)
  data/catalog.json нормалізований каталог: products + pages
"""

from __future__ import annotations

import json
import sys

from .. import config
from . import extract, landings, tilda_api


def _num(v) -> float:
    """Ціни Tilda приходять рядками з пробілами-роздільниками: '1 260.00'."""
    if v is None:
        return 0.0
    s = str(v).replace(" ", "").replace(" ", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def main() -> None:
    skip_llm = "--skip-llm" in sys.argv
    config.RAW_DIR.mkdir(parents=True, exist_ok=True)

    print("1/4 Store API…", file=sys.stderr)
    api_products = tilda_api.fetch_catalog()
    print(f"    товарів в API: {len(api_products)}", file=sys.stderr)

    print("2/4 sitemap + лендінги…", file=sys.stderr)
    import httpx
    with httpx.Client(timeout=40, headers={"User-Agent": config.USER_AGENT}) as c:
        urls = landings.fetch_sitemap_urls(c)
    fetched = landings.fetch_landings(urls)
    print(f"    сторінок: {len(fetched)} з {len(urls)}", file=sys.stderr)

    print("3/4 детермінована екстракція…", file=sys.stderr)
    parsed: dict[str, extract.LandingData] = {}
    for url, path in fetched.items():
        with open(path, encoding="utf-8") as f:
            parsed[url] = extract.parse_landing(url, f.read())

    # Злиття: основа — editions з API (SKU/ціна/атрибути), лендінг додає
    # описи, старі ціни, варіант-лейбли й повний текст для RAG.
    products: dict[str, dict] = {}
    landing_by_url = {u.rstrip("/"): p for u, p in parsed.items()}
    for p in api_products.values():
        url = (p.get("url") or "").rstrip("/")
        ld = landing_by_url.get(url)
        for ed in p.get("editions") or [{}]:
            sku = ed.get("sku") or p.get("sku") or f"uid-{p.get('uid')}"
            attrs = {k: v for k, v in ed.items()
                     if isinstance(v, str) and k.endswith(":")}
            products[sku] = {
                "sku": sku,
                "title": p.get("title", ""),
                "landing_url": url or None,
                "source": "both" if ld else "api",
                "price": _num(ed.get("price") or p.get("price")),
                "old_price": _num(ed.get("priceold")) or None,
                "volume": (ld.volume if ld else None) or (p.get("descr") or None),
                "variant_label": ", ".join(f"{k[:-1]}: {v}" for k, v in attrs.items()) or None,
                "images": [ed.get("img")] if ed.get("img") else
                          [g.get("img") for g in (p.get("gallery") or []) if g.get("img")],
                "category": (p.get("_parts") or ["catalog"])[0],
                "descr_api": p.get("descr") or "",
                "text_api": p.get("text") or "",
                "attrs_api": attrs,
                "raw_uid": str(p.get("uid")),
            }

    # Той самий SKU живе в апсел-блоках чужих лендінгів і на головній із
    # промо-ціною, тож правило суворе: ціну товару переписує ТІЛЬКИ його
    # власний лендінг; згадки на інших сторінках ідуть у upsell_price.
    api_landing_urls = {p["landing_url"] for p in products.values() if p["landing_url"]}

    # SKU, чия власна сторінка не в API: головний #order-лінк сторінки —
    # той, чия назва перетинається із заголовком (сети, комплекти).
    def _main_variant(ld: extract.LandingData) -> dict | None:
        if not ld.variants:
            return None
        title_words = set(ld.title.lower().split())
        best = max(ld.variants, key=lambda v: len(
            set(v["order_name"].lower().split()) & title_words))
        return best

    for url, ld in parsed.items():
        u = url.rstrip("/")
        if u in api_landing_urls:
            continue
        mv = _main_variant(ld)
        if mv and mv["sku"] not in products:
            products[mv["sku"]] = {
                "sku": mv["sku"], "title": ld.title or mv["order_name"],
                "landing_url": u, "source": "landing",
                "price": mv["price"], "old_price": (ld.old_prices or [None])[0],
                "volume": ld.volume, "variant_label": mv["label"],
                "images": ld.images[:1], "category": "catalog",
                "descr_api": "", "text_api": "", "attrs_api": {}, "raw_uid": None,
            }

    # Ціна з власного лендінга + upsell-ціни з чужих сторінок.
    warnings = []
    own_landing = {p["landing_url"]: p for p in products.values() if p["landing_url"]}
    for url, ld in parsed.items():
        u = url.rstrip("/")
        owner = own_landing.get(u)
        for v in ld.variants:
            known = products.get(v["sku"])
            if not known:
                continue
            if owner is not None and known["landing_url"] == u:
                if abs(known["price"] - v["price"]) > 0.01:
                    warnings.append(
                        f"{v['sku']}: API {known['price']} ≠ власний лендінг {v['price']}")
                    known["price"] = v["price"]  # власна сторінка авторитетна
            elif v["price"] < known["price"] - 0.01:
                cur = known.get("upsell_price")
                if cur is None or v["price"] < cur:
                    known["upsell_price"] = v["price"]

    product_urls = {p["landing_url"] for p in products.values() if p["landing_url"]}
    pages = [
        {"url": url, "title": ld.title, "body_text": ld.body_text}
        for url, ld in parsed.items() if url.rstrip("/") not in product_urls
    ]

    if not skip_llm:
        print("4/4 LLM-екстракція details…", file=sys.stderr)
        from . import llm_extract
        bodies = [(u, ld.body_text) for u, ld in parsed.items()
                  if u.rstrip("/") in product_urls and ld.body_text]
        details = llm_extract.extract_batch(bodies)
        for p in products.values():
            d = details.get((p["landing_url"] or "") + "/") or details.get(p["landing_url"] or "")
            p["details"] = d
            p["extraction_confidence"] = (d or {}).get("extraction_confidence")
    else:
        print("4/4 LLM-екстракцію пропущено (--skip-llm)", file=sys.stderr)

    out = {"products": sorted(products.values(), key=lambda x: x["sku"]),
           "pages": pages, "warnings": warnings}
    (config.DATA_DIR / "catalog.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")

    cats = {p["category"] for p in products.values()}
    print(f"\nПідсумок M0: products={len(products)}, pages={len(pages)}, "
          f"категорій={len(cats)}, розбіжностей цін={len(warnings)}")


if __name__ == "__main__":
    main()
