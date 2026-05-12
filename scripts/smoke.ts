// Smoke test: import the data layer + selectors directly, run them against
// the inlined sample roster, and verify the V1 model + lens selectors look
// sane. Run with: npm run smoke

import { SAMPLE_PEOPLE } from "../src/data/sampleData.ts";
import { normalize } from "../src/data/normalize.ts";
import {
  applyFilters,
  buildKpis,
  buildRibbon,
  buildSegmentMatrix,
  searchPeople,
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
}));

const model = normalize(raw);

// Anchor rows are filtered out (they\u2019re matrix-layout artifacts that share
// names with SC-org SEs); the remaining count should still be substantial.
expect("normalize: produced real people", model.people.length > 0 && model.people.length < SAMPLE_PEOPLE.length);
expect("normalize: SC org root present", model.byRole.root.length === 1);
expect("normalize: 4+ SE/SA leads", model.byRole.se_lead.length + model.byRole.sa_lead.length >= 4);
expect("normalize: 12 RVPs", model.byRole.rvp.length === 12);
expect("normalize: AEs derived", model.byRole.ae.length > 30);
expect("normalize: edges present", model.edges.length > 30);

const corpNL = buildSegmentMatrix(model, "Corp NL");
expect("matrix Corp NL: 6 RVPs", corpNL.rvpIds.length === 6);
expect("matrix Corp NL: SEs derived", corpNL.seIds.length >= 6);
expect("matrix Corp NL: cells populated", corpNL.cells.size > 5);
expect("matrix Corp NL: total AEs > covered + floaters check", corpNL.coveredAes + corpNL.floaters.length === corpNL.totalAes);

const corpUpsell = buildSegmentMatrix(model, "Corp Upsell");
expect("matrix Corp Upsell: 4 RVPs", corpUpsell.rvpIds.length === 4);
expect("matrix Corp Upsell: cells populated", corpUpsell.cells.size > 5);

const ent = buildSegmentMatrix(model, "ENT");
expect("matrix ENT: 2 RVPs", ent.rvpIds.length === 2);
expect("matrix ENT: cells populated", ent.cells.size > 0);

const ribbon = buildRibbon(model, EMPTY_FILTERS);
expect("ribbon: groups for both sides", ribbon.groups.some((g) => g.side === "se") && ribbon.groups.some((g) => g.side === "sales"));
expect("ribbon: edges \u2208 model.edges", ribbon.edges.length > 0 && ribbon.edges.length <= model.edges.length);
expect("ribbon: AVPs surfaced (some sales groups have an AVP subLabel)", ribbon.groups.some((g) => g.side === "sales" && (g.subLabel === "Keith White" || g.subLabel === "John Pasalano" || g.subLabel === "Andrew Rich")));
console.log(`(model.edges=${model.edges.length}, ribbon.edges=${ribbon.edges.length})`);

const filtered = applyFilters(model, { ...EMPTY_FILTERS, search: "Megha" });
expect("filter: search 'Megha' matches Megha Kumar", filtered.some((p) => p.name === "Megha Kumar"));

const filteredByRole = applyFilters(model, { ...EMPTY_FILTERS, roleType: "ISV" });
expect("filter: roleType=ISV returns only ISV AEs", filteredByRole.every((p) => p.roleKind !== "ae" || p.roleType === "ISV"));

const kpis = buildKpis(model);
expect("kpis: coveragePct in 0..100", kpis.coveragePct >= 0 && kpis.coveragePct <= 100);
expect("kpis: totalAes > 0", kpis.totalAes > 0);
expect("kpis: floaters non-negative", kpis.floaters >= 0);

const search = searchPeople(model, "doug");
expect("search: 'doug' matches at least one person", search.length > 0);

console.log("\nKPIs:", kpis);
console.log("RVPs:", model.byRole.rvp.map((r) => `${r.name} \u2192 ${r.avpName ?? "?"}`).join(", "));
console.log("Floaters:", model.byRole.floater.map((p) => p.name).join(", ") || "(none)");
console.log("Edges sampled:", model.edges.slice(0, 4).map((e) => `${e.seId} \u2192 ${e.aeId}`).join(", "));

console.log("\nDone. Exit code:", process.exitCode || 0);
