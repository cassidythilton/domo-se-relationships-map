import { useMemo } from "react";
import { useStore } from "../store";
import { applyFilters, buildLoad } from "../store/selectors";
import { Avatar } from "../components/Avatar";

export function CapacityLoad() {
  const model = useStore((s) => s.model);
  const filters = useStore((s) => s.filters);
  const select = useStore((s) => s.selectPerson);

  const rows = useMemo(() => {
    if (!model) return [];
    return buildLoad(applyFilters(model, filters));
  }, [model, filters]);

  if (!model) return null;

  if (!model.hasCoverageData) {
    return (
      <div className="state state-empty">
        No coverage data yet. Add <code>primary_alloc_pct</code>, <code>backup_alloc_pct</code>,{" "}
        <code>overlay_alloc_pct</code> values to enable the Capacity / Load view.
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="state state-empty">
        No SCs match the current filters.
      </div>
    );
  }

  // Visualize up to 150% so overload remains visible.
  const SCALE = 150;

  return (
    <div>
      <p className="cap-intro">
        Each bar = sum of allocation % across Primary, Backup, and Overlay assignments.
        <strong style={{ color: "var(--alert-text)" }}> Red &gt; 100%</strong> is overloaded;{" "}
        <strong style={{ color: "var(--text-muted)" }}>grey &lt; 60%</strong> is slack. The vertical
        marker shows each SC's target.
      </p>
      <div className="cap-list">
        {rows.map((r) => {
          const widthPct = Math.min((r.load / SCALE) * 100, 100);
          const targetLeft = Math.min((r.target / SCALE) * 100, 100);
          return (
            <div
              key={r.person.id}
              className="cap-row"
              onClick={() => select(r.person.id)}
            >
              <div className="cap-person">
                <Avatar name={r.person.name} roleType={r.person.role_type} />
                <div className="cap-person-text">
                  <div className="cap-name">{r.person.name}</div>
                  <div className="cap-meta">
                    {r.person.role_type || r.person.tier} · {r.person.segment}
                    {r.primary.pod && ` · P ${r.primary.pod} ${r.primary.pct}%`}
                    {r.backup.pod && ` · B ${r.backup.pod} ${r.backup.pct}%`}
                    {r.overlay.pods.length > 0 &&
                      ` · O ${r.overlay.pods.join(", ")} ${r.overlay.pct}%`}
                  </div>
                </div>
              </div>
              <div className="cap-bar-track">
                <div
                  className={`cap-bar-fill load-${r.bucket}`}
                  style={{ width: `${widthPct}%` }}
                />
                <div className="cap-target-line" style={{ left: `${targetLeft}%` }} />
              </div>
              <div className={`cap-load-num ${r.bucket}`}>{r.load}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
