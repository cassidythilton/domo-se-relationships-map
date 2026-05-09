#!/usr/bin/env python3
"""Pad the 11-column cleaned roster CSV out to the 24 columns expected by
the v2 dataset schema, leaving the new columns empty."""
import csv
from pathlib import Path

EXPECTED = [
    "name", "segment", "tier", "manager_name", "role_type", "team_column",
    "ae_row", "segment_label", "sort_order", "is_active", "notes",
    # v2 columns — empty for now; will be derived from deals at runtime
    "primary_pod", "backup_pod", "overlay_pods",
    "primary_alloc_pct", "backup_alloc_pct", "overlay_alloc_pct",
    "specializations", "target_load_pct",
    "hire_date", "tenure_months", "ramp_status",
    "email", "photo_url",
]

src = Path("scripts/sales_org_people_clean.csv")
dst = Path("scripts/sales_org_people_v2.csv")

rows = list(csv.DictReader(src.open()))
with dst.open("w", newline="") as f:
    w = csv.DictWriter(f, fieldnames=EXPECTED)
    w.writeheader()
    for r in rows:
        out = {col: r.get(col, "") for col in EXPECTED}
        w.writerow(out)
print(f"Padded {len(rows)} rows from {src.name} -> {dst.name} ({len(EXPECTED)} columns)")
