// Pre-aggregated SQL queries against the GOLD Salesforce Opportunities Master
// dataset (alias `salesDeals`, id eac44ae6-...). All queries are scoped to
// Account Super Region = 'NAM' and a date window the user picks.
//
// We never ship raw deals to the browser. Each function returns a few-hundred-
// row aggregation that powers a specific view (capacity, observed coverage,
// discrepancies, etc.). Names returned by these queries are deal-system
// names (e.g. "Robert Jusino", "Megha Kumar"); the app joins them to the
// roster via src/config/nameMap.json.

import { isoDate } from "./fiscal";
import type { DateRange } from "./fiscal";

export type SeMetric = {
  /** Deal-system canonical name (Sales Consultant column value). */
  name: string;
  dealCount: number;
  pipelineAcv: number;
  closedWonAcv: number;
  closedLostAcv: number;
  openCount: number;
  wonCount: number;
  lostCount: number;
  /** Win rate among closed deals. */
  winRate: number | null;
};

export type AeMetric = {
  /** Forecast Owner full name. */
  name: string;
  /** Forecast Manager. */
  manager: string | null;
  segment: string | null;
  primarySc: string | null;
  primaryScDealCount: number;
  totalDealCount: number;
  pipelineAcv: number;
};

export type CoverageEdge = {
  sc: string;
  ae: string;
  forecastManager: string | null;
  segment: string | null;
  dealCount: number;
  pipelineAcv: number;
};

export type DealsSnapshot = {
  range: DateRange;
  /** SE-side metrics keyed by Sales Consultant name (deal-system name). */
  seMetrics: SeMetric[];
  byScName: Map<string, SeMetric>;
  /** AE-side metrics keyed by Forecast Owner name. */
  aeMetrics: AeMetric[];
  byAeName: Map<string, AeMetric>;
  /** Coverage edges (sc, ae) with deal/pipeline counts. */
  edges: CoverageEdge[];
  /** Distinct PoC Sales Consultant names + counts. */
  pocSc: Array<{ name: string; count: number; pipelineAcv: number }>;
  /** Forecast Owners with active pipeline but no SC assigned. */
  uncoveredAes: Array<{ name: string; manager: string | null; pipelineAcv: number; dealCount: number }>;
};

const ALIAS = "salesDeals";

// Bypass type checks on @domoinc/toolkit because its public types are sparse.
async function runSql(sql: string): Promise<{ columns: string[]; rows: unknown[][] }> {
  const mod: any = await import("@domoinc/toolkit");
  const SqlClient = mod.SqlClient ?? mod.default?.SqlClient;
  const client = new SqlClient();
  const result: any = await client.get(ALIAS, sql);
  const res = result?.body || result?.data || result;
  return {
    columns: (res?.columns as string[]) ?? [],
    rows: (res?.rows as unknown[][]) ?? [],
  } as any;
}

function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

const NAM = "`Account Super Region` = 'NAM'";

function whereWindow(range: DateRange): string {
  return `${NAM} AND \`Created Date\` >= '${isoDate(range.start)}' AND \`Created Date\` <= '${isoDate(range.end)}'`;
}

