"""HTTP-шар: публічний чат + адмін-API.

Публічне: POST /api/chat, ескалація, лід. Адмінське — за basic auth (env).
"""

from __future__ import annotations

import secrets

from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text as sql_text

from . import bootstrap, config, db, llm, rag
from .agents import dialogs as dialogs_agent
from .models import Conversation, Message, Product, ProductI18n, Ticket

import os

app = FastAPI(title="RoBeauty AI Operations", docs_url=None, redoc_url=None)


# auto_error=False: без нього FastAPI сам віддає 401 з WWW-Authenticate,
# і браузер показує власне вікно логіна поверх нашої форми.
security = HTTPBasic(auto_error=False)


def admin_auth(creds: HTTPBasicCredentials | None = Depends(security)) -> str:
    # Пароль на адмінку вимикається змінною ENABLE_PASS. За замовчуванням
    # вимкнений: стенд показують клієнту, і зайвий екран входу тільки
    # заважає. Вмикати там, де адмінка виходить у відкритий доступ.
    if os.environ.get("ENABLE_PASS", "off").strip().lower() not in {"on", "1", "true", "yes"}:
        return "anonymous"
    ok = bool(creds) and (
        secrets.compare_digest(creds.username, os.environ.get("ADMIN_USER", "admin"))
        and secrets.compare_digest(
            creds.password, os.environ.get("ADMIN_PASSWORD", "change-me")))
    if not ok:
        # Свідомо БЕЗ заголовка WWW-Authenticate: інакше браузер перехоплює
        # 401 і малює системний попап замість екрана входу в застосунку.
        raise HTTPException(401, "Unauthorized")
    return creds.username


@app.get("/api/health")
def health() -> dict:
    with db.engine.connect() as conn:
        chunks = conn.exec_driver_sql("SELECT count(*) FROM chunks").scalar()
        products = conn.exec_driver_sql("SELECT count(*) FROM products").scalar()
        # Скільки товарів має польський переклад — головна метрика локалізації.
        translated = conn.exec_driver_sql(
            "SELECT count(*) FROM product_i18n WHERE lang = 'pl'").scalar()
    return {"status": "ok", "chunks": chunks, "products": products,
            "translated_pl": translated, "llm": bool(config.OPENAI_API_KEY)}


# ---------- що вже не роблять руками ----------

@app.get("/api/impact")
def impact() -> dict:
    """Цифри для розділу про заміну ручної роботи.

    Публічні й лише агреговані — жодних персональних даних. Беруться з
    бази наживо: на сторінці не має бути жодного намальованого числа.
    """
    with db.engine.connect() as c:
        q = lambda sql_text_: c.exec_driver_sql(sql_text_).scalar() or 0  # noqa: E731
        orders = q("SELECT count(*) FROM orders")
        auto = q("SELECT count(*) FROM orders WHERE confirm_decision = 'auto'")
        convs = q("SELECT count(*) FROM conversations")
        esc = q("SELECT count(*) FROM conversations WHERE escalated")
        msgs = q("SELECT count(*) FROM messages WHERE role = 'assistant'")
        shipments = q("SELECT count(*) FROM shipments")
        at_risk = q("SELECT coalesce(sum(o.total), 0) FROM shipments s "
                    "JOIN orders o ON o.id = s.order_id WHERE s.days_waiting >= 3")
        tickets = q("SELECT count(*) FROM tickets")
        products = q("SELECT count(*) FROM products")
        translated = q("SELECT count(*) FROM product_i18n WHERE lang = 'pl'")
        conflicts = q("SELECT count(*) FROM sync_log WHERE status = 'conflict'")
        cost = c.exec_driver_sql(
            "SELECT coalesce(sum(cost_usd), 0) FROM api_usage").scalar() or 0
    return {
        "orders": orders, "orders_auto": auto,
        "conversations": convs, "escalated": esc, "answers": msgs,
        "shipments": shipments, "uah_at_risk": int(at_risk),
        "tickets": tickets,
        "products": products, "translated": translated,
        "sync_conflicts": conflicts,
        "llm_cost_usd": round(float(cost), 2),
    }


