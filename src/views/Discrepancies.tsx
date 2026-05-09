import { useMemo, useState } from "react";
import { useStore } from "../store";
import {
  detectDiscrepancies,
  discrepancyKindLabel,
  fmtCurrency,
} from "../store/observed";
import type { Discrepancy } from "../store/observed";
import { Avatar } from "../components/Avatar";

const SEV_LABEL: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export function Discrepancies() {
  const model = useStore((s) => s.model);
  const deals = useStore((s) => s.deals);
  const dealsLoading = useStore((s) => s.dealsLoading);
  const dealsError = useStore((s) => s.dealsError);
  const select = useStore((s) => s.selectPerson);
  const [filterKind, setFilterKind] = useState<Discrepancy["kind"] | "all">("all");
  const [minSeverity, setMinSeverity] = useState<"high" | "medium" | "low">("low");

  const discrepancies = useMemo(() => {
    if (!model || !deals) return [];
    return detectDiscrepancies(model, deals);
  }, [model, deals]);

  if (dealsError) {
    return (
      <div className="state state-error">
        <div>
          <h2>Couldn't load deals data</h2>
          <pre>{dealsError}</pre>
        </div>
      </div>
    );
  }
  if (dealsLoading || !deals) {
    return <div className="state state-loading">Loading deal data…</div>;
  }
  if (!model) return null;

  const sevRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const filtered = discrepancies
    .filter((d) => filterKind === "all" || d.kind === filterKind)
    .filter((d) => sevRank[d.severity] <= sevRank[minSeverity]);

  // Group by kind for the summary header
  const counts: Record<string, { high: number; medium: number; low: number }> = {};
  for (const d of discrepancies) {
    counts[d.kind] ??= { high: 0, medium: 0, low: 0 };
    counts[d.kind][d.severity as "high" | "medium" | "low"]++;
  }

  const kinds: Discrepancy["kind"][] = [
    "uncovered_ae",
    "se_in_deals_not_in_roster",
    "ae_in_deals_not_in_roster",
    "roster_se_no_recent_deals",
    "ae_primary_sc_outside_pod",
  ];

  return (
    <div className="discrepancies-wrap">
      <div className="discrepancies-intro">
        <h2>Where the roster differs from observed activity</h2>
        <p>
          Comparing the asserted SE org chart (your roster) against the live{" "}
          <strong>GOLD | RevOps | Salesforce Opportunities Master</strong> deal data,
          scoped to <strong>NAM</strong> and <strong>{deals.range.label}</strong>.
          Use this view to find rows in the source roster CSV that need editing —
          then re-upload and the rest of the app will reflect the change.
        </p>
      </div>

      <div className="discrepancies-summary">
        {kinds.map((k) => {
          const c = counts[k] ?? { high: 0, medium: 0, low: 0 };
          const total = c.high + c.medium + c.low;
          return (
            <button
              key={k}
              type="button"
              className={
                "discrepancies-tile" + (filterKind === k ? " active" : "") +
                (total === 0 ? " empty" : "")
              }
              onClick={() => setFilterKind(filterKind === k ? "all" : k)}
              disabled={total === 0}
            >
              <span className="discrepancies-tile-label">{discrepancyKindLabel(k)}</span>
              <span className="discrepancies-tile-value">{total}</span>
              <span className="discrepancies-tile-meta">
                {c.high > 0 && <span className="sev sev-high">H {c.high}</span>}
                {c.medium > 0 && <span className="sev sev-medium">M {c.medium}</span>}
                {c.low > 0 && <span className="sev sev-low">L {c.low}</span>}
                {total === 0 && <span className="muted">none</span>}
              </span>
            </button>
          );
        })}
      </div>

      <div className="discrepancies-toolbar">
        <span className="muted">Show severity:</span>
        <div className="window-toggle" role="group">
          {(["high", "medium", "low"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={"window-btn" + (minSeverity === s ? " active" : "")}
              onClick={() => setMinSeverity(s)}
            >
              {s === "low" ? "all" : `\u2265 ${SEV_LABEL[s]}`}
            </button>
          ))}
        </div>
        <span className="muted" style={{ marginLeft: "auto" }}>
          Showing {filtered.length} of {discrepancies.length}
        </span>
      </div>

      <div className="discrepancies-list">
        {filtered.length === 0 && (
          <div className="state-empty">
            No discrepancies in this severity range. Either the roster matches reality
            perfectly, or you've already cleaned up the issues. (Recommended: lower the
            severity bar to "all" to double-check.)
          </div>
        )}
        {filtered.map((d, i) => (
          <DiscrepancyCard key={i} d={d} onPersonClick={(name) => {
            const p = model.people.find((x) => x.name === name);
            if (p) select(p.id);
          }} />
        ))}
      </div>
    </div>
  );
}

