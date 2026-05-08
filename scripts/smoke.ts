// Smoke test: import the data layer + selectors directly, run them against
// the sample dataset, and verify the derived model and view selectors look
// sane. Run with: node --experimental-strip-types scripts/smoke.ts

import { SAMPLE_PEOPLE } from "../src/data/sampleData.ts";
import { normalize } from "../src/data/normalize.ts";
import {
  applyFilters,
  buildKpis,
  buildLoad,
  buildMatrix,
  buildOrgTree,
  buildReverse,
  buildSpecialistMap,
} from "../src/store/selectors.ts";
import { EMPTY_FILTERS } from "../src/data/types.ts";
import type { RawPerson } from "../src/data/types.ts";

function expect(name: string, cond: unknown, detail = "") {
  if (cond) {
    console.log("ok  -", name);
  } else {
    console.error("FAIL -", name, detail);
    process.exitCode = 1;
  }
}

const num = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

const raw: RawPerson[] = SAMPLE_PEOPLE.map((e) => ({
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
}));

const model = normalize(raw);

expect("normalize: produced people", model.people.length === SAMPLE_PEOPLE.length);
expect("normalize: pods derived", model.pods.length > 0);
expect("normalize: hasCoverageData", model.hasCoverageData === true);
expect("normalize: hasSpecializationData", model.hasSpecializationData === true);

const tree = buildOrgTree(model.people);
expect("orgTree: has root", tree && tree.person.tier === "L1");
expect("orgTree: has L2 children", tree && tree.children.length >= 4);

const corpNL = buildMatrix(model, "Corp NL", model.people);
expect("matrix: Corp NL has columns", corpNL.columns.length > 0);
expect("matrix: Corp NL has rows", corpNL.rows.length > 0);
expect("matrix: Corp NL has cells", corpNL.cellMap.size > 0);

const firstPod = model.pods[0].name;
const reverse = buildReverse(model, firstPod);
expect("reverse: returns entries", reverse.entries.length > 0);

const specMap = buildSpecialistMap(model);
expect("specialistMap: has specs", specMap.specializations.length > 0);
expect("specialistMap: has cells", specMap.cells.size > 0);

const load = buildLoad(model.people);
expect("load: returns rows for L4 only", load.every((r) => r.person.tier === "L4"));
expect("load: sorted desc", load.every((r, i, a) => i === 0 || a[i - 1].load >= r.load));

const kpis = buildKpis(model, model.people);
expect("kpis: coveragePct in 0..100", kpis.coveragePct !== null && kpis.coveragePct >= 0 && kpis.coveragePct <= 100);
expect("kpis: ratioPrimary defined", kpis.ratioPrimary !== null);

const filtered = applyFilters(model, { ...EMPTY_FILTERS, search: "Alex" });
expect("filter: search 'Alex' matches Alex Carter", filtered.some((p) => p.name === "Alex Carter"));

console.log("\nKPIs:", kpis);
console.log("Pods:", model.pods.map((p) => `${p.name}(P${p.primaryCount}/B${p.backupCount}/O${p.overlayCount})`).join(", "));
console.log("\nDone. Exit code:", process.exitCode || 0);
