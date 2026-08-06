"""Єдина точка викликів LLM + облік токенів у api_usage.

Кожен виклик пише рядок обліку: purpose, модель, токени, вартість.
Ставки за 1M токенів — з env, щоб дашборд показував живі цифри.
"""

from __future__ import annotations

import json
import os

import httpx
from sqlalchemy import text as sql

from . import config, db

# USD за 1M токенів (input, output); перевизначаються env-вáрами RATE_<MODEL>
DEFAULT_RATES = {
    "gpt-5.4-mini": (0.25, 2.00),
    "gpt-4o": (2.50, 10.00),
}


def _rate(model: str) -> tuple[float, float]:
    env = os.environ.get(f"RATE_{model.replace('-', '_').replace('.', '_').upper()}")
    if env:
        i, o = env.split(":")
        return float(i), float(o)
    for known, r in DEFAULT_RATES.items():
        if model.startswith(known):
            return r
    return (1.0, 4.0)


def _log_usage(purpose: str, model: str, usage: dict) -> None:
    try:
        i = int(usage.get("prompt_tokens") or 0)
        o = int(usage.get("completion_tokens") or 0)
        ri, ro = _rate(model)
        cost = i / 1e6 * ri + o / 1e6 * ro
        with db.engine.begin() as conn:
            conn.execute(sql(
                "INSERT INTO api_usage (purpose, model, input_tokens, output_tokens, cost_usd, created_at) "
                "VALUES (:p, :m, :i, :o, :c, now())"),
                {"p": purpose, "m": model, "i": i, "o": o, "c": cost})
    except Exception:  # облік не має валити бізнес-виклик
        pass


def chat(messages: list[dict], *, purpose: str, model: str | None = None,
         json_mode: bool = False, max_tokens: int = 1500) -> str:
    model = model or config.MODEL_CHAT
    body: dict = {
        "model": model,
        "messages": messages,
        "max_completion_tokens": max_tokens,
    }
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    r = httpx.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {config.OPENAI_API_KEY}"},
        json=body, timeout=180,
    )
    r.raise_for_status()
    data = r.json()
    _log_usage(purpose, model, data.get("usage") or {})
    return data["choices"][0]["message"]["content"]


def chat_json(messages: list[dict], *, purpose: str, model: str | None = None,
              max_tokens: int = 1500) -> dict:
    txt = chat(messages, purpose=purpose, model=model or config.MODEL_LITE,
               json_mode=True, max_tokens=max_tokens)
    return json.loads(txt)
