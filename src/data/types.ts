// Source-of-truth model for the SE/SA ↔ AE relationship visualizer.
//
// Two organizations live in this model:
//   1. SC Org   — Cassidy → (SE-team leads | SA-team lead) → SE / SA individuals
//   2. Sales    — AVPs → RVPs → AEs grouped by segment (Corp NL / Corp Upsell / ENT)
//
// The bridge between the two orgs is **coverage**: every active AE is covered
// by exactly one SE in the asserted roster (the matrix screenshots).  The
// SA overlay (Solutions Architects) is opportunity-derived and lives in
// observed (deals) data, not in the roster.

// ---------- Raw ingestion shape (matches roster CSV columns 1:1) ----------

export type RawPerson = {
  name: string;
  segment: string;          // "SC Org" | "Corp NL" | "Corp Upsell" | "ENT"
  tier: string;             // "L1" | "L2" | "L3" | "L4"
  manager_name: string;
  role_type: string;        // AE role-type tag (Ecosystem / ISV / Domo Everywhere / etc.)
  team_column: string;      // matrix column key (RVP teamColumn for AEs, self for L3 RVPs)
  ae_row: string;           // matrix row key  (the SE who covers them, by short name)
  segment_label: string;
  sort_order: number;
  is_active: string;
  notes: string;
  // Legacy fields (still in CSV; ignored by the new normalize but kept on
  // RawPerson so we don't break load.ts).
  primary_pod?: string;
  backup_pod?: string;
  overlay_pods?: string;
  primary_alloc_pct?: number;
  backup_alloc_pct?: number;
  overlay_alloc_pct?: number;
  specializations?: string;
  target_load_pct?: number;
  hire_date?: string;
  tenure_months?: number;
  ramp_status?: string;
  email?: string;
  photo_url?: string;
};

// ---------- Domain enums ----------

export type SegmentKey = "Corp NL" | "Corp Upsell" | "ENT";
export const SEGMENTS: SegmentKey[] = ["Corp NL", "Corp Upsell", "ENT"];

export type RoleKind =
  | "root"          // Cassidy
  | "se_lead"       // Dan Wentworth, Tyler Clark, Chris Hunter
  | "sa_lead"       // Laura Qualey
  | "se"            // Solutions Engineer (covers AEs)
  | "sa"            // Solutions Architect (overlay; from deals)
  | "avp"           // Keith White, John Pasalano, Andrew Rich
  | "rvp"           // Doug Hut, Cam Housley, etc.
  | "ae"            // Account Executive
  | "floater";      // L4 sales-side row with no matrix placement (e.g., Juan Z, Doug F, TBD)

export type AeRoleType =
  | "Ecosystem"
  | "ISV"
  | "Domo Everywhere"
  | "Corporate NL"
  | "New Logo"
  | "Upsell"
  | "Extra AE"
  | "";

// ---------- Derived person ----------

export type Person = RawPerson & {
  /** Canonical id used everywhere (== raw name in the CSV; stable & unique). */
  id: string;
  /**
   * Resolved full display name. Derived in this order:
   *   1. nameMap.json explicit alias (e.g., "Grant A" \u2192 "Grant Anderson")
   *   2. userProfiles directory match (first-name + last-initial)
   *   3. Original CSV `name` (last resort \u2014 some short names will leak)
   * Use this everywhere a human-readable name is rendered.
   */
  displayName: string;
  /** What kind of node this is in the graph. Drives every renderer. */
  roleKind: RoleKind;
  /** Strongly-typed segment if recognized. */
  segmentKey: SegmentKey | null;
  /** AE role-type if applicable. */
  roleType: AeRoleType;
  /** Resolved AE coverer (the SE on this AE's row), if any. */
  coveringSeId: string | null;
  /** Resolved RVP id (the L3 row whose teamColumn matches this AE's team_column). */
  rvpId: string | null;
  /** Resolved AVP name (from orgMap.json) for L3 RVPs. */
  avpName: string | null;
  /** True when this is an L4 sales-side person not placed in any matrix cell. */
  isFloater: boolean;
};

// ---------- Org-map (config) ----------

export type AvpConfig = { name: string; shortName: string };
export type RvpConfig = {
  rosterName: string;
  fullName: string;
  teamColumn: string;
  segment: SegmentKey;
  avp: string | null;
};
export type SegmentLeadConfig = {
  segment: SegmentKey;
  label: string;
  leadName: string;
  scTeamSegment: string;
  /** Ideal AE count per SE in this segment. Used by buildSeLoads to compute
   *  per-SE load% (Corp NL = 4, Corp Upsell = 3, ENT = 3 today). */
  seToAeRatio: number;
};
export type SaTeamConfig = {
  leadName: string;
  label: string;
  scTeamSegment: string;
};

// ---------- Coverage (asserted, from roster) ----------

export type CoverageEdge = {
  seId: string;          // SE roster id (covers)
  aeId: string;          // AE roster id (covered)
  segment: SegmentKey;
  rvpId: string | null;
  roleType: AeRoleType;
};

// ---------- SE load (capacity vs ideal ratio) ----------

export type LoadBucket = "overloaded" | "balanced" | "slack" | "empty";

