// Loads the Domo user-profile dataset (alias `userProfiles`) and exposes
// two lookups consumed elsewhere in the app:
//
//   1. profilePictureFor(name)  → image URL for an Avatar
//   2. managerOf(name)          → their direct manager’s display name
//                                  (used by Discrepancies to suggest AVP
//                                   mappings for RVPs whose `avp` is null)
//
// The dataset’s schema isn’t fixed across instances, so we issue a
// `SELECT * … LIMIT 1` first to introspect column names, then issue a
// targeted `SELECT` that fetches whatever subset we recognize. This keeps
// the loader resilient to renamed columns ("Manager" vs "Manager Name"
// vs "Reports To" etc.) without code changes per instance.

const ALIAS = "userProfiles";

const NAME_COLS = ["display name", "user display name", "full name", "user name", "name"];
const URL_COLS = ["profile picture url", "avatar url", "photo url", "picture url"];
const MANAGER_COLS = [
  "manager display name",
  "manager name",
  "manager",
  "reports to",
  "user manager",
  "manager full name",
  "direct manager",
];

type RawRes = { columns: string[]; rows: unknown[][] };

async function runSql(sql: string): Promise<RawRes> {
  const mod: any = await import("@domoinc/toolkit");
  const SqlClient = mod.SqlClient ?? mod.default?.SqlClient;
  const client = new SqlClient();
  const result: any = await client.get(ALIAS, sql);
  const res = result?.body || result?.data || result;
  return {
    columns: (res?.columns as string[]) ?? [],
    rows: (res?.rows as unknown[][]) ?? [],
  };
}

const SUFFIX_RE = /\s+(SC|AE|CAE|CSM)$/i;

function looseKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]+/g, "");
}

function clean(name: string): string {
  return (name ?? "").toString().replace(SUFFIX_RE, "").trim();
}

function findCol(columns: string[], candidates: string[]): number {
  // Prefer exact (case-insensitive) match, then substring match.
  const lower = columns.map((c) => c.toLowerCase());
  for (const cand of candidates) {
    const i = lower.indexOf(cand);
    if (i >= 0) return i;
  }
  for (let i = 0; i < lower.length; i++) {
    if (candidates.some((cand) => lower[i].includes(cand))) return i;
  }
  return -1;
}

function quoteCol(c: string): string {
  return "`" + c.replace(/`/g, "``") + "`";
}

export type ProfilesData = {
  /** All known column names from the user-profile dataset. */
  columns: string[];
  /** Lookup table: canonical name key (full lower / loose / first+last) → picture URL. */
  pictures: Map<string, string>;
  /** name (lower-cased, suffix-stripped) → manager's display name (raw casing). */
  managers: Map<string, string>;
  /** All directory display names indexed by `${firstLower}::${lastInitialLower}`
   *  for resolving abbreviated CSV names like "Mike N" → "Mike Newcomb". */
  byFirstAndInitial: Map<string, string[]>;
  /** Display names indexed by firstNameLower (used for single-token names). */
  byFirstName: Map<string, string[]>;
  /** Set of all full display names (lower-cased) for fast already-full check. */
  fullNames: Set<string>;
};

let DATA: ProfilesData | null = null;
let LOADING: Promise<ProfilesData> | null = null;

function emptyData(): ProfilesData {
  return {
    columns: [],
    pictures: new Map(),
    managers: new Map(),
    byFirstAndInitial: new Map(),
    byFirstName: new Map(),
    fullNames: new Set(),
  };
}

async function fetchProfiles(): Promise<ProfilesData> {
  try {
    // 1. Inspect columns
    const head = await runSql("SELECT * FROM table LIMIT 1");
    const columns = head.columns;
    const nameIdx = findCol(columns, NAME_COLS);
    const urlIdx = findCol(columns, URL_COLS);
    const mgrIdx = findCol(columns, MANAGER_COLS);
    if (nameIdx < 0) {
      console.warn("[profiles] no name column found in", columns);
      return emptyData();
    }
    const select: string[] = [quoteCol(columns[nameIdx])];
    if (urlIdx >= 0) select.push(quoteCol(columns[urlIdx]));
    if (mgrIdx >= 0) select.push(quoteCol(columns[mgrIdx]));
    const sql = `SELECT ${select.join(", ")} FROM table`;
    const result = await runSql(sql);

    const pictures = new Map<string, string>();
    const managers = new Map<string, string>();
    const byFirstAndInitial = new Map<string, string[]>();
    const byFirstName = new Map<string, string[]>();
    const fullNames = new Set<string>();
    let outIdx = 0;
    const nameOut = outIdx++;
    const urlOut = urlIdx >= 0 ? outIdx++ : -1;
    const mgrOut = mgrIdx >= 0 ? outIdx++ : -1;

    for (const row of result.rows) {
      const name = clean(row[nameOut] as string);
      if (!name) continue;
      const url = urlOut >= 0 ? clean(row[urlOut] as string) : "";
      const mgr = mgrOut >= 0 ? clean(row[mgrOut] as string) : "";

      const lower = name.toLowerCase();
      fullNames.add(lower);
      if (url) {
        pictures.set(lower, url);
        pictures.set(looseKey(name), url);
        const parts = name.split(/\s+/);
        if (parts.length >= 2) {
          const fl = `${parts[0][0]}${parts[parts.length - 1]}`.toLowerCase();
          if (!pictures.has(fl)) pictures.set(fl, url);
        }
      }
      if (mgr) {
        managers.set(lower, mgr);
        managers.set(looseKey(name), mgr);
      }

      // Build name-resolution indexes
      const parts = name.split(/\s+/);
      if (parts.length >= 2) {
        const first = parts[0].toLowerCase();
        const lastInitial = parts[parts.length - 1][0].toLowerCase();
        const key = `${first}::${lastInitial}`;
        if (!byFirstAndInitial.has(key)) byFirstAndInitial.set(key, []);
        byFirstAndInitial.get(key)!.push(name);
        if (!byFirstName.has(first)) byFirstName.set(first, []);
        byFirstName.get(first)!.push(name);
      } else if (parts.length === 1) {
        const first = parts[0].toLowerCase();
        if (!byFirstName.has(first)) byFirstName.set(first, []);
        byFirstName.get(first)!.push(name);
      }
    }
    return { columns, pictures, managers, byFirstAndInitial, byFirstName, fullNames };
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn("[profiles] dataset unavailable, falling back to initials", err);
    }
    return emptyData();
  }
}

