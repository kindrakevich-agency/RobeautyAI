"""Детермінована екстракція з лендінгів: ціни, SKU, варіанти, фото, об'єм.

Tilda-сторінки — div-суп без семантики, тож спираємось на інваріанти:
- лінк «До кошику» має формат `#order:Назва [sku:00-XXXXXXXX]=ЦІНА` —
  найнадійніше джерело «SKU → актуальна ціна» на сторінці;
- закреслена стара ціна набрана комбінованим U+0336 (`9̶9̶0̶`);
- кілька #order-лінків на сторінці = варіанти товару (аромат, інтенсивність).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from bs4 import BeautifulSoup

ORDER_RE = re.compile(
    r"#order:(?P<name>[^\[\]=]{1,120}?)\s*\[sku:(?P<sku>[0-9A-Za-z-]+)\]=(?P<price>\d+(?:\.\d+)?)"
)
STRIKE_RE = re.compile(r"(?:\d̶)+\d?")
VOLUME_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(ml|мл|g|г|шт)\b", re.I)
VARIANT_RE = re.compile(r"[•·]\s*(?P<label>[^•·\[]{2,60})$")


@dataclass
class LandingData:
    url: str
    title: str = ""
    variants: list[dict] = field(default_factory=list)  # {sku, price, label}
    old_prices: list[float] = field(default_factory=list)
    images: list[str] = field(default_factory=list)
    volume: str | None = None
    body_text: str = ""


def _strike_to_number(s: str) -> float | None:
    digits = s.replace("̶", "")
    try:
        return float(digits)
    except ValueError:
        return None


def parse_landing(url: str, html: str) -> LandingData:
    soup = BeautifulSoup(html, "lxml")
    data = LandingData(url=url)

    title = soup.find("title")
    data.title = (title.get_text(strip=True) if title else "").split("|")[0].strip()

    # Варіанти з #order-лінків: шукаємо і в href, і в тексті сторінки —
    # Tilda інколи кладе їх у js-конфіг кнопки, а не в атрибут.
    seen_skus: set[str] = set()
    for m in ORDER_RE.finditer(html):
        sku = m.group("sku")
        if sku in seen_skus:
            continue
        seen_skus.add(sku)
        name = m.group("name").strip()
        vm = VARIANT_RE.search(name)
        data.variants.append({
            "sku": sku,
            "price": float(m.group("price")),
            "label": vm.group("label").strip() if vm else None,
            "order_name": name,
        })

    text = soup.get_text(" ", strip=True)
    data.body_text = re.sub(r"\s+", " ", text)[:20000]

    for sm in STRIKE_RE.finditer(text):
        v = _strike_to_number(sm.group(0))
        if v and 10 <= v <= 100000:
            data.old_prices.append(v)

    for img in soup.select("img"):
        src = img.get("data-original") or img.get("src") or ""
        if "tildacdn" in src and src not in data.images:
            data.images.append(src)

    vol = VOLUME_RE.search(data.title) or VOLUME_RE.search(text[:3000])
    if vol:
        data.volume = f"{vol.group(1)} {vol.group(2)}".replace(",", ".")

    return data