# ---------- вітрина для публічної сторінки ----------

@app.get("/api/showcase")
def showcase(lang: str = "uk", limit: int = 8) -> dict:
    """Кілька товарів із фото для головної.

    Фото віддаються прямими посиланнями на robeauty.me — ми їх не
    перезаливаємо й не кешуємо в себе, як і домовлено із замовником.
    """
    with db.get_session() as s:
        rows = (s.query(Product)
                .filter(Product.images != [], Product.price > 0)
                .order_by(Product.price.desc())
                .limit(limit * 8).all())
    def _title(pid: int) -> str:
        with db.get_session() as s:
            tr = (s.query(ProductI18n)
                  .filter(ProductI18n.product_id == pid, ProductI18n.lang == lang).first())
            return tr.title if tr else ""

    def _card(p_, title: str) -> dict:
        return {"sku": p_.sku, "title": title or p_.sku, "price": p_.price,
                "volume": p_.volume, "image": (p_.images or [None])[0],
                "url": p_.landing_url}

    # Два проходи: спершу по одному товару з категорії, потім добираємо
    # рештою. Один прохід із перевіркою «категорія вже була» пропускав
    # дублі лише коли категорій уже кілька — і смуга виходила з трьох
    # майже однакових сироваток підряд.
    cards, rest = [], []
    seen_img: set[str] = set()
    seen_cat: set[str] = set()
    seen_head: set[str] = set()
    for p_ in rows:
        img = (p_.images or [None])[0]
        if not img or img in seen_img:
            continue
        title = _title(p_.id)
        # Назви на кшталт «Сироватка + крем …» відрізняються лише хвостом,
        # тож порівнюємо перші три слова.
        head = " ".join(title.lower().split()[:3])
        if head and head in seen_head:
            continue
        seen_img.add(img)
        seen_head.add(head)
        cat = p_.category or "—"
        (cards if cat not in seen_cat else rest).append(_card(p_, title))
        seen_cat.add(cat)

    items = (cards + rest)[:limit]
    return {"items": items}


# ---------- онбординг першого запуску ----------

@app.get("/api/bootstrap")
def bootstrap_status() -> dict:
    """Стан підготовки стенда. Фронт опитує раз на секунду й малює прогрес."""
    return bootstrap.snapshot()


@app.post("/api/bootstrap/start")
def bootstrap_start() -> dict:
    return bootstrap.start()


class KeyIn(BaseModel):
    api_key: str = Field(min_length=20, max_length=300)


@app.post("/api/bootstrap/key")
def bootstrap_key(body: KeyIn) -> dict:
    """Ключ LLM з екрана онбордингу — тільки в пам'ять процесу.

    Свідомо не пишемо в файл: у демо стенд піднімають із чужої машини, і
    ключ не має лишатися на диску. Для постійної роботи він задається в .env.
    """
    key = body.api_key.strip()
    os.environ["OPENAI_API_KEY"] = key
    config.OPENAI_API_KEY = key
    return {"ok": True}


# ---------- публічний чат ----------

class ChatIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    conversation_id: int | None = None
    lang: str | None = None  # явний перемикач у віджеті; інакше автодетект


@app.post("/api/chat")
def chat(body: ChatIn) -> dict:
    lang = body.lang if body.lang in ("uk", "pl") else rag.detect_lang(body.text)
    with db.get_session() as s:
        conv = s.get(Conversation, body.conversation_id) if body.conversation_id else None
        if conv is None:
            conv = Conversation(channel="web", lang=lang)
            s.add(conv)
            s.flush()
        history = [
            {"role": "assistant" if m.role in ("assistant", "human_agent") else "user",
             "content": m.content}
            for m in s.scalars(select(Message).where(
                Message.conversation_id == conv.id).order_by(Message.id)).all()
        ]
        s.add(Message(conversation_id=conv.id, role="user", content=body.text))
        s.commit()
        conv_id = conv.id

    result = rag.answer(body.text, history, lang)

    with db.get_session() as s:
        s.add(Message(conversation_id=conv_id, role="assistant",
                      content=result["reply"],
                      product_refs=result.get("products"),
                      source_refs=result.get("sources")))
        if result.get("escalate"):
            conv = s.get(Conversation, conv_id)
            conv.escalated = True
            s.add(Ticket(source="chat", category=result.get("reason"),
                         lang=lang, status="new",
                         payload={"conversation_id": conv_id,
                                  "question": body.text[:500]}))
        s.commit()

    return {"conversation_id": conv_id, "lang": lang, **result}


