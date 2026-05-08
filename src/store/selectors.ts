import type {
  Assignment,
  DerivedModel,
  Filters,
  LoadBucket,
  Person,
  Pod,
} from "../data/types";

export function loadBucketOf(p: Person): LoadBucket {
  if (p.tier !== "L4") return "empty";
  if (p.loadSum === 0) return "empty";
  if (p.loadSum > 100) return "overloaded";
  if (p.loadSum < 60) return "slack";
  return "balanced";
}

export function applyFilters(model: DerivedModel, filters: Filters): Person[] {
  const search = filters.search.trim().toLowerCase();
  return model.people.filter((p) => {
    if (filters.segment && p.segment !== filters.segment) return false;
    if (filters.manager && p.manager_name !== filters.manager) return false;
    if (filters.roleType && p.role_type !== filters.roleType) return false;
    if (filters.specialization && !p.specializationList.includes(filters.specialization))
      return false;
    if (filters.rampStatus && (p.ramp_status || "").trim() !== filters.rampStatus)
      return false;
    if (filters.hasPrimary !== null) {
      const has = !!p.primaryPod;
      if (has !== filters.hasPrimary) return false;
    }
    if (filters.hasBackup !== null) {
      const has = !!p.backupPod;
      if (has !== filters.hasBackup) return false;
    }
    if (filters.loadBucket && loadBucketOf(p) !== filters.loadBucket) return false;
    if (search) {
      const blob = `${p.name} ${p.role_type} ${p.specializationList.join(" ")} ${p.primaryPod ?? ""} ${p.backupPod ?? ""}`.toLowerCase();
      if (!blob.includes(search)) return false;
    }
    return true;
  });
}

// ---------- Org chart ----------

export type OrgNode = {
  person: Person;
  children: OrgNode[];
};

export function buildOrgTree(people: Person[], rootSegment = "SC Org"): OrgNode | null {
  const orgPeople = people.filter((p) => p.segment === rootSegment);
  const root = orgPeople.find((p) => p.tier === "L1") ?? null;
  if (!root) return null;
  const byManager = new Map<string, Person[]>();
  for (const p of orgPeople) {
    const k = p.manager_name || "";
    if (!byManager.has(k)) byManager.set(k, []);
    byManager.get(k)!.push(p);
  }
  for (const list of byManager.values()) list.sort((a, b) => a.sort_order - b.sort_order);
  const make = (p: Person): OrgNode => ({
    person: p,
    children: (byManager.get(p.name) ?? []).map(make),
  });
  return make(root);
}

// ---------- Coverage matrix ----------

export type MatrixCell = {
  pod: string;
  row: string;
  primary: Person[];
  backup: Person[];
  overlay: Person[];
  all: Person[];
};

export type MatrixData = {
  columns: string[];
  rows: string[];
  cellMap: Map<string, MatrixCell>;
  outsideByCol: Map<string, Person[]>;
  outsideNoCol: Person[];
  segmentLeads: Person[];
};

const cellKey = (col: string, row: string) => `${col}::${row}`;

