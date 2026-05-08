import { useMemo } from "react";
import { useStore } from "../store";
import { applyFilters, buildKpis } from "../store/selectors";
import type { LoadBucket } from "../data/types";

export function KpiStrip() {
  const model = useStore((s) => s.model);
  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const setView = useStore((s) => s.setView);
  const selectPod = useStore((s) => s.selectPod);

  const filtered = useMemo(
    () => (model ? applyFilters(model, filters) : []),
    [model, filters],
  );
  const kpis = useMemo(() => (model ? buildKpis(model, filtered) : null), [model, filtered]);
  if (!model || !kpis) return null;

  const setLoad = (bucket: LoadBucket | null) => setFilters({ loadBucket: bucket });
  const jumpToFirstUncovered = () => {
    const target = kpis.podsNoPrimary[0] ?? kpis.podsNoBackup[0] ?? model.pods[0];
    if (target) selectPod(target.name);
    setView("reverse");
  };
  const jumpToSpecialist = () => setView("specialist");

  return (
    <div className="kpi-strip" role="group" aria-label="Coverage KPIs">
      <Kpi
        label="Coverage"
        value={kpis.coveragePct === null ? "n/a" : `${kpis.coveragePct}%`}
        sub={`${model.pods.length - kpis.podsNoPrimary.length}/${model.pods.length} pods have a Primary`}
        warn={kpis.coveragePct !== null && kpis.coveragePct < 100}
        good={kpis.coveragePct === 100}
        onClick={jumpToFirstUncovered}
      />
      <Kpi
        label="Backup coverage"
        value={kpis.backupCoveragePct === null ? "n/a" : `${kpis.backupCoveragePct}%`}
        sub={`${kpis.podsNoBackup.length} pods missing a Backup`}
        warn={kpis.backupCoveragePct !== null && kpis.backupCoveragePct < 80}
        onClick={jumpToFirstUncovered}
      />
      <Kpi
        label="SC : pod (Primary)"
        value={kpis.ratioPrimary === null ? "n/a" : kpis.ratioPrimary.toFixed(2)}
        sub={kpis.ratioAll === null ? "" : `All roles ratio: ${kpis.ratioAll.toFixed(2)}`}
      />
      <Kpi
        label="Overloaded SCs"
        value={String(kpis.overloaded)}
        sub="Load > 100%"
        danger={kpis.overloaded > 0}
        active={filters.loadBucket === "overloaded"}
        onClick={() => setLoad(filters.loadBucket === "overloaded" ? null : "overloaded")}
      />
      <Kpi
        label="Slack SCs"
        value={String(kpis.slack)}
        sub="Load < 60%"
        warn={kpis.slack > 0}
        active={filters.loadBucket === "slack"}
        onClick={() => setLoad(filters.loadBucket === "slack" ? null : "slack")}
      />
      {model.hasSpecializationData && (
        <Kpi
          label="Specialist gaps"
          value={kpis.specialistGaps === null ? "n/a" : String(kpis.specialistGaps)}
          sub="Pod × specialization not covered"
          warn={(kpis.specialistGaps ?? 0) > 0}
          onClick={jumpToSpecialist}
        />
      )}
    </div>
  );
}

type KpiProps = {
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
  danger?: boolean;
  good?: boolean;
  active?: boolean;
  onClick?: () => void;
};

function Kpi({ label, value, sub, warn, danger, good, active, onClick }: KpiProps) {
  const className =
    "kpi" +
    (warn ? " kpi-warn" : "") +
    (danger ? " kpi-danger" : "") +
    (good ? " kpi-good" : "") +
    (active ? " kpi-active" : "");
  return (
    <button
      className={className}
      onClick={onClick}
      type="button"
      aria-pressed={active ?? false}
      disabled={!onClick}
      style={onClick ? undefined : { cursor: "default" }}
    >
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </button>
  );
}
