// Observed-coverage selectors and discrepancy detection.
// Joins the asserted roster (DerivedModel) with the deals snapshot
// (DealsSnapshot) using a name-resolution map.

import type { DealsSnapshot, SeMetric } from "../data/deals";
import type { DerivedModel, Person } from "../data/types";
import nameMapJson from "../config/nameMap.json";

const NAME_MAP: Record<string, string> = nameMapJson as Record<string, string>;

/** Roster name -> deal-system canonical name. Identity if no entry. */
export function rosterToDealName(rosterName: string): string {
  return NAME_MAP[rosterName] ?? rosterName;
}

/** Build the inverse map for deal-system name -> roster name(s).
 *  A deal name can map to multiple roster rows (rare). */
function buildInverseMap(): Map<string, string[]> {
  const inv = new Map<string, string[]>();
  for (const [roster, deal] of Object.entries(NAME_MAP)) {
    const arr = inv.get(deal) ?? [];
    arr.push(roster);
    inv.set(deal, arr);
  }
  return inv;
}

const INVERSE_MAP = buildInverseMap();

export function dealNameToRoster(model: DerivedModel, dealName: string): Person | null {
  // Strip trailing " SC" / " AE" / " CAE" suffixes that Salesforce sometimes appends
  const clean = dealName.replace(/\s+(SC|AE|CAE|CSM)$/i, "").trim();

  // Try inverse alias map first (e.g. "Robert Jusino" -> "Rob Jusino")
  const aliases = INVERSE_MAP.get(clean);
  if (aliases) {
    for (const a of aliases) {
      const p = model.byId.get(a);
      if (p) return p;
    }
  }
  // Fall through to direct match (deal name is the same as roster name)
  return model.byId.get(clean) ?? null;
}

export function getSeMetric(deals: DealsSnapshot, person: Person): SeMetric | null {
  const dealName = rosterToDealName(person.name);
  return (
    deals.byScName.get(dealName) ??
    // Try with " SC" suffix that Salesforce sometimes appends
    deals.byScName.get(`${dealName} SC`) ??
    null
  );
}

/** AEs covered by this person (Sales Consultant on their deals). */
export type CoveredAe = {
  aeName: string;
  rosterName: string | null;
  forecastManager: string | null;
  segment: string | null;
  dealCount: number;
  pipelineAcv: number;
};

export function aesCoveredBy(
  model: DerivedModel,
  deals: DealsSnapshot,
  person: Person,
): CoveredAe[] {
  const dealName = rosterToDealName(person.name);
  return deals.edges
    .filter((e) => e.sc === dealName || e.sc === `${dealName} SC`)
    .map((e) => ({
      aeName: e.ae,
      rosterName: dealNameToRoster(model, e.ae)?.name ?? null,
      forecastManager: e.forecastManager,
      segment: e.segment,
      dealCount: e.dealCount,
      pipelineAcv: e.pipelineAcv,
    }))
    .sort((a, b) => b.pipelineAcv - a.pipelineAcv);
}

// ---------- Discrepancies ----------

export type Discrepancy =
  | {
      kind: "se_in_deals_not_in_roster";
      severity: "high" | "medium" | "low";
      dealName: string;
      pipelineAcv: number;
      dealCount: number;
    }
  | {
      kind: "roster_se_no_recent_deals";
      severity: "low";
      rosterName: string;
      tier: string;
      segment: string;
    }
  | {
      kind: "ae_in_deals_not_in_roster";
      severity: "medium" | "low";
      dealName: string;
      forecastManager: string | null;
      pipelineAcv: number;
      dealCount: number;
    }
  | {
      kind: "uncovered_ae";
      severity: "high" | "medium";
      aeName: string;
      forecastManager: string | null;
      pipelineAcv: number;
      dealCount: number;
    }
  | {
      kind: "asserted_pod_no_observed_coverage";
      severity: "medium";
      podLeader: string;
      asserted: number; // number of AEs asserted in this pod
      observedDeals: number; // total observed deals where SC = pod leader
    }
  | {
      kind: "ae_primary_sc_outside_pod";
      severity: "low";
      aeName: string;
      assertedPod: string;
      observedSc: string;
      observedDealCount: number;
    };

