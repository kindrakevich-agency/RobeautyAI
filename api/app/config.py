"""Конфігурація з env. Секрети в коді не з'являються ніколи."""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[2]  # корінь репозиторію
DATA_DIR = BASE_DIR / "data"
RAW_DIR = DATA_DIR / "raw"

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql+psycopg://robeauty:robeauty@localhost:5434/robeauty"
)

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
# Окремі моделі під окремі задачі — все з env, дефолти робочі.
MODEL_CHAT = os.environ.get("OPENAI_MODEL_CHAT", "gpt-5.4-mini")
MODEL_LITE = os.environ.get("OPENAI_MODEL_LITE", "gpt-5.4-mini")
MODEL_JUDGE = os.environ.get("OPENAI_MODEL_JUDGE", "gpt-4o")

EMBEDDINGS_URL = os.environ.get("EMBEDDINGS_URL", "http://localhost:8093")
EMBEDDINGS_PROVIDER = os.environ.get("EMBEDDINGS_PROVIDER", "tei")

# Скрапер
SITE = "https://robeauty.me"
STORE_API = "https://store.tildaapi.one/api/getproductslist/"
STORE_RECID = "742448472"
STORE_PARTS = {
    "catalog": "835858024320",     # основний каталог, ~104 позиції
    "bestsellers": "653242964584",  # добірка, підмножина каталогу
}
USER_AGENT = "RoBeautyDemoBot/1.0 (+kindrakevich.com; portfolio demo)"
RATE_LIMIT_SECONDS = 1.0

# Службові URL, які не є знаннями для консультанта
SITEMAP_EXCLUDE_PREFIXES = (
    "/policy", "/about-us", "/review", "/b2b-partners", "/termsua",
    "/gift-certificates", "/season-sale", "/thank", "/cart", "/search",
)
