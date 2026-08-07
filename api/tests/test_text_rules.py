"""Тести на детерміновані правила обробки тексту.

Покриті саме ті місця, де заборона в промпті вже не спрацьовувала і
довелося робити перевірку кодом: валюта, реєстр, твердження про
фізіологічний механізм, HTML в описах, наскрізний шаблон сайту.

Мережі й бази тут немає — усе чисті функції, тест іде за секунду.

Запуск: cd api && .venv/bin/python -m pytest tests -q
"""

from __future__ import annotations

import pytest

from app.indexer import boilerplate, split_page, strip_boilerplate
from app.knowledge import _norm
from app.rag import _drop_mechanism, _polish
from app.textclean import html_to_text


class TestРеєстрІВалюта:
    """Модель протікала внутрішньою рамкою промпта й змішувала валюти."""

    @pytest.mark.parametrize("src,expected", [
        ("Для сухої шкіри з матеріалів бачу варіанти.", "бачу варіанти."),
        ("У складі з довідки вказані пептиди.", "У складі вказані пептиди."),
        ("Згідно з наданими даними, ціна 690 грн.", "ціна 690 грн."),
    ])
    def test_рамка_промпта_прибирається(self, src, expected):
        assert _polish(src, "uk") == expected

    def test_валюта_зводиться_до_однієї(self):
        out = _polish("Ціна 890 ₴, набір 1 390 ₴ замість 1 780 грн.", "uk")
        assert "₴" not in out
        assert out.count("грн") == 3

    def test_крапка_в_кінці_речення_не_зникає(self):
        # Перший варіант шаблону з'їдав крапку разом зі скороченням «грн.»
        assert _polish("Ціна 690 грн.", "uk").endswith("грн.")

    def test_польська_версія_має_свою_валюту(self):
        assert "UAH" in _polish("Cena 690 грн.", "pl")


class TestТвердженняПроМеханізм:
    """Найризикованіший клас для магазину: відповідає продавець."""

    @pytest.mark.parametrize("src", [
        "Крем зменшує мікроскорочення м'язів.",
        "Він працює з причиною мімічних заломів.",
        "Сироватка стимулює вироблення колагену.",
        "Засіб проникає в дерму.",
        "Це лікує розацеа.",
    ])
    def test_речення_вирізається(self, src):
        assert _drop_mechanism(src + " Об'єм 30 мл.").strip() == "Об'єм 30 мл."

    @pytest.mark.parametrize("src", [
        "Це засіб для зони навколо очей, для щоденного догляду.",
        "Підходить для мімічних заломів у зоні навколо очей.",
        "Допомагає шкірі виглядати доглянутішою.",
    ])
    def test_нормальний_опис_лишається(self, src):
        assert _drop_mechanism(src) == src

    def test_польські_формулювання_теж(self):
        out = _drop_mechanism("Blokuje mikroskurcze mięśni. Pojemność 30 ml.")
        assert "mikroskurcze" not in out
        assert "30 ml" in out


class TestОчищенняHTML:
    """Store API віддає опис разом із розміткою Tilda."""

    def test_теги_прибираються_розриви_лишаються(self):
        out = html_to_text("<strong>Набридло?</strong><br /><br />Крем із 4% ніацинаміду")
        assert "<" not in out
        assert "Набридло?" in out and "ніацинаміду" in out
        assert "\n" in out

    def test_сутності_розкодовуються(self):
        assert html_to_text("30&nbsp;мл &amp; більше").replace(" ", " ") == "30 мл & більше"

    def test_список_стає_маркерами(self):
        assert "•" in html_to_text("<ul><li>перше</li><li>друге</li></ul>")

    def test_порожній_вхід(self):
        assert html_to_text(None) == "" and html_to_text("") == ""


class TestНаскрізнийШаблон:
    """20% тексту сторінок — меню й підвал; вони розмивали вектори."""

    def test_повтори_знаходяться(self):
        pages = [f"Унікальний текст сторінки номер {i}. "
                 "Безкоштовна доставка від 2900 грн. Графік роботи ПН-ПТ."
                 for i in range(8)]
        boiler = boilerplate(pages)
        assert any("доставка" in b for b in boiler)
        assert not any("номер 3" in b for b in boiler)

    def test_шаблон_вирізається_з_тіла(self):
        pages = ["Опис товару А. Безкоштовна доставка від 2900 грн."] * 6
        boiler = boilerplate(pages)
        cleaned = strip_boilerplate(pages[0], boiler)
        assert "Опис товару" in cleaned
        assert "2900" not in cleaned

    def test_рідкісний_фрагмент_не_чіпається(self):
        pages = ["Тільки тут: пептидний крем для повік."] + ["Інша сторінка."] * 6
        assert "пептидний" in strip_boilerplate(pages[0], boilerplate(pages))


class TestРізанняНаФрагменти:
    """Зріз рівно на 1500 символів починав чанки посеред слова."""

    def test_межа_проходить_по_реченнях(self):
        body = " ".join(f"Речення номер {i} про догляд за шкірою." for i in range(200))
        parts = split_page(body)
        assert len(parts) > 1
        for p in parts:
            assert p.startswith("Речення"), f"чанк починається з уривка: {p[:40]!r}"

    def test_короткий_текст_лишається_цілим(self):
        assert split_page("Короткий опис.") == ["Короткий опис."]

    def test_порожній_текст(self):
        assert split_page("") == []


class TestЗведенняСкладників:
    """Латиниця й кирилиця — той самий складник."""

    @pytest.mark.parametrize("a,b", [
        ("Niacinamide 6%", "ніацинамід"),
        ("Retinol", "ретинол"),
        ("Ceramide Complex+", "кераміди"),
        ("Acetyl Hexapeptide-8", "Argireline®"),
    ])
    def test_синоніми_дають_один_ключ(self, a, b):
        assert _norm(a) == _norm(b)

    def test_відсотки_не_впливають(self):
        assert _norm("Ніацинамід 6%") == _norm("ніацинамід 10 %")

    def test_невідомий_складник_лишається_собою(self):
        assert _norm("Екстракт манго") == "екстракт манго"
