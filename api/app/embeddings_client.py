"""Клієнт ембедінгів: TEI (self-hosted bge-m3) як основний провайдер.

bge-m3 — мультимовна модель: українські й польські тексти лягають в ОДИН
векторний простір, тож польське питання знаходить український чанк без
перекладу. Це і є причина вибору моделі.
"""

from __future__ import annotations

import httpx

from . import config


def embed(texts: list[str], batch: int = 24,
          progress: bool = False) -> list[list[float]]:
    """progress=True друкує хід — індексація каталогу довга, і без цього
    неможливо відрізнити повільний прогон від зависання."""
    import sys
    import time
    out: list[list[float]] = []
    t0 = time.monotonic()
    with httpx.Client(timeout=180) as client:
        for i in range(0, len(texts), batch):
            part = [t[:6000] for t in texts[i:i + batch]]
            r = client.post(f"{config.EMBEDDINGS_URL}/embed",
                            json={"inputs": part, "truncate": True})
            r.raise_for_status()
            out.extend(r.json())
            if progress:
                done = min(i + batch, len(texts))
                print(f"    ембедінги {done}/{len(texts)} "
                      f"({time.monotonic() - t0:.0f} с)", file=sys.stderr, flush=True)
    return out
