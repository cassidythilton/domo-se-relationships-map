import { useStore } from "../store";
import { managerChain } from "../data/normalize";
import {
  aesCoveredBy,
  fmtCurrency,
  fmtPercent,
  getSeMetric,
  rosterToDealName,
} from "../store/observed";
import { roleStyle } from "../config";
import { Avatar } from "./Avatar";
import type { Person } from "../data/types";
import { personTitle, segmentLabel } from "../data/types";

export function PersonDrawer() {
  const sel = useStore((s) => s.selection);
  const setOpen = useStore((s) => s.setDrawerOpen);
  const focusOn = useStore((s) => s.focusOnPerson);
  const model = useStore((s) => s.model);
  const deals = useStore((s) => s.deals);
  const open = useStore((s) => s.drawerOpen);
  const person =
    sel?.kind === "person" && model ? model.byId.get(sel.id) ?? null : null;
  if (!person || !model || !open) return null;
  const close = () => setOpen(false);
  // Clicking any related person in the drawer jumps to the Focus lens.
  const select = (id: string | null) => {
    if (id) focusOn(id);
    else close();
  };

  const dealName = rosterToDealName(person.name);
  const seMetric = deals ? getSeMetric(deals, person) : null;
  const covered = deals ? aesCoveredBy(model, deals, person).slice(0, 8) : [];
  const aeMetric = deals ? deals.byAeName.get(dealName) : null;

  const chain = managerChain(model, person.id);
  const directReports = (model.reportsByManager.get(person.id) ?? [])
    .map((id) => model.byId.get(id))
    .filter((p): p is Person => !!p);

  // For SEs we show their covered AEs from the asserted roster.
  const assertedCovers =
    person.roleKind === "se" || person.roleKind === "sa"
      ? (model.coveredAesBySe.get(person.id) ?? [])
          .map((id) => model.byId.get(id))
          .filter((p): p is Person => !!p)
      : [];

  // For AEs we show their covering SE.
  const coveringSe =
    person.roleKind === "ae" && person.coveringSeId
      ? model.byId.get(person.coveringSeId) ?? null
      : null;

  const rstyle = roleStyle(person.roleType || "");

  // For AE selections, render the dual chain (SE + Sales) before everything else.
  const isAe = person.roleKind === "ae";
  const rvp = person.rvpId ? model.byId.get(person.rvpId) : null;

  return (
    <div className="drawer-overlay" onClick={close}>
      <aside
        className="drawer"
        role="dialog"
        aria-label={`Details for ${person.displayName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-header">
          <Avatar name={person.displayName} roleType={person.roleType} size="lg" />
          <div className="drawer-header-text">
            <h3 className="drawer-title">{person.displayName}</h3>
            <div className="drawer-sub">
              <span className="chip chip-tier">{roleLabel(person.roleKind)}</span>
              {person.roleType && (
                <span
                  className="chip chip-role"
                  style={{
                    background: rstyle.fill,
                    borderColor: rstyle.border,
                    color: rstyle.text,
                    ["--role-color" as string]: rstyle.dot,
                  }}
                >
                  {person.roleType}
                </span>
              )}
              <span className="muted">{segmentLabel(person.segment)}</span>
            </div>
            {person.email && (
              <div className="drawer-sub" style={{ marginTop: 4 }}>
                <a href={`mailto:${person.email}`} className="drawer-mail">
                  {person.email}
                </a>
              </div>
            )}
            <div className="drawer-actions">
              <button
                type="button"
                className="btn btn-active"
                onClick={() => focusOn(person.id)}
              >
                Open in Focus
              </button>
            </div>
          </div>
          <button className="drawer-close" onClick={close} aria-label="Close">
            ×
          </button>
        </div>

        {isAe && (coveringSe || rvp) && (
          <div className="drawer-section">
            <h4>Coverage chain</h4>
            <div className="drawer-dual">
              <div className="drawer-dual-side">
                <span className="drawer-dual-label">SE side</span>
                {coveringSe ? (
                  <button
                    type="button"
                    className="drawer-dual-pill"
                    onClick={() => select(coveringSe.id)}
                  >
                    <Avatar name={coveringSe.displayName} size="sm" />
                    <span>
                      <span className="drawer-dual-name">{coveringSe.displayName}</span>
                      <span className="drawer-dual-sub">SE</span>
                    </span>
                  </button>
                ) : (
                  <span className="drawer-dual-empty">no SE assigned</span>
                )}
                {chain.length > 0 && (
                  <span className="drawer-dual-chain">
                    {chain
                      .map((c) => c.name)
                      .reverse()
                      .slice(1)
                      .join(" → ")}
                  </span>
                )}
              </div>
              <div className="drawer-dual-side">
                <span className="drawer-dual-label">Sales side</span>
                {rvp ? (
                  <button
                    type="button"
                    className="drawer-dual-pill"
                    onClick={() => select(rvp.id)}
                  >
                    <Avatar name={rvp.displayName} size="sm" />
                    <span>
                      <span className="drawer-dual-name">{rvp.displayName}</span>
                      <span className="drawer-dual-sub">RVP</span>
                    </span>
                  </button>
                ) : (
                  <span className="drawer-dual-empty">no RVP</span>
                )}
                {rvp?.avpName && (
                  <span className="drawer-dual-chain">{rvp.avpName} (AVP)</span>
                )}
              </div>
            </div>
          </div>
        )}

        {assertedCovers.length > 0 && (
          <div className="drawer-section">
            <h4>AEs covered (asserted) — {assertedCovers.length}</h4>
            <ul className="drawer-list">
              {assertedCovers.map((a) => (
                <li
                  key={a.id}
                  className="drawer-row clickable"
                  onClick={() => select(a.id)}
                >
                  <span className="label drawer-row-name">
                    <Avatar name={a.displayName} size="sm" />
                    <span>
                      {a.displayName}
                      {a.roleType && (
                        <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>
                          · {a.roleType}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="value muted">
                    {a.rvpId ? a.rvpId : "no RVP"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {coveringSe && (
          <div className="drawer-section">
            <h4>Covered by</h4>
            <div
              className="drawer-row clickable"
              onClick={() => select(coveringSe.id)}
            >
              <span className="label drawer-row-name">
                <Avatar name={coveringSe.displayName} size="sm" />
                {coveringSe.displayName}
              </span>
              <span className="value muted">{coveringSe.manager_name}</span>
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
                  <span className="label drawer-row-name">
                    <Avatar name={m.displayName} size="sm" />
                    {m.displayName}
                  </span>
                  <span className="value muted">{m.tier}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {directReports.length > 0 && person.roleKind !== "ae" && (
          <div className="drawer-section">
            <h4>Direct reports ({directReports.length})</h4>
            <div className="chip-row">
              {directReports.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="chip chip-clickable"
                  onClick={() => select(r.id)}
                >
                  {r.displayName}
                </button>
              ))}
            </div>
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
            <h4>AEs in deals ({covered.length})</h4>
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
                    <span className="label drawer-row-name">
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

        {aeMetric && person.roleKind === "ae" && (
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
                  <span className="label">Observed primary SE</span>
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

        {person.notes && (
          <div className="drawer-section">
            <h4>Notes</h4>
            <p className="drawer-notes">{person.notes}</p>
          </div>
        )}
      </aside>
    </div>
  );
}

function roleLabel(kind: Person["roleKind"]): string {
  // Floater AEs are still "Account Executive" by title \u2014 they're just
  // unplaced in the matrix. The Discrepancies lens flags that.
  return personTitle({ roleKind: kind });
}
