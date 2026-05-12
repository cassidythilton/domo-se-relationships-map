// AppDB roster client.
//
// The roster used to live in a Domo dataset (`salesOrgPeople`). It now lives
// in the `SovRoster` AppDB collection — managed entirely from the Settings
// tab via download / edit / upload of CSV or JSON files.
//
// First-run behavior: if the collection is empty AND we have a bundled v2
// CSV (via SAMPLE_PEOPLE), we auto-seed it once. The Settings tab surfaces
// a banner so the user knows where the data came from. After the auto-seed
// the collection is the source of truth — no further reads against the
// Domo dataset.

import type { RawPerson } from "./types";
import { rowFromMap } from "./rosterIO";

const COLLECTION_NAME = "SovRoster";

type RawDoc = {
  id: string;
  content: Record<string, unknown>;
  updatedOn?: string;
  updatedBy?: number | string;
};

let CLIENT: any = null;
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

function toRow(d: RawDoc): RawPerson {
  return rowFromMap(d.content ?? {});
}

// --------------------------------------------------------
// Public API
// --------------------------------------------------------

export type LoadResult = {
  rows: RawPerson[];
  /** Document IDs keyed by name — used by upsert/delete paths. */
  idsByName: Map<string, string>;
  /** Most recent updatedOn across docs (ISO string), if available. */
  lastUpdatedAt: string | null;
  /** True when AppDB itself isn't reachable (dev mode, no toolkit). */
  unavailable: boolean;
  error: string | null;
};

export async function loadRoster(): Promise<LoadResult> {
  const client = await getClient();
  if (!client) {
    return {
      rows: [],
      idsByName: new Map(),
      lastUpdatedAt: null,
      unavailable: true,
      error: ERROR,
    };
  }
  try {
    const result = await client.get();
    const docs = unwrap(result?.body ?? result);
    const rows = docs.map(toRow);
    const idsByName = new Map<string, string>();
    for (const d of docs) {
      const name = String(d.content?.name ?? "").trim();
      if (name) idsByName.set(name, d.id);
    }
    let lastUpdatedAt: string | null = null;
    for (const d of docs) {
      if (typeof d.updatedOn === "string") {
        if (!lastUpdatedAt || d.updatedOn > lastUpdatedAt) {
          lastUpdatedAt = d.updatedOn;
        }
      }
    }
    rows.sort((a, b) => a.sort_order - b.sort_order);
    return { rows, idsByName, lastUpdatedAt, unavailable: false, error: null };
  } catch (err) {
    return {
      rows: [],
      idsByName: new Map(),
      lastUpdatedAt: null,
      unavailable: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function rowToContent(r: RawPerson): Record<string, unknown> {
  return {
    name: r.name,
    segment: r.segment,
    tier: r.tier,
    manager_name: r.manager_name ?? "",
    role_type: r.role_type ?? "",
    team_column: r.team_column ?? "",
    ae_row: r.ae_row ?? "",
    segment_label: r.segment_label ?? r.segment,
    sort_order: String(r.sort_order ?? 0),
    is_active: r.is_active ?? "TRUE",
    notes: r.notes ?? "",
  };
}

async function deleteAll(client: any, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  // Toolkit accepts an array, but proxy-side it sometimes balks at large
  // batches. Chunk to be safe.
  const CHUNK = 50;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    try {
      await client.delete(slice);
    } catch {
      // Fall back to one-at-a-time if the bulk path fails
      for (const id of slice) {
        try { await client.delete(id); } catch { /* keep going */ }
      }
    }
  }
}

async function createMany(client: any, rows: RawPerson[]): Promise<{ created: number; errors: string[] }> {
  if (rows.length === 0) return { created: 0, errors: [] };
  const errors: string[] = [];
  let created = 0;
  // Send up to 8 at a time to respect any rate limits without dragging.
  const BATCH = 8;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      slice.map((r) => client.create(rowToContent(r))),
    );
    for (const res of results) {
      if (res.status === "fulfilled") created++;
      else errors.push(res.reason instanceof Error ? res.reason.message : String(res.reason));
    }
  }
  return { created, errors };
}

export type WriteResult = {
  ok: boolean;
  added: number;
  updated: number;
  removed: number;
  error: string | null;
};

const empty: WriteResult = { ok: false, added: 0, updated: 0, removed: 0, error: null };

