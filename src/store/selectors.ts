// Pure selectors used by the V1 lenses + Focus.

import type {
  AeRoleType,
  CoverageEdge,
  DerivedModel,
  Filters,
  LoadBucket,
  Person,
  SeLoad,
  SegmentKey,
} from "../data/types";
import { personTitle, segmentLabel } from "../data/types.ts";

// profiles helpers are wired via a runtime registration to keep this
// module importable from pure-Node smoke tests (which don’t pull the
// browser-only Domo toolkit). The browser app calls `setProfilesAdapter`
// at startup; smoke tests leave it null.
type ProfilesAdapter = {
  managerOf: (name: string) => string | null;
  hasManagerData: () => boolean;
};

let PROFILES_ADAPTER: ProfilesAdapter | null = null;

export function setProfilesAdapter(a: ProfilesAdapter | null): void {
  PROFILES_ADAPTER = a;
}

// -----------------------------------------------------------------
// Filtering — applied against the model.people list.
// -----------------------------------------------------------------

export function applyFilters(model: DerivedModel, filters: Filters): Person[] {
  const search = filters.search.trim().toLowerCase();
  return model.people.filter((p) => {
    if (filters.segment && p.segment !== filters.segment && p.segmentKey !== filters.segment)
      return false;
    if (filters.roleType && p.roleType !== filters.roleType) return false;
    if (filters.avp && p.avpName !== filters.avp) return false;
    if (filters.rvpId && p.rvpId !== filters.rvpId) return false;
    if (filters.seId) {
      if (p.id !== filters.seId && p.coveringSeId !== filters.seId) return false;
    }
    if (search) {
      const blob = `${p.name} ${p.role_type} ${p.team_column} ${p.ae_row} ${p.segment} ${p.tier}`.toLowerCase();
      if (!blob.includes(search)) return false;
    }
    return true;
  });
}

// -----------------------------------------------------------------
// SE load (capacity vs ideal ratio).
//
// Each segment has an ideal AE-per-SE ratio (Corp NL = 4, Upsell = 3,
// ENT = 3). For an SE covering across multiple segments, we sum
// per-segment contributions to compute load%:
//
//   contribution = aesInSegment / ratioInSegment
//   loadPct      = sum(contribution) * 100 / 1 = sum * 100
//                  (where 100% means “exactly at full target capacity”)
//
// Effective target = sum of primary-segment-equivalents for display.
// -----------------------------------------------------------------

const OVERLOAD_PCT = 100;
const SLACK_PCT = 60;

function segmentRatios(model: DerivedModel): Record<SegmentKey, number> {
  const out: Record<SegmentKey, number> = { "Corp NL": 4, "Corp Upsell": 3, ENT: 3 };
  for (const s of model.segments) {
    out[s.segment] = s.seToAeRatio || out[s.segment] || 4;
  }
  return out;
}

export function buildSeLoads(model: DerivedModel): Map<string, SeLoad> {
  const ratios = segmentRatios(model);
  const out = new Map<string, SeLoad>();

  // Initialize every SE / SA in SC org with an empty load
  for (const p of model.byRole.se.concat(model.byRole.sa)) {
    if (p.segment !== "SC Org") continue;
    out.set(p.id, {
      seId: p.id,
      coveredCount: 0,
      countBySegment: { "Corp NL": 0, "Corp Upsell": 0, ENT: 0 },
      primarySegment: null,
      primaryTarget: 0,
      effectiveTarget: 0,
      loadPct: 0,
      bucket: "empty",
    });
  }

  // Tally coverage by segment
  for (const e of model.edges) {
    const load = out.get(e.seId);
    if (!load) continue;
    load.coveredCount++;
    load.countBySegment[e.segment] = (load.countBySegment[e.segment] ?? 0) + 1;
  }

  // Compute load% per SE
  for (const load of out.values()) {
    let primarySegment: SegmentKey | null = null;
    let primaryCount = -1;
    let pctSum = 0;
    for (const seg of Object.keys(load.countBySegment) as SegmentKey[]) {
      const n = load.countBySegment[seg];
      if (n > primaryCount) {
        primaryCount = n;
        primarySegment = n > 0 ? seg : primarySegment;
      }
      const ratio = ratios[seg];
      if (ratio > 0) pctSum += (n / ratio) * 100;
    }
    load.primarySegment = primarySegment;
    load.primaryTarget = primarySegment ? ratios[primarySegment] : 0;
    load.effectiveTarget = load.primaryTarget > 0
      ? Math.max(1, Math.round((load.coveredCount / Math.max(pctSum / 100, 0.0001))))
      : 0;
    load.loadPct = Math.round(pctSum);

    if (load.coveredCount === 0) load.bucket = "empty";
    else if (load.loadPct > OVERLOAD_PCT) load.bucket = "overloaded";
    else if (load.loadPct < SLACK_PCT) load.bucket = "slack";
    else load.bucket = "balanced";
  }

  return out;
}

// -----------------------------------------------------------------
// KPI strip — three pills (deals window moved into Discrepancies).
// -----------------------------------------------------------------

export type Kpis = {
  coveragePct: number;
  totalAes: number;
  coveredAes: number;
  floaters: number;
  overloadedSes: number;
  slackSes: number;
  balancedSes: number;
  emptySes: number;
  totalSes: number;
  /** Median load% across non-empty SEs. */
  medianLoadPct: number;
};

export function buildKpis(model: DerivedModel): Kpis {
  const aes = model.byRole.ae;
  const totalAes = aes.length;
  const coveredAes = aes.filter((a) => !!a.coveringSeId).length;
  const coveragePct = totalAes > 0 ? Math.round((coveredAes / totalAes) * 100) : 0;
  const floaters = model.byRole.floater.length;

  const loads = buildSeLoads(model);
  let overloaded = 0;
  let slack = 0;
  let balanced = 0;
  let empty = 0;
  const nonEmptyPcts: number[] = [];
  for (const ld of loads.values()) {
    switch (ld.bucket) {
      case "overloaded": overloaded++; nonEmptyPcts.push(ld.loadPct); break;
      case "balanced": balanced++; nonEmptyPcts.push(ld.loadPct); break;
      case "slack": slack++; nonEmptyPcts.push(ld.loadPct); break;
      default: empty++; break;
    }
  }
  nonEmptyPcts.sort((a, b) => a - b);
  const medianLoadPct = nonEmptyPcts.length
    ? nonEmptyPcts[Math.floor(nonEmptyPcts.length / 2)]
    : 0;

  return {
    coveragePct,
    totalAes,
    coveredAes,
    floaters,
    overloadedSes: overloaded,
    slackSes: slack,
    balancedSes: balanced,
    emptySes: empty,
    totalSes: loads.size,
    medianLoadPct,
  };
}

