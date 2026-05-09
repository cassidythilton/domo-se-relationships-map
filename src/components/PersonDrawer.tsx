import { useStore, usePerson } from "../store";
import { loadBucketOf } from "../store/selectors";
import {
  aesCoveredBy,
  fmtCurrency,
  fmtPercent,
  getSeMetric,
  rosterToDealName,
} from "../store/observed";
import { roleAccent } from "../config";
import { Avatar } from "./Avatar";
import type { Person } from "../data/types";

export function PersonDrawer() {
  const id = useStore((s) => s.selectedPersonId);
  const select = useStore((s) => s.selectPerson);
  const model = useStore((s) => s.model);
  const deals = useStore((s) => s.deals);
  const person = usePerson(id);
  if (!person || !model) return null;

  const dealName = rosterToDealName(person.name);
  const seMetric = deals ? getSeMetric(deals, person) : null;
  const covered = deals ? aesCoveredBy(model, deals, person).slice(0, 8) : [];
  const aeMetric = deals ? deals.byAeName.get(dealName) : null;

  const chain: Person[] = [];
  let cursor = model.byId.get(person.manager_name);
  while (cursor) {
    chain.push(cursor);
    if (cursor.manager_name === cursor.name) break;
    cursor = model.byId.get(cursor.manager_name);
  }

  const directReports = model.people.filter((p) => p.manager_name === person.name);
  const bucket = loadBucketOf(person);
  // Scale: render up to 150% so overload bars stay visible
  const SCALE = 150;
  const widthPct = Math.min((person.loadSum / SCALE) * 100, 100);

  const rampClass = (person.ramp_status || "").toLowerCase();
  const showRampChip = rampClass && rampClass !== "active";

  return (
    <div className="drawer-overlay" onClick={() => select(null)}>
      <aside
        className="drawer"
        role="dialog"
        aria-label={`Details for ${person.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-header">
          <Avatar name={person.name} roleType={person.role_type} size="lg" />
          <div className="drawer-header-text">
            <h3 className="drawer-title">{person.name}</h3>
            <div className="drawer-sub">
              {person.role_type && (
                <span
                  className="chip chip-role"
                  style={{ ["--role-color" as string]: roleAccent(person.role_type) }}
                >
                  {person.role_type}
                </span>
              )}
              <span>{person.tier}</span>
              <span>•</span>
              <span>{person.segment}</span>
              {showRampChip && <span className={`chip chip-status ${rampClass}`}>{person.ramp_status}</span>}
            </div>
            {person.email && (
              <div className="drawer-sub" style={{ marginTop: 4 }}>
                <a href={`mailto:${person.email}`} style={{ color: "var(--accent-text)", textDecoration: "none" }}>
                  {person.email}
                </a>
              </div>
            )}
          </div>
          <button className="drawer-close" onClick={() => select(null)} aria-label="Close">
            ×
          </button>
        </div>

        {person.tier === "L4" && (
          <div className="drawer-section">
            <h4>Coverage</h4>
            <ul className="drawer-list">
              <li className="drawer-row">
                <span className="label">Primary pod</span>
                <span className="value">
                  {person.primaryPod ? (
                    <>
                      <span className="chip chip-primary">{person.primaryPod}</span>
                      <span className="muted tabular">{person.primary_alloc_pct ?? 0}%</span>
                    </>
                  ) : (
                    <span className="muted">none</span>
                  )}
                </span>
              </li>
              <li className="drawer-row">
                <span className="label">Backup pod</span>
                <span className="value">
                  {person.backupPod ? (
                    <>
                      <span className="chip chip-backup">{person.backupPod}</span>
                      <span className="muted tabular">{person.backup_alloc_pct ?? 0}%</span>
                    </>
                  ) : (
                    <span className="muted">none</span>
                  )}
                </span>
              </li>
              <li className="drawer-row">
                <span className="label">Overlay pods</span>
                <span className="value">
                  {person.overlayPods.length > 0 ? (
                    <>
                      <span className="chip-row" style={{ justifyContent: "flex-end" }}>
                        {person.overlayPods.map((p) => (
                          <span key={p} className="chip chip-overlay">{p}</span>
                        ))}
                      </span>
                      <span className="muted tabular">{person.overlay_alloc_pct ?? 0}%</span>
                    </>
                  ) : (
                    <span className="muted">none</span>
                  )}
                </span>
              </li>
            </ul>
            <div className="load-gauge">
              <div className="load-bar">
                <div
                  className={`load-bar-fill load-${bucket}`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <div className="load-meta">
                <span>
                  Total load <strong>{person.loadSum}%</strong>
                </span>
                <span>Target {person.targetLoad}%</span>
              </div>
            </div>
          </div>
        )}

        {person.specializationList.length > 0 && (
          <div className="drawer-section">
            <h4>Specializations</h4>
            <div className="chip-row">
              {person.specializationList.map((s) => (
                <span key={s} className="chip chip-spec">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {chain.length > 0 && (
          <div className="drawer-section">
            <h4>Manager chain</h4>
            <ul className="drawer-list">
              {chain.map((m) => (
                <li
                  key={m.id}
                  className="drawer-row clickable"
                  onClick={() => select(m.id)}
                >
                  <span className="label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Avatar name={m.name} size="sm" />
                    {m.name}
                  </span>
                  <span className="value">
                    <span className="chip">{m.tier}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {directReports.length > 0 && (
          <div className="drawer-section">
            <h4>Direct reports ({directReports.length})</h4>
            <div className="chip-row">
              {directReports.map((r) => (
                <span
                  key={r.id}
                  className="chip"
                  style={{ cursor: "pointer" }}
                  onClick={() => select(r.id)}
                >
                  {r.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {(person.hire_date || person.tenure_months !== undefined) && (
          <div className="drawer-section">
            <h4>People detail</h4>
            <ul className="drawer-list">
              {person.hire_date && (
                <li className="drawer-row">
                  <span className="label">Hire date</span>
                  <span className="value tabular">{person.hire_date}</span>
                </li>
              )}
              {person.tenure_months !== undefined && (
                <li className="drawer-row">
                  <span className="label">Tenure</span>
                  <span className="value tabular">{person.tenure_months} months</span>
                </li>
              )}
            </ul>
          </div>
        )}

        {person.notes && (
          <div className="drawer-section">
            <h4>Notes</h4>
            <p style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 13, color: "var(--text-primary)" }}>
              {person.notes}
            </p>
          </div>
        )}

        {seMetric && (
          <div className="drawer-section">
            <h4>Observed pipeline ({deals!.range.label} · NAM)</h4>
            <ul className="drawer-list">
              <li className="drawer-row">
                <span className="label">Open pipeline ACV</span>
                <span className="value tabular">{fmtCurrency(seMetric.pipelineAcv)}</span>
              </li>
              <li className="drawer-row">
                <span className="label">Open deals</span>
                <span className="value tabular">{seMetric.openCount}</span>
              </li>
              <li className="drawer-row">
                <span className="label">Closed won ACV</span>
                <span className="value tabular">{fmtCurrency(seMetric.closedWonAcv)}</span>
              </li>
              <li className="drawer-row">
                <span className="label">Win rate</span>
                <span className="value tabular">{fmtPercent(seMetric.winRate)}</span>
              </li>
            </ul>
          </div>
        )}

        {covered.length > 0 && (
          <div className="drawer-section">
            <h4>AEs covered ({covered.length})</h4>
            <ul className="drawer-list">
              {covered.map((c) => {
                const target = c.rosterName
                  ? () => {
                      const p = model.people.find((x) => x.name === c.rosterName);
                      if (p) select(p.id);
                    }
                  : undefined;
                return (
                  <li
                    key={c.aeName}
                    className={"drawer-row" + (target ? " clickable" : "")}
                    onClick={target}
                  >
                    <span className="label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar name={c.aeName} size="sm" />
                      <span>
                        {c.aeName}
                        {c.forecastManager && (
                          <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>
                            · {c.forecastManager}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="value tabular muted">
                      {c.dealCount} · {fmtCurrency(c.pipelineAcv)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {aeMetric && person.tier === "L4" && person.role_type && (
          <div className="drawer-section">
            <h4>Observed deal activity ({deals!.range.label})</h4>
            <ul className="drawer-list">
              <li className="drawer-row">
                <span className="label">Total deals</span>
                <span className="value tabular">{aeMetric.totalDealCount}</span>
              </li>
              <li className="drawer-row">
                <span className="label">Open pipeline</span>
                <span className="value tabular">{fmtCurrency(aeMetric.pipelineAcv)}</span>
              </li>
              {aeMetric.primarySc && (
                <li className="drawer-row">
                  <span className="label">Observed primary SC</span>
                  <span className="value">
                    {aeMetric.primarySc}{" "}
                    <span className="muted tabular">({aeMetric.primaryScDealCount} deals)</span>
                  </span>
                </li>
              )}
              {aeMetric.manager && (
                <li className="drawer-row">
                  <span className="label">Forecast Manager</span>
                  <span className="value">{aeMetric.manager}</span>
                </li>
              )}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}