export function buildMatrix(model: DerivedModel, segmentKey: string, filtered: Person[]): MatrixData {
  // Pod columns are the L3 SCs in the SC Org under this segment context.
  // To match the existing app: columns = L3 names (managers of L4s) sorted by sort_order
  const segmentLeads = model.people
    .filter((p) => p.tier === "L3")
    .sort((a, b) => a.sort_order - b.sort_order);
  const columns = segmentLeads.map((p) => p.name);

  // Rows are unique ae_row values among L4s of this segment, ordered by sort_order
  const reps = filtered.filter((p) => p.tier === "L4" && p.segment === segmentKey);
  const rowSet = new Set<string>();
  const rowOrder = new Map<string, number>();
  for (const r of reps) {
    if (r.ae_row && !rowSet.has(r.ae_row)) {
      rowSet.add(r.ae_row);
      rowOrder.set(r.ae_row, r.sort_order);
    }
  }
  const rows = [...rowSet].sort(
    (a, b) => (rowOrder.get(a) ?? 0) - (rowOrder.get(b) ?? 0),
  );

  const cellMap = new Map<string, MatrixCell>();
  const outsideByCol = new Map<string, Person[]>();
  const outsideNoCol: Person[] = [];

  for (const r of reps) {
    if (!r.role_type) continue;
    // Build the set of (pod, role) cells this rep belongs to. A rep can appear in
    // multiple cells when they have explicit Backup / Overlay assignments. We
    // prefer the new primary/backup/overlay columns; if none are populated, we
    // fall back to legacy team_column as a single Primary placement.
    type Placement = { pod: string; role: "Primary" | "Backup" | "Overlay" };
    const placements: Placement[] = [];
    if (r.primaryPod) placements.push({ pod: r.primaryPod, role: "Primary" });
    if (r.backupPod) placements.push({ pod: r.backupPod, role: "Backup" });
    for (const p of r.overlayPods) placements.push({ pod: p, role: "Overlay" });
    if (placements.length === 0 && r.team_column) {
      placements.push({ pod: r.team_column, role: "Primary" });
    }

    const row = r.ae_row || "";
    let placed = false;
    for (const pl of placements) {
      if (!pl.pod || !row) continue;
      const key = cellKey(pl.pod, row);
      let cell = cellMap.get(key);
      if (!cell) {
        cell = { pod: pl.pod, row, primary: [], backup: [], overlay: [], all: [] };
        cellMap.set(key, cell);
      }
      cell.all.push(r);
      if (pl.role === "Primary") cell.primary.push(r);
      else if (pl.role === "Backup") cell.backup.push(r);
      else cell.overlay.push(r);
      placed = true;
    }

    if (!placed) {
      const fallbackCol = r.primaryPod || r.team_column;
      if (fallbackCol) {
        if (!outsideByCol.has(fallbackCol)) outsideByCol.set(fallbackCol, []);
        outsideByCol.get(fallbackCol)!.push(r);
      } else {
        outsideNoCol.push(r);
      }
    }
  }

  return { columns, rows, cellMap, outsideByCol, outsideNoCol, segmentLeads };
}

// ---------- Reverse coverage ----------

export type ReverseEntry = {
  role: "Primary" | "Backup" | "Overlay" | "Manager";
  person: Person;
  allocationPct: number;
};

export function buildReverse(
  model: DerivedModel,
  pod: string,
): { entries: ReverseEntry[]; assignments: Assignment[] } {
  const assignments = model.assignmentsByPod.get(pod) ?? [];
  const entries: ReverseEntry[] = [];
  for (const a of assignments) {
    const person = model.byId.get(a.scId);
    if (!person) continue;
    entries.push({ role: a.role, person, allocationPct: a.allocationPct });
  }
  // Manager chain: walk up from any of the Primary SCs
  const seen = new Set(entries.map((e) => e.person.id));
  const primary = entries.filter((e) => e.role === "Primary").map((e) => e.person);
  for (const p of primary) {
    let cursor = model.byId.get(p.manager_name);
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      entries.push({ role: "Manager", person: cursor, allocationPct: 0 });
      cursor = model.byId.get(cursor.manager_name);
    }
  }
  // Sort: Primary, Backup, Overlay, Manager
  const order: Record<string, number> = { Primary: 0, Backup: 1, Overlay: 2, Manager: 3 };
  entries.sort((a, b) => order[a.role] - order[b.role] || a.person.name.localeCompare(b.person.name));
  return { entries, assignments };
}

// ---------- Specialist map ----------

export type SpecialistCell = {
  pod: string;
  specialization: string;
  count: number;
  primaryCount: number;
};

export type SpecialistMapData = {
  pods: string[];
  specializations: string[];
  cells: Map<string, SpecialistCell>;
};