const SEV_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function detectDiscrepancies(
  model: DerivedModel,
  deals: DealsSnapshot,
): Discrepancy[] {
  const out: Discrepancy[] = [];

  // 1. SEs that appear in deals but not in roster (NAM-only because that's
  //    the deals scope). Filter to those with material activity.
  for (const m of deals.seMetrics) {
    const matched = dealNameToRoster(model, m.name);
    if (matched) continue;
    if (m.name.endsWith(" SC")) continue; // suffix variant — already handled
    const sev = m.pipelineAcv > 250000 || m.dealCount > 30
      ? "high"
      : m.dealCount > 5
        ? "medium"
        : "low";
    out.push({
      kind: "se_in_deals_not_in_roster",
      severity: sev,
      dealName: m.name,
      pipelineAcv: m.pipelineAcv,
      dealCount: m.dealCount,
    });
  }

  // 2. Roster L3 SEs (SC Org segment) with zero recent deals.
  for (const p of model.people) {
    if (p.segment !== "SC Org" || (p.tier !== "L3" && p.tier !== "L2")) continue;
    const m = getSeMetric(deals, p);
    if (m && m.dealCount > 0) continue;
    out.push({
      kind: "roster_se_no_recent_deals",
      severity: "low",
      rosterName: p.name,
      tier: p.tier,
      segment: p.segment,
    });
  }

  // 3. AEs in deals not in roster (only flag the ones with real pipeline).
  for (const a of deals.aeMetrics) {
    if (a.pipelineAcv < 50000 && a.totalDealCount < 10) continue;
    const matched = dealNameToRoster(model, a.name);
    if (matched) continue;
    out.push({
      kind: "ae_in_deals_not_in_roster",
      severity: a.pipelineAcv > 500000 ? "medium" : "low",
      dealName: a.name,
      forecastManager: a.manager,
      pipelineAcv: a.pipelineAcv,
      dealCount: a.totalDealCount,
    });
  }

  // 4. Uncovered AEs — open pipeline, no Sales Consultant assigned.
  for (const u of deals.uncoveredAes) {
    out.push({
      kind: "uncovered_ae",
      severity: u.pipelineAcv > 100000 ? "high" : "medium",
      aeName: u.name,
      forecastManager: u.manager,
      pipelineAcv: u.pipelineAcv,
      dealCount: u.dealCount,
    });
  }

  // 5. Asserted-pod-vs-observed delta: where the roster says an AE is in pod X
  //    but their observed primary SC is in a different pod.
  // Build pod membership from roster: pod name -> set of AE names asserted in it.
  const podAssertedAes = new Map<string, Set<string>>();
  for (const p of model.people) {
    if (p.tier !== "L4" || !p.team_column || !p.role_type) continue;
    if (!podAssertedAes.has(p.team_column)) podAssertedAes.set(p.team_column, new Set());
    podAssertedAes.get(p.team_column)!.add(p.name);
  }

  for (const ae of deals.aeMetrics) {
    if (!ae.primarySc) continue;
    const aeRosterPerson = dealNameToRoster(model, ae.name);
    if (!aeRosterPerson || !aeRosterPerson.team_column) continue;
    const observedScRoster = dealNameToRoster(model, ae.primarySc);
    if (!observedScRoster) continue;
    // If observed SC's roster name matches the asserted pod (by team_column
    // OR by name == pod leader), no discrepancy.
    const podLeader = aeRosterPerson.team_column;
    if (observedScRoster.name === podLeader) continue;
    // Skip cases where observed SC is downstream of the pod leader (same pod's other SE)
    if (observedScRoster.manager_name === podLeader) continue;
    out.push({
      kind: "ae_primary_sc_outside_pod",
      severity: "low",
      aeName: aeRosterPerson.name,
      assertedPod: podLeader,
      observedSc: observedScRoster.name,
      observedDealCount: ae.primaryScDealCount,
    });
  }

  return out.sort((a, b) => {
    const sa = SEV_ORDER[a.severity] ?? 9;
    const sb = SEV_ORDER[b.severity] ?? 9;
    if (sa !== sb) return sa - sb;
    return a.kind.localeCompare(b.kind);
  });
}

export function discrepancyKindLabel(kind: Discrepancy["kind"]): string {
  switch (kind) {
    case "se_in_deals_not_in_roster":
      return "SE in deals — not in roster";
    case "roster_se_no_recent_deals":
      return "Roster SE — no recent deals";
    case "ae_in_deals_not_in_roster":
      return "AE in deals — not in roster";
    case "uncovered_ae":
      return "AE with pipeline — no SC assigned";
    case "asserted_pod_no_observed_coverage":
      return "Asserted pod — no observed coverage";
    case "ae_primary_sc_outside_pod":
      return "AE's primary SC is outside their asserted pod";
  }
}

export function fmtCurrency(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

export function fmtPercent(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(0)}%`;
}
