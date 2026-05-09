#!/usr/bin/env python3
"""
Take the user-provided roster CSV, apply confirmed cleanups, and produce:

  scripts/sales_org_people_clean.csv   <- upload this to dataset c92d8b58
  src/config/nameMap.json              <- ships with the app

The nameMap is built from two sources:
  1. data-verified aliases from scripts/nameMap_resolved.json
     (produced by scripts/resolve_ae_names.py — tier-aware lookups against
     deals dataset eac44ae6, scoped to NAM + FY26-to-date)
  2. a small set of manually-verified extras for L3 SC Org typos/aliases
     that the resolver couldn't see (because their roster name has the typo)

Discrepancies the resolver couldn't resolve will be surfaced in-app via
the new Discrepancies tab so the user can fix the source roster.
"""
from __future__ import annotations
import csv
import json
from pathlib import Path

ROSTER_IN = Path("/Users/cassidy.hilton/Downloads/Sales Org - People.csv")
ROSTER_OUT = Path("scripts/sales_org_people_clean.csv")
RESOLVED = Path("scripts/nameMap_resolved.json")
NAMEMAP_OUT = Path("src/config/nameMap.json")

# 1) Roster typo fixes — apply to `name` AND any `manager_name` references.
ROSTER_RENAMES: dict[str, str] = {
    "Issaac Thacker": "Isaac Thacker",
    "Megha Kimar":    "Megha Kumar",
    "Mike harding":   "Mike Harding",
}

# 2) Rows to drop entirely (confirmed with user).
ROWS_TO_DROP: list[dict[str, str]] = [
    # ENT row 133: "Dan,ENT,L4,,New Logo,Taylor,Matt,Enterprise,14,TRUE,"
    # User confirmed: this is Dan Gouveia (an SC Org L3 SE) listed in
    # the AE row by mistake.
    {"name": "Dan", "segment": "ENT", "tier": "L4", "ae_row": "Matt"},
]

# 3) Manager-name canonicalization — short forms expand to full L1/L2 names.
MANAGER_EXPAND: dict[str, str] = {
    "Cassidy": "Cassidy Hilton",
    "Dan":     "Dan Wentworth",
    "Tyler":   "Tyler Clark",
    "Chris":   "Chris Hunter",
    "LQ":      "Laura Qualey",
    "Blake":   "Blake Woodward",
}

# 4) Manual extras for the nameMap. The resolver couldn't see these because
#    the roster name itself was wrong/abbreviated; after the roster rename
#    pass these become the canonical "roster name = deals name" identity.
#    These are SC Org L3 SE alias mismatches verified in the NAM SC list.
MANUAL_EXTRAS: dict[str, str] = {
    "Rob Jusino":   "Robert Jusino",
    "Matt Newsom":  "Matthew Newsom",
    # After roster rename, "Issaac Thacker" -> "Isaac Thacker"; deals also
    # uses "Isaac Thacker", so no alias needed (identity).
    # Same for "Megha Kumar" and "Mike Harding".
}


def main() -> None:
    rows = list(csv.DictReader(ROSTER_IN.open()))
    print(f"Read {len(rows)} rows from {ROSTER_IN.name}")

    # Drop bad rows
    def keep(r: dict) -> bool:
        for d in ROWS_TO_DROP:
            if all(r.get(k) == v for k, v in d.items()):
                return False
        return True
    before = len(rows)
    rows = [r for r in rows if keep(r)]
    print(f"Dropped {before - len(rows)} rows.")

    # Apply renames
    for r in rows:
        if r["name"] in ROSTER_RENAMES:
            r["name"] = ROSTER_RENAMES[r["name"]]
        if r.get("manager_name") in ROSTER_RENAMES:
            r["manager_name"] = ROSTER_RENAMES[r["manager_name"]]
        if r.get("manager_name") in MANAGER_EXPAND:
            r["manager_name"] = MANAGER_EXPAND[r["manager_name"]]

    # Write cleaned CSV
    ROSTER_OUT.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = list(rows[0].keys())
    with ROSTER_OUT.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)
    print(f"Wrote {len(rows)} cleaned rows to {ROSTER_OUT}")

    # Build final nameMap = resolver output + manual extras
    resolved: dict[str, str] = json.loads(RESOLVED.read_text()) if RESOLVED.exists() else {}
    final_map = dict(resolved)
    final_map.update(MANUAL_EXTRAS)
    NAMEMAP_OUT.parent.mkdir(parents=True, exist_ok=True)
    NAMEMAP_OUT.write_text(json.dumps(final_map, indent=2, sort_keys=True) + "\n")
    print(f"Wrote {len(final_map)} entries to {NAMEMAP_OUT}")
    print(f"  ({len(resolved)} from resolver, {len(MANUAL_EXTRAS)} manual extras)")


if __name__ == "__main__":
    main()
