"""RAG-ядро консультанта: гібридний пошук + grounding + ескалація.

Retrieval: pgvector kNN + повнотекст (tsv мови запиту), злиття RRF (k=60).
Якщо польських чанків мало (переклади ще в draft) — паралельний fallback на
українські: bge-m3 кладе обидві мови в один векторний простір, тож польське
питання знаходить український чанк, а модель відповідає польською.

Grounding: відповідь тільки з наданих чанків; коли найкращий збіг нижче
порога — чесне «не знаю» + пропозиція покликати людину, питання пишеться в
unanswered. Медичні питання (хвороби шкіри, вагітність, алергії) —
детермінована м'яка відмова з ескалацією, без участі моделі.
"""

from __future__ import annotations

import re
from pathlib import Path

from sqlalchemy import select, text as sql

from . import config, db, embeddings_client, llm
from .models import Chunk, Page, Product, ProductI18n, Unanswered

TOP_K = 8
CANDIDATES = 16
RRF_K = 60
GROUND_THRESHOLD = 0.42  # косинус bge-m3; нижче — «не знаю»

PROMPTS_DIR = Path(__file__).resolve().parents[1] / "prompts"

MEDICAL_RE = re.compile(
    r"вагітн|ваготн|годуванн|лактаці|екзем|псоріаз|дерматит|розацеа\b.*лік|"
    r"алергі|онколог|діагноз|ciąż|karmieni|egzem|łuszczyc|alergi|atopow",
    re.I)

REFUSAL = {
    "uk": ("Це питання стосується здоров'я, і чесна відповідь тут одна: його "
           "варто обговорити з дерматологом. Я передам розмову менеджеру — "
           "підкажемо, як діяти далі."),
    "pl": ("To pytanie dotyczy zdrowia — uczciwie mówiąc, najlepiej omówić je "
           "z dermatologiem. Przekażę rozmowę do naszego zespołu, podpowiemy "
           "kolejne kroki."),
}

DONT_KNOW = {
    "uk": ("Чесно: у моїй базі знань немає надійної відповіді на це питання. "
           "Можу покликати людину — менеджер відповість особисто."),
    "pl": ("Szczerze: w mojej bazie wiedzy nie ma pewnej odpowiedzi na to "
           "pytanie. Mogę poprosić o pomoc człowieka — doradca odpowie osobiście."),
}


def detect_lang(text: str) -> str:
    """Швидка евристика: польська діакритика/диграфи → pl, кирилиця → uk.
    Непевні випадки вирішує LLM-класифікація одним коротким викликом."""
    if re.search(r"[ąćęłńóśźż]", text, re.I):
        return "pl"
    if re.search(r"[а-щьюяїієґ]", text, re.I):
        return "uk"
    try:
        out = llm.chat_json([{"role": "user", "content":
            f'Мова тексту: "{text[:200]}". Поверни JSON {{"lang": "uk"|"pl"|"other"}}'}],
            purpose="lang-detect", max_tokens=20)
        return out.get("lang", "uk") if out.get("lang") in ("uk", "pl") else "uk"
    except Exception:  # noqa: BLE001
        return "uk"


def _fts_query(question: str) -> str | None:
    terms = {t for t in re.findall(r"[\w'-]{4,}", question.lower())}
    return " | ".join(sorted(terms)) or None


