"""Агент відправлень: від оплаченого замовлення до чернетки ТТН.

Що він доводить. Створення ТТН із даних чекаута — інтеграція, і ми чесно
кажемо це замовнику. Агент потрібен для того, що в цьому процесі вирішує
ЛЮДИНА: чи відправляти післяплатою клієнту з невикупами, яку суму
оголошувати, кому подзвонити перед відправкою. Рішення тут детерміновані
— правила видно, їх можна посперечатись і підкрутити; LLM використовується
лише там, де без нього ніяк: розбір сирого повідомлення з месенджера.

Створення ТТН на стенді СИМУЛЮЄТЬСЯ і так і підписане: номер має префікс
DEMO. Бойовий виклик InternetDocument.save відрізняється лише ключем API
— сама чернетка вже в його форматі.
"""

from __future__ import annotations

import datetime as dt
import json
import re

from sqlalchemy import select

from .. import db, llm, np_directory, rag
from ..models import Customer, Dispatch, Order, Product, ProductI18n, Shipment

# ---------- правила рішення ----------
#
# Пороги навмисно видно в коді й у відповіді API: замовник має бачити не
# «магію», а правило, з яким можна сперечатися.

PICKUP_RISKY = 0.8      # нижче — клієнт уже не забирав посилки
COD_CEILING = 3000      # післяплата вище цієї суми завжди йде людині
NEW_COD_CEILING = 1500  # для клієнта без історії поріг суворіший


def _weight_kg(items: list, products_by_sku: dict) -> float:
    """Оцінка ваги з складу кошика.

    Тілесні продукти мають вагу в атрибутах («Вага: 550»), рідини — об'єм
    («100 ml»). Це оцінка для чернетки, і вона так і підписана: точну вагу
    ставить комірник при пакуванні.
    """
    total = 0.0
    for it in items or []:
        p = products_by_sku.get(it.get("sku") or "")
        qty = int(it.get("qty") or 1)
        grams = 300.0  # запасне значення на позицію
        if p is not None:
            # Один dumps, без вкладеного: подвійне екранування лапок
            # розтягувало відстань між «Вага» і числом, і регулярка
            # не діставала.
            raw = (p.volume or "") + " " + json.dumps(p.raw or {},
                                                      ensure_ascii=False)
            m = re.search(r"[Вв]ага\W{0,6}(\d{2,4})", raw)
            if m:
                grams = float(m.group(1))
            else:
                m = re.search(r"(\d{2,4})\s*(?:ml|мл|g|г)\b", p.volume or "")
                if m:
                    grams = float(m.group(1))
        total += grams * qty
    return round(max(0.1, total / 1000 + 0.15), 2)  # +150 г пакування


def decide(order: Order, customer: Customer | None,
           past_unclaimed: int) -> tuple[str, str]:
    """(auto | needs_human, причина людською мовою)."""
    if order.payment == "card":
        return "auto", "Передоплата карткою — ризику невикупу немає."
    # далі — післяплата
    if customer is None or customer.orders_count == 0:
        if order.total > NEW_COD_CEILING:
            return ("needs_human",
                    f"Новий клієнт і післяплата на {int(order.total)} грн — "
                    f"поріг для нових {NEW_COD_CEILING} грн. Пропоную "
                    "передоплату або дзвінок.")
        return "auto", "Новий клієнт, але сума в межах порогу для післяплати."
    if past_unclaimed > 0 or (customer.pickup_rate or 1.0) < PICKUP_RISKY:
        return ("needs_human",
                f"Історія невикупів: забирає {int((customer.pickup_rate or 0) * 100)}% "
                f"посилок. Післяплата ризикована — пропоную передоплату.")
    if order.total > COD_CEILING:
        return ("needs_human",
                f"Післяплата на {int(order.total)} грн вище стелі "
                f"{COD_CEILING} грн — за правилом іде людині.")
    return "auto", (f"Постійний клієнт, забирає {int((customer.pickup_rate or 1) * 100)}% "
                    "посилок — післяплата безпечна.")


def _np_payload(order: Order, customer: Customer | None, weight: float,
                city_ref: str, warehouse_ref: str) -> dict:
    """Чернетка рівно у формі InternetDocument.save."""
    return {
        "modelName": "InternetDocument",
        "calledMethod": "save",
        "methodProperties": {
            "PayerType": "Recipient" if order.payment == "cod" else "Sender",
            "PaymentMethod": "Cash",
            "CargoType": "Parcel",
            "Weight": str(weight),
            "SeatsAmount": "1",
            "Cost": str(int(order.total)),
            "Description": "Косметичні засоби",
            "RecipientCityRef": city_ref,
            "RecipientAddressRef": warehouse_ref,
            "RecipientName": customer.name if customer else "",
            "RecipientsPhone": customer.phone_masked if customer else "",
            "BackwardDeliveryData": ([{
                "PayerType": "Recipient", "CargoType": "Money",
                "RedeliveryString": str(int(order.total)),
            }] if order.payment == "cod" else []),
        },
    }