export function buildSpecialistMap(model: DerivedModel): SpecialistMapData {
  const pods = model.pods.map((p) => p.name);
  const specializations = model.specializations;
  const cells = new Map<string, SpecialistCell>();
  for (const a of model.assignments) {
    for (const spec of a.specializations) {
      const key = `${a.pod}::${spec}`;
      let cell = cells.get(key);
      if (!cell) {
        cell = { pod: a.pod, specialization: spec, count: 0, primaryCount: 0 };
        cells.set(key, cell);
      }
      cell.count++;
      if (a.role === "Primary") cell.primaryCount++;
    }
  }
  return { pods, specializations, cells };
}

// ---------- Capacity / Load ----------

export type LoadRow = {
  person: Person;
  load: number;
  target: number;
  bucket: LoadBucket;
  primary: { pod: string | null; pct: number };
  backup: { pod: string | null; pct: number };
  overlay: { pods: string[]; pct: number };
};

export function buildLoad(filtered: Person[]): LoadRow[] {
  return filtered
    .filter((p) => p.tier === "L4")
    .map((p) => ({
      person: p,
      load: p.loadSum,
      target: p.targetLoad,
      bucket: loadBucketOf(p),
      primary: { pod: p.primaryPod, pct: p.primary_alloc_pct ?? 0 },
      backup: { pod: p.backupPod, pct: p.backup_alloc_pct ?? 0 },
      overlay: { pods: p.overlayPods, pct: p.overlay_alloc_pct ?? 0 },
    }))
    .sort((a, b) => b.load - a.load);
}

// ---------- KPIs ----------

export type Kpis = {
  coveragePct: number | null;
  backupCoveragePct: number | null;
  ratioPrimary: number | null;
  ratioAll: number | null;
  overloaded: number;
  slack: number;
  podsNoPrimary: Pod[];
  podsNoBackup: Pod[];
  specialistGaps: number | null;
};

export function buildKpis(model: DerivedModel, filteredPeople: Person[]): Kpis {
  const pods = model.pods;
  const totalPods = pods.length;
  const podsNoPrimary = pods.filter((p) => !p.hasPrimary);
  const podsNoBackup = pods.filter((p) => p.hasPrimary && !p.hasBackup);
  const podsWithPrimary = totalPods - podsNoPrimary.length;
  const podsWithBackup = totalPods - podsNoPrimary.length - podsNoBackup.length;
  const coveragePct = totalPods > 0 ? Math.round((podsWithPrimary / totalPods) * 100) : null;
  const backupCoveragePct = totalPods > 0 ? Math.round((podsWithBackup / totalPods) * 100) : null;

  const scs = filteredPeople.filter((p) => p.tier === "L4");
  const primaryAssignments = model.assignments.filter((a) => a.role === "Primary").length;
  const ratioPrimary = scs.length > 0 ? +(primaryAssignments / scs.length).toFixed(2) : null;
  const ratioAll = scs.length > 0 ? +(model.assignments.length / scs.length).toFixed(2) : null;

  const overloaded = scs.filter((p) => p.loadSum > 100).length;
  const slack = scs.filter((p) => p.loadSum > 0 && p.loadSum < 60).length;

  let specialistGaps: number | null = null;
  if (model.hasSpecializationData && model.specializations.length > 0) {
    let gaps = 0;
    for (const pod of pods) {
      const podAssignments = model.assignmentsByPod.get(pod.name) ?? [];
      const covered = new Set(podAssignments.flatMap((a) => a.specializations));
      for (const spec of model.specializations) {
        if (!covered.has(spec)) gaps++;
      }
    }
    specialistGaps = gaps;
  }

  return {
    coveragePct,
    backupCoveragePct,
    ratioPrimary,
    ratioAll,
    overloaded,
    slack,
    podsNoPrimary,
    podsNoBackup,
    specialistGaps,
  };
}