def retrieve(question: str, lang: str) -> list[dict]:
    qvec = embeddings_client.embed([question])[0]
    # Мовний пул для векторного пошуку. Для польської шукаємо в ОБОХ мовах
    # одразу: затверджених польських перекладів завжди менше, ніж українських
    # карток, і обмеження лише своєю мовою відрізало б 98% каталогу. Один
    # векторний простір bge-m3 — це і є причина, чому модель обрана саме така:
    # польське питання знаходить український опис без перекладу на льоту.
    langs = ["pl", "uk"] if lang == "pl" else ["uk"]
    with db.engine.connect() as conn:
        knn = conn.execute(sql(
            "SELECT id, ref_type, ref_id, lang, text, "
            "       1 - (embedding <=> CAST(:v AS vector)) AS sim "
            "FROM chunks WHERE lang = ANY(:langs) "
            "ORDER BY embedding <=> CAST(:v AS vector) LIMIT :n"),
            {"v": str(qvec), "langs": langs, "n": CANDIDATES}).mappings().all()

        # Лексична гілка: назви складників і брендів (ARGIRELINE, niacynamid)
        # пишуться однаково обома мовами, тож шукаємо в обох tsvector-колонках.
        tsq = _fts_query(question)
        fts = conn.execute(sql(
            "SELECT id, ref_type, ref_id, lang, text, 0.0 AS sim, "
            "       greatest(ts_rank(tsv_uk, to_tsquery('simple', :q)), "
            "                ts_rank(tsv_pl, to_tsquery('simple', :q))) AS r "
            "FROM chunks "
            "WHERE tsv_uk @@ to_tsquery('simple', :q) "
            "   OR tsv_pl @@ to_tsquery('simple', :q) "
            "ORDER BY r DESC LIMIT :n"),
            {"q": tsq, "n": CANDIDATES}).mappings().all() if tsq else []

    scores: dict[int, float] = {}
    rows: dict[int, dict] = {}
    sims: dict[int, float] = {}
    for rank, r in enumerate(knn):
        scores[r["id"]] = scores.get(r["id"], 0) + 1.0 / (RRF_K + rank)
        rows[r["id"]] = dict(r)
        sims[r["id"]] = float(r["sim"])
    for rank, r in enumerate(fts):
        scores[r["id"]] = scores.get(r["id"], 0) + 1.0 / (RRF_K + rank)
        rows.setdefault(r["id"], dict(r))

    ranked = sorted(scores, key=scores.get, reverse=True)[:TOP_K]
    missing = [cid for cid in ranked if cid not in sims]
    if missing:
        with db.engine.connect() as conn:
            for cid, sim in conn.execute(sql(
                "SELECT id, 1 - (embedding <=> CAST(:v AS vector)) FROM chunks "
                "WHERE id = ANY(:ids)"), {"v": str(qvec), "ids": missing}):
                sims[cid] = float(sim)
    return [{**rows[cid], "sim": sims.get(cid, 0.0)} for cid in ranked]


def sources_for(chunks: list[dict], lang: str) -> list[dict]:
    """[>власний шар] Джерела відповіді: назва + робочий лінк на robeauty.me."""
    out, seen = [], set()
    with db.get_session() as s:
        for c in chunks:
            key = (c["ref_type"], c["ref_id"])
            if key in seen:
                continue
            seen.add(key)
            if c["ref_type"] == "product":
                p = s.get(Product, c["ref_id"])
                t = s.scalar(select(ProductI18n).where(
                    ProductI18n.product_id == c["ref_id"],
                    ProductI18n.lang == lang)) or s.scalar(
                    select(ProductI18n).where(
                        ProductI18n.product_id == c["ref_id"],
                        ProductI18n.lang == "uk"))
                out.append({"type": "product", "title": t.title if t else p.sku,
                            "url": p.landing_url})
            else:
                pg = s.get(Page, c["ref_id"])
                out.append({"type": "page", "title": pg.title or pg.url,
                            "url": pg.url})
    return out


def _product_ids_direct(question: str, limit: int) -> list[int]:
    """Пошук ТІЛЬКИ по товарних чанках.

    Оглядові й контентні сторінки довші, тож у загальному топі вони регулярно
    витісняють короткі картки товарів — і відповідь лишається без жодної
    картки, хоча товар у каталозі є. Тому коли товарів у топі немає, шукаємо
    їх окремим запитом по підмножині чанків.
    """
    qvec = embeddings_client.embed([question])[0]
    with db.engine.connect() as conn:
        rows = conn.execute(sql(
            "SELECT ref_id, 1 - (embedding <=> CAST(:v AS vector)) AS sim "
            "FROM chunks WHERE ref_type = 'product' "
            "ORDER BY embedding <=> CAST(:v AS vector) LIMIT :n"),
            {"v": str(qvec), "n": limit * 3}).mappings().all()
    seen, out = set(), []
    for r in rows:
        if r["sim"] < GROUND_THRESHOLD or r["ref_id"] in seen:
            continue
        seen.add(r["ref_id"])
        out.append(r["ref_id"])
        if len(out) >= limit:
            break
    return out


