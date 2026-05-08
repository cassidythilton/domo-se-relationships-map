import type {
  Assignment,
  DerivedModel,
  Person,
  Pod,
  RawPerson,
} from "./types";

const splitCsv = (s: string | undefined): string[] =>
  (s ?? "")
    .split(/[,;|]/g)
    .map((x) => x.trim())
    .filter(Boolean);

function normalizePerson(raw: RawPerson): Person {
  const explicitPrimary = (raw.primary_pod ?? "").trim();
  const fallbackPrimary = (raw.team_column ?? "").trim();
  const primaryPod = explicitPrimary || fallbackPrimary || null;
  const backupPod = (raw.backup_pod ?? "").trim() || null;
  const overlayPods = splitCsv(raw.overlay_pods);
  const specializationList = splitCsv(raw.specializations);

  // Load = sum of allocation %; only count primary if a pod is actually assigned.
  const primaryAlloc = primaryPod ? raw.primary_alloc_pct ?? 0 : 0;
  const backupAlloc = backupPod ? raw.backup_alloc_pct ?? 0 : 0;
  const overlayAlloc = overlayPods.length > 0 ? raw.overlay_alloc_pct ?? 0 : 0;
  const loadSum = primaryAlloc + backupAlloc + overlayAlloc;
  const targetLoad = raw.target_load_pct ?? 100;

  return {
    ...raw,
    id: raw.name,
    primaryPod,
    backupPod,
    overlayPods,
    specializationList,
    loadSum,
    targetLoad,
  };
}

function buildAssignments(people: Person[]): Assignment[] {
  const out: Assignment[] = [];
  for (const p of people) {
    if (p.tier !== "L4") continue;
    if (p.primaryPod) {
      out.push({
        scId: p.id,
        scName: p.name,
        role: "Primary",
        pod: p.primaryPod,
        allocationPct: p.primary_alloc_pct ?? 0,
        specializations: p.specializationList,
        rampStatus: p.ramp_status || null,
      });
    }
    if (p.backupPod) {
      out.push({
        scId: p.id,
        scName: p.name,
        role: "Backup",
        pod: p.backupPod,
        allocationPct: p.backup_alloc_pct ?? 0,
        specializations: p.specializationList,
        rampStatus: p.ramp_status || null,
      });
    }
    if (p.overlayPods.length) {
      // Single overlay_alloc_pct distributed evenly across overlay pods
      const each = p.overlayPods.length > 0 ? (p.overlay_alloc_pct ?? 0) / p.overlayPods.length : 0;
      for (const pod of p.overlayPods) {
        out.push({
          scId: p.id,
          scName: p.name,
          role: "Overlay",
          pod,
          allocationPct: each,
          specializations: p.specializationList,
          rampStatus: p.ramp_status || null,
        });
      }
    }
  }
  return out;
}

function buildPods(assignments: Assignment[]): Pod[] {
  const map = new Map<string, Pod>();
  for (const a of assignments) {
    let pod = map.get(a.pod);
    if (!pod) {
      pod = {
        name: a.pod,
        primaryCount: 0,
        backupCount: 0,
        overlayCount: 0,
        totalSCs: 0,
        hasPrimary: false,
        hasBackup: false,
      };
      map.set(a.pod, pod);
    }
    if (a.role === "Primary") pod.primaryCount++;
    if (a.role === "Backup") pod.backupCount++;
    if (a.role === "Overlay") pod.overlayCount++;
  }
  // Compute totals
  for (const pod of map.values()) {
    pod.totalSCs = pod.primaryCount + pod.backupCount + pod.overlayCount;
    pod.hasPrimary = pod.primaryCount > 0;
    pod.hasBackup = pod.backupCount > 0;
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function normalize(rawRows: RawPerson[]): DerivedModel {
  const people = rawRows.map(normalizePerson);
  const byId = new Map(people.map((p) => [p.id, p]));
  const assignments = buildAssignments(people);

  const assignmentsByPod = new Map<string, Assignment[]>();
  for (const a of assignments) {
    if (!assignmentsByPod.has(a.pod)) assignmentsByPod.set(a.pod, []);
    assignmentsByPod.get(a.pod)!.push(a);
  }
  const assignmentsBySC = new Map<string, Assignment[]>();
  for (const a of assignments) {
    if (!assignmentsBySC.has(a.scId)) assignmentsBySC.set(a.scId, []);
    assignmentsBySC.get(a.scId)!.push(a);
  }

  const pods = buildPods(assignments);

  const segments = unique(people.map((p) => p.segment).filter(Boolean));
  const managers = unique(people.map((p) => p.manager_name).filter(Boolean)).sort();
  const roleTypes = unique(people.map((p) => p.role_type).filter(Boolean)).sort();
  const specializations = unique(people.flatMap((p) => p.specializationList)).sort();
  const rampStatuses = unique(people.map((p) => (p.ramp_status || "").trim()).filter(Boolean)).sort();

  const hasCoverageData = people.some(
    (p) =>
      (p.primary_pod ?? "").trim() ||
      (p.backup_pod ?? "").trim() ||
      (p.overlay_pods ?? "").trim() ||
      (p.primary_alloc_pct ?? 0) > 0 ||
      (p.backup_alloc_pct ?? 0) > 0 ||
      (p.overlay_alloc_pct ?? 0) > 0,
  );
  const hasSpecializationData = specializations.length > 0;

  return {
    people,
    byId,
    pods,
    podByName: new Map(pods.map((p) => [p.name, p])),
    assignments,
    assignmentsByPod,
    assignmentsBySC,
    segments,
    managers,
    roleTypes,
    specializations,
    rampStatuses,
    hasCoverageData,
    hasSpecializationData,
  };
}

function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}