/** Wipe AppDB and replace with the supplied rows. */
export async function replaceAllRoster(rows: RawPerson[]): Promise<WriteResult> {
  const client = await getClient();
  if (!client) return { ...empty, error: ERROR ?? "AppDB unavailable" };
  try {
    const existing = await loadRoster();
    if (existing.error) return { ...empty, error: existing.error };
    await deleteAll(client, [...existing.idsByName.values()]);
    const { created, errors } = await createMany(client, rows);
    return {
      ok: errors.length === 0,
      added: created,
      updated: 0,
      removed: existing.idsByName.size,
      error: errors[0] ?? null,
    };
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Insert only rows whose `name` doesn't already exist. */
export async function appendNewRoster(rows: RawPerson[]): Promise<WriteResult> {
  const client = await getClient();
  if (!client) return { ...empty, error: ERROR ?? "AppDB unavailable" };
  try {
    const existing = await loadRoster();
    if (existing.error) return { ...empty, error: existing.error };
    const toInsert = rows.filter((r) => !existing.idsByName.has(r.name));
    const { created, errors } = await createMany(client, toInsert);
    return {
      ok: errors.length === 0,
      added: created,
      updated: 0,
      removed: 0,
      error: errors[0] ?? null,
    };
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Update existing rows (by name) and add net-new rows. Existing rows that
 *  aren't in the upload are LEFT ALONE. */
export async function upsertRoster(rows: RawPerson[]): Promise<WriteResult> {
  const client = await getClient();
  if (!client) return { ...empty, error: ERROR ?? "AppDB unavailable" };
  try {
    const existing = await loadRoster();
    if (existing.error) return { ...empty, error: existing.error };
    const toCreate: RawPerson[] = [];
    const toUpdate: { id: string; row: RawPerson }[] = [];
    for (const r of rows) {
      const id = existing.idsByName.get(r.name);
      if (id) toUpdate.push({ id, row: r });
      else toCreate.push(r);
    }
    let updated = 0;
    const updErrors: string[] = [];
    const UB = 8;
    for (let i = 0; i < toUpdate.length; i += UB) {
      const slice = toUpdate.slice(i, i + UB);
      const results = await Promise.allSettled(
        slice.map(({ id, row }) => client.update({ id, content: rowToContent(row) })),
      );
      for (const res of results) {
        if (res.status === "fulfilled") updated++;
        else updErrors.push(res.reason instanceof Error ? res.reason.message : String(res.reason));
      }
    }
    const { created, errors: createErrors } = await createMany(client, toCreate);
    const allErrors = [...updErrors, ...createErrors];
    return {
      ok: allErrors.length === 0,
      added: created,
      updated,
      removed: 0,
      error: allErrors[0] ?? null,
    };
  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : String(err) };
  }
}

// --------------------------------------------------------
// Auto-seed
// --------------------------------------------------------

const SEED_LS_KEY = "sov_roster_autoseed_v1";

export type SeedAttempt = {
  /** Whether AppDB was reachable. */
  available: boolean;
  /** Whether the collection had any rows at the time of the attempt. */
  wasEmpty: boolean;
  /** Whether we actually inserted seed rows. */
  seeded: boolean;
  /** Number of rows inserted (if seeded === true). */
  rowsInserted: number;
  error: string | null;
};

/** If the collection is empty, insert the supplied seed rows. Idempotent. */
export async function autoSeedIfEmpty(seed: RawPerson[]): Promise<SeedAttempt> {
  const client = await getClient();
  if (!client) {
    return {
      available: false,
      wasEmpty: false,
      seeded: false,
      rowsInserted: 0,
      error: ERROR,
    };
  }
  const existing = await loadRoster();
  if (existing.error) {
    return { available: true, wasEmpty: false, seeded: false, rowsInserted: 0, error: existing.error };
  }
  if (existing.rows.length > 0) {
    return { available: true, wasEmpty: false, seeded: false, rowsInserted: 0, error: null };
  }
  const { created, errors } = await createMany(client, seed);
  if (created > 0) {
    try { localStorage.setItem(SEED_LS_KEY, new Date().toISOString()); } catch { /* ignore */ }
  }
  return {
    available: true,
    wasEmpty: true,
    seeded: created > 0,
    rowsInserted: created,
    error: errors[0] ?? null,
  };
}

/** Banner state for the Settings tab \u2014 was this a fresh seed? */
export function lastAutoSeedAt(): string | null {
  try { return localStorage.getItem(SEED_LS_KEY); } catch { return null; }
}
export function clearAutoSeedFlag(): void {
  try { localStorage.removeItem(SEED_LS_KEY); } catch { /* ignore */ }
}