// -----------------------------------------------------------------
// Segment matrix.
// -----------------------------------------------------------------

export type MatrixCell = {
  rvpId: string;
  seId: string;
  aes: Person[];
};

export type SegmentMatrix = {
  segment: SegmentKey;
  segmentLabel: string;
  segmentLeadName: string | null;
  /** Ideal AE-per-SE ratio for this segment. */
  seToAeRatio: number;
  rvpIds: string[];
  rvpById: Map<string, Person | null>;
  seIds: string[];
  seById: Map<string, Person | null>;
  loadBySe: Map<string, SeLoad>;
  cells: Map<string, MatrixCell>;
  floaters: Person[];
  totalAes: number;
  coveredAes: number;
};

const cellKey = (rvpId: string, seId: string) => `${rvpId}::${seId}`;

export function buildSegmentMatrix(
  model: DerivedModel,
  segment: SegmentKey,
  filters?: Filters,
): SegmentMatrix {
  const segCfg = model.segments.find((s) => s.segment === segment);
  const seToAeRatio = segCfg?.seToAeRatio ?? 4;

  // Apply non-segment filters to AE candidates
  const segAesAll = model.byRole.ae.filter((p) => p.segmentKey === segment);
  let segAes = segAesAll;
  if (filters) {
    segAes = segAes.filter((p) => {
      if (filters.roleType && p.roleType !== filters.roleType) return false;
      if (filters.avp && p.avpName !== filters.avp) return false;
      if (filters.rvpId && p.rvpId !== filters.rvpId) return false;
      if (filters.search) {
        const blob = `${p.name} ${p.role_type}`.toLowerCase();
        if (!blob.includes(filters.search.toLowerCase())) return false;
      }
      return true;
    });
  }

  // RVPs: only those with surviving AEs (or all, if no filters)
  const rvpRows = model.byRole.rvp
    .filter((p) => p.segmentKey === segment)
    .filter((rvp) => {
      if (filters?.rvpId && rvp.id !== filters.rvpId) return false;
      if (filters?.avp && rvp.avpName !== filters.avp) return false;
      return true;
    })
    .sort((a, b) => a.sort_order - b.sort_order);
  const rvpIds = rvpRows.map((p) => p.id);
  const rvpById = new Map<string, Person | null>(rvpRows.map((p) => [p.id, p]));

  // SEs covering at least one surviving AE, plus same-team SEs (for empty rows)
  const seIdsSet = new Set<string>();
  for (const a of segAes) {
    if (a.coveringSeId) seIdsSet.add(a.coveringSeId);
  }
  const lead = segCfg?.leadName;
  // Only show same-team SEs as empty rows when no filter is narrowing AEs
  const filteringActive =
    !!filters &&
    !!(filters.roleType || filters.avp || filters.rvpId || filters.seId || filters.search);
  if (lead && !filteringActive) {
    for (const seId of model.sesByLead.get(lead) ?? []) {
      seIdsSet.add(seId);
    }
  }
  if (filters?.seId) {
    if (!seIdsSet.has(filters.seId)) {
      // Add the explicitly-selected SE even if they don’t cover surviving AEs
      seIdsSet.add(filters.seId);
    }
  }
  const seRows = [...seIdsSet]
    .map((id) => model.byId.get(id))
    .filter((p): p is Person => !!p)
    .filter((p) => !filters?.seId || p.id === filters.seId)
    .sort((a, b) => a.sort_order - b.sort_order);
  const seIds = seRows.map((p) => p.id);
  const seById = new Map<string, Person | null>(seRows.map((p) => [p.id, p]));

  // Cells & floaters
  const cells = new Map<string, MatrixCell>();
  const floaters: Person[] = [];
  for (const a of segAes) {
    if (!a.coveringSeId || !a.rvpId) {
      floaters.push(a);
      continue;
    }
    if (!seIdsSet.has(a.coveringSeId)) continue;
    if (!rvpById.has(a.rvpId)) continue;
    const k = cellKey(a.rvpId, a.coveringSeId);
    let cell = cells.get(k);
    if (!cell) {
      cell = { rvpId: a.rvpId, seId: a.coveringSeId, aes: [] };
      cells.set(k, cell);
    }
    cell.aes.push(a);
  }
  for (const cell of cells.values()) {
    cell.aes.sort((x, y) => x.sort_order - y.sort_order);
  }

  // Load per SE — from full model coverage so the load% reflects total
  // capacity (matches the screen real-estate at the row-head, not the
  // narrowed view).
  const allLoads = buildSeLoads(model);
  const loadBySe = new Map<string, SeLoad>();
  for (const id of seIds) {
    const ld = allLoads.get(id);
    if (ld) loadBySe.set(id, ld);
  }

  return {
    segment,
    segmentLabel: segCfg?.label ?? segment,
    segmentLeadName: segCfg?.leadName ?? null,
    seToAeRatio,
    rvpIds,
    rvpById,
    seIds,
    seById,
    loadBySe,
    cells,
    floaters,
    totalAes: segAesAll.length,
    coveredAes: segAesAll.filter((a) => a.coveringSeId && a.rvpId).length,
  };
}

// -----------------------------------------------------------------
// Full-org bipartite ribbon — filters HIDE both sides cohesively.
// -----------------------------------------------------------------

export type RibbonNode = {
  id: string;
  label: string;
  side: "se" | "sales";
  groupKey: string;
  groupLabel: string;
  subLabel?: string;
  person: Person;
};

export type RibbonGroup = {
  side: "se" | "sales";
  key: string;
  label: string;
  subLabel?: string;
  nodeIds: string[];
};

export type RibbonEdge = CoverageEdge;

export type Ribbon = {
  groups: RibbonGroup[];
  nodes: Map<string, RibbonNode>;
  edges: RibbonEdge[];
};

/**
 * Optional context that scopes the ribbon to a subset of the org based on
 * the current selection. Used by the Overview to auto-narrow Panel 1 to
 * just the relationships that matter for the active selection — so other
 * teams' RVPs / managers / SEs don't visually persist when the user has
 * focused on something specific.
 *
 *   - `managerId` → only that manager's direct-report SEs (and the
 *      AEs/RVPs they cover) survive.
 *   - `seId`      → only that SE survives, and only the AEs they cover.
 *   - `aeId`      → only that AE survives, plus their covering SE.
 *   - `rvpId`     → only that RVP's AEs survive (and SEs covering them).
 *   - `avpName`   → only RVPs/AEs under that AVP survive.
 */
