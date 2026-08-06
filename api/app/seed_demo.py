"""Синтетичні дані для розділів агентів. Ідемпотентно: маркерний клієнт.

Реальні інтеграції соцмереж — поза межами демо, але діалоги Instagram/
Telegram/Viber лежать у ТІЙ САМІЙ таблиці, що й веб-чат: агент аналізу та
адмінка працюють з усіма каналами однаково, а customer_identities зв'язує
акаунти одного клієнта між каналами.

Запуск: python -m app.seed_demo
"""

from __future__ import annotations

import datetime as dt
import random
import sys

from sqlalchemy import select

from . import db
from .models import (
    Conversation, Customer, CustomerIdentity, Message, Order, Product,
    Shipment, SyncLog, Ticket,
)

rng = random.Random(42)  # відтворюваність демо

FIRST = ["Олена", "Ірина", "Марія", "Наталя", "Оксана", "Тетяна", "Юлія",
         "Катерина", "Вікторія", "Софія", "Анна", "Дарина", "Людмила", "Інна"]
LAST = ["Шевченко", "Коваленко", "Бондаренко", "Ткаченко", "Мельник",
        "Кравченко", "Поліщук", "Лисенко", "Савченко", "Романюк"]
CITIES = ["Київ", "Одеса", "Львів", "Дніпро", "Харків", "Вінниця",
          "Полтава", "Луцьк", "Івано-Франківськ", "Черкаси"]

NP_STATUSES = ["прибуло у відділення", "прямує до відділення",
               "прибуло в поштомат", "відділення: очікує клієнта"]

SOCIAL_DIALOGS = [
    ("instagram", "@olena.sh", "uk", [
        ("user", "Привіт! Бачила у сторіз сироватку з ніацинамідом, вона підійде для жирної шкіри з постакне?"),
        ("assistant", "Вітаю! Так, SOS сироватка з ніацинамідом якраз для жирної шкіри: працює з постакне, нерівним тоном і розширеними порами. Наносити ввечері на чисту шкіру."),
        ("user", "А з кислотами можна поєднувати?"),
        ("assistant", "У один догляд з AHA-кислотами краще не поєднувати — чергуйте через день. Ніацинамід добре працює в парі зі зволожувальним кремом."),
        ("user", "Дякую, замовила!"),
    ]),
    ("instagram", "@marichka_beauty", "uk", [
        ("user", "Добрий день, чи є у вас щось від темних кіл під очима?"),
        ("assistant", "Добрий день! Подивіться сироватку-замінник ботоксу під очі з ARGIRELINE® — вона працює з набряками й темними колами, 1190 ₴ за 20 ml."),
        ("user", "А результат коли видно?"),
        ("assistant", "Перші зміни зазвичай через 3–4 тижні регулярного використання, ранок і вечір."),
    ]),
    ("telegram", "+380 67 *** ** 12", "uk", [
        ("user", "де моє замовлення 1024?"),
        ("assistant", "Перевіряю… Замовлення №1024 прибуло у відділення Нової Пошти вчора. Зберігається безкоштовно 5 днів."),
        ("user", "а можна переадресувати на інше відділення?"),
        ("assistant", "Це питання вирішить менеджер — передаю діалог, відповімо протягом години."),
    ]),
    ("telegram", "@viktoria_dn", "uk", [
        ("user", "Крем прийшов з пошкодженою кришкою, що робити?"),
        ("assistant", "Прикро це чути! Передаю ваше звернення менеджеру — сфотографуйте, будь ласка, упаковку, ми оформимо заміну."),
    ]),
    ("viber", "+380 50 *** ** 77", "uk", [
        ("user", "Підкажіть щось для сухої шкіри взимку, обличчя лущиться"),
        ("assistant", "Для сухої шкіри взимку раджу пептидний крем з церамідами: відновлює бар'єр і тримає вологу. У парі з ним — м'яке кремове очищення замість пінки."),
        ("user", "Скільки коштує крем?"),
        ("assistant", "1260 ₴ за 50 ml, зараз діє акція в наборі з тоніком."),
    ]),
    ("instagram", "@pani_sofia", "pl", [
        ("user", "Dzień dobry, czy wysyłacie do Polski?"),
        ("assistant", "Dzień dobry! Tak, wysyłamy do Polski — dostawa 5–7 dni roboczych. Szczegóły podpowie doradca, przekazuję rozmowę."),
    ]),
]