def product_cards(chunks: list[dict], lang: str, limit: int = 3,
                  question: str | None = None) -> list[dict]:
    ids = [c["ref_id"] for c in chunks if c["ref_type"] == "product"][:limit]
    if not ids and question:
        ids = _product_ids_direct(question, limit)
    cards = []
    with db.get_session() as s:
        for pid in ids:
            p = s.get(Product, pid)
            t = s.scalar(select(ProductI18n).where(
                ProductI18n.product_id == pid, ProductI18n.lang == lang,
                ProductI18n.status.in_(("approved", "source")))) or s.scalar(
                select(ProductI18n).where(
                    ProductI18n.product_id == pid, ProductI18n.lang == "uk"))
            d = p.details or {}
            cards.append({
                "sku": p.sku, "title": t.title if t else p.sku,
                "price": p.price, "old_price": p.old_price,
                "volume": p.volume, "variant_label": p.variant_label,
                # Зображення — прямий лінк на CDN бренду, нічого не копіюємо
                "image": (p.images or [None])[0],
                "url": p.landing_url,          # у чаті ведемо на сайт бренду
                # Перші три активи — рівно стільки, скільки читається в картці
                "ingredients": (d.get("active_ingredients") or [])[:3],
            })
    return cards


def _system_prompt(lang: str) -> str:
    f = PROMPTS_DIR / "consultant.md"
    text_ = f.read_text(encoding="utf-8")
    # файл має секції "## uk" і "## pl"
    parts = re.split(r"^## (uk|pl)\s*$", text_, flags=re.M)
    sections = {parts[i]: parts[i + 1] for i in range(1, len(parts) - 1, 2)}
    return (sections.get(lang) or sections.get("uk") or text_).strip()


# Реєстр і валюта у відповіді.
#
# Промпт просить не згадувати «матеріали» і тримати одну валюту, але модель
# порушує це в частині відповідей, тож правило додатково застосовується
# детерміновано. Так формулювання не залежить від того, як цього разу лягла
# генерація.

_FRAME_RE = [
    (re.compile(r"\b(?:з|із|у|в)\s+(?:наданих\s+)?(?:довідкових\s+)?матеріал(?:ах|ів|и)\b\s*", re.I), ""),
    (re.compile(r"\bз\s+довідк(?:и|ових)\b\s*", re.I), ""),
    (re.compile(r"\bу\s+баз(?:і|и)\s+знань\b\s*", re.I), ""),
    (re.compile(r"\bзгідно\s+з\s+(?:наданими\s+)?даними\b\s*", re.I), ""),
    (re.compile(r"\bw\s+materiałach\b\s*", re.I), ""),
    (re.compile(r"\bwedług\s+(?:dostarczonych\s+)?danych\b\s*", re.I), ""),
]

_CURRENCY = {"uk": "грн", "pl": "UAH"}


def _polish(reply: str, lang: str) -> str:
    for rx, repl in _FRAME_RE:
        reply = rx.sub(repl, reply)
    unit = _CURRENCY.get(lang, "грн")
    # Уніфікуємо валюту: ₴ / UAH / грн → один запис після числа.
    # «грн» без крапки в шаблоні: інакше заміна з'їдає крапку в кінці речення.
    reply = re.sub(r"(\d(?:[\d\u00a0\u202f ]*\d)?)\s*(?:₴|грн|UAH)(?!\w)", rf"\1 {unit}", reply)
    # Прибираємо подвійні пробіли, що лишилися після вирізаних зворотів.
    reply = re.sub(r"[ \t]{2,}", " ", reply)
    reply = re.sub(r"\s+([,.:;!?»)])", r"\1", reply)
    return reply.strip()


def answer(question: str, history: list[dict], lang: str) -> dict:
    if MEDICAL_RE.search(question):
        return {"reply": REFUSAL.get(lang, REFUSAL["uk"]), "escalate": True,
                "reason": "medical", "sources": [], "products": []}

    chunks = retrieve(question, lang)
    top_sim = max((c["sim"] for c in chunks), default=0.0)
    if not chunks or top_sim < GROUND_THRESHOLD:
        with db.get_session() as s:
            s.add(Unanswered(question=question[:500], lang=lang))
            s.commit()
        return {"reply": DONT_KNOW.get(lang, DONT_KNOW["uk"]), "escalate": False,
                "offer_human": True, "reason": "no-knowledge",
                "sources": [], "products": []}

    context = "\n\n---\n\n".join(c["text"][:2000] for c in chunks)
    messages = [{"role": "system", "content": _system_prompt(lang)},
                *history[-6:],
                {"role": "user", "content":
                 f"Каталог RoBeauty:\n{context}\n\nПитання клієнта: {question}"}]
    reply = llm.chat(messages, purpose="chat", model=config.MODEL_CHAT,
                     max_tokens=1200)

    return {"reply": _polish(reply, lang), "escalate": False,
            "confidence": round(min(0.98, 0.5 + top_sim / 2), 2),
            "sources": sources_for(chunks, lang),
            "products": product_cards(chunks, lang, question=question)}
