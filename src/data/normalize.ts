// Build the DerivedModel from raw roster rows + org-map config.
//
// Two orgs join here:
//   * SC org: `segment === "SC Org"` rows. L1 root, L2 leads, L3 ICs.
//   * Sales:  `segment in {"Corp NL","Corp Upsell","ENT"}` rows.
//             L3 rows are RVPs. L4 rows are AEs (or AE-row anchors that
//             alias to a covering SE), or "floaters" with no matrix cell.
//
// Anchor rows (notes contains "ae_row anchor") exist solely to declare
// the matrix-row short-name aliases for SEs duplicated into a sales
// segment for layout. They're consumed to build `seShortToId` and then
// dropped from the people set so they don't collide with their SC-org
// counterpart in `byId`.

import orgMapJson from "../config/orgMap.json" with { type: "json" };
import nameMapJson from "../config/nameMap.json" with { type: "json" };
import type {
  AeRoleType,
  AvpConfig,
  CoverageEdge,
  DerivedModel,
  Person,
  RawPerson,
  RoleKind,
  RvpConfig,
  SaTeamConfig,
  SegmentKey,
  SegmentLeadConfig,
  Settings,
} from "./types";
import { EMPTY_SETTINGS } from "./types.ts";

const NAME_MAP: Record<string, string> = nameMapJson as Record<string, string>;

// Runtime-injected resolver. The browser app wires this from
// `data/profiles.ts` so abbreviated CSV names that don't exist in the
// curated nameMap.json can fall back to the live user-profile directory
// (e.g., "Mike N" \u2192 "Mike Newcomb"). Smoke tests leave it null.
type DirectoryResolver = (shortName: string) => string | null;
let DIRECTORY_RESOLVER: DirectoryResolver | null = null;
export function setDirectoryResolver(fn: DirectoryResolver | null): void {
  DIRECTORY_RESOLVER = fn;
}

function resolveDisplayName(rawName: string): string {
  if (!rawName) return rawName;
  // 1. Curated alias map (e.g., "Grant A" \u2192 "Grant Anderson")
  const aliased = NAME_MAP[rawName];
  if (aliased) return aliased;
  // 2. If the name already looks full (\u2265 2 tokens, last token \u2265 3 chars), use it.
  const parts = rawName.trim().split(/\s+/);
  if (parts.length >= 2 && parts[parts.length - 1].length >= 3) return rawName;
  // 3. Live directory lookup (when wired)
  if (DIRECTORY_RESOLVER) {
    const fromDir = DIRECTORY_RESOLVER(rawName);
    if (fromDir) return fromDir;
  }
  // 4. Last resort \u2014 surface the original short name
  return rawName;
}

const ORG_MAP = orgMapJson as unknown as {
  avps: AvpConfig[];
  rvps: RvpConfig[];
  segmentLeads: SegmentLeadConfig[];
  saTeam: SaTeamConfig;
  scOrgRoot: string;
};

const KNOWN_SEGMENTS = new Set<SegmentKey>(["Corp NL", "Corp Upsell", "ENT"]);

function asSegment(s: string): SegmentKey | null {
  return KNOWN_SEGMENTS.has(s as SegmentKey) ? (s as SegmentKey) : null;
}

function asRoleType(s: string): AeRoleType {
  switch (s) {
    case "Ecosystem":
    case "ISV":
    case "Domo Everywhere":
    case "Corporate NL":
    case "New Logo":
    case "Upsell":
    case "Extra AE":
      return s;
    default:
      return "";
  }
}

function isAnchor(raw: RawPerson): boolean {
  return (raw.notes || "").toLowerCase().includes("ae_row anchor");
}

