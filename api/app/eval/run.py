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

JUDGE = """Оціни відповідь консультанта косметичного бренду. Питання:
{q}

Відповідь:
{a}

Джерела, надані з відповіддю: {sources}

Поверни ТІЛЬКИ JSON:
{{"grounded": true|false — чи спирається відповідь на надані джерела без вигадок,
 "helpful": true|false — чи відповідає по суті питання,
 "correct_language": true|false — чи відповідь мовою "{lang}"}}"""

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
            srcs = "; ".join(s["title"] for s in res.get("sources", [])[:6])
            verdict = llm.chat_json([{"role": "user", "content": JUDGE.format(
                q=c["q"], a=reply[:1500], sources=srcs or "(немає)",
                lang=c["lang"])}],
                purpose="judge", model=None, max_tokens=200)
            ok = all(verdict.get(k) for k in ("grounded", "helpful",
                                              "correct_language"))
            # Метрики пошуку: сліпа розмітка релевантності топ-5 фрагментів
            chunks = rag.retrieve(c["q"], c["lang"])[:5]
            labels = judge_relevance(c["q"], chunks)
            p_hits += sum(labels) / 5 if labels else 0.0
            first = next((i + 1 for i, v in enumerate(labels) if v), None)
            rr_sum += 1 / first if first else 0.0
        judge_pass += ok
        per_case.append({"q": c["q"][:60], "behaviour": behaviour, "ok": ok})
        print(f"  {i:>2}/{len(cases)} {'OK ' if ok else 'FAIL'} {c['q'][:56]}",
              file=sys.stderr)

    n_ans = len(answerable) or 1
    report = {
        "judge_pass_rate": round(judge_pass / len(cases), 3),
        "p_at_5": round(p_hits / n_ans, 3),
        "mrr": round(rr_sum / n_ans, 3),
        "cases": per_case,
    }
    print(f"\nEval: pass={report['judge_pass_rate']}, P@5≈{report['p_at_5']}, "
          f"MRR≈{report['mrr']}")
    if save:
        with db.get_session() as s:
            s.add(EvalRun(p_at_5=report["p_at_5"], mrr=report["mrr"],
                          judge_pass_rate=report["judge_pass_rate"],
                          report=report))
            s.commit()
        print("звіт збережено в eval_runs")


if __name__ == "__main__":
    main()