export function ensureProfilesLoaded(): Promise<ProfilesData> {
  if (DATA) return Promise.resolve(DATA);
  if (LOADING) return LOADING;
  LOADING = fetchProfiles().then((d) => {
    DATA = d;
    return d;
  });
  return LOADING;
}

/** Synchronous picture lookup; returns null if not loaded yet or unknown. */
export function profilePictureFor(name: string | null | undefined): string | null {
  if (!name || !DATA) return null;
  const c = clean(name).toLowerCase();
  if (DATA.pictures.has(c)) return DATA.pictures.get(c)!;
  const loose = looseKey(name);
  if (DATA.pictures.has(loose)) return DATA.pictures.get(loose)!;
  const parts = clean(name).split(/\s+/);
  if (parts.length >= 2) {
    const fl = `${parts[0][0]}${parts[parts.length - 1]}`.toLowerCase();
    if (DATA.pictures.has(fl)) return DATA.pictures.get(fl)!;
  }
  return null;
}

/** Synchronous manager lookup. Returns null if profile data isn’t loaded
 *  or the directory has no manager information for this name. */
export function managerOf(name: string | null | undefined): string | null {
  if (!name || !DATA) return null;
  const c = clean(name).toLowerCase();
  if (DATA.managers.has(c)) return DATA.managers.get(c)!;
  const loose = looseKey(name);
  if (DATA.managers.has(loose)) return DATA.managers.get(loose)!;
  return null;
}

/** Whether the user-profile dataset has a usable manager column. */
export function hasManagerData(): boolean {
  return !!DATA && DATA.managers.size > 0;
}

/** Resolve an abbreviated CSV name ("Mike N" / "Truman") to a full display
 *  name from the live user directory. Returns null if the directory isn't
 *  loaded yet or the name doesn't have a unique match. */
export function displayNameFromDirectory(rawName: string | null | undefined): string | null {
  if (!rawName || !DATA) return null;
  const trimmed = rawName.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/\s+/);
  // Already full name? (>=2 tokens, last token >=3 chars)
  if (parts.length >= 2 && parts[parts.length - 1].length >= 3) {
    if (DATA.fullNames.has(trimmed.toLowerCase())) return trimmed;
    return trimmed; // treat as already-full even if directory hasn't seen it
  }
  if (parts.length >= 2) {
    const first = parts[0].toLowerCase();
    const lastInitial = parts[parts.length - 1][0]?.toLowerCase();
    if (lastInitial) {
      const matches = DATA.byFirstAndInitial.get(`${first}::${lastInitial}`);
      if (matches && matches.length === 1) return matches[0];
    }
  }
  if (parts.length === 1) {
    const first = parts[0].toLowerCase();
    const matches = DATA.byFirstName.get(first);
    if (matches && matches.length === 1) return matches[0];
  }
  return null;
}

export function profilesSnapshot(): ProfilesData | null {
  return DATA;
}

import { useEffect, useState } from "react";

/** Reactive hook — re-renders when profile data finishes loading. */
export function useProfilesReady(): { ready: boolean; data: ProfilesData | null } {
  const [data, setData] = useState<ProfilesData | null>(DATA);
  useEffect(() => {
    if (DATA) {
      setData(DATA);
      return;
    }
    let cancelled = false;
    ensureProfilesLoaded().then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return { ready: !!data, data };
}
