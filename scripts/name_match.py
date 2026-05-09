#!/usr/bin/env python3
"""Cross-reference roster CSV (abbreviated names) with the GOLD Salesforce
Opportunities Master deals dataset (full names) and produce:

  1. confident exact matches (first + last initial unique)
  2. ambiguous matches (multiple deal-side candidates)
  3. roster-only people (no deal activity in window)
  4. deals-only SCs (active SE with no roster row)

Run:
  scripts/name_match.py
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
ROSTER_CSV = Path("/Users/cassidy.hilton/Downloads/Sales Org - People.csv")

# Trailing 24-month window for matching (broader than FY-to-date so we don't
# miss SEs who only worked early FY26 deals or recent hires).
WINDOW_SQL = "WHERE `Created Date` > '2024-05-01'"


def http(method, url, *, headers=None, data=None, timeout=60):
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
        "POST",
        f"https://{INSTANCE}/api/query/v1/execute/{DEALS_DS}",
        headers={"x-domo-authentication": sid, "content-type": "application/json"},
        data=json.dumps({"sql": query}).encode(),
    )
    if s >= 400:
        sys.exit(f"sql failed: {s} {raw[:300]!r}")
    return json.loads(raw)


def normalize_token(s: str) -> str:
    """lowercase, strip punctuation/whitespace, drop trailing ' SC' tag."""
    s = re.sub(r"\s+SC$", "", s.strip(), flags=re.IGNORECASE)
    return re.sub(r"[^a-z]", "", s.lower())


def first_word(name: str) -> str:
    return name.strip().split()[0] if name.strip() else ""


def last_initial(name: str) -> str | None:
    parts = name.strip().split()
    return parts[-1][0].upper() if len(parts) >= 2 else None


def main() -> int:
    sid = get_sid()
    print(f"Got sid (len={len(sid)}). Querying deals…\n")

    # Pull all deals-side SC-like names, with deal counts so we can rank
    # ambiguity candidates by signal strength.
    rows = sql(sid, f"""
        SELECT name, COUNT(*) AS n FROM (
          SELECT `Sales Consultant` AS name FROM table {WINDOW_SQL}
            AND `Sales Consultant` IS NOT NULL AND `Sales Consultant` <> ''
          UNION ALL
          SELECT `PoC Sales Consultant` FROM table {WINDOW_SQL}
            AND `PoC Sales Consultant` IS NOT NULL AND `PoC Sales Consultant` <> ''
          UNION ALL
          SELECT `Lead SC` FROM table {WINDOW_SQL}
            AND `Lead SC` IS NOT NULL AND `Lead SC` <> ''
        ) t GROUP BY name ORDER BY n DESC
    """)["rows"]
    deal_names: dict[str, int] = {r[0]: int(r[1]) for r in rows}
    print(f"Found {len(deal_names)} distinct SC-like names in deals window.\n")

    # Build first-name → [(full_name, deal_count)] index
    by_first: dict[str, list[tuple[str, int]]] = defaultdict(list)
    for name, n in deal_names.items():
        clean = re.sub(r"\s+SC$", "", name, flags=re.IGNORECASE).strip()
        first = clean.split()[0].lower()
        by_first[first].append((clean, n))

    # Read roster
    roster = list(csv.DictReader(ROSTER_CSV.open()))
    print(f"Roster has {len(roster)} rows.\n")

    confident: list[tuple[str, str]] = []
    ambiguous: list[dict] = []
    roster_only: list[str] = []
    matched_deal_names: set[str] = set()

    for r in roster:
        name = (r.get("name") or "").strip()
        if not name or name == "TBD":
            continue
        # Already a full name (>= 2 words and last token is a word > 1 char)?
        parts = name.split()
        already_full = len(parts) >= 2 and len(parts[-1]) > 2
        first = parts[0].lower()
        # Resolve based on first-name + last-initial when present
        if already_full:
            li = last_initial(name)
            cands = by_first.get(first, [])
            # exact-name match wins
            exact = [c for c in cands if c[0].lower() == name.lower()]
            if exact:
                confident.append((name, exact[0][0]))
                matched_deal_names.add(exact[0][0])
            else:
                # initial match
                li_match = [c for c in cands if last_initial(c[0]) == li]
                if len(li_match) == 1:
                    confident.append((name, li_match[0][0]))
                    matched_deal_names.add(li_match[0][0])
                elif len(li_match) > 1:
                    ambiguous.append({"roster": name, "candidates": li_match,
                                       "tier": r.get("tier"), "segment": r.get("segment")})
                else:
                    roster_only.append(name)
        else:
            # Single-word or "First L" abbreviation
            li = last_initial(name)  # 'Greg G' -> 'G', 'Brock' -> None
            cands = by_first.get(first, [])
            if not cands:
                roster_only.append(name)
                continue
            if li:
                li_match = [c for c in cands if last_initial(c[0]) == li]
                if len(li_match) == 1:
                    confident.append((name, li_match[0][0]))
                    matched_deal_names.add(li_match[0][0])
                elif len(li_match) > 1:
                    ambiguous.append({"roster": name, "candidates": li_match,
                                       "tier": r.get("tier"), "segment": r.get("segment")})
                else:
                    roster_only.append(name)
            else:
                # No last initial — single word
                if len(cands) == 1:
                    confident.append((name, cands[0][0]))
                    matched_deal_names.add(cands[0][0])
                else:
                    ambiguous.append({"roster": name, "candidates": cands,
                                       "tier": r.get("tier"), "segment": r.get("segment")})

    deals_only = sorted([n for n in deal_names if n not in matched_deal_names
                         and not n.lower().endswith(" sc")],
                        key=lambda n: -deal_names[n])

    print(f"--- CONFIDENT MATCHES ({len(confident)}) ---")
    for r, d in confident:
        if r != d:
            print(f"  {r:<22} -> {d}")
    print()

    print(f"--- AMBIGUOUS ({len(ambiguous)}) ---")
    for a in ambiguous:
        cand_str = ", ".join(f"{c[0]} ({c[1]})" for c in a["candidates"])
        print(f"  {a['roster']:<22} ({a['tier']:<3} {a['segment']:<12}) -> {cand_str}")
    print()

    print(f"--- ROSTER-ONLY ({len(roster_only)}) — no deal activity in window ---")
    for n in roster_only:
        print(f"  {n}")
    print()

    print(f"--- DEALS-ONLY ({len(deals_only)}) — active SC, no roster row ---")
    for n in deals_only[:50]:
        print(f"  {n:<30} {deal_names[n]} deals")

    return 0


if __name__ == "__main__":
    sys.exit(main())
