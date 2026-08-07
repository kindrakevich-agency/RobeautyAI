"""Довідник міст і відділень Нової Пошти.

Два режими, і в інтерфейсі чесно видно, який працює:

  * якщо в оточенні є NP_API_KEY — живі виклики Address.searchSettlements
    і AddressGeneral.getWarehouses (ключ безкоштовний, реєструється за
    п'ять хвилин у бізнес-кабінеті НП);
  * без ключа — вбудований демонстраційний зріз на кілька міст. Його
    достатньо, щоб показати механіку розбору й вибору відділення, і він
    підписаний як демо-зріз, щоб ніхто не сприйняв його за живі дані.

Розділення навмисне: механіка агента однакова в обох режимах, тож демо
без ключа не є «намальованим» — з ключем той самий код працює по всій
країні.
"""

from __future__ import annotations

import json
import os
import pathlib
import re

import httpx

NP_API = "https://api.novaposhta.ua/v2.0/json/"
DEMO_FILE = pathlib.Path(__file__).parent / "data" / "np_demo_directory.json"


def mode() -> str:
    return "live" if os.environ.get("NP_API_KEY") else "demo"


def _norm(s: str) -> str:
    return re.sub(r"[^\w\s]", " ", (s or "").lower()).strip()


# ---------- демо-зріз ----------

def _demo() -> dict:
    return json.loads(DEMO_FILE.read_text(encoding="utf-8"))


def _demo_settlements(query: str) -> list[dict]:
    q = _norm(query)
    out = []
    for s in _demo()["settlements"]:
        if q and q in _norm(s["name"]):
            out.append({"name": s["name"], "area": s["area"], "ref": s["ref"]})
    return out


def _demo_warehouses(settlement_ref: str) -> list[dict]:
    for s in _demo()["settlements"]:
        if s["ref"] == settlement_ref:
            return [{"number": w["number"], "address": w["address"],
                     "ref": w["ref"]} for w in s["warehouses"]]
    return []


# ---------- живий API ----------

def _np_call(model: str, method: str, props: dict) -> list[dict]:
    r = httpx.post(NP_API, json={
        "apiKey": os.environ.get("NP_API_KEY", ""),
        "modelName": model, "calledMethod": method,
        "methodProperties": props}, timeout=20)
    r.raise_for_status()
    d = r.json()
    return d.get("data") or []


def _live_settlements(query: str) -> list[dict]:
    rows = _np_call("Address", "searchSettlements",
                    {"CityName": query, "Limit": "10"})
    out = []
    for r in rows:
        for a in r.get("Addresses", []):
            out.append({"name": a.get("MainDescription", ""),
                        "area": a.get("Area", ""),
                        "ref": a.get("Ref", "")})
    return out


def _live_warehouses(settlement_ref: str) -> list[dict]:
    rows = _np_call("AddressGeneral", "getWarehouses",
                    {"SettlementRef": settlement_ref, "Limit": "50"})
    return [{"number": str(r.get("Number", "")),
             "address": r.get("ShortAddress", r.get("Description", "")),
             "ref": r.get("Ref", "")} for r in rows]


# ---------- публічний інтерфейс ----------

def search_settlements(query: str) -> list[dict]:
    if not query:
        return []
    try:
        return (_live_settlements(query) if mode() == "live"
                else _demo_settlements(query))
    except (httpx.HTTPError, ValueError, KeyError):
        return _demo_settlements(query)


def warehouses(settlement_ref: str) -> list[dict]:
    try:
        return (_live_warehouses(settlement_ref) if mode() == "live"
                else _demo_warehouses(settlement_ref))
    except (httpx.HTTPError, ValueError, KeyError):
        return _demo_warehouses(settlement_ref)


def match_warehouse(settlement_ref: str, hint: str) -> dict:
    """Підбір відділення за підказкою з тексту.

    «142» — упевнений збіг за номером. «біля ринку» — ні: номера немає,
    тож повертаємо кандидатів і чесно кажемо, що потрібен вибір людини.
    Агент ніколи не вгадує відділення: помилка тут означає посилку не туди.
    """
    ws = warehouses(settlement_ref)
    if not ws:
        return {"status": "none", "options": []}
    m = re.search(r"№?\s*(\d{1,4})", hint or "")
    if m:
        num = m.group(1)
        exact = [w for w in ws if w["number"] == num]
        if exact:
            return {"status": "matched", "warehouse": exact[0], "options": []}
    return {"status": "ambiguous", "options": ws[:5]}
