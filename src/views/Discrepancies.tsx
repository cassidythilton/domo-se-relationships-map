import { useMemo, useState } from "react";
import { useStore } from "../store";
import {
  detectDiscrepancies,
  discrepancyKindLabel,
  fmtCurrency,
} from "../store/observed";
import type { Discrepancy } from "../store/observed";
import {
  pocCoverageGaps,
  suggestAvpFixes,
  type PocCoverageGaps,
} from "../store/selectors";
import { personTitle, segmentLabel } from "../data/types";
import { useProfilesReady } from "../data/profiles";
import { Avatar } from "../components/Avatar";
import { WindowPicker } from "../components/WindowPicker";

const SEV_LABEL: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const KINDS: Discrepancy["kind"][] = [
  "uncovered_ae",
  "se_in_deals_not_in_roster",
  "ae_in_deals_not_in_roster",
  "ae_no_covering_se",
  "ae_primary_sc_outside_pod",
  "roster_se_no_recent_deals",
  "rvp_unknown_avp",
];

export function Discrepancies() {
  const model = useStore((s) => s.model);
  const deals = useStore((s) => s.deals);
  const dealsLoading = useStore((s) => s.dealsLoading);
  const dealsError = useStore((s) => s.dealsError);
  const select = useStore((s) => s.selectPerson);
  const [filterKind, setFilterKind] = useState<Discrepancy["kind"] | "all">("all");
  const [minSeverity, setMinSeverity] = useState<"high" | "medium" | "low">("low");
  const profiles = useProfilesReady();

  const discrepancies = useMemo(() => {
    if (!model || !deals) return [];
    return detectDiscrepancies(model, deals);
  }, [model, deals]);

  // V4 of Shape A: Solutions Architect coverage gaps. Pure derivation
  // over the existing dealsSnapshot maps — same source of truth as the
  // SA overlay everywhere else.
  const pocGaps = useMemo<PocCoverageGaps | null>(() => {
    if (!model || !deals) return null;
    return pocCoverageGaps(model, deals);
  }, [model, deals]);

  // Live-data fixes — suggest AVPs for RVPs whose avp is null, by looking
  // each RVP up in the user-profile dataset and reading their manager.
  const avpSuggestions = useMemo(() => {
    if (!model || !profiles.ready) return [];
    return suggestAvpFixes(model);
  }, [model, profiles.ready]);

  if (!model) return null;

  // Even if the deals snapshot fails (e.g., the dataset isn't reachable in
  // dev), we can still surface the live-data AVP suggestions because those
  // come from the userProfiles dataset — a separate alias that often
  // works on its own.
  const showSuggestions = avpSuggestions.length > 0;
  if (dealsError) {
    return (
      <div className="discrepancies-wrap">
        {showSuggestions && (
          <SuggestedFixes suggestions={avpSuggestions} onSelect={select} />
        )}
        <div className="state state-error">
          <div>
            <h2>Couldn't load deals data</h2>
            <pre>{dealsError}</pre>
            <p className="muted" style={{ marginTop: 16 }}>
              The Discrepancies lens needs the live deals dataset to compare against
              the asserted roster. Other lenses still work without it.
            </p>
          </div>
        </div>
      </div>
    );
  }
  if (dealsLoading || !deals) {
    return (
      <div className="discrepancies-wrap">
        {showSuggestions && (
          <SuggestedFixes suggestions={avpSuggestions} onSelect={select} />
        )}
        <div className="state state-loading">Loading deal data…</div>
      </div>
    );
  }

  const sevRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const filtered = discrepancies
    .filter((d) => filterKind === "all" || d.kind === filterKind)
    .filter((d) => sevRank[d.severity] <= sevRank[minSeverity]);

  const counts: Record<string, { high: number; medium: number; low: number }> = {};
  for (const d of discrepancies) {
    counts[d.kind] ??= { high: 0, medium: 0, low: 0 };
    counts[d.kind][d.severity as "high" | "medium" | "low"]++;
  }

  return (
    <div className="discrepancies-wrap">
      {avpSuggestions.length > 0 && (
        <SuggestedFixes suggestions={avpSuggestions} onSelect={select} />
      )}

      <div className="discrepancies-intro">
        <div className="discrepancies-intro-text">
          <h2>Where the roster differs from observed activity</h2>
          <p>
            Comparing the asserted SE / AE relationships in your roster against the live{" "}
            <strong>GOLD · RevOps · Salesforce Opportunities Master</strong> deal data,
            scoped to <strong>NAM</strong> and <strong>{deals.range.label}</strong>.
            Use this view to find rows in the source roster CSV that need editing —
            then re-upload and the rest of the app reflects the change.
          </p>
        </div>
        <WindowPicker />
      </div>

      {pocGaps && (
        <PocCoverageSection
          gaps={pocGaps}
          window={deals.range.label}
          onSelect={select}
        />
      )}

      <div className="discrepancies-summary">
        {KINDS.map((k) => {
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
              {s === "low" ? "all" : `≥ ${SEV_LABEL[s]}`}
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
            perfectly, or you've already cleaned up the issues. Lower the severity bar
            to "all" to double-check.
          </div>
        )}
        {filtered.map((d, i) => (
          <DiscrepancyCard
            key={i}
            d={d}
            onPersonClick={(name) => {
              const p = model.people.find((x) => x.name === name);
              if (p) select(p.id);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function SuggestedFixes({
  suggestions,
  onSelect,
}: {
  suggestions: ReturnType<typeof suggestAvpFixes>;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="suggested-fixes">
      <div className="suggested-fixes-head">
        <div>
          <h3 className="suggested-fixes-title">
            Suggested fixes from live data
          </h3>
          <p className="suggested-fixes-sub">
            Inferred from the <strong>userProfiles</strong> dataset by looking up each RVP's
            direct manager. Apply by editing{" "}
            <code>src/config/orgMap.json</code> with the suggested patch — the rest of the
            app refreshes automatically on next load.
          </p>
        </div>
        <span className="suggested-fixes-count">{suggestions.length}</span>
      </div>
      <ul className="suggested-fixes-list">
        {suggestions.map((s) => (
          <li key={s.rvpId} className="suggested-fix">
            <div className="suggested-fix-row">
              <button
                type="button"
                className="suggested-fix-rvp"
                onClick={() => onSelect(s.rvpId)}
              >
                <Avatar name={s.rvpName} size="md" />
                <span>
                  <span className="suggested-fix-name">{s.rvpName}</span>
                  <span className="suggested-fix-sub">RVP · {s.segment}</span>
                </span>
              </button>
              <span className="suggested-fix-arrow" aria-hidden="true">→</span>
              <div className="suggested-fix-avp">
                <Avatar name={s.suggestedAvp} size="md" />
                <span>
                  <span className="suggested-fix-name">{s.suggestedAvp}</span>
                  <span className="suggested-fix-sub">
                    {s.alreadyKnown ? "AVP (already in list)" : "AVP (new)"} · from directory
                  </span>
                </span>
              </div>
            </div>
            <details className="suggested-fix-patch">
              <summary>Show JSON patch</summary>
              <pre>{s.patch}</pre>
            </details>
          </li>
        ))}
      </ul>
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
            Add a row in the SE org or alias an existing roster name in nameMap.json.
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
              {d.tier} {segmentLabel(d.segment)} · 0 NAM deals as Solutions Engineer in window
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
            New AE — add as L4 in the appropriate segment / RVP team.
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
              FM: {d.forecastManager ?? "—"} · <strong>no SE assigned</strong>
            </div>
          </div>
          <div className="discrepancy-action muted">
            Pipeline at risk — assign a Solutions Engineer in Salesforce.
          </div>
        </div>
      );
    case "ae_primary_sc_outside_pod":
      return (
        <div className="discrepancy-row">
          <div className="discrepancy-row-text">
            <div className="discrepancy-row-title">{d.aeName}</div>
            <div className="discrepancy-row-meta">
              Asserted covering SE: <strong>{d.assertedSe}</strong> · Observed primary SE:{" "}
              <strong>{d.observedSc}</strong> ({d.observedDealCount} deals)
            </div>
          </div>
          <div className="discrepancy-action muted">
            Either re-assign the AE in the roster, or update the deal coverage.
          </div>
        </div>
      );
    case "rvp_unknown_avp":
      return (
        <div className="discrepancy-row">
          <div className="discrepancy-row-text">
            <div className="discrepancy-row-title">{d.rvpName}</div>
            <div className="discrepancy-row-meta">
              {d.segment} · no AVP mapped
            </div>
          </div>
          <div className="discrepancy-action muted">
            Edit <code>src/config/orgMap.json</code> — set the <code>avp</code> field for this RVP.
          </div>
        </div>
      );
    case "ae_no_covering_se":
      return (
        <div className="discrepancy-row clickable" onClick={() => onPersonClick(d.aeName)}>
          <Avatar name={d.aeName} size="md" />
          <div className="discrepancy-row-text">
            <div className="discrepancy-row-title">{d.aeName}</div>
            <div className="discrepancy-row-meta">
              {d.segment}{d.rvpId ? ` · RVP: ${d.rvpId}` : ""} · no SE in matrix row
            </div>
          </div>
          <div className="discrepancy-action muted">
            Set <code>ae_row</code> on this CSV row to the covering SE’s short name.
          </div>
        </div>
      );
  }
}

// -----------------------------------------------------------------
// V4 of Shape A — Solutions Architect coverage section.
// Self-contained: own card, four row groups, hides empties.
// -----------------------------------------------------------------

function PocCoverageSection({
  gaps,
  window: windowLabel,
  onSelect,
}: {
  gaps: PocCoverageGaps;
  window: string;
  onSelect: (id: string) => void;
}) {
  const total =
    gaps.uncoveredAesWithPipeline.length +
    gaps.observedNotAsserted.length +
    gaps.unmappedNames.length +
    gaps.idleSas.length;
  if (total === 0) return null;

  return (
    <div className="poc-disc-section">
      <div className="poc-disc-section-head">
        <span className="poc-disc-section-icon" aria-hidden="true" />
        <div className="poc-disc-section-text">
          <h3 className="poc-disc-section-title">Solutions Architect coverage</h3>
          <p className="poc-disc-section-sub">
            Derived from live deals · {windowLabel}
          </p>
        </div>
        <span className="poc-disc-section-count">{total}</span>
      </div>

      {gaps.uncoveredAesWithPipeline.length > 0 && (
        <div className="poc-disc-group">
          <div className="poc-disc-group-title">
            AEs with active pipeline & no SA partner
            <span className="poc-disc-group-count">
              {gaps.uncoveredAesWithPipeline.length}
            </span>
          </div>
          <div className="poc-disc-rows">
            {gaps.uncoveredAesWithPipeline.slice(0, 10).map((row) => (
              <button
                key={row.ae.id}
                type="button"
                className="poc-disc-row"
                onClick={() => onSelect(row.ae.id)}
              >
                <Avatar name={row.ae.displayName} size="sm" />
                <span className="poc-disc-row-text">
                  <span className="poc-disc-row-name">{row.ae.displayName}</span>
                  <span className="poc-disc-row-sub">
                    {personTitle(row.ae)}
                    {row.ae.coveringSeId && ` · covered by ${row.ae.coveringSeId}`}
                  </span>
                </span>
                <span className="poc-disc-row-pill warn">
                  {fmtCurrency(row.pipelineAcv)} pipeline
                </span>
                <span className="poc-disc-row-meta">
                  {row.dealCount} deal{row.dealCount === 1 ? "" : "s"}
                </span>
              </button>
            ))}
            {gaps.uncoveredAesWithPipeline.length > 10 && (
              <div className="poc-disc-rest">
                +{gaps.uncoveredAesWithPipeline.length - 10} more
              </div>
            )}
          </div>
        </div>
      )}

      {gaps.observedNotAsserted.length > 0 && (
        <div className="poc-disc-group">
          <div className="poc-disc-group-title">
            Observed SA pairs missing from asserted coverage
            <span className="poc-disc-group-count">{gaps.observedNotAsserted.length}</span>
          </div>
          <div className="poc-disc-rows">
            {gaps.observedNotAsserted.slice(0, 10).map((row) => {
              const k = `${row.scPerson.id}::${row.aePerson.id}`;
              return (
                <div key={k} className="poc-disc-row poc-disc-row-static">
                  <span className="poc-disc-row-prefix">Pair</span>
                  <button
                    type="button"
                    className="poc-disc-link"
                    onClick={() => onSelect(row.scPerson.id)}
                  >
                    {row.scPerson.displayName}
                  </button>
                  <span aria-hidden="true">→</span>
                  <button
                    type="button"
                    className="poc-disc-link"
                    onClick={() => onSelect(row.aePerson.id)}
                  >
                    {row.aePerson.displayName}
                  </button>
                  <span className="poc-disc-row-sub">
                    + SA{" "}
                    {row.partners
                      .slice(0, 2)
                      .map((p) => `${p.poc} (${p.dealCount})`)
                      .join(", ")}
                    {row.partners.length > 2 && ` +${row.partners.length - 2}`}
                  </span>
                  <span className="poc-disc-row-meta">re-check coverage</span>
                </div>
              );
            })}
            {gaps.observedNotAsserted.length > 10 && (
              <div className="poc-disc-rest">
                +{gaps.observedNotAsserted.length - 10} more
              </div>
            )}
          </div>
        </div>
      )}

      {gaps.unmappedNames.length > 0 && (
        <div className="poc-disc-group">
          <div className="poc-disc-group-title">
            Unmapped Solutions Architect names
            <span className="poc-disc-group-count">{gaps.unmappedNames.length}</span>
            <span className="poc-disc-group-hint">
              (deals data references names not in the roster / nameMap)
            </span>
          </div>
          <div className="poc-disc-rows">
            {gaps.unmappedNames.slice(0, 10).map((row) => (
              <div key={`${row.source}::${row.name}`} className="poc-disc-row poc-disc-row-static">
                <span className="poc-disc-row-prefix">
                  {row.source === "sc"
                    ? "SC name"
                    : row.source === "ae"
                    ? "AE name"
                    : "SA name"}
                </span>
                <span className="poc-disc-row-name">"{row.name}"</span>
                <span className="poc-disc-row-sub">
                  no roster match · add alias in <code>src/config/nameMap.json</code>
                </span>
                <span className="poc-disc-row-meta">
                  {row.dealCount} deal{row.dealCount === 1 ? "" : "s"}
                </span>
              </div>
            ))}
            {gaps.unmappedNames.length > 10 && (
              <div className="poc-disc-rest">
                +{gaps.unmappedNames.length - 10} more
              </div>
            )}
          </div>
        </div>
      )}

      {gaps.idleSas.length > 0 && (
        <div className="poc-disc-group">
          <div className="poc-disc-group-title">
            Idle SAs (no engagements in window)
            <span className="poc-disc-group-count">{gaps.idleSas.length}</span>
          </div>
          <div className="poc-disc-rows">
            {gaps.idleSas.map((row) => (
              <button
                key={row.sa.id}
                type="button"
                className="poc-disc-row"
                onClick={() => onSelect(row.sa.id)}
              >
                <Avatar name={row.sa.displayName} size="sm" />
                <span className="poc-disc-row-text">
                  <span className="poc-disc-row-name">{row.sa.displayName}</span>
                  <span className="poc-disc-row-sub">
                    Solutions Architect
                    {row.sa.manager_name && ` · reports to ${row.sa.manager_name}`}
                  </span>
                </span>
                <span className="poc-disc-row-meta">0 deals in window</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