export type RibbonScope = {
  managerId?: string | null;
  rvpId?: string | null;
  avpName?: string | null;
  seId?: string | null;
  aeId?: string | null;
};

export function buildRibbon(
  model: DerivedModel,
  filters: Filters,
  scope: RibbonScope = {},
): Ribbon {
  const search = filters.search.trim().toLowerCase();
  const matchSearch = (p: Person) =>
    !search ||
    `${p.name} ${p.role_type} ${p.tier}`.toLowerCase().includes(search);

  // Step 1: filter AEs by segment / avp / rvpId / roleType / search.
  // Selection scope (`scope.*`) further narrows the sales side without
  // touching the user's filter chips.
  const survivingAes = new Set<string>();
  for (const a of model.byRole.ae) {
    if (filters.segment && a.segmentKey !== filters.segment) continue;
    if (filters.avp && a.avpName !== filters.avp) {
      // a.avpName is null for AEs (only RVPs carry it). Resolve via RVP.
      const rvp = a.rvpId ? model.byId.get(a.rvpId) : null;
      if (!rvp || rvp.avpName !== filters.avp) continue;
    }
    if (filters.rvpId && a.rvpId !== filters.rvpId) continue;
    if (filters.roleType && a.roleType !== filters.roleType) continue;
    if (scope.rvpId && a.rvpId !== scope.rvpId) continue;
    if (scope.avpName) {
      const rvp = a.rvpId ? model.byId.get(a.rvpId) : null;
      if (!rvp || rvp.avpName !== scope.avpName) continue;
    }
    if (scope.aeId && a.id !== scope.aeId) continue;
    if (scope.seId && a.coveringSeId !== scope.seId) continue;
    if (search && !matchSearch(a)) continue;
    survivingAes.add(a.id);
  }

  // Step 2: SEs survive if they (a) match search themselves OR (b) cover
  // at least one surviving AE. Lead-filter (filters.seId) further narrows.
  // When a manager scope is active, restrict to that manager's direct
  // reports (SE/SA only).
  const managerScopeIds = scope.managerId
    ? new Set(
        (model.reportsByManager.get(scope.managerId) ?? [])
          .map((id) => model.byId.get(id))
          .filter(
            (p): p is import("../data/types").Person =>
              !!p && (p.roleKind === "se" || p.roleKind === "sa"),
          )
          .map((p) => p.id),
      )
    : null;
  // Resolve the AE-scope's covering SE up front so we can filter SEs to
  // just that one when an AE is selected.
  const aeScopeCoveringSeId = scope.aeId
    ? model.byId.get(scope.aeId)?.coveringSeId ?? null
    : null;

  const survivingSes = new Set<string>();
  for (const p of model.byRole.se.concat(model.byRole.sa)) {
    if (p.segment !== "SC Org") continue;
    if (filters.seId && p.id !== filters.seId) continue;
    if (managerScopeIds && !managerScopeIds.has(p.id)) continue;
    if (scope.seId && p.id !== scope.seId) continue;
    if (scope.aeId && aeScopeCoveringSeId && p.id !== aeScopeCoveringSeId) continue;
    let keep = false;
    if (search && matchSearch(p)) keep = true;
    if (!keep) {
      const covered = model.coveredAesBySe.get(p.id) ?? [];
      if (covered.some((aid) => survivingAes.has(aid))) keep = true;
    }
    if (keep) survivingSes.add(p.id);
  }

  // Step 2b: if a manager scope is active, drop AEs not covered by the
  // surviving SEs (so the sales side narrows to that manager's book).
  if (managerScopeIds) {
    for (const aeId of [...survivingAes]) {
      const a = model.byId.get(aeId);
      if (!a || !a.coveringSeId || !survivingSes.has(a.coveringSeId)) {
        survivingAes.delete(aeId);
      }
    }
  }

  // Step 3: if SEs were narrowed by filters.seId, drop AEs they don’t cover
  if (filters.seId) {
    for (const aeId of [...survivingAes]) {
      const a = model.byId.get(aeId);
      if (!a || !a.coveringSeId || !survivingSes.has(a.coveringSeId)) {
        survivingAes.delete(aeId);
      }
    }
  }

  // SE side: groups = SE leads (Dan / Tyler / Chris / Laura), filtered to
  // those with surviving SEs.
  const seGroups: RibbonGroup[] = [];
  const nodes = new Map<string, RibbonNode>();
  const orderedLeads: { id: string; label: string; subLabel?: string }[] = [];
  for (const seg of model.segments) {
    const lead = model.byId.get(seg.leadName);
    if (!lead) continue;
    orderedLeads.push({ id: lead.id, label: lead.name, subLabel: seg.label });
  }
  const saLead = model.byId.get("Laura Qualey");
  if (saLead)
    orderedLeads.push({ id: saLead.id, label: saLead.name, subLabel: "Solutions Architects" });

  for (const lead of orderedLeads) {
    const childIds = (model.sesByLead.get(lead.id) ?? []).filter((id) =>
      survivingSes.has(id),
    );
    if (childIds.length === 0) continue;
    seGroups.push({
      side: "se",
      key: lead.id,
      label: lead.label,
      subLabel: lead.subLabel,
      nodeIds: childIds,
    });
    for (const cid of childIds) {
      const p = model.byId.get(cid);
      if (!p) continue;
      nodes.set(cid, {
        id: cid,
        label: p.displayName,
        side: "se",
        groupKey: lead.id,
        groupLabel: lead.label,
        subLabel: personTitle(p),
        person: p,
      });
    }
  }

  // Sales side: RVPs filtered to those with surviving AEs in segment(s).
  const salesGroups: RibbonGroup[] = [];
  for (const seg of model.segments) {
    if (filters.segment && seg.segment !== filters.segment) continue;
    const rvpsInSeg = model.byRole.rvp
      .filter((p) => p.segmentKey === seg.segment)
      .filter((rvp) => {
        if (filters.rvpId && rvp.id !== filters.rvpId) return false;
        if (filters.avp && rvp.avpName !== filters.avp) return false;
        return true;
      })
      .sort((a, b) => a.sort_order - b.sort_order);
    for (const rvp of rvpsInSeg) {
      const aeIds = (model.aesByRvp.get(rvp.id) ?? []).filter((id) =>
        survivingAes.has(id),
      );
      if (aeIds.length === 0) continue;
      salesGroups.push({
        side: "sales",
        key: rvp.id,
        label: rvp.displayName,
        subLabel: rvp.avpName ?? `${seg.label}`,
        nodeIds: aeIds,
      });
      for (const aid of aeIds) {
        const a = model.byId.get(aid);
        if (!a) continue;
        nodes.set(aid, {
          id: aid,
          label: a.displayName,
          side: "sales",
          groupKey: rvp.id,
          groupLabel: rvp.displayName,
          subLabel: personTitle(a),
          person: a,
        });
      }
    }
  }

  // Edges — only include those where both endpoints are present
  const edges = model.edges.filter(
    (e) => nodes.has(e.seId) && nodes.has(e.aeId),
  );

  return {
    groups: [...seGroups, ...salesGroups],
    nodes,
    edges,
  };
}