def main() -> None:
    with db.get_session() as s:
        marker = s.scalar(select(Customer).where(Customer.name == "__seed_marker__"))
        if marker:
            print("сідер уже виконувався — пропускаю (ідемпотентність)")
            return

        products = s.scalars(select(Product).where(Product.price > 0)).all()
        if not products:
            sys.exit("каталог порожній — спершу load_catalog")

        customers: list[Customer] = []
        for i in range(40):
            c = Customer(
                name=f"{rng.choice(FIRST)} {rng.choice(LAST)}",
                phone_masked=f"+380 {rng.choice([50, 67, 63, 96])} *** ** {rng.randint(10, 99)}",
                city=rng.choice(CITIES),
                orders_count=rng.randint(1, 14),
                pickup_rate=round(rng.uniform(0.5, 1.0), 2),
                ltv=round(rng.uniform(600, 18000), 0),
            )
            customers.append(c)
            s.add(c)
        s.flush()

        # Зв'язки акаунтів: у частини клієнтів є Instagram/Telegram
        for c in customers[:14]:
            translit = c.name.split()[0].lower()
            s.add(CustomerIdentity(customer_id=c.id, channel="instagram",
                                   handle=f"@{translit}.{rng.randint(1, 99)}",
                                   confidence="manual"))
        for c in customers[5:20]:
            s.add(CustomerIdentity(customer_id=c.id, channel="telegram",
                                   handle=c.phone_masked, confidence="matched",
                                   note="збіг номера телефону"))

        now = dt.datetime.now(dt.timezone.utc)
        orders: list[Order] = []
        for i in range(60):
            c = rng.choice(customers)
            items = [{"sku": p.sku, "qty": rng.randint(1, 2), "price": p.price}
                     for p in rng.sample(products, rng.randint(1, 3))]
            total = sum(x["price"] * x["qty"] for x in items)
            o = Order(
                number=f"{1000 + i}", customer_id=c.id, items=items,
                total=round(total, 2),
                payment=rng.choice(["cod", "cod", "card"]),
                status="pending",
                created_at=now - dt.timedelta(days=rng.uniform(0, 30)),
            )
            orders.append(o)
            s.add(o)
        s.flush()

        for o in rng.sample(orders, 25):
            days = rng.randint(0, 7)
            s.add(Shipment(order_id=o.id, np_status=rng.choice(NP_STATUSES),
                           np_updated_at=now - dt.timedelta(days=days),
                           days_waiting=days))

        conflicts = [
            ("tilda_to_1c", "оновлення ціни", "conflict", "SKU відсутній в 1С"),
            ("one_c_to_tilda", "оновлення залишку", "conflict", "розбіжність ціни: 1С 990, сайт 1190"),
            ("tilda_to_1c", "нове замовлення", "conflict", "новий товар — немає картки в 1С"),
        ]
        for i in range(30):
            p = rng.choice(products)
            if i < len(conflicts):
                d, a, st, det = conflicts[i]
            else:
                d = rng.choice(["tilda_to_1c", "one_c_to_tilda"])
                a = rng.choice(["оновлення ціни", "оновлення залишку", "нове замовлення"])
                st, det = "ok", None
            s.add(SyncLog(direction=d, sku=p.sku, action=a, status=st, detail=det,
                          created_at=now - dt.timedelta(hours=rng.uniform(1, 200))))

        # Мультиканальні діалоги + прив'язка до клієнтів через identities
        identities = s.scalars(select(CustomerIdentity)).all()
        by_channel: dict[str, list[CustomerIdentity]] = {}
        for ident in identities:
            by_channel.setdefault(ident.channel, []).append(ident)
        for channel, handle, lang, msgs in SOCIAL_DIALOGS:
            match = next((i for i in by_channel.get(channel, [])), None)
            conv = Conversation(
                channel=channel, external_handle=handle, lang=lang,
                customer_id=match.customer_id if match and rng.random() < 0.7 else None,
                started_at=now - dt.timedelta(days=rng.uniform(0, 10)),
                escalated=any("менеджер" in m[1] or "doradc" in m[1]
                              for m in msgs if m[0] == "assistant"),
            )
            s.add(conv)
            s.flush()
            for role, content in msgs:
                s.add(Message(conversation_id=conv.id, role=role, content=content))
            if conv.escalated:
                s.add(Ticket(source="chat", category="handoff", lang=lang,
                             status="new", payload={"conversation_id": conv.id,
                                                    "channel": channel}))

        s.add(Customer(name="__seed_marker__", phone_masked="-", city="-"))
        s.commit()
        print(f"сідер: customers=40, identities={len(identities)}, orders=60, "
              f"shipments=25, sync_log=30, соц-діалогів={len(SOCIAL_DIALOGS)}")


if __name__ == "__main__":
    main()
