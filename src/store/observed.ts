// Observed-coverage selectors and discrepancy detection.
// Joins the asserted roster (DerivedModel) with the deals snapshot
// (DealsSnapshot) using a name-resolution map.

import type { DealsSnapshot, SeMetric } from "../data/deals";
import type { DerivedModel, Person } from "../data/types";
import nameMapJson from "../config/nameMap.json" with { type: "json" };

const NAME_MAP: Record<string, string> = nameMapJson as Record<string, string>;

/** Roster name -> deal-system canonical name. Identity if no entry. */
export function rosterToDealName(rosterName: string): string {
  return NAME_MAP[rosterName] ?? rosterName;
}

/** Build inverse map (deal-system name -> roster name(s)).
 *  A deal name can map to multiple roster rows in rare cases. */
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
  const clean = dealName.replace(/\s+(SC|AE|CAE|CSM)$/i, "").trim();
  const aliases = INVERSE_MAP.get(clean);
  if (aliases) {
    for (const a of aliases) {
      const p = model.byId.get(a);
      if (p) return p;
    }
  }
  return model.byId.get(clean) ?? null;
}

export function getSeMetric(deals: DealsSnapshot, person: Person): SeMetric | null {
  const dealName = rosterToDealName(person.name);
  return (
    deals.byScName.get(dealName) ??
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
      kind: "ae_primary_sc_outside_pod";
      severity: "low";
      aeName: string;
      assertedSe: string;
      observedSc: string;
      observedDealCount: number;
    }
  | {
      kind: "rvp_unknown_avp";
      severity: "low";
      rvpName: string;
      segment: string;
    }
  | {
      kind: "ae_no_covering_se";
      severity: "medium";
      aeName: string;
      segment: string;
      rvpId: string | null;
    };

const SEV_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function detectDiscrepancies(
  model: DerivedModel,
  deals: DealsSnapshot,
): Discrepancy[] {
  const out: Discrepancy[] = [];

  // 1. SEs that appear in deals but not in roster (NAM-only).
  for (const m of deals.seMetrics) {
    const matched = dealNameToRoster(model, m.name);
    if (matched) continue;
    if (m.name.endsWith(" SC")) continue;
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

  // 2. Roster SC-org SEs / SAs with zero recent deals.
  for (const p of model.people) {
    if (p.segment !== "SC Org") continue;
    if (p.roleKind !== "se" && p.roleKind !== "sa") continue;
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

  // 4. Uncovered AEs in deals (open pipeline, no SC assigned).
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

  // 5. AE’s observed primary SC differs from asserted covering SE.
  for (const ae of deals.aeMetrics) {
    if (!ae.primarySc) continue;
    const aeRosterPerson = dealNameToRoster(model, ae.name);
    if (!aeRosterPerson || aeRosterPerson.roleKind !== "ae") continue;
    if (!aeRosterPerson.coveringSeId) continue;
    const observedScRoster = dealNameToRoster(model, ae.primarySc);
    if (!observedScRoster) continue;
    if (observedScRoster.id === aeRosterPerson.coveringSeId) continue;
    // Skip cases where the observed SC reports to the same SE manager as the
    // asserted covering SE (same team — a teammate handled the deal).
    const assertedSe = model.byId.get(aeRosterPerson.coveringSeId);
    if (assertedSe && observedScRoster.manager_name === assertedSe.manager_name) continue;
    out.push({
      kind: "ae_primary_sc_outside_pod",
      severity: "low",
      aeName: aeRosterPerson.name,
      assertedSe: assertedSe?.name ?? aeRosterPerson.coveringSeId,
      observedSc: observedScRoster.name,
      observedDealCount: ae.primaryScDealCount,
    });
  }

  // 6. RVPs with no AVP mapping (data-cleanup nudges).
  for (const rvp of model.byRole.rvp) {
    if (rvp.avpName) continue;
    out.push({
      kind: "rvp_unknown_avp",
      severity: "low",
      rvpName: rvp.name,
      segment: rvp.segment,
    });
  }

  // 7. Roster AEs with no covering SE (the matrix has them in a row but the
  //    short-name didn’t resolve to an SE id).
  for (const a of model.byRole.ae) {
    if (a.coveringSeId) continue;
    out.push({
      kind: "ae_no_covering_se",
      severity: "medium",
      aeName: a.name,
      segment: a.segment,
      rvpId: a.rvpId,
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
      return "AE with pipeline — no SE assigned";
    case "ae_primary_sc_outside_pod":
      return "AE’s observed SE differs from asserted";
    case "rvp_unknown_avp":
      return "RVP — AVP unknown";
    case "ae_no_covering_se":
      return "Roster AE — no covering SE";
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
