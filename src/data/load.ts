// Roster loader. The roster lives in the SovRoster AppDB collection.
//
// First run after the SovRoster collection is provisioned, the collection
// is empty \u2014 we auto-seed it from the inlined v2 CSV (SAMPLE_PEOPLE) so
// existing data isn't lost in the migration. Subsequent loads read AppDB
// directly and never touch the bundled sample data.
//
// Dev mode (no Domo runtime): loadRoster returns unavailable=true and we
// fall back to SAMPLE_PEOPLE so `npm run dev` keeps rendering the org.

import type { RawPerson } from "./types";
import { autoSeedIfEmpty, loadRoster } from "./rosterDb";
import { rowFromMap } from "./rosterIO";

async function bundledSampleAsync(): Promise<RawPerson[]> {
  const mod = await import("./sampleData");
  return mod.SAMPLE_PEOPLE.map((r) => rowFromMap(r as Record<string, unknown>)).sort(
    (a, b) => a.sort_order - b.sort_order,
  );
}

export async function loadPeople(): Promise<RawPerson[]> {
  // 1. Try AppDB
  let result = await loadRoster();

  // 2. AppDB unreachable \u2014 dev mode fallback
  if (result.unavailable) {
    if (import.meta.env.DEV) {
      return bundledSampleAsync();
    }
    throw new Error(
      result.error ?? "Roster (SovRoster) unavailable and no dev fallback active.",
    );
  }

  // 3. AppDB reachable but empty \u2014 auto-seed from bundled v2 CSV
  if (result.rows.length === 0) {
    const seed = await bundledSampleAsync();
    const seedResult = await autoSeedIfEmpty(seed);
    if (seedResult.seeded) {
      // Re-read so we have the fresh document IDs
      result = await loadRoster();
      if (result.rows.length > 0) return result.rows;
      // If for any reason the re-read returns empty, just use the seed
      return seed;
    }
    if (seedResult.error) {
      console.warn("[roster] seed attempt failed:", seedResult.error);
    }
    return seed;
  }

  return result.rows;
}