// -----------------------------------------------------------------
// Search results
// -----------------------------------------------------------------

export type SearchResult = {
  kind: "person";
  id: string;
  name: string;
  sub: string;
  roleKind: Person["roleKind"];
};

export function searchPeople(model: DerivedModel, term: string): SearchResult[] {
  const t = term.trim().toLowerCase();
  if (!t) return [];
  const out: SearchResult[] = [];
  for (const p of model.people) {
    const haystack = `${p.displayName} ${p.name}`.toLowerCase();
    if (haystack.includes(t)) {
      const subParts: string[] = [personTitle(p)];
      if (p.roleKind === "ae") {
        if (p.rvpId) subParts.push(`under ${p.rvpId}`);
        if (p.roleType) subParts.push(`tag: ${p.roleType}`);
      } else if (p.roleKind === "rvp") {
        subParts.push(segmentLabel(p.segment));
        if (p.avpName) subParts.push(`reports to ${p.avpName}`);
      } else if (p.roleKind === "se" || p.roleKind === "sa") {
        const cnt = model.coveredAesBySe.get(p.id)?.length ?? 0;
        subParts.push(`${cnt} AE${cnt === 1 ? "" : "s"} covered`);
      } else if (p.roleKind === "floater") {
        subParts.push("unplaced");
      }
      out.push({
        kind: "person",
        id: p.id,
        name: p.displayName,
        sub: subParts.join(" · "),
        roleKind: p.roleKind,
      });
    }
    if (out.length > 30) break;
  }
  return out.slice(0, 30);
}

// -----------------------------------------------------------------
// Role-type colors — brand-aligned, kept low-saturation.
// -----------------------------------------------------------------

export const ROLE_TYPE_KEYS: AeRoleType[] = [
  "Corporate NL",
  "New Logo",
  "Upsell",
  "Ecosystem",
  "ISV",
  "Domo Everywhere",
  "Extra AE",
];

export function loadBucketLabel(b: LoadBucket): string {
  switch (b) {
    case "overloaded": return "Overloaded";
    case "balanced": return "On target";
    case "slack": return "Has slack";
    case "empty": return "No coverage";
  }
}

// -----------------------------------------------------------------
// Live-data inference — looks at the user-profile dataset to suggest
// AVP mappings for RVPs whose `avp` is unset in orgMap.json.
// -----------------------------------------------------------------

export type AvpSuggestion = {
  rvpId: string;
  rvpName: string;
  rvpFullName: string;
  segment: string;
  /** Suggested AVP display name from the user directory. */
  suggestedAvp: string;
  /** Whether this AVP is already in the known AVP list. */
  alreadyKnown: boolean;
  /** Source of the inference (today: "directory"). */
  source: "directory";
  /** JSON snippet the user can paste into orgMap.json. */
  patch: string;
};

export function suggestAvpFixes(model: DerivedModel): AvpSuggestion[] {
  if (!PROFILES_ADAPTER || !PROFILES_ADAPTER.hasManagerData()) return [];

  const knownAvps = new Set(model.avps);
  const out: AvpSuggestion[] = [];
  for (const rvp of model.byRole.rvp) {
    if (rvp.avpName) continue; // already mapped
    let suggestion: string | null = null;
    const m = PROFILES_ADAPTER.managerOf(rvp.name);
    if (m) suggestion = m;
    if (!suggestion) continue;
    out.push({
      rvpId: rvp.id,
      rvpName: rvp.name,
      rvpFullName: rvp.name,
      segment: rvp.segment,
      suggestedAvp: suggestion,
      alreadyKnown: knownAvps.has(suggestion),
      source: "directory",
      patch: buildOrgMapPatch(rvp, suggestion, knownAvps.has(suggestion)),
    });
  }
  return out;
}

function buildOrgMapPatch(rvp: Person, suggestedAvp: string, alreadyKnown: boolean): string {
  const lines: string[] = [];
  if (!alreadyKnown) {
    lines.push(`// add to "avps":`);
    lines.push(`{ "name": "${suggestedAvp}", "shortName": "${suggestedAvp}" }`);
    lines.push("");
  }
  lines.push(`// in "rvps", set "${rvp.name}" → avp:`);
  lines.push(`"avp": "${suggestedAvp}"`);
  return lines.join("\n");
}

// -----------------------------------------------------------------
// Solutions Architect (SA) overlay — V1 of Shape A.
//
// `pocPartners*` aggregations live on `dealsSnapshot` keyed by deal-system
// names (e.g. "Doug Carter"). The roster's `Person.id` is the raw CSV name
// (sometimes a short alias like "Mike"); `Person.displayName` is the
// resolved full name. We bridge in two steps:
//
//   1. `resolvePocPartner(name, model)` — deal-system name → roster Person
//      via `byId` first (works when the roster carries the full name),
//      then a `displayName` scan (catches short-name → full-name aliases).
//      Returns `null` for names that don't resolve — these surface in the
//      "Unmapped Solutions Architect names" Discrepancies row in V4.
//
//   2. `pocPartnersForSubject(subject, deals)` — given any selectable
//      subject (today: SE / SA / AE), return the ranked partner list for
//      that subject. V1 covers SE/SA/AE; manager/RVP/AVP variants are
//      added in V2 alongside the Panel 2 roster strips.
// -----------------------------------------------------------------

export type PocPartner = {
  /** Deal-system canonical name as stored on `pocPartners.poc`. */
  name: string;
  /** Resolved roster Person, if the name maps. */
  person: Person | null;
  dealCount: number;
};