export type SeLoad = {
  seId: string;
  /** Total AEs covered (asserted). */
  coveredCount: number;
  /** Per-segment breakdown: how many AEs covered in each segment. */
  countBySegment: Record<SegmentKey, number>;
  /** Segment with the most AEs (target & display reference). */
  primarySegment: SegmentKey | null;
  /** Ideal AE count if this SE’s entire load were in their primary segment. */
  primaryTarget: number;
  /** Effective target accounting for segment mix (sum of primary-segment-equivalents). */
  effectiveTarget: number;
  /** load% — 100 means at-target. >100 = overloaded; <60 = slack. */
  loadPct: number;
  bucket: LoadBucket;
};

// ---------- Derived model ----------

export type DerivedModel = {
  /** All people, in original sort order. */
  people: Person[];
  byId: Map<string, Person>;
  /** Subset by role-kind for fast lookup. */
  byRole: Record<RoleKind, Person[]>;
  /** Coverage edges (SE → AE). */
  edges: CoverageEdge[];
  /** AE id → their covering SE id (if any). */
  coveringSeByAe: Map<string, string>;
  /** SE id → list of AE ids they cover. */
  coveredAesBySe: Map<string, string[]>;
  /** AVP id → list of RVP ids. */
  rvpsByAvp: Map<string, string[]>;
  /** RVP id → list of AE ids on their team. */
  aesByRvp: Map<string, string[]>;
  /** SE-team-lead id → list of SE ids that report to them. */
  sesByLead: Map<string, string[]>;
  /** Manager id → direct reports. */
  reportsByManager: Map<string, string[]>;
  /** All known AVP names from orgMap. */
  avps: string[];
  /** All known RVP ids in segment / sort order. */
  rvps: string[];
  /** Segment metadata (one row per segment). */
  segments: SegmentLeadConfig[];
  /** Floaters: L4 sales rows without a matrix cell. */
  floaters: Person[];
};

// ---------- Selection / lens ----------

export type LensKey =
  | "fullOrg"
  | "focus"
  | "corpNL"
  | "corpUpsell"
  | "ent"
  | "discrepancies"
  | "settings";

export type LensGroup = "overview" | "segment" | "ops" | "config";

export type ViewKey = LensKey;     // alias kept for back-compat with existing imports

export type Density = 1 | 2 | 3;

export type ViewConfigEntry = {
  key: LensKey;
  label: string;
  group: LensGroup;
  segmentFilter?: SegmentKey;
  defaultDensity: Density;
  densities: Density[];
};

// Selection model: a single focused entity. Fully covers the future lenses
// (SE-centric, AE-centric, etc.); for V1 only `person` is used.
export type Selection =
  | { kind: "person"; id: string }
  | { kind: "rvp"; id: string }
  | { kind: "avp"; name: string }
  | { kind: "segment"; segment: SegmentKey }
  | null;

// ---------- Filters ----------

export type Filters = {
  segment: SegmentKey | null;
  roleType: AeRoleType | null;
  avp: string | null;
  rvpId: string | null;
  seId: string | null;
  search: string;
};

export const EMPTY_FILTERS: Filters = {
  segment: null,
  roleType: null,
  avp: null,
  rvpId: null,
  seId: null,
  search: "",
};

// ---------- Settings (persisted to AppDB SovConfig collection) ----------

export type CapacityTargets = Record<SegmentKey, number>;

/** Map of RVP roster name → AVP name. Overrides static orgMap.json values. */
export type AvpOverrides = Record<string, string>;

export type AppDefaults = {
  /** Lens to land on when the app first opens. */
  landingLens: LensKey;
  /** Default deals window. */
  dealsWindow: string;
};

export type Settings = {
  capacityTargets: CapacityTargets;
  avpOverrides: AvpOverrides;
  defaults: AppDefaults;
};

export const DEFAULT_CAPACITY_TARGETS: CapacityTargets = {
  "Corp NL": 4,
  "Corp Upsell": 3,
  ENT: 3,
};

export const DEFAULT_APP_DEFAULTS: AppDefaults = {
  landingLens: "fullOrg",
  dealsWindow: "current_fy_to_date",
};

export const EMPTY_SETTINGS: Settings = {
  capacityTargets: { ...DEFAULT_CAPACITY_TARGETS },
  avpOverrides: {},
  defaults: { ...DEFAULT_APP_DEFAULTS },
};

// ---------- Display helpers ----------
//
// The CSV roster carries the historical value `"SC Org"` for the SE/SA
// organization (Sales Consultant was the legacy term for Solutions
// Engineer). We keep that as the data join key so the existing roster
// dataset doesn't need to be re-uploaded, but every user-facing render
// goes through this helper to show the current term.

export function segmentLabel(rawSegment: string): string {
  if (rawSegment === "SC Org") return "SE Org";
  return rawSegment;
}

/**
 * Real job title for a person. NEVER use `role_type` as a title \u2014 that
 * column carries informational categorization tags (Extra AE, Ecosystem,
 * ISV, Domo Everywhere, etc.) that color-code AEs in the matrix but are
 * NOT the person\u2019s actual title. Use this helper everywhere a title
 * goes (sub-labels, chains, drawer header, search results, focus pills).
 */
export function personTitle(p: { roleKind: RoleKind; tier?: string }): string {
  switch (p.roleKind) {
    case "root": return "SE Org Lead";
    case "se_lead": return "SE Manager";
    case "sa_lead": return "SA Manager";
    case "se": return "Solutions Engineer";
    case "sa": return "Solutions Architect";
    case "rvp": return "RVP";
    case "avp": return "AVP";
    case "ae": return "Account Executive";
    case "floater": return "Account Executive";
  }
}