class EscalateIn(BaseModel):
    conversation_id: int
    phone: str | None = None
    note: str | None = None


@app.post("/api/chat/escalate")
def escalate(body: EscalateIn) -> dict:
    """Кнопка «Покликати людину» або м'який збір ліда."""
    with db.get_session() as s:
        conv = s.get(Conversation, body.conversation_id)
        if conv is None:
            raise HTTPException(404, "conversation not found")
        conv.escalated = True
        s.add(Ticket(source="chat" if not body.phone else "form",
                     category="handoff" if not body.phone else "lead",
                     lang=conv.lang, status="new",
                     payload={"conversation_id": conv.id,
                              "phone": body.phone, "note": body.note}))
        s.commit()
    return {"ok": True}


# ---------- адмін: діалоги всіх каналів ----------

@app.get("/api/admin/conversations")
def admin_conversations(_: str = Depends(admin_auth), channel: str | None = None,
                        escalated: bool | None = None,
                        offset: int = 0, limit: int = 25) -> dict:
    """Список розмов із тим, що справді допомагає обрати, яку відкрити.

    Раніше картка показувала лише канал і «аналіз ще не робили» — усі
    виглядали однаково, і сенсу в списку не було. Тепер видно перше
    питання клієнта, скільки було реплік, чи показував бот товари, чи
    дійшло до менеджера і що дав аналіз.
    """
    with db.get_session() as s:
        base = select(Conversation)
        if channel:
            base = base.where(Conversation.channel == channel)
        if escalated is not None:
            base = base.where(Conversation.escalated == escalated)
        total = s.scalar(select(func.count()).select_from(base.subquery())) or 0
        rows = s.scalars(base.order_by(Conversation.started_at.desc())
                         .offset(max(0, offset)).limit(min(100, max(1, limit)))).all()
        counts = dict(s.execute(
            select(Conversation.channel, func.count()).group_by(
                Conversation.channel)).all())

        ids = [c.id for c in rows]
        first_q: dict[int, str] = {}
        n_msgs: dict[int, int] = {}
        n_prod: dict[int, int] = {}
        last_at: dict[int, str] = {}
        if ids:
            for m in s.scalars(select(Message).where(
                    Message.conversation_id.in_(ids)).order_by(Message.id)).all():
                n_msgs[m.conversation_id] = n_msgs.get(m.conversation_id, 0) + 1
                last_at[m.conversation_id] = str(m.created_at)
                if m.role == "user" and m.conversation_id not in first_q:
                    first_q[m.conversation_id] = (m.content or "")[:160]
                if m.product_refs:
                    n_prod[m.conversation_id] = (n_prod.get(m.conversation_id, 0)
                                                 + len(m.product_refs))

        return {"by_channel": counts, "total": total,
                "offset": offset, "limit": limit,
                "items": [{
                    "id": c.id, "channel": c.channel, "lang": c.lang,
                    "handle": c.external_handle, "customer_id": c.customer_id,
                    "started_at": str(c.started_at), "escalated": c.escalated,
                    "analysis": c.analysis,
                    "preview": first_q.get(c.id),
                    "messages": n_msgs.get(c.id, 0),
                    "products": n_prod.get(c.id, 0),
                    "last_at": last_at.get(c.id),
                } for c in rows]}