/**
 * Resolve a deal-system name to a roster Person, or return null when no
 * match exists. V1 strategy: try `byId` (full names match the roster id
 * for most SAs), then fall back to a `displayName` scan.
 */
export function resolvePocPartner(
  name: string,
  model: DerivedModel,
): Person | null {
  if (!name) return null;
  const direct = model.byId.get(name);
  if (direct) return direct;
  for (const p of model.people) {
    if (p.displayName === name) return p;
  }
  return null;
}

/**
 * Returns the ranked Solutions Architect partners for a subject. The subject
 * dictates which `dealsSnapshot` map(s) to consult:
 *   - SE / SA           → `pocPartnersBySc` (the SE on the deal)
 *   - AE                → `pocPartnersByAe` (the forecast owner on the deal)
 *   - SE/SA lead, root  → union of bySc for every direct-report SE/SA
 *   - RVP               → union of byAe for every AE on the RVP's row
 *   - AVP               → union of byAe for every AE in the AVP's book
 *   - floater           → empty (no deal relationships)
 *
 * In every case, deal counts are summed across the union by partner name.
 */
export function pocPartnersForSubject(
  subject: Person | null,
  deals: import("../data/deals").DealsSnapshot | null,
  model: DerivedModel,
): PocPartner[] {
  if (!subject || !deals) return [];

  // Direct lookups for the leaf cases.
  const direct = (raw: Array<{ poc: string; dealCount: number }>): PocPartner[] =>
    raw.map((p) => ({
      name: p.poc,
      person: resolvePocPartner(p.poc, model),
      dealCount: p.dealCount,
    }));

  switch (subject.roleKind) {
    case "se":
    case "sa":
      return direct(deals.pocPartnersBySc.get(subject.displayName) ?? []);
    case "ae":
      return direct(deals.pocPartnersByAe.get(subject.displayName) ?? []);
    case "floater":
      return [];
    case "se_lead":
    case "sa_lead":
    case "root":
      return aggregateByDisplayNames(
        (model.reportsByManager.get(subject.id) ?? [])
          .map((id) => model.byId.get(id))
          .filter(
            (p): p is Person =>
              !!p && (p.roleKind === "se" || p.roleKind === "sa"),
          )
          .map((p) => p.displayName),
        deals.pocPartnersBySc,
        model,
      );
    case "rvp":
      return aggregateByDisplayNames(
        (model.aesByRvp.get(subject.id) ?? [])
          .map((id) => model.byId.get(id))
          .filter((a): a is Person => !!a)
          .map((a) => a.displayName),
        deals.pocPartnersByAe,
        model,
      );
    case "avp": {
      const aeNames: string[] = [];
      for (const rvp of model.byRole.rvp) {
        if (rvp.avpName !== subject.name) continue;
        for (const aeId of model.aesByRvp.get(rvp.id) ?? []) {
          const a = model.byId.get(aeId);
          if (a) aeNames.push(a.displayName);
        }
      }
      return aggregateByDisplayNames(aeNames, deals.pocPartnersByAe, model);
    }
  }
}

function aggregateByDisplayNames(
  names: string[],
  byName: Map<string, Array<{ poc: string; dealCount: number }>>,
  model: DerivedModel,
): PocPartner[] {
  const totals = new Map<string, number>();
  for (const n of names) {
    const list = byName.get(n);
    if (!list) continue;
    for (const p of list) {
      totals.set(p.poc, (totals.get(p.poc) ?? 0) + p.dealCount);
    }
  }
  const out: PocPartner[] = [];
  for (const [name, dealCount] of totals) {
    out.push({ name, person: resolvePocPartner(name, model), dealCount });
  }
  out.sort((a, b) => b.dealCount - a.dealCount);
  return out;
}

// -----------------------------------------------------------------
// Panel 3 fan-out — V2 of Shape A.
//
// `selectionFanout` returns Panel 3's data for any selectable subject.
// It generalizes today's "single AE drill" geometry to a uniform
// fan-out: chain at top, AE-side groups below, scaled to 1..N AEs.
//
// `side` tells the renderer which chain goes on top:
//   - "tech" → SE chain (used when subject is on the SE side)
//   - "comm" → commercial chain pill (used for RVP/AVP selections)
//
// `groups` are the visible body of the panel. Each group has a head
// (RVP+AVP, OR covering-SE chain when subject is RVP) and a list of
// AE cards, optionally with deal counts (for SA/manager subjects whose
// AE relationships are deal-derived).
// -----------------------------------------------------------------

export type FanoutAe = {
  ae: Person;
  /** Optional — present when AE is sourced from deals (SA / manager). */
  dealCount?: number;
};

export type FanoutGroup = {
  /** Stable id for the group (e.g. RVP id or "se:<id>"). */
  key: string;
  /** Group label when no specific RVP is in play (e.g. covering-SE name). */
  label: string;
  /** Sub-label (e.g. AVP name, role-type, segment). */
  subLabel?: string;
  /** When the group head represents an RVP, this is the RVP Person. */
  rvp: Person | null;
  /** AVP name shown next to the group head (when known). */
  avpName: string | null;
  /** Group head as a clickable Person (RVP for RVP-grouped, SE for SE-grouped). */
  headPerson: Person | null;
  aes: FanoutAe[];
};

export type SelectionFanout = {
  subject: Person | null;
  /** Empty title hint for the renderer. "{verb}: {name} → {scopeText}". */
  verb: string;
  scopeText: string;
  /** Which chain to render at the top of the panel. */
  side: "tech" | "comm";
  /** Manager / commercial chain pills. Excludes the subject itself. */
  chain: Person[];
  /** Whether the subject's pill should render as the "active" tail. */
  showSubjectInChain: boolean;
  /** Body groups. */
  groups: FanoutGroup[];
  /** Aggregate stats. */
  totalAes: number;
  totalRvps: number;
  totalAvps: number;
  /** True when the subject is an SA (panel suppresses bench, shows engagement stats). */
  isSa: boolean;
  /** Total deal count across deal-derived AEs (SA case only). */
  totalDeals: number;
};

const EMPTY_FANOUT: SelectionFanout = {
  subject: null,
  verb: "Relationships",
  scopeText: "no AE in scope",
  side: "tech",
  chain: [],
  showSubjectInChain: false,
  groups: [],
  totalAes: 0,
  totalRvps: 0,
  totalAvps: 0,
  isSa: false,
  totalDeals: 0,
};

