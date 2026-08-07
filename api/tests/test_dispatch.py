"""Тести правил агента відправлень.

Рішення про післяплату — це гроші: невикуп означає доставку в обидва боки
за рахунок магазину. Тому правила детерміновані й покриті тестами, а не
віддані моделі.
"""

from __future__ import annotations

import pytest

from app import np_directory
from app.agents.dispatch import (COD_CEILING, NEW_COD_CEILING, PICKUP_RISKY,
                                 _weight_kg, decide)


class _O:
    def __init__(self, total: float, payment: str = "cod"):
        self.total = total
        self.payment = payment


class _C:
    def __init__(self, orders_count: int = 5, pickup_rate: float = 1.0):
        self.orders_count = orders_count
        self.pickup_rate = pickup_rate
        self.name = "Тест"


class TestРішенняПроПісляплату:
    def test_передоплата_завжди_авто(self):
        d, reason = decide(_O(9999, "card"), _C(0, 0.1), 3)
        assert d == "auto" and "Передоплата" in reason

    def test_новий_клієнт_мала_сума_авто(self):
        d, _ = decide(_O(NEW_COD_CEILING - 1), None, 0)
        assert d == "auto"

    def test_новий_клієнт_велика_сума_людині(self):
        d, reason = decide(_O(NEW_COD_CEILING + 1), None, 0)
        assert d == "needs_human" and "Новий клієнт" in reason

    def test_історія_невикупів_людині(self):
        d, reason = decide(_O(500), _C(10, PICKUP_RISKY - 0.1), 0)
        assert d == "needs_human" and "невикуп" in reason.lower()

    def test_минулі_зависання_посилок_людині(self):
        d, _ = decide(_O(500), _C(10, 1.0), past_unclaimed=2)
        assert d == "needs_human"

    def test_надійний_клієнт_авто(self):
        d, reason = decide(_O(1200), _C(8, 0.97), 0)
        assert d == "auto" and "97%" in reason

    def test_стеля_післяплати(self):
        d, _ = decide(_O(COD_CEILING + 100), _C(8, 1.0), 0)
        assert d == "needs_human"


class TestВага:
    class _P:
        def __init__(self, volume, raw=None):
            self.volume = volume
            self.raw = raw or {}

    def test_вага_з_обєму(self):
        prods = {"a": self._P("100 ml")}
        assert _weight_kg([{"sku": "a", "qty": 1}], prods) == 0.25  # 100г + 150г

    def test_вага_з_атрибута(self):
        prods = {"b": self._P("Набір", {"attrs_api": {"Вага:": "550"}})}
        w = _weight_kg([{"sku": "b", "qty": 1}], prods)
        assert 0.6 <= w <= 0.8

    def test_невідомий_товар_запасне_значення(self):
        assert _weight_kg([{"sku": "x", "qty": 2}], {}) == 0.75  # 2×300г + 150г

    def test_порожній_кошик_не_нуль(self):
        assert _weight_kg([], {}) >= 0.1


class TestДовідникНП:
    def test_місто_знаходиться(self):
        got = np_directory.search_settlements("нова прага")
        assert got and got[0]["name"] == "Нова Прага"

    def test_номер_відділення_упевнений_збіг(self):
        city = np_directory.search_settlements("Київ")[0]
        m = np_directory.match_warehouse(city["ref"], "відділення 142")
        assert m["status"] == "matched" and m["warehouse"]["number"] == "142"

    def test_без_номера_варіанти_для_людини(self):
        city = np_directory.search_settlements("Нова Прага")[0]
        m = np_directory.match_warehouse(city["ref"], "біля ринку")
        assert m["status"] == "ambiguous" and len(m["options"]) == 2

    def test_агент_не_вгадує_відділення(self):
        # «біля ринку» описує відділення №1, але без номера це лише здогадка —
        # і вона має піти людині, а не в накладну.
        city = np_directory.search_settlements("Нова Прага")[0]
        m = np_directory.match_warehouse(city["ref"], "біля ринку")
        assert "warehouse" not in m


class TestТелефонЛід:
    @pytest.mark.parametrize("text,expected", [
        ("066 342 34 12", "+380663423412"),
        ("+38 (063) 031-08-15", "+380630310815"),
        ("подзвоніть 0937771122 після 18", "+380937771122"),
        ("мій номер 12345", None),
        ("сироватка за 690 грн", None),
    ])
    def test_розпізнавання(self, text, expected):
        from app.main import _extract_phone
        assert _extract_phone(text) == expected
