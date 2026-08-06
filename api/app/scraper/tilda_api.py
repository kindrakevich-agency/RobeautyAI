"""Каталог із Tilda Store API.

Публічний ендпоінт, той самий, що викликає сторінка /products у браузері.
Класичний хост store.tildaapi.com для цього магазину відповідає
{"redirectto":"one"} — робочий шард store.tildaapi.one.

Editions — це варіанти товару (аромат, інтенсивність, об'єм): кожен зі своїм
SKU, ціною і фото, плюс уже структуровані атрибути на кшталт «Проблема:» і
«Зона нанесення:». Це найякісніше джерело «SKU → ціна», лендінги його лише
доповнюють описами.
"""

from __future__ import annotations

import json
import time

import httpx

from .. import config


def fetch_storepart(client: httpx.Client, part_uid: str) -> list[dict]:
    products: list[dict] = []
    offset = 0
    while True:
        r = client.get(
            config.STORE_API,
            params={
                "storepartuid": part_uid,
                "recid": config.STORE_RECID,
                "c": str(int(time.time() * 1000)),
                "getparts": "true",
                "getoptions": "true",
                "size": "100",
                "from": str(offset),
            },
        )
        r.raise_for_status()
        data = r.json()
        batch = data.get("products", [])
        products.extend(batch)
        total = int(data.get("total") or 0)
        offset += len(batch)
        if not batch or offset >= total:
            break
        time.sleep(config.RATE_LIMIT_SECONDS)
    return products


def fetch_catalog() -> dict:
    """Обидва сторпарти → дедуплікація по uid товару."""
    config.RAW_DIR.mkdir(parents=True, exist_ok=True)
    seen: dict[str, dict] = {}
    with httpx.Client(
        timeout=40,
        headers={"User-Agent": config.USER_AGENT},
        follow_redirects=True,
    ) as client:
        for name, uid in config.STORE_PARTS.items():
            items = fetch_storepart(client, uid)
            (config.RAW_DIR / f"store_api_{name}.json").write_text(
                json.dumps(items, ensure_ascii=False, indent=1), encoding="utf-8"
            )
            for p in items:
                key = str(p.get("uid"))
                entry = seen.setdefault(key, p)
                parts = set(entry.setdefault("_parts", []))
                parts.add(name)
                entry["_parts"] = sorted(parts)
            time.sleep(config.RATE_LIMIT_SECONDS)
    return seen
