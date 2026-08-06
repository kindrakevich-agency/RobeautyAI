"""LLM-екстракція структурованих полів товару з тексту лендінга.

Порожнє поле — null, вигадувати заборонено промптом і перевіряється схемою.
Фейли валідації не валять прогін — пишуться в data/extract_errors.jsonl.
"""

from __future__ import annotations

import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

import httpx
from pydantic import BaseModel, ValidationError

from .. import config

PROMPT = """Ти витягуєш структуровані дані про косметичний засіб з тексту
його сторінки. Використовуй ТІЛЬКИ те, що прямо написано в тексті.
Якщо чогось немає — постав null або порожній список. НЕ вигадуй.

Текст сторінки:
{body}

Поверни ТІЛЬКИ JSON за схемою:
{{
 "active_ingredients": ["..."],
 "full_composition": "рядок INCI або null",
 "skin_type": ["суха"|"жирна"|"комбінована"|"нормальна"|"чутлива"],
 "skin_concerns": ["зморшки", "сухість", "целюліт", "темні кола", ...],
 "how_to_use": "як застосовувати або null",
 "when_to_use": "ранок"|"вечір"|"ранок і вечір"|null,
 "combine_with": ["..."],
 "do_not_combine_with": ["..."],
 "contraindications": "або null",
 "faq": [{{"q": "...", "a": "..."}}],
 "marketing_claims": ["..."],
 "texture": "або null",
 "extraction_confidence": "high"|"low"
}}"""


class Details(BaseModel):
    active_ingredients: list[str] = []
    full_composition: str | None = None
    skin_type: list[str] = []
    skin_concerns: list[str] = []
    how_to_use: str | None = None
    when_to_use: str | None = None
    combine_with: list[str] = []
    do_not_combine_with: list[str] = []
    contraindications: str | None = None
    faq: list[dict] = []
    marketing_claims: list[str] = []
    texture: str | None = None
    extraction_confidence: str = "low"


def _call(client: httpx.Client, body: str) -> Details:
    r = client.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {config.OPENAI_API_KEY}"},
        json={
            "model": config.MODEL_LITE,
            "messages": [{"role": "user", "content": PROMPT.format(body=body[:14000])}],
            "max_completion_tokens": 4500,
            "response_format": {"type": "json_object"},
        },
        timeout=120,
    )
    r.raise_for_status()
    txt = r.json()["choices"][0]["message"]["content"]
    return Details.model_validate_json(txt)


def extract_batch(items: list[tuple[str, str]], parallel: int = 4) -> dict[str, dict]:
    """[(url, body_text)] → url → details. Помилки — в extract_errors.jsonl."""
    out: dict[str, dict] = {}
    errors = []
    with httpx.Client() as client:
        with ThreadPoolExecutor(max_workers=parallel) as pool:
            futures = {pool.submit(_call, client, body): url for url, body in items}
            for i, fut in enumerate(as_completed(futures), 1):
                url = futures[fut]
                try:
                    out[url] = fut.result().model_dump()
                except (httpx.HTTPError, ValidationError, json.JSONDecodeError) as e:
                    errors.append({"url": url, "error": str(e)[:300]})
                print(f"  екстракція {i}/{len(items)}", file=sys.stderr)
    if errors:
        with open(config.DATA_DIR / "extract_errors.jsonl", "a", encoding="utf-8") as f:
            for e in errors:
                f.write(json.dumps(e, ensure_ascii=False) + "\n")
    return out