export function selectionFanout(
  model: DerivedModel,
  subject: Person | null,
  deals: import("../data/deals").DealsSnapshot | null = null,
): SelectionFanout {
  if (!subject) return EMPTY_FANOUT;

  switch (subject.roleKind) {
    case "ae":
      return fanoutForAe(model, subject);
    case "se":
      return fanoutForSe(model, subject);
    case "sa":
      return fanoutForSa(model, subject, deals);
    case "se_lead":
    case "sa_lead":
    case "root":
      return fanoutForManager(model, subject);
    case "rvp":
      return fanoutForRvp(model, subject);
    case "avp":
      return fanoutForAvp(model, subject);
    case "floater":
      return { ...EMPTY_FANOUT, subject, scopeText: "unplaced — no asserted coverage" };
  }
}

function chainFor(model: DerivedModel, id: string): Person[] {
  const out: Person[] = [];
  let cursor = model.byId.get(id);
  if (!cursor) return out;
  let next = cursor.manager_name ? model.byId.get(cursor.manager_name) : undefined;
  const seen = new Set<string>([cursor.id]);
  while (next && !seen.has(next.id)) {
    out.push(next);
    seen.add(next.id);
    next = next.manager_name ? model.byId.get(next.manager_name) : undefined;
  }
  return out.reverse(); // root → ... → manager (excludes subject)
}

function groupAesByRvp(model: DerivedModel, aes: FanoutAe[]): FanoutGroup[] {
  const byRvp = new Map<string, FanoutAe[]>();
  for (const f of aes) {
    const k = f.ae.rvpId ?? "_unassigned";
    if (!byRvp.has(k)) byRvp.set(k, []);
    byRvp.get(k)!.push(f);
  }
  const groups: FanoutGroup[] = [];
  for (const [rvpId, list] of byRvp) {
    const rvp = rvpId === "_unassigned" ? null : model.byId.get(rvpId) ?? null;
    list.sort((a, b) => (a.ae.sort_order ?? 0) - (b.ae.sort_order ?? 0));
    groups.push({
      key: rvpId,
      label: rvp?.displayName ?? "Unassigned",
      subLabel: rvp?.avpName ?? undefined,
      rvp,
      avpName: rvp?.avpName ?? null,
      headPerson: rvp,
      aes: list,
    });
  }
  groups.sort((a, b) => (a.rvp?.sort_order ?? 9999) - (b.rvp?.sort_order ?? 9999));
  return groups;
}

