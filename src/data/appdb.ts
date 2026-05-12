// AppDB persistence layer for the SovConfig collection.
//
// The collection is declared in manifest.json under collectionsMapping.
// We use the @domoinc/toolkit AppDBClient (toolkit-first per the appdb
// skill) and store each settings group as a separate document keyed
// by `key`, with a JSON-encoded `value`. That way new settings groups
// can land without schema changes.
//
// Wire shape lessons inherited from sister apps (e.g., aiCOE):
//   - The proxy is name-based: requests use COLLECTION NAME, not UUID
//   - On first deploy, the collection may not be provisioned yet; we
//     gracefully degrade to an in-memory snapshot until the next
//     publish materializes it
//   - Documents come back as { id, content: { key, value, ... } }

const COLLECTION_NAME = "SovConfig";

export type SovConfigKey =
  | "capacityTargets"
  | "avpOverrides"
  | "defaults";

export type SovConfigDoc<T = unknown> = {
  id?: string;
  key: SovConfigKey;
  value: T;
  updatedAt?: string;
  updatedBy?: string;
};

type RawDoc = {
  id: string;
  content: {
    key: string;
    value: string; // JSON-encoded
    updatedAt?: string;
    updatedBy?: string;
  };
};

let CLIENT: any = null;
let LOAD_PROMISE: Promise<void> | null = null;
let LOADED = false;
let UNAVAILABLE = false;
let ERROR: string | null = null;

async function getClient(): Promise<any | null> {
  if (CLIENT) return CLIENT;
  if (UNAVAILABLE) return null;
  try {
    const mod: any = await import("@domoinc/toolkit");
    const AppDBClient = mod.AppDBClient ?? mod.default?.AppDBClient;
    if (!AppDBClient || !AppDBClient.DocumentsClient) {
      UNAVAILABLE = true;
      ERROR = "AppDBClient.DocumentsClient unavailable in toolkit";
      return null;
    }
    CLIENT = new AppDBClient.DocumentsClient(COLLECTION_NAME);
    return CLIENT;
  } catch (err) {
    UNAVAILABLE = true;
    ERROR = err instanceof Error ? err.message : String(err);
    return null;
  }
}

function unwrap(raw: unknown): RawDoc[] {
  if (Array.isArray(raw)) return raw as RawDoc[];
  const body = (raw as { body?: unknown })?.body;
  if (Array.isArray(body)) return body as RawDoc[];
  return [];
}

function parseDoc<T>(d: RawDoc): SovConfigDoc<T> | null {
  if (!d || !d.content) return null;
  let parsed: T;
  try {
    parsed = JSON.parse(d.content.value || "null") as T;
  } catch {
    return null;
  }
  return {
    id: d.id,
    key: d.content.key as SovConfigKey,
    value: parsed,
    updatedAt: d.content.updatedAt,
    updatedBy: d.content.updatedBy,
  };
}

export type SovConfigSnapshot = {
  capacityTargets: SovConfigDoc<Record<string, number>> | null;
  avpOverrides: SovConfigDoc<Record<string, string>> | null;
  defaults: SovConfigDoc<Record<string, string>> | null;
  /** True when the collection has been read at least once (or known unavailable). */
  ready: boolean;
  /** True when AppDB itself isn't reachable (dev mode, no toolkit, etc.). */
  unavailable: boolean;
  error: string | null;
};

let SNAPSHOT: SovConfigSnapshot = {
  capacityTargets: null,
  avpOverrides: null,
  defaults: null,
  ready: false,
  unavailable: false,
  error: null,
};

const LISTENERS = new Set<() => void>();
function emit() {
  for (const l of LISTENERS) l();
}

export function getSnapshot(): SovConfigSnapshot {
  return SNAPSHOT;
}

export function subscribe(fn: () => void): () => void {
  LISTENERS.add(fn);
  return () => LISTENERS.delete(fn);
}

