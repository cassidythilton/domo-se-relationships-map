import Query from "@domoinc/query";
import type { RawPerson } from "./types";

const SELECT_COLS = [
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

const num = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

const cleanRow = (e: Record<string, unknown>): RawPerson => ({
  name: str(e.name),
  segment: str(e.segment),
  tier: str(e.tier),
  manager_name: str(e.manager_name),
  role_type: str(e.role_type),
  team_column: str(e.team_column),
  ae_row: str(e.ae_row),
  segment_label: str(e.segment_label) || str(e.segment),
  sort_order: num(e.sort_order),
  is_active: str(e.is_active),
  notes: str(e.notes),
  primary_pod: str(e.primary_pod),
  backup_pod: str(e.backup_pod),
  overlay_pods: str(e.overlay_pods),
  primary_alloc_pct: num(e.primary_alloc_pct),
  backup_alloc_pct: num(e.backup_alloc_pct),
  overlay_alloc_pct: num(e.overlay_alloc_pct),
  specializations: str(e.specializations),
  target_load_pct: e.target_load_pct === undefined || e.target_load_pct === "" ? undefined : num(e.target_load_pct),
  hire_date: str(e.hire_date),
  tenure_months: e.tenure_months === undefined || e.tenure_months === "" ? undefined : num(e.tenure_months),
  ramp_status: str(e.ramp_status),
  email: str(e.email),
  photo_url: str(e.photo_url),
});

export async function loadPeople(): Promise<RawPerson[]> {
  try {
    const result = await new Query()
      .select(SELECT_COLS)
      .where("is_active")
      .equals("TRUE")
      .fetch("salesOrgPeople");
    const rows: Array<Record<string, unknown>> = Array.isArray(result)
      ? (result as unknown as Array<Record<string, unknown>>)
      : (((result as unknown as { rows?: Array<Record<string, unknown>> })?.rows) ?? []);
    return rows.map(cleanRow).sort((a, b) => a.sort_order - b.sort_order);
  } catch (err) {
    if (import.meta.env.DEV) {
      const sample = await import("./sampleData").then((m) => m.SAMPLE_PEOPLE);
      return sample.map((r) => cleanRow(r as Record<string, unknown>)).sort((a, b) => a.sort_order - b.sort_order);
    }
    throw err;
  }
}
