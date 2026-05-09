#!/usr/bin/env python3
"""Tier-aware name resolver. Looks each abbreviated roster name up in the
appropriate deals column based on roster role:

  - L1 / L2 / SC Org L3                         -> Sales Consultant
  - segment-L3 (Corp NL/Upsell/ENT pod leaders) -> Sales Consultant
  - L4 with role_type                           -> Forecast Owner
  - L4 with notes='ae_row anchor'               -> Forecast Manager

Scoped to Account Super Region = 'NAM' and Created Date >= FY26 start
(2025-02-01) since only NAM activity matters for this app.
"""
from __future__ import annotations
import csv
import json
import re
import sys
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

INSTANCE = "domo.domo.com"
DEALS_DS = "eac44ae6-6463-44ab-ad5a-6294977873ff"
ROSTER = Path("/Users/cassidy.hilton/Downloads/Sales Org - People.csv")
WHERE = "WHERE `Account Super Region`='NAM' AND `Created Date` > '2025-02-01'"


def http(method, url, *, headers=None, data=None, timeout=60):
    import urllib.error
    req = urllib.request.Request(url=url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def get_sid():
    cfg = json.loads((Path.home() / ".config/configstore/ryuu" / f"{INSTANCE}.json").read_text())
    base = f"https://{INSTANCE}/api"
    body = urllib.parse.urlencode({
        "client_id": "domo:internal:devstudio",
        "grant_type": "refresh_token",
        "refresh_token": cfg["refreshToken"],
    }).encode()
    s, raw = http("POST", f"{base}/oauth2/token",
                  headers={"content-type": "application/x-www-form-urlencoded;charset=utf-8"}, data=body)
    access = json.loads(raw)["access_token"]
    s, raw = http("GET", f"{base}/oauth2/sid",
                  headers={"authorization": f"Bearer {access}"})
    return json.loads(raw)["sid"]


def sql(sid: str, query: str):
    s, raw = http(
        "POST", f"https://{INSTANCE}/api/query/v1/execute/{DEALS_DS}",
        headers={"x-domo-authentication": sid, "content-type": "application/json"},
        data=json.dumps({"sql": query}).encode(),
    )
    if s >= 400:
        sys.exit(f"sql failed: {s} {raw[:300]!r}")
    return json.loads(raw)


def index_by_first(rows: list[tuple[str, int]]) -> dict[str, list[tuple[str, int]]]:
    by_first: dict[str, list[tuple[str, int]]] = defaultdict(list)
    for name, n in rows:
        clean = re.sub(r"\s+SC$|\s+AE$|\s+CAE$|\s+CSM$", "", name, flags=re.IGNORECASE).strip()
        first = clean.split()[0].lower()
        by_first[first].append((clean, n))
    # collapse duplicates after stripping suffixes
    for first, cands in by_first.items():
        agg: dict[str, int] = {}
        for nm, n in cands:
            agg[nm] = agg.get(nm, 0) + n
        by_first[first] = sorted(agg.items(), key=lambda x: -x[1])
    return by_first


def resolve(name: str, by_first: dict[str, list[tuple[str, int]]]) -> tuple[str, list[tuple[str, int]]]:
    """Return (status, candidates).
    status in {'exact', 'unique-initial', 'unique-first', 'ambiguous', 'none'}.
    """
    parts = name.split()
    first = parts[0].lower()
    cands = by_first.get(first, [])
    if not cands:
        return ("none", [])
    # Exact full-name match wins
    exact = [c for c in cands if c[0].lower() == name.lower()]
    if exact:
        return ("exact", exact)
    if len(parts) >= 2 and len(parts[-1]) >= 1:
        initial = parts[-1][0].upper()
        li_match = [c for c in cands
                    if len(c[0].split()) >= 2 and c[0].split()[-1][0].upper() == initial]
        if len(li_match) == 1:
            return ("unique-initial", li_match)
        if len(li_match) > 1:
            return ("ambiguous", li_match)
        return ("none", [])
    # single word
    if len(cands) == 1:
        return ("unique-first", cands)
    return ("ambiguous", cands)


def main():
    sid = get_sid()
    print(f"sid OK; querying NAM SC / FO / FM (FY26-to-date)\n")

    se_rows = sql(sid, f"""
      SELECT `Sales Consultant` AS name, COUNT(*) AS n FROM table {WHERE}
        AND `Sales Consultant` IS NOT NULL AND `Sales Consultant` <> ''
      GROUP BY 1 ORDER BY n DESC
    """)["rows"]
    fo_rows = sql(sid, f"""
      SELECT `Forecast Owner` AS name, COUNT(*) AS n FROM table {WHERE}
        AND `Forecast Owner` IS NOT NULL AND `Forecast Owner` <> ''
      GROUP BY 1 ORDER BY n DESC
    """)["rows"]
    fm_rows = sql(sid, f"""
      SELECT `Forecast Manager` AS name, COUNT(*) AS n FROM table {WHERE}
        AND `Forecast Manager` IS NOT NULL AND `Forecast Manager` <> ''
      GROUP BY 1 ORDER BY n DESC
    """)["rows"]
    se_idx = index_by_first([(r[0], int(r[1])) for r in se_rows])
    fo_idx = index_by_first([(r[0], int(r[1])) for r in fo_rows])
    fm_idx = index_by_first([(r[0], int(r[1])) for r in fm_rows])
    print(f"SC names: {sum(len(v) for v in se_idx.values())}, "
          f"FO: {sum(len(v) for v in fo_idx.values())}, "
          f"FM: {sum(len(v) for v in fm_idx.values())}\n")

    roster = list(csv.DictReader(ROSTER.open()))

    # Categorize each row by which deals column to use
    def lookup_index(r: dict) -> tuple[str, dict]:
        seg = r.get("segment", "")
        tier = r.get("tier", "")
        notes = (r.get("notes") or "")
        role = (r.get("role_type") or "")
        if tier in ("L1", "L2"):
            return "SC", se_idx
        if tier == "L3":
            return "SC", se_idx  # SC Org L3 + segment L3 are all SE pod leaders
        if tier == "L4":
            if "ae_row anchor" in notes:
                return "FM", fm_idx  # AE manager
            return "FO", fo_idx  # AE
        return "SC", se_idx

    confident: list[dict] = []
    ambiguous: list[dict] = []
    unmatched: list[dict] = []

    for r in roster:
        name = (r.get("name") or "").strip()
        if not name or name == "TBD":
            continue
        col, idx = lookup_index(r)
        status, cands = resolve(name, idx)
        rec = {"name": name, "tier": r["tier"], "segment": r["segment"],
               "manager": r["manager_name"], "team_column": r["team_column"],
               "ae_row": r["ae_row"], "notes": r.get("notes", ""),
               "lookup": col, "status": status, "cands": cands}
        if status in ("exact", "unique-initial", "unique-first"):
            confident.append(rec)
        elif status == "ambiguous":
            ambiguous.append(rec)
        else:
            unmatched.append(rec)

    print(f"--- CONFIDENT ({len(confident)}) ---")
    by_change: list[tuple[str, str, str, int, str]] = []  # roster, full, lookup, n, context
    for r in confident:
        full, n = r["cands"][0]
        if r["name"] != full:
            ctx = f"{r['tier']} {r['segment']}"
            by_change.append((r["name"], full, r["lookup"], n, ctx))
    for orig, new, col, n, ctx in sorted(by_change):
        print(f"  {orig:<22} -> {new:<32} via {col} ({n} deals)  [{ctx}]")

    print(f"\n--- AMBIGUOUS ({len(ambiguous)}) — need context-aware resolution ---")
    for r in ambiguous:
        cands_str = ", ".join(f"{c[0]} ({c[1]})" for c in r["cands"][:5])
        ctx = f"{r['tier']} {r['segment']} mgr={r['manager']} pod={r['team_column']} row={r['ae_row']}"
        print(f"  {r['name']:<14} via {r['lookup']:<3} -> {cands_str}")
        print(f"    {ctx}")

    print(f"\n--- UNMATCHED ({len(unmatched)}) ---")
    for r in unmatched:
        ctx = f"{r['tier']} {r['segment']} mgr={r['manager']}"
        if r["name"].split()[0] != r["name"]:
            ctx += f" abbrev"
        print(f"  {r['name']:<22} via {r['lookup']}  [{ctx}]")

    # Emit final nameMap from confident matches only (to avoid bad data)
    out: dict[str, str] = {}
    for r in confident:
        full, n = r["cands"][0]
        if r["name"] != full:
            out[r["name"]] = full
    Path("scripts/nameMap_resolved.json").write_text(json.dumps(out, indent=2, sort_keys=True) + "\n")
    print(f"\nWrote {len(out)} confident aliases to scripts/nameMap_resolved.json")


if __name__ == "__main__":
    main()