export async function loadAllConfig(): Promise<SovConfigSnapshot> {
  if (LOAD_PROMISE) {
    await LOAD_PROMISE;
    return SNAPSHOT;
  }
  LOAD_PROMISE = (async () => {
    const client = await getClient();
    if (!client) {
      SNAPSHOT = {
        capacityTargets: null,
        avpOverrides: null,
        defaults: null,
        ready: true,
        unavailable: true,
        error: ERROR,
      };
      LOADED = true;
      emit();
      return;
    }
    try {
      const result = await client.get();
      const docs = unwrap(result?.body ?? result);
      const next: SovConfigSnapshot = {
        capacityTargets: null,
        avpOverrides: null,
        defaults: null,
        ready: true,
        unavailable: false,
        error: null,
      };
      for (const d of docs) {
        const parsed = parseDoc(d);
        if (!parsed) continue;
        if (parsed.key === "capacityTargets")
          next.capacityTargets = parsed as SovConfigDoc<Record<string, number>>;
        else if (parsed.key === "avpOverrides")
          next.avpOverrides = parsed as SovConfigDoc<Record<string, string>>;
        else if (parsed.key === "defaults")
          next.defaults = parsed as SovConfigDoc<Record<string, string>>;
      }
      SNAPSHOT = next;
      LOADED = true;
      emit();
    } catch (err) {
      SNAPSHOT = {
        capacityTargets: null,
        avpOverrides: null,
        defaults: null,
        ready: true,
        unavailable: false,
        error: err instanceof Error ? err.message : String(err),
      };
      LOADED = true;
      emit();
    }
  })();
  await LOAD_PROMISE;
  return SNAPSHOT;
}

export async function saveConfig<T>(
  key: SovConfigKey,
  value: T,
  who?: string,
): Promise<{ ok: boolean; error?: string }> {
  const client = await getClient();
  if (!client) {
    return { ok: false, error: ERROR ?? "AppDB unavailable" };
  }
  // Find existing doc by key (use snapshot if loaded, else query)
  let existing: SovConfigDoc<unknown> | null = null;
  const snap = SNAPSHOT;
  if (key === "capacityTargets") existing = snap.capacityTargets;
  else if (key === "avpOverrides") existing = snap.avpOverrides;
  else if (key === "defaults") existing = snap.defaults;

  const content = {
    key,
    value: JSON.stringify(value),
    updatedAt: new Date().toISOString(),
    updatedBy: who ?? "user",
  };

  try {
    if (existing && existing.id) {
      await client.update({ id: existing.id, content });
    } else {
      const created = await client.create(content);
      const newId =
        (created && (created.body?.id ?? (created as any).id)) ?? undefined;
      // Persist returned id back into snapshot so subsequent saves update.
      const docOut: SovConfigDoc<T> = {
        id: newId,
        key,
        value,
        updatedAt: content.updatedAt,
        updatedBy: content.updatedBy,
      };
      if (key === "capacityTargets") SNAPSHOT.capacityTargets = docOut as any;
      else if (key === "avpOverrides") SNAPSHOT.avpOverrides = docOut as any;
      else if (key === "defaults") SNAPSHOT.defaults = docOut as any;
      emit();
      return { ok: true };
    }
    // Updated path — refresh the in-memory snapshot
    const merged: SovConfigDoc<T> = {
      id: existing?.id,
      key,
      value,
      updatedAt: content.updatedAt,
      updatedBy: content.updatedBy,
    };
    if (key === "capacityTargets") SNAPSHOT.capacityTargets = merged as any;
    else if (key === "avpOverrides") SNAPSHOT.avpOverrides = merged as any;
    else if (key === "defaults") SNAPSHOT.defaults = merged as any;
    emit();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function deleteConfigKey(key: SovConfigKey): Promise<{ ok: boolean; error?: string }> {
  const client = await getClient();
  if (!client) return { ok: false, error: ERROR ?? "AppDB unavailable" };
  let id: string | undefined;
  if (key === "capacityTargets") id = SNAPSHOT.capacityTargets?.id;
  else if (key === "avpOverrides") id = SNAPSHOT.avpOverrides?.id;
  else if (key === "defaults") id = SNAPSHOT.defaults?.id;
  if (!id) {
    if (key === "capacityTargets") SNAPSHOT.capacityTargets = null;
    else if (key === "avpOverrides") SNAPSHOT.avpOverrides = null;
    else if (key === "defaults") SNAPSHOT.defaults = null;
    emit();
    return { ok: true };
  }
  try {
    await client.delete(id);
    if (key === "capacityTargets") SNAPSHOT.capacityTargets = null;
    else if (key === "avpOverrides") SNAPSHOT.avpOverrides = null;
    else if (key === "defaults") SNAPSHOT.defaults = null;
    emit();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function isLoaded(): boolean {
  return LOADED;
}
