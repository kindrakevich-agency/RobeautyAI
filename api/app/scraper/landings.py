"""Sitemap і продуктові лендінги robeauty.me.

Кеш на диску обов'язковий: повторний прогін читає файли, а не сайт.
Ліміт 1 запит/секунду, чесний User-Agent.
"""

from __future__ import annotations

import hashlib
import time
from xml.etree import ElementTree

import httpx

from .. import config

NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}


def cache_path(url: str):
    h = hashlib.sha1(url.encode()).hexdigest()[:16]
    slug = url.rstrip("/").split("/")[-1][:60] or "index"
    return config.RAW_DIR / "landings" / f"{slug}.{h}.html"


def is_content_url(url: str) -> bool:
    if not url.startswith(config.SITE):
        return False
    path = url[len(config.SITE):] or "/"
    return not any(path.startswith(p) for p in config.SITEMAP_EXCLUDE_PREFIXES)


def fetch_sitemap_urls(client: httpx.Client) -> list[str]:
    r = client.get(f"{config.SITE}/sitemap.xml")
    r.raise_for_status()
    (config.RAW_DIR / "sitemap.xml").write_bytes(r.content)
    tree = ElementTree.fromstring(r.content)
    urls = [loc.text.strip() for loc in tree.iterfind(".//sm:loc", NS) if loc.text]
    return sorted(u for u in urls if is_content_url(u))


def fetch_landings(urls: list[str]) -> dict[str, str]:
    """url → шлях до кешованого HTML. Хиби мережі не валять прогін."""
    (config.RAW_DIR / "landings").mkdir(parents=True, exist_ok=True)
    out: dict[str, str] = {}
    with httpx.Client(
        timeout=40,
        headers={"User-Agent": config.USER_AGENT},
        follow_redirects=True,
    ) as client:
        for url in urls:
            path = cache_path(url)
            if path.exists() and path.stat().st_size > 500:
                out[url] = str(path)
                continue
            try:
                r = client.get(url)
                if r.status_code == 200 and len(r.text) > 500:
                    path.write_text(r.text, encoding="utf-8")
                    out[url] = str(path)
            except httpx.HTTPError:
                pass
            time.sleep(config.RATE_LIMIT_SECONDS)
    return out
