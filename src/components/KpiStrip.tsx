import { useMemo } from "react";
import { useStore } from "../store";
import { buildKpis } from "../store/selectors";

export function KpiStrip() {
  const model = useStore((s) => s.model);
  const kpis = useMemo(() => (model ? buildKpis(model) : null), [model]);
  if (!model || !kpis) return null;

  const coverageStatus =
    kpis.coveragePct >= 95 ? "good" : kpis.coveragePct >= 80 ? "warn" : "danger";

  // "Capacity" pill: how many SEs are at-or-near target vs overloaded vs slack.
  // Show overloaded count as the headline number; sub-line gives the mix.
  const capacityTone =
    kpis.overloadedSes === 0
      ? "good"
      : kpis.overloadedSes > 2
        ? "danger"
        : "warn";

  return (
    <div className="kpi-strip" role="region" aria-label="Coverage health">
      <Pill
        tone={coverageStatus}
        label="AEs covered"
        value={`${kpis.coveragePct}%`}
        sub={`${kpis.coveredAes} of ${kpis.totalAes}`}
      />
      <Pill
        tone={kpis.floaters === 0 ? "good" : kpis.floaters > 3 ? "warn" : "neutral"}
        label="Floaters"
        value={String(kpis.floaters)}
        sub={kpis.floaters === 0 ? "all placed" : "no SE assigned"}
      />
      <Pill
        tone={capacityTone}
        label="Overloaded SEs"
        value={String(kpis.overloadedSes)}
        sub={`${kpis.balancedSes} on target · ${kpis.slackSes} slack · median ${kpis.medianLoadPct}%`}
      />
    </div>
  );
}

function Pill({
  tone,
  label,
  value,
  sub,
}: {
  tone: "good" | "warn" | "danger" | "neutral";
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className={`kpi-pill kpi-${tone}`}>
      <div className="kpi-pill-dot" aria-hidden="true" />
      <div className="kpi-pill-body">
        <div className="kpi-pill-value">{value}</div>
        <div className="kpi-pill-label">{label}</div>
        <div className="kpi-pill-sub">{sub}</div>
      </div>
    </div>
  );
}
