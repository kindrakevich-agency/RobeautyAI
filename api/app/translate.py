"""M2: польська локалізація каталогу.

Переклади створюються зі status='draft' і затверджуються в адмінці.
Перші N товарів авто-approve, щоб чат польською працював одразу.

Регуляторний фільтр ЄС: у перекладі не мають з'явитися медичні твердження.
Інструкція в промпті + пост-перевірка стоп-регексами; порушення лишає draft
із приміткою — його видно в адмінці в розділі локалізації.

Запуск: python -m app.translate [--limit N] [--auto-approve 20]
"""

from __future__ import annotations

import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

from sqlalchemy import select

from . import db, llm
from .models import Product, ProductI18n

GLOSSARY = """Глосарій бренду (не перекладати, лишати як є):
ARGIRELINE®, BEAUTIFEYE®, MATRIXYL®, bakuchiol → bakuchiol, Meccano,
RoBeauty, назви продуктів-брендів — транслітерація як бренд-неймінг.
INCI-назви складників не перекладати."""

RULES = """Правила:
- тон бренду: «наука + турбота», без крикливого маркетингу;
- ЗАБОРОНЕНІ медичні твердження: «лікує», «leczy», «wyleczy», «uzdrawia»,
  «усуває назавжди», «likwiduje na zawsze», обіцянки терапевтичного ефекту.
  Косметика доглядає і зменшує видимість — не лікує;
- одиниці (ml, g) і ціни не чіпати;
- повертай ТІЛЬКИ JSON: {"title": "...", "description": "..."}"""

# Стоп-фрази для пост-перевірки польського тексту
STOP_PATTERNS = [
    r"\blecz\w*", r"\bwylecz\w*", r"\buzdraw\w*", r"\bterapi\w*",
    r"na zawsze", r"\blikwiduje zmarszczki\b", r"\bmedycz\w*",
]
STOP_RE = re.compile("|".join(STOP_PATTERNS), re.I)


def translate_product(title: str, description: str) -> dict:
    out = llm.chat_json([
        {"role": "system",
         "content": f"Ти перекладаєш картки косметики з української на польську.\n{GLOSSARY}\n{RULES}"},
        {"role": "user", "content": f"Назва: {title}\n\nОпис: {description[:4000]}"},
    ], purpose="translate", max_tokens=2500)
    return {"title": str(out.get("title") or ""),
            "description": str(out.get("description") or "")}


def main() -> None:
    limit = None
    auto_approve = 20
    args = sys.argv[1:]
    if "--limit" in args:
        limit = int(args[args.index("--limit") + 1])
    if "--auto-approve" in args:
        auto_approve = int(args[args.index("--auto-approve") + 1])

    with db.get_session() as s:
        products = s.execute(
            select(Product, ProductI18n)
            .join(ProductI18n,
                  (ProductI18n.product_id == Product.id) & (ProductI18n.lang == "uk"))
            .order_by(Product.id)
        ).all()
        if limit:
            products = products[:limit]

        done = {r.product_id for r in s.scalars(
            select(ProductI18n).where(ProductI18n.lang == "pl"))}
        todo = [(p.id, uk.title, uk.description)
                for p, uk in products if p.id not in done]
        print(f"до перекладу: {len(todo)} (вже є: {len(done)})", file=sys.stderr)

        results: dict[int, dict | None] = {}
        with ThreadPoolExecutor(max_workers=4) as pool:
            futs = {pool.submit(translate_product, t, d): pid for pid, t, d in todo}
            for i, fut in enumerate(as_completed(futs), 1):
                pid = futs[fut]
                try:
                    results[pid] = fut.result()
                except Exception as e:  # noqa: BLE001
                    results[pid] = None
                    print(f"  фейл product_id={pid}: {str(e)[:80]}", file=sys.stderr)
                if i % 20 == 0:
                    print(f"  {i}/{len(todo)}", file=sys.stderr)

        approved = 0
        for pid, _, _ in todo:
            tr = results.get(pid)
            if not tr or not tr["title"]:
                continue
            hit = STOP_RE.search(tr["title"] + " " + tr["description"])
            status, note = "draft", None
            if hit:
                note = f"регуляторний фільтр: «{hit.group(0)}»"
            elif approved < auto_approve:
                status, approved = "approved", approved + 1
            s.add(ProductI18n(product_id=pid, lang="pl", title=tr["title"],
                              description=tr["description"], status=status,
                              review_note=note))
        s.commit()

        total_pl = s.scalars(select(ProductI18n).where(ProductI18n.lang == "pl")).all()
        print(f"PL-перекладів: {len(total_pl)}, approved: "
              f"{sum(1 for r in total_pl if r.status == 'approved')}, "
              f"із приміткою фільтра: {sum(1 for r in total_pl if r.review_note)}")


if __name__ == "__main__":
    main()
