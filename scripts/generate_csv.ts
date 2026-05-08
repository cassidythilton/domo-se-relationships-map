// Emit a CSV of the sample dataset to scripts/sales_org_people.csv.
// Run with: node --experimental-strip-types --no-warnings scripts/generate_csv.ts

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SAMPLE_PEOPLE } from "../src/data/sampleData.ts";

const COLUMNS = [
  "name",
  "segment",
  "tier",
  "manager_name",
  "role_type",
  "team_column",
  "ae_row",
  "segment_label",
  "sort_order",
  "is_active",
  "notes",
  "primary_pod",
  "backup_pod",
  "overlay_pods",
  "primary_alloc_pct",
  "backup_alloc_pct",
  "overlay_alloc_pct",
  "specializations",
  "target_load_pct",
  "hire_date",
  "tenure_months",
  "ramp_status",
  "email",
  "photo_url",
];

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const lines: string[] = [];
lines.push(COLUMNS.join(","));
for (const row of SAMPLE_PEOPLE) {
  const r = row as Record<string, unknown>;
  lines.push(COLUMNS.map((c) => csvEscape(r[c])).join(","));
}

const here = resolve(fileURLToPath(new URL(".", import.meta.url)));
const out = resolve(here, "sales_org_people.csv");
writeFileSync(out, lines.join("\n") + "\n", "utf8");
console.log(`Wrote ${SAMPLE_PEOPLE.length} rows to ${out}`);