def queue(include_dispatched: bool = False) -> dict:
    """Черга дня відправки: оплачені/підтверджені замовлення без ТТН."""
    with db.get_session() as s:
        done = {d.order_id for d in s.scalars(select(Dispatch))}
        shipped = {sh.order_id for sh in s.scalars(select(Shipment))}
        orders = [o for o in s.scalars(
            select(Order).order_by(Order.created_at.desc()).limit(60))
            if (include_dispatched or o.id not in done)
            and o.id not in shipped]
        # Продукти для оцінки ваги
        products = {p.sku: p for p in s.scalars(select(Product))}
        customers = {c.id: c for c in s.scalars(select(Customer))}
        # Невикупи в історії клієнта: посилки, що чекали 5+ днів
        unclaimed: dict[int, int] = {}
        for sh, o in s.execute(
                select(Shipment, Order).join(Order, Order.id == Shipment.order_id)):
            if sh.days_waiting >= 5:
                unclaimed[o.customer_id] = unclaimed.get(o.customer_id, 0) + 1

        items = []
        directory_mode = np_directory.mode()
        # Синтетичні замовлення стенда не мають adресних ref із чекаута,
        # тож місто беремо з профілю клієнта по демо-зрізу — навіть у
        # живому режимі. На бойовому ref прийдуть готовими з форми.
        cities = {c["name"]: c for c in np_directory._demo()["settlements"]}
        for o in orders[:25]:
            cust = customers.get(o.customer_id)
            weight = _weight_kg(o.items, products)
            decision, reason = decide(o, cust, unclaimed.get(o.customer_id, 0))
            # Синтетичні замовлення не мають adреси — беремо місто клієнта
            # з демо-довідника; на бойовому це прийде з чекаута готовими ref.
            city = cities.get((cust.city if cust else "") or "Київ")
            if city is None:
                # Міста немає в демо-зрізі — кажемо це прямо, а не
                # підставляємо чуже відділення: у першій версії клієнтка
                # з Луцька тихо отримувала київську адресу.
                city = {"ref": "", "warehouses": [
                    {"number": "?", "address": "місто поза демо-зрізом",
                     "ref": ""}]}
            wh = city["warehouses"][o.id % len(city["warehouses"])]
            items.append({
                "order_id": o.id, "number": o.number,
                "customer": cust.name if cust else "—",
                "city": cust.city if cust else "—",
                "warehouse": f"№{wh.get('number', '?')}, {wh.get('address', '')}",
                "total": o.total, "payment": o.payment,
                "weight_kg": weight,
                "decision": decision, "reason": reason,
                "date": o.created_at.strftime("%d.%m.%Y") if o.created_at else "",
                "payload": _np_payload(o, cust, weight,
                                       city.get("ref", ""), wh.get("ref", "")),
            })
    ready = sum(1 for x in items if x["decision"] == "auto")
    return {"mode": directory_mode, "items": items,
            "ready": ready, "needs_human": len(items) - ready,
            "rules": {"pickup_risky": PICKUP_RISKY, "cod_ceiling": COD_CEILING,
                      "new_cod_ceiling": NEW_COD_CEILING}}


def draft_for(order_id: int) -> dict | None:
    """Елемент черги для одного замовлення, незалежно від статусу ТТН."""
    q = queue(include_dispatched=True)
    for x in q["items"]:
        if x["order_id"] == order_id:
            return x
    return None


def create_simulated(order_id: int) -> dict:
    """«Створити ТТН» на стенді: чесна симуляція з префіксом DEMO."""
    with db.get_session() as s:
        existing = s.scalar(select(Dispatch).where(Dispatch.order_id == order_id))
        if existing:
            return {"ttn": existing.ttn_number, "already": True}
        o = s.get(Order, order_id)
        if o is None:
            return {"error": "order not found"}
        ttn = f"DEMO-{dt.date.today():%Y%m%d}-{2040000000 + order_id}"
        s.add(Dispatch(order_id=order_id, ttn_number=ttn, simulated=True))
        s.commit()
    return {"ttn": ttn, "simulated": True}


# ---------- розбір сирого повідомлення з месенджера ----------

PARSE_PROMPT = """З повідомлення клієнта в месенджері магазину косметики
витягни дані для замовлення. Використовуй ЛИШЕ те, що є в тексті.

Повідомлення:
{text}

Поверни ТІЛЬКИ JSON:
{{"name": "ім'я та прізвище або null",
  "phone": "телефон як у тексті або null",
  "city": "назва населеного пункту або null",
  "warehouse_hint": "усе, що сказано про відділення, або null",
  "products": ["згадки товарів, як їх назвав клієнт"],
  "note": "інші побажання або null"}}"""