function DiscrepancyCard({
  d,
  onPersonClick,
}: {
  d: Discrepancy;
  onPersonClick: (name: string) => void;
}) {
  return (
    <div className={`discrepancy-card sev-${d.severity}`}>
      <div className="discrepancy-card-head">
        <span className={`sev sev-${d.severity}`}>{SEV_LABEL[d.severity]}</span>
        <span className="discrepancy-kind">{discrepancyKindLabel(d.kind)}</span>
      </div>
      <div className="discrepancy-card-body">{renderDiscrepancyBody(d, onPersonClick)}</div>
    </div>
  );
}

function renderDiscrepancyBody(
  d: Discrepancy,
  onPersonClick: (name: string) => void,
): JSX.Element {
  switch (d.kind) {
    case "se_in_deals_not_in_roster":
      return (
        <div className="discrepancy-row">
          <Avatar name={d.dealName} size="md" />
          <div className="discrepancy-row-text">
            <div className="discrepancy-row-title">{d.dealName}</div>
            <div className="discrepancy-row-meta">
              {d.dealCount} deals · {fmtCurrency(d.pipelineAcv)} pipeline ACV ·
              not in roster
            </div>
          </div>
          <div className="discrepancy-action muted">
            Add an L3 row in the SC Org segment, or alias an existing roster name.
          </div>
        </div>
      );
    case "roster_se_no_recent_deals":
      return (
        <div className="discrepancy-row clickable" onClick={() => onPersonClick(d.rosterName)}>
          <Avatar name={d.rosterName} size="md" />
          <div className="discrepancy-row-text">
            <div className="discrepancy-row-title">{d.rosterName}</div>
            <div className="discrepancy-row-meta">
              {d.tier} {d.segment} · 0 NAM deals as Sales Consultant in window
            </div>
          </div>
          <div className="discrepancy-action muted">
            Either inactive (mark is_active=FALSE) or covers non-NAM region.
          </div>
        </div>
      );
    case "ae_in_deals_not_in_roster":
      return (
        <div className="discrepancy-row">
          <Avatar name={d.dealName} size="md" />
          <div className="discrepancy-row-text">
            <div className="discrepancy-row-title">{d.dealName}</div>
            <div className="discrepancy-row-meta">
              {d.dealCount} deals · {fmtCurrency(d.pipelineAcv)} pipeline ·
              FM: {d.forecastManager ?? "—"}
            </div>
          </div>
          <div className="discrepancy-action muted">
            New AE — add as L4 in the appropriate segment / pod.
          </div>
        </div>
      );
    case "uncovered_ae":
      return (
        <div className="discrepancy-row">
          <Avatar name={d.aeName} size="md" />
          <div className="discrepancy-row-text">
            <div className="discrepancy-row-title">{d.aeName}</div>
            <div className="discrepancy-row-meta">
              {d.dealCount} open · {fmtCurrency(d.pipelineAcv)} pipeline ·
              FM: {d.forecastManager ?? "—"} · <strong>no SC assigned</strong>
            </div>
          </div>
          <div className="discrepancy-action muted">
            Pipeline at risk — assign a Sales Consultant in Salesforce.
          </div>
        </div>
      );
    case "asserted_pod_no_observed_coverage":
      return (
        <div className="discrepancy-row">
          <div className="discrepancy-row-text">
            <div className="discrepancy-row-title">{d.podLeader}</div>
            <div className="discrepancy-row-meta">
              {d.asserted} AEs in asserted pod · {d.observedDeals} observed deals
            </div>
          </div>
        </div>
      );
    case "ae_primary_sc_outside_pod":
      return (
        <div className="discrepancy-row">
          <div className="discrepancy-row-text">
            <div className="discrepancy-row-title">{d.aeName}</div>
            <div className="discrepancy-row-meta">
              Asserted pod: <strong>{d.assertedPod}</strong> · Observed primary SC:{" "}
              <strong>{d.observedSc}</strong> ({d.observedDealCount} deals)
            </div>
          </div>
          <div className="discrepancy-action muted">
            Either re-assign the AE in the roster, or update the deal coverage.
          </div>
        </div>
      );
  }
}