function countDistinctAvps(groups: FanoutGroup[]): number {
  const set = new Set<string>();
  for (const g of groups) if (g.avpName) set.add(g.avpName);
  return set.size;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function scopeLabel(totalAes: number, totalRvps: number): string {
  if (totalAes === 0) return "no AEs in scope";
  if (totalAes === 1) return "1 AE in scope";
  return `${plural(totalAes, "AE")} across ${plural(totalRvps, "RVP")}`;
}

function fanoutForAe(model: DerivedModel, ae: Person): SelectionFanout {
  const seId = ae.coveringSeId;
  const se = seId ? model.byId.get(seId) ?? null : null;
  const chain = se ? [...chainFor(model, se.id), se] : [];
  const groups = groupAesByRvp(model, [{ ae }]);
  return {
    subject: ae,
    verb: "Relationships",
    scopeText: "1 AE in scope",
    side: "tech",
    chain,
    showSubjectInChain: false,
    groups,
    totalAes: 1,
    totalRvps: groups.length,
    totalAvps: countDistinctAvps(groups),
    isSa: false,
    totalDeals: 0,
  };
}

function fanoutForSe(model: DerivedModel, se: Person): SelectionFanout {
  const aeIds = model.coveredAesBySe.get(se.id) ?? [];
  const aes: FanoutAe[] = aeIds
    .map((id) => model.byId.get(id))
    .filter((a): a is Person => !!a)
    .map((ae) => ({ ae }));
  const groups = groupAesByRvp(model, aes);
  return {
    subject: se,
    verb: "Relationships",
    scopeText: scopeLabel(aes.length, groups.length),
    side: "tech",
    chain: chainFor(model, se.id),
    showSubjectInChain: true,
    groups,
    totalAes: aes.length,
    totalRvps: groups.length,
    totalAvps: countDistinctAvps(groups),
    isSa: false,
    totalDeals: 0,
  };
}

function fanoutForSa(
  model: DerivedModel,
  sa: Person,
  deals: import("../data/deals").DealsSnapshot | null,
): SelectionFanout {
  // SAs don't have asserted coverage — their AE relationships come from
  // deals. We pull every (sc, ae, poc) row where poc resolves to this SA,
  // bucket by AE, and resolve each to a roster Person.
  const byAe = new Map<string, number>();
  if (deals) {
    for (const e of deals.pocPartners) {
      if (!e.poc || !e.ae) continue;
      const pocPerson = resolvePocPartner(e.poc, model);
      if (pocPerson?.id !== sa.id) continue;
      byAe.set(e.ae, (byAe.get(e.ae) ?? 0) + e.dealCount);
    }
  }
  const aes: FanoutAe[] = [];
  let totalDeals = 0;
  for (const [aeName, dealCount] of byAe) {
    const ae = resolvePocPartner(aeName, model);
    if (!ae) continue; // unmapped names surface in V4 discrepancies
    aes.push({ ae, dealCount });
    totalDeals += dealCount;
  }
  const groups = groupAesByRvp(model, aes);
  return {
    subject: sa,
    verb: "Engagements",
    scopeText:
      aes.length === 0
        ? "no engagements in current window"
        : `${plural(aes.length, "AE")} across ${plural(groups.length, "RVP")}`,
    side: "tech",
    chain: chainFor(model, sa.id),
    showSubjectInChain: true,
    groups,
    totalAes: aes.length,
    totalRvps: groups.length,
    totalAvps: countDistinctAvps(groups),
    isSa: true,
    totalDeals,
  };
}

function fanoutForManager(model: DerivedModel, mgr: Person): SelectionFanout {
  const directIds = model.reportsByManager.get(mgr.id) ?? [];
  const aes: FanoutAe[] = [];
  for (const id of directIds) {
    const p = model.byId.get(id);
    if (!p || (p.roleKind !== "se" && p.roleKind !== "sa")) continue;
    for (const aeId of model.coveredAesBySe.get(p.id) ?? []) {
      const ae = model.byId.get(aeId);
      if (ae) aes.push({ ae });
    }
  }
  const groups = groupAesByRvp(model, aes);
  return {
    subject: mgr,
    verb: "Relationships",
    scopeText: scopeLabel(aes.length, groups.length),
    side: "tech",
    chain: chainFor(model, mgr.id),
    showSubjectInChain: true,
    groups,
    totalAes: aes.length,
    totalRvps: groups.length,
    totalAvps: countDistinctAvps(groups),
    isSa: false,
    totalDeals: 0,
  };
}

function fanoutForRvp(model: DerivedModel, rvp: Person): SelectionFanout {
  // RVP-side selection: invert the geometry. The commercial chain (RVP+AVP)
  // is implied by the panel head; group AEs by their *covering SE* so the
  // panel reads "this RVP's AEs, by who supports them on the SE side".
  const aeIds = model.aesByRvp.get(rvp.id) ?? [];
  const bySe = new Map<string, FanoutAe[]>();
  let totalAes = 0;
  for (const aeId of aeIds) {
    const ae = model.byId.get(aeId);
    if (!ae) continue;
    totalAes++;
    const seKey = ae.coveringSeId ?? "_unassigned";
    if (!bySe.has(seKey)) bySe.set(seKey, []);
    bySe.get(seKey)!.push({ ae });
  }
  const groups: FanoutGroup[] = [];
  for (const [seId, list] of bySe) {
    const se = seId === "_unassigned" ? null : model.byId.get(seId) ?? null;
    list.sort((a, b) => (a.ae.sort_order ?? 0) - (b.ae.sort_order ?? 0));
    groups.push({
      key: `se:${seId}`,
      label: se?.displayName ?? "Unassigned",
      subLabel: se ? personTitle(se) : undefined,
      rvp: null,
      avpName: null,
      headPerson: se,
      aes: list,
    });
  }
  groups.sort((a, b) => (a.headPerson?.sort_order ?? 9999) - (b.headPerson?.sort_order ?? 9999));
  // Commercial chain at the top: AVP (if known) → RVP itself becomes the
  // subject pill at the chain's tail.
  const chain: Person[] = [];
  if (rvp.avpName) {
    const avp = model.byId.get(rvp.avpName);
    if (avp) chain.push(avp);
  }

  return {
    subject: rvp,
    verb: "AEs on row",
    scopeText:
      totalAes === 0
        ? "no AEs on this RVP's row"
        : `${plural(totalAes, "AE")} across ${plural(groups.length, "covering SE")}`,
    side: "comm",
    chain,
    showSubjectInChain: true,
    groups,
    totalAes,
    // For "comm" side selections, this slot is interpreted as the
    // dominant secondary grouping (covering SE count). The renderer
    // labels it accordingly.
    totalRvps: groups.length,
    totalAvps: rvp.avpName ? 1 : 0,
    isSa: false,
    totalDeals: 0,
  };
}

// -----------------------------------------------------------------
// SA-centric Panel 2 — V3 of Shape A.
//
// `saEngagements` returns the SA's by-covering-SE engagement footprint:
// for each SE Doug has partnered with, the AEs he supported and the
// per-(SE, AE) deal counts. Complements `selectionFanout` for SAs (which
// groups by RVP). Panel 2 uses this to render a matrix-row equivalent
// honest to the SA's actual deal pattern (no asserted coverage to fake).
// -----------------------------------------------------------------

export type SaEngagementAe = {
  ae: Person;
  dealCount: number;
};

export type SaEngagementColumn = {
  /** The covering SE Person on the asserted roster. */
  se: Person;
  totalDealCount: number;
  aes: SaEngagementAe[];
};

export type SaEngagements = {
  sa: Person;
  columns: SaEngagementColumn[];
  totalDeals: number;
  totalSes: number;
  totalAes: number;
};

const EMPTY_SA_ENGAGEMENTS = (sa: Person): SaEngagements => ({
  sa,
  columns: [],
  totalDeals: 0,
  totalSes: 0,
  totalAes: 0,
});

// -----------------------------------------------------------------
// Discrepancies — Solutions Architect coverage gaps (V4 of Shape A).
// -----------------------------------------------------------------

export type PocGapUncoveredAe = {
  ae: Person;
  pipelineAcv: number;
  dealCount: number;
};

export type PocGapObservedNotAsserted = {
  scName: string;
  aeName: string;
  scPerson: Person;
  aePerson: Person;
  partners: Array<{ poc: string; dealCount: number }>;
};

export type PocGapUnmappedName = {
  /** Where in the deals data this name appears. */
  source: "sc" | "ae" | "poc";
  name: string;
  dealCount: number;
};

export type PocGapIdleSa = {
  sa: Person;
};

export type PocCoverageGaps = {
  uncoveredAesWithPipeline: PocGapUncoveredAe[];
  observedNotAsserted: PocGapObservedNotAsserted[];
  unmappedNames: PocGapUnmappedName[];
  idleSas: PocGapIdleSa[];
};

const EMPTY_POC_GAPS: PocCoverageGaps = {
  uncoveredAesWithPipeline: [],
  observedNotAsserted: [],
  unmappedNames: [],
  idleSas: [],
};

export function pocCoverageGaps(
  model: DerivedModel,
  deals: import("../data/deals").DealsSnapshot | null,
): PocCoverageGaps {
  if (!deals) return EMPTY_POC_GAPS;

  // 1. AEs with active pipeline & no SA partner.
  const uncoveredAesWithPipeline: PocGapUncoveredAe[] = [];
  for (const aeMetric of deals.aeMetrics) {
    if (aeMetric.pipelineAcv <= 0) continue;
    const partners = deals.pocPartnersByAe.get(aeMetric.name);
    if (partners && partners.length > 0) continue;
    const ae = resolvePocPartner(aeMetric.name, model);
    if (!ae) continue; // unmapped names land in the unmapped row group below
    uncoveredAesWithPipeline.push({
      ae,
      pipelineAcv: aeMetric.pipelineAcv,
      dealCount: aeMetric.totalDealCount,
    });
  }
  uncoveredAesWithPipeline.sort((a, b) => b.pipelineAcv - a.pipelineAcv);

  // 2. Observed (sc, ae) pairs missing from the asserted matrix. We need
  //    both endpoints to resolve to roster Persons; the pair is missing
  //    if `model.edges` has no (seId, aeId) entry. We aggregate per-pair
  //    so the row group dedupes if the same pair appears across multiple
  //    SA rows.
  const assertedPairs = new Set<string>();
  for (const e of model.edges) assertedPairs.add(`${e.seId}::${e.aeId}`);
  const observedPairs = new Map<string, PocGapObservedNotAsserted>();
  for (const e of deals.pocPartners) {
    if (!e.sc || !e.ae) continue;
    const sc = resolvePocPartner(e.sc, model);
    const ae = resolvePocPartner(e.ae, model);
    if (!sc || !ae) continue;
    const k = `${sc.id}::${ae.id}`;
    if (assertedPairs.has(k)) continue;
    let row = observedPairs.get(k);
    if (!row) {
      row = {
        scName: e.sc,
        aeName: e.ae,
        scPerson: sc,
        aePerson: ae,
        partners: [],
      };
      observedPairs.set(k, row);
    }
    const existing = row.partners.find((p) => p.poc === e.poc);
    if (existing) existing.dealCount += e.dealCount;
    else row.partners.push({ poc: e.poc, dealCount: e.dealCount });
  }
  for (const row of observedPairs.values()) {
    row.partners.sort((a, b) => b.dealCount - a.dealCount);
  }
  const observedNotAsserted = [...observedPairs.values()].sort(
    (a, b) => sumDealCount(b.partners) - sumDealCount(a.partners),
  );

  // 3. Unmapped names. Three sources: sc, ae, poc. We want to surface
  //    names that don't resolve to a roster Person — those are the
  //    nameMap drift the user can fix in `src/config/nameMap.json`.
  const unmappedTotals = new Map<string, PocGapUnmappedName>();
  const recordUnmapped = (name: string, source: PocGapUnmappedName["source"], n: number) => {
    if (!name) return;
    if (resolvePocPartner(name, model)) return;
    const k = `${source}::${name}`;
    const existing = unmappedTotals.get(k);
    if (existing) existing.dealCount += n;
    else unmappedTotals.set(k, { source, name, dealCount: n });
  };
  for (const e of deals.pocPartners) {
    recordUnmapped(e.sc, "sc", e.dealCount);
    if (e.ae) recordUnmapped(e.ae, "ae", e.dealCount);
    recordUnmapped(e.poc, "poc", e.dealCount);
  }
  const unmappedNames = [...unmappedTotals.values()].sort(
    (a, b) => b.dealCount - a.dealCount,
  );

  // 4. Idle SAs — roster SAs that don't appear in any pocPartners row.
  const activeSaIds = new Set<string>();
  for (const e of deals.pocPartners) {
    if (!e.poc) continue;
    const p = resolvePocPartner(e.poc, model);
    if (p) activeSaIds.add(p.id);
  }
  const idleSas: PocGapIdleSa[] = model.byRole.sa
    .filter((sa) => !activeSaIds.has(sa.id))
    .map((sa) => ({ sa }));

  return {
    uncoveredAesWithPipeline,
    observedNotAsserted,
    unmappedNames,
    idleSas,
  };
}

function sumDealCount(list: Array<{ dealCount: number }>): number {
  let total = 0;
  for (const x of list) total += x.dealCount;
  return total;
}

export function saEngagements(
  model: DerivedModel,
  sa: Person,
  deals: import("../data/deals").DealsSnapshot | null,
): SaEngagements {
  if (!deals) return EMPTY_SA_ENGAGEMENTS(sa);

  // Group raw pocPartner rows where poc resolves to this SA.
  // Bucket by covering SE name (deal-system), then by AE.
  type Bucket = Map<string, Map<string, number>>; // sc → ae → dealCount
  const bucket: Bucket = new Map();
  for (const e of deals.pocPartners) {
    if (!e.sc || !e.ae || !e.poc) continue;
    const pocPerson = resolvePocPartner(e.poc, model);
    if (pocPerson?.id !== sa.id) continue;
    if (!bucket.has(e.sc)) bucket.set(e.sc, new Map());
    const aeMap = bucket.get(e.sc)!;
    aeMap.set(e.ae, (aeMap.get(e.ae) ?? 0) + e.dealCount);
  }

  const columns: SaEngagementColumn[] = [];
  let totalDeals = 0;
  const allAes = new Set<string>();
  for (const [scName, aeMap] of bucket) {
    const se = resolvePocPartner(scName, model);
    if (!se) continue; // unmapped SE name — surfaced in V4 discrepancies
    const aes: SaEngagementAe[] = [];
    let columnDeals = 0;
    for (const [aeName, dealCount] of aeMap) {
      const ae = resolvePocPartner(aeName, model);
      if (!ae) continue;
      aes.push({ ae, dealCount });
      columnDeals += dealCount;
      allAes.add(ae.id);
      totalDeals += dealCount;
    }
    if (aes.length === 0) continue;
    aes.sort((a, b) => b.dealCount - a.dealCount);
    columns.push({ se, totalDealCount: columnDeals, aes });
  }
  columns.sort((a, b) => b.totalDealCount - a.totalDealCount);

  return {
    sa,
    columns,
    totalDeals,
    totalSes: columns.length,
    totalAes: allAes.size,
  };
}

function fanoutForAvp(model: DerivedModel, avp: Person): SelectionFanout {
  // AVP-side selection: groups are RVPs in the AVP's book; cards are AEs
  // grouped under each RVP.
  const groups: FanoutGroup[] = [];
  let totalAes = 0;
  const rvps = model.byRole.rvp
    .filter((r) => r.avpName === avp.name)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  for (const rvp of rvps) {
    const aeIds = model.aesByRvp.get(rvp.id) ?? [];
    const aes: FanoutAe[] = [];
    for (const aeId of aeIds) {
      const ae = model.byId.get(aeId);
      if (!ae) continue;
      aes.push({ ae });
      totalAes++;
    }
    aes.sort((a, b) => (a.ae.sort_order ?? 0) - (b.ae.sort_order ?? 0));
    groups.push({
      key: rvp.id,
      label: rvp.displayName,
      subLabel: avp.displayName,
      rvp,
      avpName: avp.name,
      headPerson: rvp,
      aes,
    });
  }
  return {
    subject: avp,
    verb: "AEs in book",
    scopeText:
      totalAes === 0
        ? "no AEs in this AVP's book"
        : `${plural(totalAes, "AE")} across ${plural(groups.length, "RVP")}`,
    side: "comm",
    chain: [],
    showSubjectInChain: true,
    groups,
    totalAes,
    totalRvps: groups.length,
    totalAvps: 1,
    isSa: false,
    totalDeals: 0,
  };
}
