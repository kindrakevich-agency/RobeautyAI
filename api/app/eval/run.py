"""Eval якості: retrieval-метрики + сліпий суддя + перевірка поведінки.

Суддя НЕ знає, звідки відповідь — оцінює лише «питання → відповідь →
джерела»: чи відповідає по суті, чи спирається на джерела, чи не вигадує.
Поведінкові кейси: медичні питання мусять відмовляти, питання поза базою —
чесно казати «не знаю».

Запуск: python -m app.eval.run [--save]
Звіт лягає в eval_runs; останній показує дашборд адмінки.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from .. import db, llm, rag
from ..models import EvalRun

QUESTIONS_FILE = Path(__file__).parent / "questions.yaml"

JUDGE = """Ти перевіряєш відповідь консультанта косметичного магазину.
Ти не знаєш, хто її писав.

ПИТАННЯ КЛІЄНТА:
{q}

ВІДПОВІДЬ КОНСУЛЬТАНТА:
{a}

МАТЕРІАЛИ, з яких відповідь мала бути зібрана:
{sources}

Оціни три речі.

1. grounded — чи всі КОНКРЕТНІ факти відповіді є в матеріалах: назви
   засобів, ціни, об'єми, склад, для якої шкіри. Числа можуть бути записані
   інакше («1 590 ₴» і «1590 грн» — те саме). Загальні поради без цифр
   («зволоження важливе для сухої шкіри») вигадкою НЕ вважаються.
   false став лише тоді, коли назване щось, чого в матеріалах немає взагалі.

2. helpful — чи клієнт отримав те, про що питав.

3. correct_language — чи відповідь мовою "{lang}". Назви товарів і
   складників можуть бути іншою мовою — це нормально.

Поверни ТІЛЬКИ JSON без пояснень:
{{"grounded": true, "helpful": true, "correct_language": true}}"""

RELEVANCE = """Питання клієнта косметичного бренду: «{q}»

Нижче фрагменти, які повернув пошук. Для кожного визнач, чи допомагає він
відповісти саме на це питання: 1 — містить релевантну інформацію,
0 — про інше або лише загальні слова про бренд.

Будь суворим: загальна сторінка про бренд не є відповіддю на питання про
конкретний засіб чи проблему шкіри.

Фрагменти:
{items}