export async function loadDealsSnapshot(range: DateRange): Promise<DealsSnapshot> {
  const where = whereWindow(range);

  const [seRes, aeRes, edgeRes, pocRes, uncoveredRes] = await Promise.all([
    runSql(`
      SELECT
        \`Sales Consultant\` AS sc,
        COUNT(*) AS deal_count,
        SUM(CASE WHEN \`Is Pipeline\` = 'TRUE' THEN \`ACV (USD)\` ELSE 0 END) AS pipeline_acv,
        SUM(CASE WHEN \`Is Won\` = 'TRUE'      THEN \`ACV (USD)\` ELSE 0 END) AS won_acv,
        SUM(CASE WHEN \`Is Won\` = 'FALSE' AND \`Is Closed\` = 'TRUE' THEN \`ACV (USD)\` ELSE 0 END) AS lost_acv,
        SUM(CASE WHEN \`Is Pipeline\` = 'TRUE' THEN 1 ELSE 0 END) AS open_count,
        SUM(CASE WHEN \`Is Won\` = 'TRUE'      THEN 1 ELSE 0 END) AS won_count,
        SUM(CASE WHEN \`Is Won\` = 'FALSE' AND \`Is Closed\` = 'TRUE' THEN 1 ELSE 0 END) AS lost_count
      FROM ${ALIAS}
      WHERE ${where} AND \`Sales Consultant\` IS NOT NULL AND \`Sales Consultant\` <> ''
      GROUP BY \`Sales Consultant\`
      ORDER BY pipeline_acv DESC
    `),
    runSql(`
      SELECT
        \`Forecast Owner\` AS ae,
        MAX(\`Forecast Manager\`) AS fm,
        MAX(\`Sales Segment\`) AS segment,
        COUNT(*) AS deal_count,
        SUM(CASE WHEN \`Is Pipeline\` = 'TRUE' THEN \`ACV (USD)\` ELSE 0 END) AS pipeline_acv
      FROM ${ALIAS}
      WHERE ${where} AND \`Forecast Owner\` IS NOT NULL AND \`Forecast Owner\` <> ''
      GROUP BY \`Forecast Owner\`
      ORDER BY pipeline_acv DESC
    `),
    runSql(`
      SELECT
        \`Sales Consultant\` AS sc,
        \`Forecast Owner\` AS ae,
        MAX(\`Forecast Manager\`) AS fm,
        MAX(\`Sales Segment\`) AS segment,
        COUNT(*) AS deal_count,
        SUM(CASE WHEN \`Is Pipeline\` = 'TRUE' THEN \`ACV (USD)\` ELSE 0 END) AS pipeline_acv
      FROM ${ALIAS}
      WHERE ${where}
        AND \`Sales Consultant\` IS NOT NULL AND \`Sales Consultant\` <> ''
        AND \`Forecast Owner\`    IS NOT NULL AND \`Forecast Owner\`    <> ''
      GROUP BY \`Sales Consultant\`, \`Forecast Owner\`
    `),
    runSql(`
      SELECT
        \`PoC Sales Consultant\` AS poc,
        COUNT(*) AS deal_count,
        SUM(CASE WHEN \`Is Pipeline\` = 'TRUE' THEN \`ACV (USD)\` ELSE 0 END) AS pipeline_acv
      FROM ${ALIAS}
      WHERE ${where} AND \`PoC Sales Consultant\` IS NOT NULL AND \`PoC Sales Consultant\` <> ''
      GROUP BY \`PoC Sales Consultant\`
      ORDER BY deal_count DESC
    `),
    runSql(`
      SELECT
        \`Forecast Owner\` AS ae,
        MAX(\`Forecast Manager\`) AS fm,
        SUM(CASE WHEN \`Is Pipeline\` = 'TRUE' THEN \`ACV (USD)\` ELSE 0 END) AS pipeline_acv,
        SUM(CASE WHEN \`Is Pipeline\` = 'TRUE' THEN 1 ELSE 0 END) AS open_count
      FROM ${ALIAS}
      WHERE ${where} AND (\`Sales Consultant\` IS NULL OR \`Sales Consultant\` = '')
        AND \`Is Pipeline\` = 'TRUE'
        AND \`Forecast Owner\` IS NOT NULL AND \`Forecast Owner\` <> ''
      GROUP BY \`Forecast Owner\`
      HAVING open_count > 0
      ORDER BY pipeline_acv DESC
    `),
  ]);

  const seMetrics: SeMetric[] = seRes.rows.map((r) => {
    const wonCount = num(r[6]);
    const lostCount = num(r[7]);
    const closed = wonCount + lostCount;
    return {
      name: str(r[0]),
      dealCount: num(r[1]),
      pipelineAcv: num(r[2]),
      closedWonAcv: num(r[3]),
      closedLostAcv: num(r[4]),
      openCount: num(r[5]),
      wonCount,
      lostCount,
      winRate: closed > 0 ? wonCount / closed : null,
    };
  });

  const aeMetrics: AeMetric[] = aeRes.rows.map((r) => ({
    name: str(r[0]),
    manager: str(r[1]) || null,
    segment: str(r[2]) || null,
    primarySc: null,
    primaryScDealCount: 0,
    totalDealCount: num(r[3]),
    pipelineAcv: num(r[4]),
  }));
  const byAeName = new Map(aeMetrics.map((a) => [a.name, a]));

  const edges: CoverageEdge[] = edgeRes.rows.map((r) => ({
    sc: str(r[0]),
    ae: str(r[1]),
    forecastManager: str(r[2]) || null,
    segment: str(r[3]) || null,
    dealCount: num(r[4]),
    pipelineAcv: num(r[5]),
  }));

  // Annotate AE with their primary SC (most-frequent on their deals)
  const scPerAe = new Map<string, Map<string, number>>();
  for (const e of edges) {
    if (!scPerAe.has(e.ae)) scPerAe.set(e.ae, new Map());
    scPerAe.get(e.ae)!.set(e.sc, (scPerAe.get(e.ae)!.get(e.sc) ?? 0) + e.dealCount);
  }
  for (const [ae, scs] of scPerAe) {
    let best: [string, number] | null = null;
    for (const [sc, n] of scs) {
      if (!best || n > best[1]) best = [sc, n];
    }
    const aeRec = byAeName.get(ae);
    if (aeRec && best) {
      aeRec.primarySc = best[0];
      aeRec.primaryScDealCount = best[1];
    }
  }

  const pocSc = pocRes.rows.map((r) => ({
    name: str(r[0]),
    count: num(r[1]),
    pipelineAcv: num(r[2]),
  }));

  const uncoveredAes = uncoveredRes.rows.map((r) => ({
    name: str(r[0]),
    manager: str(r[1]) || null,
    pipelineAcv: num(r[2]),
    dealCount: num(r[3]),
  }));

  return {
    range,
    seMetrics,
    byScName: new Map(seMetrics.map((m) => [m.name, m])),
    aeMetrics,
    byAeName,
    edges,
    pocSc,
    uncoveredAes,
  };
}
