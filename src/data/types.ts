export type SegmentKey = "SC Org" | "Corp NL" | "Corp Upsell" | "ENT" | string;

export type AssignmentRole = "Primary" | "Backup" | "Overlay";

export type RawPerson = {
  name: string;
  segment: string;
  tier: string;
  manager_name: string;
  role_type: string;
  team_column: string;
  ae_row: string;
  segment_label: string;
  sort_order: number;
  is_active: string;
  notes: string;
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

export type Person = RawPerson & {
  id: string;
  primaryPod: string | null;
  backupPod: string | null;
  overlayPods: string[];
  specializationList: string[];
  loadSum: number;
  targetLoad: number;
};

export type Assignment = {
  scId: string;
  scName: string;
  role: AssignmentRole;
  pod: string;
  allocationPct: number;
  specializations: string[];
  rampStatus: string | null;
};

export type Pod = {
  name: string;
  primaryCount: number;
  backupCount: number;
  overlayCount: number;
  totalSCs: number;
  hasPrimary: boolean;
  hasBackup: boolean;
};

export type DerivedModel = {
  people: Person[];
  byId: Map<string, Person>;
  pods: Pod[];
  podByName: Map<string, Pod>;
  assignments: Assignment[];
  assignmentsByPod: Map<string, Assignment[]>;
  assignmentsBySC: Map<string, Assignment[]>;
  segments: string[];
  managers: string[];
  roleTypes: string[];
  specializations: string[];
  rampStatuses: string[];
  hasCoverageData: boolean;
  hasSpecializationData: boolean;
};

export type LoadBucket = "overloaded" | "balanced" | "slack" | "empty";

export type Filters = {
  segment: string | null;
  manager: string | null;
  roleType: string | null;
  specialization: string | null;
  rampStatus: string | null;
  loadBucket: LoadBucket | null;
  hasPrimary: boolean | null;
  hasBackup: boolean | null;
  search: string;
};

export const EMPTY_FILTERS: Filters = {
  segment: null,
  manager: null,
  roleType: null,
  specialization: null,
  rampStatus: null,
  loadBucket: null,
  hasPrimary: null,
  hasBackup: null,
  search: "",
};

export type ViewKey =
  | "scOrg"
  | "corpNL"
  | "corpUpsell"
  | "ent"
  | "reverse"
  | "specialist"
  | "capacity"
  | "discrepancies"
  | "roadmap";

export type Density = 1 | 2 | 3;

export type ViewConfigEntry = {
  key: ViewKey;
  label: string;
  group: "segment" | "analytics" | "reference";
  segmentFilter?: string;
  defaultDensity: Density;
  densities: Density[];
};