function classify(raw: RawPerson, leadByName: Map<string, SegmentLeadConfig>, saLeadName: string): RoleKind {
  if (raw.tier === "L1") return "root";
  if (raw.tier === "L2") {
    if (raw.name === saLeadName) return "sa_lead";
    if (leadByName.has(raw.name)) return "se_lead";
    // L2 with no team mapping (e.g., Blake Woodward) — treated as an SE lead
    // so they still render on the SE side; surfaced in Discrepancies.
    return "se_lead";
  }
  if (raw.segment === "SC Org" && raw.tier === "L3") {
    if (raw.manager_name === saLeadName) return "sa";
    return "se";
  }
  if (raw.tier === "L3") return "rvp";
  if (raw.tier === "L4") {
    if (!raw.team_column || !raw.ae_row) return "floater";
    return "ae";
  }
  return "se";
}

export function normalize(
  rawRows: RawPerson[],
  settings: Settings = EMPTY_SETTINGS,
): DerivedModel {
  const leadByName = new Map<string, SegmentLeadConfig>(
    ORG_MAP.segmentLeads.map((s) => [s.leadName, s]),
  );
  // Apply Settings.capacityTargets on top of the static seToAeRatio values.
  const segmentsWithRatio: SegmentLeadConfig[] = ORG_MAP.segmentLeads.map((s) => ({
    ...s,
    seToAeRatio:
      settings.capacityTargets[s.segment] ?? s.seToAeRatio ?? 4,
  }));
  // Apply Settings.avpOverrides on top of the static rvps[] mapping.
  const rvpsResolved: RvpConfig[] = ORG_MAP.rvps.map((r) => {
    const override = settings.avpOverrides[r.rosterName];
    if (override !== undefined && override !== null && override !== "") {
      return { ...r, avp: override };
    }
    return r;
  });
  const rvpByTeamCol = new Map<string, RvpConfig>();
  for (const r of rvpsResolved) rvpByTeamCol.set(r.teamColumn, r);
  const rvpByRosterName = new Map<string, RvpConfig>();
  for (const r of rvpsResolved) rvpByRosterName.set(r.rosterName, r);

  // Split anchor rows out so they don't collide in byId. Anchors carry the
  // matrix short-name (e.g., "Megha", "Mike", "Dan G") that we need to map
  // to a real SC-org SE id.
  const anchorRows: RawPerson[] = [];
  const realRows: RawPerson[] = [];
  for (const r of rawRows) {
    if (isAnchor(r)) anchorRows.push(r);
    else realRows.push(r);
  }

  // First pass: build classified Person records.
  const people: Person[] = realRows.map((raw) => {
    const roleKind = classify(raw, leadByName, ORG_MAP.saTeam.leadName);
    const segmentKey = asSegment(raw.segment);
    const roleType = asRoleType(raw.role_type);
    const rvpCfg = roleKind === "rvp"
      ? rvpByRosterName.get(raw.name) ?? null
      : roleKind === "ae"
        ? rvpByTeamCol.get(raw.team_column) ?? null
        : null;
    return {
      ...raw,
      id: raw.name,
      displayName: resolveDisplayName(raw.name),
      roleKind,
      segmentKey,
      roleType,
      coveringSeId: null,
      rvpId: rvpCfg ? rvpCfg.rosterName : null,
      avpName: roleKind === "rvp" ? rvpCfg?.avp ?? null : null,
      isFloater: roleKind === "floater",
    };
  });

  // Synthesize AVP persons so they're navigable like everyone else. They
  // come from orgMap.avps and don't appear in the roster CSV.
  for (const a of ORG_MAP.avps) {
    if (people.some((p) => p.name === a.name)) continue;
    const synth: Person = {
      name: a.name,
      segment: "Sales",
      tier: "AVP",
      manager_name: "",
      role_type: "",
      team_column: "",
      ae_row: "",
      segment_label: "Sales",
      sort_order: -1,
      is_active: "TRUE",
      notes: "Synthesized from orgMap.avps",
      id: a.name,
      displayName: resolveDisplayName(a.name),
      roleKind: "avp",
      segmentKey: null,
      roleType: "",
      coveringSeId: null,
      rvpId: null,
      avpName: null,
      isFloater: false,
    };
    people.push(synth);
  }

  const byId = new Map<string, Person>(people.map((p) => [p.id, p]));

  // Build short-name → SE id index, scoped per segment so first-name
  // collisions across segments resolve correctly (e.g., "Matt" in ENT
  // resolves to Matt Newsom under Chris Hunter, while "Matt T" in Corp
  // Upsell resolves to Matt Torline under Tyler Clark). Anchor rows are
  // the authoritative source of "this short name covers AEs in this
  // segment" — we prefer them over implicit first-name fallbacks.
  type ShortKey = string; // `${segment}::${shortLower}`
  const seShortToId = new Map<ShortKey, string>();

  function resolveAnchor(short: string, segment: string): string | null {
    const segLead = ORG_MAP.segmentLeads.find((s) => s.segment === segment);
    const leadId = segLead?.leadName ?? null;
    const parts = short.split(/\s+/);
    const firstShort = parts[0]?.toLowerCase();
    const lastInitial =
      parts.length >= 2 ? parts[parts.length - 1][0]?.toLowerCase() : null;

    // All SC-org SE/SA candidates (cross-team allowed; e.g., Megha & Abby
    // cover Corp NL even though they report to Chris Hunter).
    const allSes = people.filter(
      (q) =>
        (q.roleKind === "se" || q.roleKind === "sa") && q.segment === "SC Org",
    );

    // 1. Exact full-name match anywhere in SC org.
    const exact = allSes.find((q) => q.name.toLowerCase() === short.toLowerCase());
    if (exact) return exact.id;

    // 2. First-name + last-initial match anywhere in SC org.
    if (lastInitial) {
      const liMatches = allSes.filter(
        (q) =>
          q.name.split(/\s+/)[0]?.toLowerCase() === firstShort &&
          q.name.split(/\s+/).slice(-1)[0]?.[0]?.toLowerCase() === lastInitial,
      );
      if (liMatches.length === 1) return liMatches[0].id;
    }

    // 3. First-name match anywhere; if ambiguous, prefer the one under the
    //    segment lead.
    const firstMatches = allSes.filter(
      (q) => q.name.split(/\s+/)[0]?.toLowerCase() === firstShort,
    );
    if (firstMatches.length === 1) return firstMatches[0].id;
    if (firstMatches.length > 1) {
      const underLead = leadId
        ? firstMatches.filter((q) => q.manager_name === leadId)
        : [];
      if (underLead.length === 1) return underLead[0].id;
    }

    return null;
  }

  // Index real SC-org SEs/SAs by full name (cross-segment fallback).
  for (const p of people) {
    if (p.roleKind !== "se" && p.roleKind !== "sa") continue;
    seShortToId.set(`__any__::${p.name.toLowerCase()}`, p.id);
  }
  // Resolve each anchor row. The anchor declares: "in `segment`, AEs whose
  // ae_row equals `aliasKey` are covered by the SE we resolve here". The
  // alias key is the anchor's `ae_row` field (which always carries the
  // short alias the AE rows reference). The resolution target is the
  // anchor's `name` field, which may be the full name ("Megha Kumar") or
  // the short alias itself ("Mike").
  for (const a of anchorRows) {
    const aliasKey = (a.ae_row || a.name || "").trim();
    if (!aliasKey || !a.segment) continue;
    // Try resolving by anchor.name first (richer signal), then by aliasKey
    const id =
      resolveAnchor((a.name || "").trim(), a.segment) ??
      resolveAnchor(aliasKey, a.segment);
    if (id) {
      seShortToId.set(`${a.segment}::${aliasKey.toLowerCase()}`, id);
    }
  }

  // Pass 2: coverage edges. For each AE, resolve their `ae_row` short name
  // to an SE id, scoped first to their segment, then falling back to the
  // generic full-name index.
  const edges: CoverageEdge[] = [];
  const coveringSeByAe = new Map<string, string>();
  const coveredAesBySe = new Map<string, string[]>();
  for (const p of people) {
    if (p.roleKind !== "ae") continue;
    const aeRow = (p.ae_row || "").trim().toLowerCase();
    if (!aeRow) continue;
    const seId =
      seShortToId.get(`${p.segment}::${aeRow}`) ??
      seShortToId.get(`__any__::${aeRow}`) ??
      null;
    if (!seId) continue;
    p.coveringSeId = seId;
    coveringSeByAe.set(p.id, seId);
    if (!coveredAesBySe.has(seId)) coveredAesBySe.set(seId, []);
    coveredAesBySe.get(seId)!.push(p.id);
    edges.push({
      seId,
      aeId: p.id,
      segment: p.segmentKey ?? "Corp NL",
      rvpId: p.rvpId,
      roleType: p.roleType,
    });
  }

  for (const [seId, aeIds] of coveredAesBySe) {
    aeIds.sort((a, b) => (byId.get(a)?.sort_order ?? 0) - (byId.get(b)?.sort_order ?? 0));
    coveredAesBySe.set(seId, aeIds);
  }

  // Sales-side groupings
  const rvpsByAvp = new Map<string, string[]>();
  for (const r of ORG_MAP.rvps) {
    const k = r.avp ?? "_unassigned";
    if (!rvpsByAvp.has(k)) rvpsByAvp.set(k, []);
    rvpsByAvp.get(k)!.push(r.rosterName);
  }
  const aesByRvp = new Map<string, string[]>();
  for (const p of people) {
    if (p.roleKind !== "ae" || !p.rvpId) continue;
    if (!aesByRvp.has(p.rvpId)) aesByRvp.set(p.rvpId, []);
    aesByRvp.get(p.rvpId)!.push(p.id);
  }

  // SE-side groupings
  const sesByLead = new Map<string, string[]>();
  for (const p of people) {
    if (p.roleKind !== "se" && p.roleKind !== "sa") continue;
    if (p.segment !== "SC Org") continue;
    const lead = p.manager_name || "_unassigned";
    if (!sesByLead.has(lead)) sesByLead.set(lead, []);
    sesByLead.get(lead)!.push(p.id);
  }
  for (const [k, ids] of sesByLead) {
    ids.sort((a, b) => (byId.get(a)?.sort_order ?? 0) - (byId.get(b)?.sort_order ?? 0));
    sesByLead.set(k, ids);
  }

  const reportsByManager = new Map<string, string[]>();
  for (const p of people) {
    if (!p.manager_name) continue;
    if (!reportsByManager.has(p.manager_name)) reportsByManager.set(p.manager_name, []);
    reportsByManager.get(p.manager_name)!.push(p.id);
  }

  const byRole: Record<RoleKind, Person[]> = {
    root: [],
    se_lead: [],
    sa_lead: [],
    se: [],
    sa: [],
    avp: [],
    rvp: [],
    ae: [],
    floater: [],
  };
  for (const p of people) byRole[p.roleKind].push(p);

  return {
    people,
    byId,
    byRole,
    edges,
    coveringSeByAe,
    coveredAesBySe,
    rvpsByAvp,
    aesByRvp,
    sesByLead,
    reportsByManager,
    avps: ORG_MAP.avps.map((a) => a.name),
    rvps: rvpsResolved.map((r) => r.rosterName),
    segments: segmentsWithRatio,
    floaters: byRole.floater,
  };
}

// Re-export the static org-map so the Settings view can render the
// asserted defaults vs the live overrides side-by-side.
export const STATIC_ORG_MAP = ORG_MAP;

/** Pull the manager chain for a given person (excludes the person themselves). */
export function managerChain(model: DerivedModel, id: string): Person[] {
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
  return out;
}

/** Resolve a roster short alias to a Person. */
export function resolveByName(model: DerivedModel, name: string): Person | null {
  if (!name) return null;
  return model.byId.get(name) ?? null;
}
