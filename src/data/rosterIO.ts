// Roster import / export helpers.
//
// Two file formats are supported:
//   * CSV  — RFC-4180 with quoted fields (handles embedded commas/quotes/newlines)
//   * JSON — array of objects whose keys mirror the CSV column names
//
// Column contract (matches the SovRoster AppDB schema and the v2 dataset):

import type { RawPerson } from "./types";

export const ROSTER_COLUMNS: ReadonlyArray<keyof RawPerson> = [
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
];

const REQUIRED_COLUMNS: ReadonlyArray<keyof RawPerson> = [
  "name",
  "segment",
  "tier",
];

export const ROSTER_CSV_HEADER = ROSTER_COLUMNS.join(",");

export const ROSTER_CSV_TEMPLATE = ROSTER_CSV_HEADER + "\n";

export const ROSTER_JSON_TEMPLATE = JSON.stringify(
  [
    Object.fromEntries(ROSTER_COLUMNS.map((c) => [c, ""])),
  ],
  null,
  2,
);

const num = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

/** Build a complete RawPerson from a partial map (any unknown keys ignored). */
export function rowFromMap(m: Record<string, unknown>): RawPerson {
  return {
    name: str(m.name).trim(),
    segment: str(m.segment).trim(),
    tier: str(m.tier).trim(),
    manager_name: str(m.manager_name),
    role_type: str(m.role_type),
    team_column: str(m.team_column),
    ae_row: str(m.ae_row),
    segment_label: str(m.segment_label) || str(m.segment),
    sort_order: num(m.sort_order),
    is_active: str(m.is_active) || "TRUE",
    notes: str(m.notes),
  };
}

// -----------------------------------------------------------------
// CSV \u2014 RFC-4180 parser/serializer
// -----------------------------------------------------------------

export function parseCsv(text: string): Record<string, string>[] {
  // Strip BOM if present
  const t = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let inQuotes = false;
  const len = t.length;
  while (i < len) {
    const c = t[i];
    if (inQuotes) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (c === "\r") {
      // swallow; \r\n handled by \n below
      i += 1;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  // Tail row (file may not end with newline)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    if (cols.length === 1 && cols[0].trim() === "") continue;
    const obj: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      obj[header[c]] = cols[c] ?? "";
    }
    out.push(obj);
  }
  return out;
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function rosterToCsv(rows: RawPerson[]): string {
  const lines: string[] = [ROSTER_CSV_HEADER];
  for (const row of rows) {
    lines.push(
      ROSTER_COLUMNS.map((c) => csvEscape((row as unknown as Record<string, unknown>)[c])).join(","),
    );
  }
  return lines.join("\n") + "\n";
}

// -----------------------------------------------------------------
// JSON
// -----------------------------------------------------------------

export function parseJson(text: string): Record<string, unknown>[] {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as { rows?: unknown }).rows)) {
    return (parsed as { rows: Record<string, unknown>[] }).rows;
  }
  throw new Error("Expected a JSON array of row objects");
}

export function rosterToJson(rows: RawPerson[]): string {
  // Emit only the canonical columns so round-tripping is stable.
  const stripped = rows.map((r) =>
    Object.fromEntries(
      ROSTER_COLUMNS.map((c) => [c, (r as unknown as Record<string, unknown>)[c]]),
    ),
  );
  return JSON.stringify(stripped, null, 2);
}

// -----------------------------------------------------------------
// Validation + parse-and-validate convenience
// -----------------------------------------------------------------

export type ParseResult = {
  rows: RawPerson[];
  warnings: string[];
  errors: string[];
};

export function parseAndValidate(text: string, format: "csv" | "json"): ParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let raw: Record<string, unknown>[] = [];
  try {
    raw = format === "csv" ? parseCsv(text) : parseJson(text);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
    return { rows: [], warnings, errors };
  }

  if (raw.length === 0) {
    errors.push("File contained zero rows.");
    return { rows: [], warnings, errors };
  }

  // Required-column presence (against the FIRST row\u2019s keys for CSV; JSON
  // can have heterogeneous keys but we still need each row to populate them).
  const firstKeys = new Set(Object.keys(raw[0] ?? {}));
  for (const col of REQUIRED_COLUMNS) {
    if (!firstKeys.has(col)) {
      errors.push(`Missing required column "${col}" \u2014 expected one of: ${ROSTER_COLUMNS.join(", ")}`);
    }
  }
  if (errors.length) return { rows: [], warnings, errors };

  const rows: RawPerson[] = [];
  const seenNames = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const m = raw[i];
    const r = rowFromMap(m);
    if (!r.name) {
      warnings.push(`Row ${i + 1} skipped: missing name`);
      continue;
    }
    if (!r.segment) {
      warnings.push(`Row ${i + 1} (${r.name}) skipped: missing segment`);
      continue;
    }
    if (!r.tier) {
      warnings.push(`Row ${i + 1} (${r.name}) skipped: missing tier`);
      continue;
    }
    if (seenNames.has(r.name)) {
      warnings.push(`Row ${i + 1} (${r.name}) skipped: duplicate name in file`);
      continue;
    }
    seenNames.add(r.name);
    rows.push(r);
  }

  return { rows, warnings, errors };
}

// -----------------------------------------------------------------
// Diff helper for the upload preview
// -----------------------------------------------------------------

export type RosterDiff = {
  added: string[];
  updated: string[];
  removed: string[];
  unchanged: string[];
};

function rowKey(r: RawPerson): string {
  return r.name;
}

function rowsEqual(a: RawPerson, b: RawPerson): boolean {
  for (const c of ROSTER_COLUMNS) {
    if (
      (a as unknown as Record<string, unknown>)[c] !==
      (b as unknown as Record<string, unknown>)[c]
    ) {
      return false;
    }
  }
  return true;
}

export type UploadMode = "replace" | "append" | "upsert";

export function diffRoster(
  current: RawPerson[],
  incoming: RawPerson[],
  mode: UploadMode,
): RosterDiff {
  const currentMap = new Map(current.map((r) => [rowKey(r), r]));
  const incomingMap = new Map(incoming.map((r) => [rowKey(r), r]));

  const added: string[] = [];
  const updated: string[] = [];
  const removed: string[] = [];
  const unchanged: string[] = [];

  if (mode === "replace") {
    for (const [k, inc] of incomingMap) {
      const cur = currentMap.get(k);
      if (!cur) added.push(k);
      else if (!rowsEqual(cur, inc)) updated.push(k);
      else unchanged.push(k);
    }
    for (const k of currentMap.keys()) {
      if (!incomingMap.has(k)) removed.push(k);
    }
  } else if (mode === "append") {
    for (const [k, inc] of incomingMap) {
      void inc;
      if (!currentMap.has(k)) added.push(k);
      else unchanged.push(k);
    }
  } else {
    // upsert: add new + update existing if changed (no removes)
    for (const [k, inc] of incomingMap) {
      const cur = currentMap.get(k);
      if (!cur) added.push(k);
      else if (!rowsEqual(cur, inc)) updated.push(k);
      else unchanged.push(k);
    }
  }

  return { added, updated, removed, unchanged };
}
