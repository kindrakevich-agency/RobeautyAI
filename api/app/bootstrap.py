"""Онбординг першого запуску: стан підготовки стенда для UI.

Після клону репозиторію даних немає — каталог не зберігається в git. Тут
живе покроковий процес підготовки з людським описом кожного кроку, який
фронтенд показує у вигляді прогресу. Замовник має бачити, що саме
відбувається: що парситься, що пишеться в базу і навіщо.
"""

from __future__ import annotations

import threading
import traceback
from dataclasses import asdict, dataclass, field

from sqlalchemy import func, select

from . import config, db
from .models import Chunk, Product, ProductI18n


@dataclass
class Step:
    key: str
    status: str = "pending"        # pending | running | done | failed
    detail: str = ""
    count: int | None = None


@dataclass
class BootstrapState:
    running: bool = False
    finished: bool = False
    error: str | None = None
    steps: list[Step] = field(default_factory=lambda: [
        Step("scrape"),      # збір каталогу з сайту бренду
        Step("load"),        # запис у PostgreSQL
        Step("translate"),   # польська локалізація
        Step("index"),       # ембедінги та індекс
        Step("seed"),        # синтетика для агентів
    ])

    def step(self, key: str) -> Step:
        return next(s for s in self.steps if s.key == key)


STATE = BootstrapState()
_lock = threading.Lock()


def snapshot() -> dict:
    """Поточний стан + що вже є в базі. Викликається фронтендом раз на секунду."""
    with db.get_session() as s:
        products = s.scalar(select(func.count()).select_from(Product)) or 0
        chunks = s.scalar(select(func.count()).select_from(Chunk)) or 0
        pl = s.scalar(select(func.count()).where(ProductI18n.lang == "pl")) or 0
    return {
        **{k: v for k, v in asdict(STATE).items() if k != "steps"},
        "steps": [asdict(s) for s in STATE.steps],
        "db": {"products": products, "chunks": chunks, "pl_translations": pl},
        "ready": chunks > 10,
        "has_llm_key": bool(config.OPENAI_API_KEY),
    }


def _run() -> None:
    from . import indexer, load_catalog, seed_demo, translate
    from .scraper import run as scraper

    try:
        st = STATE.step("scrape")
        if (config.DATA_DIR / "catalog.json").exists():
            st.status, st.detail = "done", "каталог уже зібрано раніше"
        else:
            st.status = "running"
            scraper.main()
            st.status = "done"

        st = STATE.step("load")
        st.status = "running"
        load_catalog.main()
        with db.get_session() as s:
            st.count = s.scalar(select(func.count()).select_from(Product))
        st.status = "done"

        st = STATE.step("translate")
        if not config.OPENAI_API_KEY:
            st.status, st.detail = "failed", "немає ключа LLM — крок пропущено"
        else:
            st.status = "running"
            translate.main()
            with db.get_session() as s:
                st.count = s.scalar(select(func.count()).where(ProductI18n.lang == "pl"))
            st.status = "done"

        st = STATE.step("index")
        st.status = "running"
        indexer.main()
        with db.get_session() as s:
            st.count = s.scalar(select(func.count()).select_from(Chunk))
        st.status = "done"

        st = STATE.step("seed")
        st.status = "running"
        seed_demo.main()
        st.status = "done"

        STATE.finished = True
    except Exception as e:  # noqa: BLE001
        STATE.error = f"{type(e).__name__}: {e}"
        traceback.print_exc()
        for s_ in STATE.steps:
            if s_.status == "running":
                s_.status = "failed"
    finally:
        STATE.running = False


def start() -> dict:
    with _lock:
        if STATE.running:
            return snapshot()
        STATE.running = True
        STATE.finished = False
        STATE.error = None
        for s in STATE.steps:
            s.status, s.detail, s.count = "pending", "", None
        threading.Thread(target=_run, daemon=True).start()
    return snapshot()