Поверни ТІЛЬКИ JSON-обʼєкт: {{"labels": [0, 1, ...]}} — по одному числу
на кожен фрагмент, у тому ж порядку."""


def judge_answer(q: str, a: str, sources: str, lang: str,
                 votes: int = 3) -> dict[str, bool]:
    """Вердикт за більшістю з кількох голосів.

    Заміряно: на одному й тому самому вході суддя дає різні відповіді —
    з п'яти викликів чотири «спирається на джерела» і один ні. Це відома
    властивість оцінювання моделлю, і лікується вона не промптом, а
    повторенням: беремо непарну кількість голосів і рахуємо більшість.
    Інакше метрика міряє власний шум, а не якість бота.
    """
    tally = {"grounded": 0, "helpful": 0, "correct_language": 0}
    got = 0
    for _ in range(votes):
        try:
            v = llm.chat_json([{"role": "user", "content": JUDGE.format(
                q=q, a=a, sources=sources, lang=lang)}],
                purpose="judge", max_tokens=200)
        except Exception as e:  # noqa: BLE001
            print(f"    суддя впав: {str(e)[:80]}", file=sys.stderr)
            continue
        if not v:
            continue
        got += 1
        for k in tally:
            tally[k] += int(bool(v.get(k)))
    if not got:
        return dict.fromkeys(tally, False)
    return {k: n * 2 > got for k, n in tally.items()}


def judge_relevance(question: str, chunks: list[dict]) -> list[int]:
    """Сліпа розмітка релевантності знайдених фрагментів.

    Раніше тут рахувалося «чи є хоч якісь джерела» — метрика завжди давала
    1.0 і нічого не вимірювала. Тепер кожен фрагмент оцінює суддя, який
    бачить лише питання й текст, без знання про спосіб пошуку.
    """
    if not chunks:
        return []
    body = "\n\n".join(f"[{i + 1}] {c['text'][:400]}" for i, c in enumerate(chunks))
    try:
        out = llm.chat_json([{"role": "user", "content": RELEVANCE.format(
            q=question, items=body)}], purpose="judge", max_tokens=300)
        raw = out if isinstance(out, list) else (
            out.get("labels") or out.get("result") or out.get("scores"))
        if not isinstance(raw, list):
            # Режим JSON у OpenAI повертає обʼєкт, тож масив у корені
            # неможливий — якщо форма все одно інша, це видно в логах,
            # а не тихо перетворюється на нулі.
            print(f"    суддя повернув несподівану форму: {str(out)[:120]}",
                  file=sys.stderr)
            return []
        labels = [int(bool(x)) for x in raw][:len(chunks)]
        return labels + [0] * (len(chunks) - len(labels))
    except Exception as e:  # noqa: BLE001
        print(f"    суддя релевантності впав: {str(e)[:100]}", file=sys.stderr)
        return []


def load_questions() -> list[dict]:
    """Мінімальний парсер нашого YAML (плоскі списки ключ: значення)."""
    items, cur = [], {}
    for line in QUESTIONS_FILE.read_text(encoding="utf-8").splitlines():
        line = line.rstrip()
        if line.startswith("- "):
            if cur:
                items.append(cur)
            cur = {}
            line = "  " + line[2:]
        m = re.match(r"\s+(\w+):\s*(.+)", line)
        if m and cur is not None:
            cur[m.group(1)] = m.group(2).strip().strip('"')
    if cur:
        items.append(cur)
    return items


def main() -> None:
    save = "--save" in sys.argv
    cases = load_questions()
    per_case, judge_pass, p_hits, rr_sum = [], 0, 0.0, 0.0
    # Окремі складові оцінки. Єдине число «все або нічого» ховало
    # причину: перевірка трьох провалів вручну показала якісні
    # відповіді, забраковані одним суворим вердиктом.
    dims = {"grounded": 0, "helpful": 0, "correct_language": 0}
    dims_n = 0
    answerable = [c for c in cases if c["behaviour"] == "answer"]

    for i, c in enumerate(cases, 1):
        res = rag.answer(c["q"], [], c["lang"])
        reply, behaviour = res["reply"], c["behaviour"]

        if behaviour == "refuse-medical":
            ok = bool(res.get("escalate")) and res.get("reason") == "medical"
        elif behaviour == "no-knowledge":
            # Питання поза темою тепер відсікає окремий фільтр ще до пошуку,
            # і він повертає власну причину. Це та сама правильна поведінка —
            # без цього рядка eval рахував відмову за помилку.
            ok = (res.get("reason") in {"no-knowledge", "out-of-scope"}
                  or res.get("offer_human", False))
        else:
            # Суддя має бачити РІВНО те, що бачила модель, інакше він
            # штрафує за факти, яких просто не отримав. Перша версія давала
            # йому 5 фрагментів без блоку цін — і кожна ціна у відповіді
            # виглядала вигаданою: показник упав з 0.613 до 0.097.
            ctx_all = rag.retrieve(c["q"], c["lang"])
            ctx = ctx_all[:5]
            srcs = "\n---\n".join(x["text"][:900] for x in ctx_all)
            srcs += rag.price_table(ctx_all, c["lang"], mentions_in=srcs)
            srcs = srcs or "(немає)"
            marks = judge_answer(c["q"], reply[:1500], srcs, c["lang"])
            for k, v in marks.items():
                dims[k] += int(v)
            dims_n += 1
            ok = all(marks.values())
            # Метрики пошуку: сліпа розмітка релевантності топ-5 фрагментів
            labels = judge_relevance(c["q"], ctx)
            p_hits += sum(labels) / 5 if labels else 0.0
            first = next((i + 1 for i, v in enumerate(labels) if v), None)
            rr_sum += 1 / first if first else 0.0
        judge_pass += ok
        per_case.append({"q": c["q"][:60], "behaviour": behaviour, "ok": ok,
                         **({"marks": marks} if behaviour == "answer" else {})})
        print(f"  {i:>2}/{len(cases)} {'OK ' if ok else 'FAIL'} {c['q'][:56]}",
              file=sys.stderr)

    n_ans = len(answerable) or 1
    d_n = dims_n or 1
    report = {
        "judge_pass_rate": round(judge_pass / len(cases), 3),
        "grounded_rate": round(dims["grounded"] / d_n, 3),
        "helpful_rate": round(dims["helpful"] / d_n, 3),
        "language_rate": round(dims["correct_language"] / d_n, 3),
        "p_at_5": round(p_hits / n_ans, 3),
        "mrr": round(rr_sum / n_ans, 3),
        "cases": per_case,
    }
    print(f"\nEval на {len(cases)} питаннях")
    print(f"  P@5              {report['p_at_5']}")
    print(f"  MRR              {report['mrr']}")
    print(f"  спирається на джерела  {report['grounded_rate']}")
    print(f"  відповідає по суті     {report['helpful_rate']}")
    print(f"  правильна мова         {report['language_rate']}")
    print(f"  усі три одночасно      {report['judge_pass_rate']}"
          f"  (сувора оцінка: один вердикт бракує відповідь цілком)")
    if save:
        with db.get_session() as s:
            s.add(EvalRun(p_at_5=report["p_at_5"], mrr=report["mrr"],
                          judge_pass_rate=report["judge_pass_rate"],
                          report=report))
            s.commit()
        print("звіт збережено в eval_runs")


if __name__ == "__main__":
    main()
