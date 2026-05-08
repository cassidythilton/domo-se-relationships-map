import { useStore, usePerson } from "../store";
import { loadBucketOf } from "../store/selectors";
import { roleColor } from "../config";
import type { Person } from "../data/types";

export function PersonDrawer() {
  const id = useStore((s) => s.selectedPersonId);
  const select = useStore((s) => s.selectPerson);
  const model = useStore((s) => s.model);
  const person = usePerson(id);
  if (!person || !model) return null;

  // Walk manager chain
  const chain: Person[] = [];
  let cursor = model.byId.get(person.manager_name);
  while (cursor) {
    chain.push(cursor);
    if (cursor.manager_name === cursor.name) break;
    cursor = model.byId.get(cursor.manager_name);
  }

  const directReports = model.people.filter((p) => p.manager_name === person.name);

  const bucket = loadBucketOf(person);
  const loadPct = Math.min(person.loadSum, 150);

  return (
    <div className="drawer-overlay" onClick={() => select(null)}>
      <aside
        className="drawer"
        role="dialog"
        aria-label={`Details for ${person.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <h3 className="drawer-title">{person.name}</h3>
            <div className="drawer-sub">
              {person.role_type ? (
                <>
                  <span
                    className="chip"
                    style={{ background: roleColor(person.role_type) }}
                  >
                    {person.role_type}
                  </span>{" "}
                </>
              ) : null}
              {person.tier} • {person.segment}
              {person.email ? ` • ${person.email}` : ""}
            </div>
          </div>
          <button className="drawer-close" onClick={() => select(null)} aria-label="Close">
            ×
          </button>
        </div>

        {/* Coverage section */}
        {person.tier === "L4" && (
          <div className="drawer-section">
            <h4>Coverage</h4>
            <ul className="drawer-list">
              <li className="drawer-row">
                <span className="label">Primary pod</span>
                <span className="value">
                  {person.primaryPod ? (
                    <>
                      <span className="chip chip-primary">{person.primaryPod}</span>{" "}
                      <span className="muted">{person.primary_alloc_pct ?? 0}%</span>
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
                      <span className="chip chip-backup">{person.backupPod}</span>{" "}
                      <span className="muted">{person.backup_alloc_pct ?? 0}%</span>
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
                      <span className="chip-row">
                        {person.overlayPods.map((p) => (
                          <span key={p} className="chip chip-overlay">
                            {p}
                          </span>
                        ))}
                      </span>
                      <span className="muted"> {person.overlay_alloc_pct ?? 0}% total</span>
                    </>
                  ) : (
                    <span className="muted">none</span>
                  )}
                </span>
              </li>
            </ul>
            <div style={{ marginTop: 12 }}>
              <div className="load-bar">
                <div
                  className={`load-bar-fill load-${bucket}`}
                  style={{ width: `${(loadPct / 150) * 100}%` }}
                />
              </div>
              <div className="load-meta">
                <span>
                  Load: <strong>{person.loadSum}%</strong>
                </span>
                <span>Target: {person.targetLoad}%</span>
              </div>
            </div>
          </div>
        )}

        {/* Specializations */}
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

        {/* Manager chain */}
        {chain.length > 0 && (
          <div className="drawer-section">
            <h4>Manager chain</h4>
            <ul className="drawer-list">
              {chain.map((m) => (
                <li
                  key={m.id}
                  className="drawer-row"
                  style={{ cursor: "pointer" }}
                  onClick={() => select(m.id)}
                >
                  <span className="label">{m.tier}</span>
                  <span className="value">{m.name}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Direct reports */}
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

        {/* People detail */}
        {(person.hire_date || person.tenure_months || person.ramp_status) && (
          <div className="drawer-section">
            <h4>People detail</h4>
            <ul className="drawer-list">
              {person.ramp_status && (
                <li className="drawer-row">
                  <span className="label">Status</span>
                  <span className="value">{person.ramp_status}</span>
                </li>
              )}
              {person.hire_date && (
                <li className="drawer-row">
                  <span className="label">Hire date</span>
                  <span className="value">{person.hire_date}</span>
                </li>
              )}
              {person.tenure_months !== undefined && (
                <li className="drawer-row">
                  <span className="label">Tenure</span>
                  <span className="value">{person.tenure_months} months</span>
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Notes — surfaced for the first time in v2 */}
        {person.notes && (
          <div className="drawer-section">
            <h4>Notes</h4>
            <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{person.notes}</p>
          </div>
        )}
      </aside>
    </div>
  );
}