def _match_products(mentions: list[str]) -> list[dict]:
    """Згадка клієнта → товар каталогу, за перетином слів назви."""
    out = []
    with db.get_session() as s:
        titles = [(t.product_id, t.title) for t in s.scalars(
            select(ProductI18n).where(ProductI18n.lang == "uk"))]
        products = {p.id: p for p in s.scalars(select(Product))}
    def stems(text: str) -> set[str]:
        # Основа слова — перші 4 літери: «пінку»/«пінка» → «пінк»,
        # «тонером»/«тонер» → «тоне». Грубо, але для назв товарів достатньо.
        return {w[:4] for w in re.findall(r"[\w’']{4,}", text.lower())}

    for m in mentions or []:
        words = stems(m)
        best, score = None, 0
        for pid, title in titles:
            tw = stems(title)
            inter = len(words & tw)
            if inter > score:
                best, score = pid, inter
        # Другий ешелон — семантичний пошук по векторах товарів: він зшиває
        # «пінку для вмивання» з «PureGlow Foam Cleanser», що в каталозі
        # назване англійською. Слабкий текстовий збіг теж перевіряємо
        # семантикою: одна спільна основа може вказати не на той товар.
        if not best or score < 2:
            try:
                ids = rag._product_ids_direct(m, 1)
                if ids and ids[0] in products:
                    best, score = ids[0], max(score, 1)
                    sem = True
                else:
                    sem = False
            except Exception:  # noqa: BLE001
                sem = False
        else:
            sem = False
        if best and score > 0:
            p = products[best]
            title = next(t for i, t in titles if i == best)
            out.append({"mention": m, "title": title, "sku": p.sku,
                        "price": p.price,
                        "confidence": "semantic" if sem
                        else ("high" if score >= 2 else "low")})
        else:
            out.append({"mention": m, "title": None, "sku": None,
                        "price": None, "confidence": "none"})
    return out


def parse_message(text: str) -> dict:
    """Сире повідомлення → структура з упевненістю по кожному полю."""
    try:
        raw = llm.chat_json([{"role": "user",
                              "content": PARSE_PROMPT.format(text=text[:2000])}],
                            purpose="dispatch-parse", max_tokens=400) or {}
    except Exception as e:  # noqa: BLE001
        return {"error": f"розбір не вдався: {str(e)[:120]}"}

    phone = raw.get("phone")
    phone_norm = None
    if phone:
        digits = re.sub(r"\D", "", str(phone))
        if len(digits) == 10 and digits.startswith("0"):
            phone_norm = "+38" + digits
        elif len(digits) == 12 and digits.startswith("380"):
            phone_norm = "+" + digits

    city_q = raw.get("city") or ""
    settlements = np_directory.search_settlements(city_q)
    city = settlements[0] if len(settlements) == 1 else None
    wh = (np_directory.match_warehouse(city["ref"], raw.get("warehouse_hint") or "")
          if city else {"status": "no-city", "options": []})

    products = _match_products(raw.get("products") or [])
    total = sum(p["price"] or 0 for p in products if p["sku"])

    return {
        "mode": np_directory.mode(),
        "fields": {
            "name": {"value": raw.get("name"),
                     "ok": bool(raw.get("name"))},
            "phone": {"value": phone_norm or phone,
                      "ok": bool(phone_norm),
                      "note": None if phone_norm else "невалідний формат"},
            "city": {"value": city["name"] if city else city_q or None,
                     "ok": bool(city),
                     "candidates": settlements[:5] if not city else []},
            "warehouse": {"status": wh.get("status"),
                          "value": wh.get("warehouse"),
                          "options": wh.get("options", [])},
        },
        "products": products,
        "total": total,
        "note": raw.get("note"),
        # Готова відповідь клієнту — з вибором відділення замість «уточніть самі».
        "reply_draft": _reply_draft(raw, city, wh, products, total),
    }


def _reply_draft(raw: dict, city: dict | None, wh: dict,
                 products: list[dict], total: float) -> str:
    name = (raw.get("name") or "").split()[0] if raw.get("name") else ""
    lines = [f"Вітаю{', ' + name if name else ''}!"]
    got = [p for p in products if p["sku"]]
    if got:
        lines.append("Ваше замовлення: " + "; ".join(
            f"{p['title']} — {int(p['price'])} грн" for p in got)
            + f". Разом {int(total)} грн.")
    if wh.get("status") == "ambiguous" and city:
        opts = wh.get("options", [])[:3]
        lines.append(f"У місті {city['name']} є кілька відділень: " + "; ".join(
            f"№{o['number']} ({o['address']})" for o in opts)
            + ". Котре вам зручніше?")
    elif wh.get("status") == "matched":
        w = wh["warehouse"]
        lines.append(f"Доставка: {city['name']}, відділення №{w['number']}, "
                     f"{w['address']} — так?")
    return "\n".join(lines)
