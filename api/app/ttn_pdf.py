"""PDF експрес-накладної.

Справжній документ: A4, кирилиця (DejaVu), штрих-код Code 128 — той самий
формат, що друкує кабінет НП. Через увесь аркуш іде водяний знак ДЕМО:
макет показує дані майбутнього виклику, а не заміняє документ перевізника.
"""

from __future__ import annotations

import io
import pathlib

from reportlab.graphics.barcode import code128
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

_FONTS = [
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
     "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ("/System/Library/Fonts/Supplemental/Arial Unicode.ttf",) * 2,  # macOS
]


def _register_fonts() -> tuple[str, str]:
    for regular, bold in _FONTS:
        if pathlib.Path(regular).exists():
            pdfmetrics.registerFont(TTFont("TTN", regular))
            pdfmetrics.registerFont(TTFont("TTN-B", bold))
            return "TTN", "TTN-B"
    return "Helvetica", "Helvetica-Bold"  # без кирилиці, але не падаємо


def build(item: dict, ttn: str) -> bytes:
    """item — елемент черги відправлень (див. dispatch.queue)."""
    f, fb = _register_fonts()
    mp = (item.get("payload") or {}).get("methodProperties", {})
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    m = 46  # поле

    # Водяний знак
    c.saveState()
    c.translate(w / 2, h / 2)
    c.rotate(32)
    c.setFont(fb, 110)
    c.setFillColorRGB(0.86, 0.30, 0.30, alpha=0.13)
    c.drawCentredString(0, 0, "ДЕМО")
    c.restoreState()

    y = h - m
    c.setFillColorRGB(0.06, 0.10, 0.11)
    c.setFont(fb, 10)
    c.drawString(m, y, "ЕКСПРЕС-НАКЛАДНА (демонстраційний макет)")
    c.setFont(f, 9)
    c.drawRightString(w - m, y, "Перевізник: Нова Пошта")
    y -= 14
    c.drawRightString(w - m, y, item.get("date", ""))
    c.setFont(fb, 22)
    c.drawString(m, y - 8, ttn)
    y -= 34
    c.setLineWidth(1.4)
    c.line(m, y, w - m, y)

    # Штрих-код Code 128 — справжній, читається сканером
    digits = "".join(ch for ch in ttn if ch.isdigit())
    bc = code128.Code128(digits, barHeight=42, barWidth=1.25, humanReadable=False)
    bc.drawOn(c, (w - bc.width) / 2, y - 58)
    c.setFont(f, 9)
    c.drawCentredString(w / 2, y - 70, "  ".join(digits))
    y -= 96

    # Відправник / отримувач
    box_w = (w - 2 * m - 14) / 2
    box_h = 84
    for i, (title, lines) in enumerate((
        ("ВІДПРАВНИК", ["ROBEAUTY", "м. Київ, відділення №142"]),
        ("ОТРИМУВАЧ", [mp.get("RecipientName") or item.get("customer", ""),
                       f"{item.get('city', '')}, {item.get('warehouse', '')}",
                       mp.get("RecipientsPhone", "")]),
    )):
        x = m + i * (box_w + 14)
        c.setLineWidth(0.8)
        c.roundRect(x, y - box_h, box_w, box_h, 4)
        c.setFont(fb, 7.5)
        c.setFillColorRGB(0.42, 0.53, 0.53)
        c.drawString(x + 10, y - 16, title)
        c.setFillColorRGB(0.06, 0.10, 0.11)
        c.setFont(fb, 11)
        c.drawString(x + 10, y - 32, lines[0][:44])
        c.setFont(f, 9.5)
        yy = y - 46
        for ln in lines[1:]:
            c.drawString(x + 10, yy, str(ln)[:52])
            yy -= 13
    y -= box_h + 22

    # Параметри відправлення
    cells = [
        ("ВАГА", f"{mp.get('Weight', '')} кг"),
        ("МІСЦЬ", str(mp.get("SeatsAmount", "1"))),
        ("ОГОЛОШЕНА ВАРТІСТЬ", f"{mp.get('Cost', '')} грн"),
        ("ПІСЛЯПЛАТА",
         f"{mp.get('Cost', '')} грн" if item.get("payment") == "cod" else "—"),
    ]
    cw = (w - 2 * m) / 4
    c.setLineWidth(0.8)
    c.rect(m, y - 46, w - 2 * m, 46)
    for i, (k, v) in enumerate(cells):
        x = m + i * cw
        if i:
            c.line(x, y - 46, x, y)
        c.setFont(fb, 6.8)
        c.setFillColorRGB(0.42, 0.53, 0.53)
        c.drawCentredString(x + cw / 2, y - 15, k)
        c.setFillColorRGB(0.06, 0.10, 0.11)
        c.setFont(fb, 12)
        c.drawCentredString(x + cw / 2, y - 34, v)
    y -= 70

    # Рішення агента — те, чого немає в звичайній накладній
    c.setFont(fb, 7.5)
    c.setFillColorRGB(0.42, 0.53, 0.53)
    c.drawString(m, y, "РІШЕННЯ АГЕНТА")
    c.setFillColorRGB(0.06, 0.10, 0.11)
    c.setFont(f, 9.5)
    reason = item.get("reason", "")
    for i in range(0, len(reason), 100):
        y -= 13
        c.drawString(m, y, reason[i:i + 100])
    y -= 26

    c.setFont(f, 7.5)
    c.setFillColorRGB(0.42, 0.53, 0.53)
    note = ("Демонстраційний макет зі стенда robeauty.kindrakevich.com. Дані — з чернетки "
            "InternetDocument.save; документ перевізника створює виклик API з ключем акаунта.")
    line = ""
    for word in note.split():
        if len(line) + len(word) > 128:
            c.drawString(m, y, line)
            y -= 10
            line = word
        else:
            line = f"{line} {word}".strip()
    if line:
        c.drawString(m, y, line)

    c.showPage()
    c.save()
    return buf.getvalue()