@app.get("/api/admin/conversations/{conv_id}")
def admin_conversation(conv_id: int, _: str = Depends(admin_auth)) -> dict:
    with db.get_session() as s:
        conv = s.get(Conversation, conv_id)
        if conv is None:
            raise HTTPException(404)
        msgs = s.scalars(select(Message).where(
            Message.conversation_id == conv_id).order_by(Message.id)).all()
        return {"id": conv.id, "channel": conv.channel, "lang": conv.lang,
                "handle": conv.external_handle, "customer_id": conv.customer_id,
                "escalated": conv.escalated, "analysis": conv.analysis,
                "messages": [{"role": m.role, "content": m.content,
                              "products": m.product_refs,
                              "sources": m.source_refs,
                              "at": str(m.created_at)} for m in msgs]}


class HumanReplyIn(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


@app.post("/api/admin/conversations/{conv_id}/reply")
def human_reply(conv_id: int, body: HumanReplyIn,
                user: str = Depends(admin_auth)) -> dict:
    """Handoff: людина відповідає в той самий діалог, віджет це побачить."""
    with db.get_session() as s:
        if s.get(Conversation, conv_id) is None:
            raise HTTPException(404)
        s.add(Message(conversation_id=conv_id, role="human_agent",
                      content=body.content))
        s.commit()
    return {"ok": True}


@app.post("/api/admin/dialogs/analyze")
def run_dialog_analysis(_: str = Depends(admin_auth)) -> dict:
    """Прогнати агента аналізу по всіх непроаналізованих розмовах."""
    return {"analyzed": dialogs_agent.analyze_pending()}


# ---------- адмін: агенти 1, 2, 4, 5, 7 ----------

from .agents import analytics as analytics_agent  # noqa: E402
from .agents import orders as orders_agent  # noqa: E402
from .agents import shipments as shipments_agent  # noqa: E402
from .agents import sync1c as sync_agent  # noqa: E402
from .agents import tickets as tickets_agent  # noqa: E402
from .models import (  # noqa: E402
    ApiUsage, Customer, CustomerIdentity, EvalRun, Order, Product,
    ProductI18n, Shipment, SyncLog, Unanswered,
)


@app.get("/api/admin/orders")
def admin_orders(_: str = Depends(admin_auth)) -> dict:
    with db.get_session() as s:
        rows = s.execute(
            select(Order, Customer).join(Customer, Customer.id == Order.customer_id)
            .where(Customer.name != "__seed_marker__")
            .order_by(Order.created_at.desc())).all()
        auto = sum(1 for o, _ in rows if o.confirm_decision == "auto")
        return {"auto_pct": round(auto / len(rows) * 100) if rows else 0,
                "calls_saved_today": auto,
                "items": [{
                    "id": o.id, "number": o.number, "customer": c.name,
                    "city": c.city, "total": o.total, "payment": o.payment,
                    "status": o.status, "decision": o.confirm_decision,
                    "reason": o.confirm_reason, "pickup_rate": c.pickup_rate,
                    "orders_count": c.orders_count, "created_at": str(o.created_at),
                } for o, c in rows]}


@app.post("/api/admin/orders/run")
def run_orders_agent(_: str = Depends(admin_auth)) -> dict:
    return orders_agent.run()


@app.get("/api/admin/shipments")
def admin_shipments(_: str = Depends(admin_auth)) -> dict:
    with db.get_session() as s:
        rows = s.execute(
            select(Shipment, Order, Customer)
            .join(Order, Order.id == Shipment.order_id)
            .join(Customer, Customer.id == Order.customer_id)
            .order_by(Shipment.days_waiting.desc())).all()
        at_risk = sum(o.total for sh, o, _ in rows
                      if "відділен" in sh.np_status or "поштомат" in sh.np_status)
        return {"uah_at_risk": round(at_risk),
                "items": [{
                    "id": sh.id, "order": o.number, "customer": c.name,
                    "np_status": sh.np_status, "days_waiting": sh.days_waiting,
                    "total": o.total, "reminders": sh.reminders or [],
                } for sh, o, c in rows]}


@app.post("/api/admin/shipments/run")
def run_shipments_agent(_: str = Depends(admin_auth)) -> dict:
    return shipments_agent.run()


@app.get("/api/admin/tickets")
def admin_tickets(_: str = Depends(admin_auth)) -> dict:
    with db.get_session() as s:
        rows = s.scalars(select(Ticket).order_by(Ticket.created_at.desc())
                         .limit(100)).all()

        # Звернення типу handoff створює кнопка «покликати людину» — у них
        # зберігається лише посилання на розмову, тож картка виходила
        # порожньою. Дістаємо останнє питання клієнта з тієї розмови:
        # менеджеру треба бачити, з чим прийшли, а не слово «handoff».
        conv_ids = [(t.payload or {}).get("conversation_id") for t in rows]
        conv_ids = [c for c in conv_ids if c]
        last_q: dict[int, str] = {}
        if conv_ids:
            for m in s.scalars(select(Message).where(
                    Message.conversation_id.in_(conv_ids),
                    Message.role == "user").order_by(Message.id)).all():
                last_q[m.conversation_id] = (m.content or "")[:300]

        out = []
        for t in rows:
            pl = t.payload or {}
            conv = pl.get("conversation_id")
            out.append({
                "id": t.id, "source": t.source, "lang": t.lang,
                "category": t.category, "sentiment": t.sentiment,
                "priority": t.priority, "status": t.status,
                "text": pl.get("text") or pl.get("question")
                        or (last_q.get(conv) if conv else None),
                "conversation_id": conv,
                "phone": pl.get("phone"),
                "draft_reply": t.draft_reply, "created_at": str(t.created_at),
            })
        return {"items": out}


@app.post("/api/admin/tickets/generate")
def gen_tickets(_: str = Depends(admin_auth)) -> dict:
    return {"generated": tickets_agent.generate_inbox()}


@app.post("/api/admin/tickets/run")
def run_tickets_agent(_: str = Depends(admin_auth)) -> dict:
    return tickets_agent.run()


@app.get("/api/admin/tickets/digest")
def tickets_digest(_: str = Depends(admin_auth)) -> dict:
    return {"digest": tickets_agent.weekly_digest()}


@app.get("/api/admin/sync")
def admin_sync(_: str = Depends(admin_auth)) -> dict:
    with db.get_session() as s:
        rows = s.scalars(select(SyncLog).order_by(
            SyncLog.created_at.desc()).limit(100)).all()
        return {"items": [{
            "id": r.id, "direction": r.direction, "sku": r.sku,
            "action": r.action, "status": r.status, "detail": r.detail,
            "resolution": r.resolution, "created_at": str(r.created_at),
        } for r in rows]}


@app.post("/api/admin/sync/explain")
def run_sync_agent(_: str = Depends(admin_auth)) -> dict:
    return {"explained": sync_agent.explain_conflicts()}


class SyncResolveIn(BaseModel):
    action: str = Field(pattern="^(create|ignore)$")


@app.post("/api/admin/sync/{log_id}/resolve")
def resolve_sync(log_id: int, body: SyncResolveIn,
                 _: str = Depends(admin_auth)) -> dict:
    return {"ok": sync_agent.resolve(log_id, body.action)}


# ---------- адмін: каталог товарів ----------

@app.get("/api/admin/products")
def admin_products(_: str = Depends(admin_auth), q: str | None = None) -> dict:
    with db.get_session() as s:
        query = select(Product).order_by(Product.id).limit(300)
        rows = s.scalars(query).all()
        titles = {r.product_id: r for r in s.scalars(
            select(ProductI18n).where(ProductI18n.lang == "uk"))}
        items = []
        for p in rows:
            title = titles[p.id].title if p.id in titles else p.sku
            if q and q.lower() not in title.lower() and q.lower() not in p.sku.lower():
                continue
            d = p.details or {}
            items.append({
                "id": p.id, "sku": p.sku, "title": title,
                "price": p.price, "old_price": p.old_price,
                "volume": p.volume, "variant_label": p.variant_label,
                "image": (p.images or [None])[0],
                "landing_url": p.landing_url,
                "ingredients": (d.get("active_ingredients") or [])[:3],
                "skin_type": d.get("skin_type") or [],
            })
        return {"total": len(items), "items": items}


@app.get("/api/admin/products/{product_id}")
def admin_product(product_id: int, _: str = Depends(admin_auth)) -> dict:
    """Сторінка товару в адмінці — саме сюди ведуть внутрішні посилання."""
    with db.get_session() as s:
        p = s.get(Product, product_id)
        if p is None:
            raise HTTPException(404)
        i18n = {r.lang: r for r in s.scalars(select(ProductI18n).where(
            ProductI18n.product_id == product_id))}
        return {
            "id": p.id, "sku": p.sku, "price": p.price,
            "old_price": p.old_price, "upsell_price": p.upsell_price,
            "volume": p.volume, "variant_label": p.variant_label,
            "images": p.images or [], "category": p.category,
            "landing_url": p.landing_url, "source": p.source,
            "details": p.details or {},
            "extraction_confidence": p.extraction_confidence,
            "titles": {lang: {"title": r.title, "description": r.description,
                              "status": r.status}
                       for lang, r in i18n.items()},
        }


@app.get("/api/admin/products/by-sku/{sku}")
def admin_product_by_sku(sku: str, _: str = Depends(admin_auth)) -> dict:
    with db.get_session() as s:
        p = s.scalar(select(Product).where(Product.sku == sku))
        if p is None:
            raise HTTPException(404)
        return {"id": p.id}


# ---------- адмін: локалізація (5.6) ----------

@app.get("/api/admin/localization")
def admin_localization(_: str = Depends(admin_auth)) -> dict:
    with db.get_session() as s:
        rows = s.execute(
            select(Product, ProductI18n)
            .join(ProductI18n, (ProductI18n.product_id == Product.id) &
                  (ProductI18n.lang == "pl"))
            .order_by(Product.id)).all()
        uk = {r.product_id: r for r in s.scalars(
            select(ProductI18n).where(ProductI18n.lang == "uk"))}
        total = s.scalar(select(func.count()).select_from(Product))
        return {"total": total, "translated": len(rows),
                "approved": sum(1 for _, t in rows if t.status == "approved"),
                "items": [{
                    "id": t.id, "sku": p.sku, "status": t.status,
                    "note": t.review_note,
                    "uk_title": uk[p.id].title if p.id in uk else "",
                    "pl_title": t.title,
                    "uk_description": (uk[p.id].description if p.id in uk else "")[:600],
                    "pl_description": (t.description or "")[:600],
                } for p, t in rows]}


class I18nActionIn(BaseModel):
    action: str = Field(pattern="^(approve|reject)$")


@app.post("/api/admin/localization/{i18n_id}")
def localization_action(i18n_id: int, body: I18nActionIn,
                        _: str = Depends(admin_auth)) -> dict:
    with db.get_session() as s:
        row = s.get(ProductI18n, i18n_id)
        if row is None or row.lang != "pl":
            raise HTTPException(404)
        row.status = "approved" if body.action == "approve" else "draft"
        if body.action == "reject":
            row.review_note = (row.review_note or "") + " | відхилено оператором"
        s.commit()
    return {"ok": True}


# ---------- адмін: аналітика (5.7), eval і прогалини (5.8), дашборд (5.9) ----------

class AskIn(BaseModel):
    question: str = Field(min_length=3, max_length=400)
    lang: str = "uk"


@app.post("/api/admin/analytics/ask")
def analytics_ask(body: AskIn, _: str = Depends(admin_auth)) -> dict:
    return analytics_agent.ask(body.question, body.lang)


@app.get("/api/admin/eval")
def admin_eval(_: str = Depends(admin_auth)) -> dict:
    with db.get_session() as s:
        runs = s.scalars(select(EvalRun).order_by(
            EvalRun.started_at.desc()).limit(10)).all()
        gaps = s.scalars(select(Unanswered).where(
            Unanswered.resolved.is_(False)).order_by(
            Unanswered.created_at.desc()).limit(50)).all()
        return {"runs": [{
            "at": str(r.started_at), "p_at_5": r.p_at_5, "mrr": r.mrr,
            "judge_pass_rate": r.judge_pass_rate,
                  "grounded": (r.report or {}).get("grounded_rate"),
                  "helpful": (r.report or {}).get("helpful_rate"),
                  "language": (r.report or {}).get("language_rate"),
                  "cases": len((r.report or {}).get("cases") or []),
        } for r in runs], "gaps": [{
            "id": g.id, "question": g.question, "lang": g.lang,
            "at": str(g.created_at),
        } for g in gaps]}


class GapFixIn(BaseModel):
    answer_text: str = Field(min_length=10, max_length=4000)


@app.post("/api/admin/eval/gaps/{gap_id}/fix")
def fix_gap(gap_id: int, body: GapFixIn, _: str = Depends(admin_auth)) -> dict:
    """Замкнутий цикл: прогалина → ручний чанк знань → питання закрите."""
    from . import embeddings_client
    from .models import Chunk, Page
    with db.get_session() as s:
        gap = s.get(Unanswered, gap_id)
        if gap is None:
            raise HTTPException(404)
        page = Page(url=f"manual://gap-{gap_id}", title=f"Доповнення: {gap.question[:60]}",
                    body_text=body.answer_text, lang=gap.lang)
        s.add(page)
        s.flush()
        vec = embeddings_client.embed([gap.question + "\n" + body.answer_text])[0]
        s.add(Chunk(ref_type="page", ref_id=page.id, lang=gap.lang,
                    text=gap.question + "\n" + body.answer_text, embedding=vec))
        gap.resolved = True
        s.commit()
        s.execute(sql_text(
            "UPDATE chunks SET tsv_uk = to_tsvector('simple', unaccent(text)) "
            "WHERE tsv_uk IS NULL AND lang = 'uk'"))
        s.execute(sql_text(
            "UPDATE chunks SET tsv_pl = to_tsvector('simple', unaccent(text)) "
            "WHERE tsv_pl IS NULL AND lang = 'pl'"))
        s.commit()
    return {"ok": True}



class InsightsIn(BaseModel):
    question: str = Field(min_length=3, max_length=400)
    lang: str = "uk"


@app.post("/api/admin/insights")
def admin_insights(body: InsightsIn, _: str = Depends(admin_auth)) -> dict:
    """AI-звіт по стану системи — рядок у шапці замість пошуку.

    Зріз показників збирається НА СЕРВЕРІ: клієнт не може підмінити цифри
    або запитати дані поза своїм доступом.
    """
    with db.get_session() as s:
        snapshot = {
            "orders": {
                "total": s.scalar(select(func.count()).select_from(Order)),
                "auto": s.scalar(select(func.count()).where(
                    Order.confirm_decision == "auto")),
                "call_queue": s.scalar(select(func.count()).where(
                    Order.confirm_decision == "call")),
            },
            "shipments_waiting": [
                {"days": sh.days_waiting, "status": sh.np_status,
                 "reminders": len(sh.reminders or [])}
                for sh in s.scalars(select(Shipment).order_by(
                    Shipment.days_waiting.desc()).limit(10))],
            "conversations": {
                "by_channel": dict(s.execute(
                    select(Conversation.channel, func.count())
                    .group_by(Conversation.channel)).all()),
                "escalated": s.scalar(select(func.count()).where(
                    Conversation.escalated.is_(True))),
                "topics": [c.analysis.get("topic") for c in s.scalars(
                    select(Conversation).where(Conversation.analysis.isnot(None))
                    .limit(20)) if c.analysis],
            },
            "tickets_by_category": dict(s.execute(
                select(Ticket.category, func.count())
                .where(Ticket.category.isnot(None))
                .group_by(Ticket.category)).all()),
            "localization": {
                "approved": s.scalar(select(func.count()).where(
                    ProductI18n.lang == "pl", ProductI18n.status == "approved")),
                "total": s.scalar(select(func.count()).select_from(Product)),
            },
            "knowledge_gaps": [g.question for g in s.scalars(
                select(Unanswered).where(Unanswered.resolved.is_(False)).limit(10))],
            "api_cost_usd": round(float(s.scalar(
                select(func.coalesce(func.sum(ApiUsage.cost_usd), 0))) or 0), 4),
        }

    prompt = (
        "Ти — операційний аналітик бренду косметики. На основі зрізу системи дай "
        "стислий брифінг: що зараз найважливіше, де ризик, що варто зробити далі. "
        "3–5 пунктів, конкретні цифри, без води. "
        f"Мова відповіді: {'польська' if body.lang == 'pl' else 'українська'}.\n\n"
        f"Питання: {body.question}\n\nЗріз системи: {snapshot}")
    return {"report": llm.chat([{"role": "user", "content": prompt}],
                               purpose="insights", max_tokens=900)}


@app.get("/api/admin/dashboard")
def admin_dashboard(_: str = Depends(admin_auth)) -> dict:
    with db.get_session() as s:
        orders_total = s.scalar(select(func.count()).select_from(Order))
        auto = s.scalar(select(func.count()).where(
            Order.confirm_decision == "auto"))
        at_risk = s.scalar(select(func.coalesce(func.sum(Order.total), 0))
                           .select_from(Shipment)
                           .join(Order, Order.id == Shipment.order_id)) or 0
        conv_by_channel = dict(s.execute(
            select(Conversation.channel, func.count())
            .group_by(Conversation.channel)).all())
        escalated = s.scalar(select(func.count()).where(
            Conversation.escalated.is_(True)))
        pl_total = s.scalar(select(func.count()).where(ProductI18n.lang == "pl"))
        pl_approved = s.scalar(select(func.count()).where(
            ProductI18n.lang == "pl", ProductI18n.status == "approved"))
        products_total = s.scalar(select(func.count()).select_from(Product))
        # Те, з чим менеджер щось робить сьогодні. Локалізація на дашборді
        # показувала «20 / 179» і читалася як поломка, хоча агент переклав
        # усі 179 — просто людина ще не встигла їх затвердити. Для цього
        # є власний розділ; на головному екрані потрібна дія, а не звіт.
        waiting_human = s.scalar(select(func.count()).where(
            Ticket.status == "new")) or 0
        unanswered = s.scalar(select(func.count()).select_from(Unanswered)) or 0
        last_eval = s.scalar(select(EvalRun).order_by(
            EvalRun.started_at.desc()).limit(1))
        usage = s.execute(select(
            func.coalesce(func.sum(ApiUsage.cost_usd), 0),
            func.coalesce(func.sum(ApiUsage.input_tokens +
                                   ApiUsage.output_tokens), 0),
            func.count())).one()
        by_purpose = [
            {"purpose": p, "cost": round(c, 4)}
            for p, c in s.execute(
                select(ApiUsage.purpose,
                       func.sum(ApiUsage.cost_usd))
                .group_by(ApiUsage.purpose)
                .order_by(func.sum(ApiUsage.cost_usd).desc())).all()]
        identities = s.scalar(select(func.count()).select_from(CustomerIdentity))
    return {
        "orders": {"total": orders_total, "auto_pct":
                   round(auto / orders_total * 100) if orders_total else 0},
        "uah_at_risk": round(at_risk),
        "conversations": {"by_channel": conv_by_channel, "escalated": escalated},
        "identities_linked": identities,
        "waiting_human": waiting_human,
        "unanswered": unanswered,
        "localization": {"products": products_total, "translated": pl_total,
                         "approved": pl_approved},
        "eval": {"p_at_5": last_eval.p_at_5 if last_eval else None,
                 "judge_pass_rate": last_eval.judge_pass_rate if last_eval else None},
        "api_costs": {"total_usd": round(float(usage[0]), 4),
                      "tokens": int(usage[1]), "calls": int(usage[2]),
                      "by_purpose": by_purpose},
    }
