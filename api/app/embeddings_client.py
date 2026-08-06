"""Клієнт ембедінгів: TEI (self-hosted bge-m3) як основний провайдер.

bge-m3 — мультимовна модель: українські й польські тексти лягають в ОДИН
векторний простір, тож польське питання знаходить український чанк без
перекладу. Це і є причина вибору моделі.
"""

from __future__ import annotations

import httpx

from . import config


def embed(texts: list[str], batch: int = 24) -> list[list[float]]:
    out: list[list[float]] = []
    with httpx.Client(timeout=180) as client:
        for i in range(0, len(texts), batch):
            part = [t[:6000] for t in texts[i:i + batch]]
            r = client.post(f"{config.EMBEDDINGS_URL}/embed",
                            json={"inputs": part, "truncate": True})
            r.raise_for_status()
            out.extend(r.json())
    return out
