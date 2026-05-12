// Adaptive three-panel Overview — the default landing experience.
//
// All three panels run off ONE selection model. Click anything in any
// panel and the rest reframe to stay consistent:
//
//   Panel 1 — Full-org bipartite ribbon. Always shows the whole org;
//             highlights the path through the current selection.
//   Panel 2 — SE-centric. Manager chain at top, AEs grouped by RVP,
//             load gauge below.
//   Panel 3 — AE-centric. Dual chain (technical + commercial) stacked
//             vertically.
//
// Selection rules:
//   click SE/SA → Panel 2 = that SE; Panel 3 = first AE they cover
//   click AE    → Panel 3 = that AE; Panel 2 = their covering SE
//   click RVP   → Panel 2 = first SE covering this RVP’s AEs
//                  Panel 3 = first AE on this RVP’s team
//   click AVP   → same as RVP, but scoped to the AVP’s book
//   click Mgr   → Panel 2 = first direct report; Panel 3 = first AE
//                  that report covers
//
// Defaults (no selection): pick the highest-loaded SE in SC Org and
// their first AE so the panels are always populated.

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { managerChain } from "../data/normalize";
import { buildRibbon, buildSeLoads } from "../store/selectors";
import type { Ribbon, RibbonNode } from "../store/selectors";
import type { Person, SeLoad } from "../data/types";
import { personTitle, segmentLabel } from "../data/types";
import { managerAccent, roleStyle, segmentStyle } from "../config";
import { Avatar } from "../components/Avatar";
import { PocPartnersStrip } from "../components/PocPartnersStrip";
import { PocMark } from "../components/PocMark";
import {
  saEngagements,
  selectionFanout,
  type FanoutGroup,
  type SaEngagements,
} from "../store/selectors";

export function Overview() {
  const model = useStore((s) => s.model);
  const sel = useStore((s) => s.selection);
  const filters = useStore((s) => s.filters);
  const select = useStore((s) => s.selectPerson);
  const openDrawer = useStore((s) => s.openPersonDrawer);

  const loads = useMemo(() => (model ? buildSeLoads(model) : new Map<string, SeLoad>()), [model]);

  // Resolve the subject for Panel 2 and Panel 3 from the current
  // selection, narrowed by whatever filters are active so the panels match
  // the rail. The "subject" can be any kind of node (SE, manager, RVP, AVP)
  // — Panel 2 renders an appropriate view per node-kind, and Panel 3 (the
  // relationships fan-out) receives `relSubject` which is the actual
  // selection (or covering SE for AE-clicks, see derivePanels).
  const { panelSubject, relSubject } = useMemo(() => {
    if (!model) return { panelSubject: null as Person | null, relSubject: null as Person | null };
    const selPerson =
      sel?.kind === "person" ? model.byId.get(sel.id) ?? null : null;
    return derivePanels(model, selPerson, loads, filters);
  }, [model, sel, loads, filters]);

  if (!model) return <div className="state state-empty">Loading…</div>;

  // Ribbon respects the filter rail — lets the user narrow what shows
  // across all three panels in one place. Selection auto-focuses the
  // ribbon to that subtree so unrelated teams stop persisting in the
  // view: pick an SE → only that SE + the RVPs they cover; pick an AE →
  // only that AE + their covering SE; pick a manager → that manager's
  // team and the RVPs they touch; etc.
  const selectedId = sel?.kind === "person" ? sel.id : null;
  const ribbonScope = useMemo(() => {
    if (!selectedId) return {};
    const p = model.byId.get(selectedId);
    if (!p) return {};
    switch (p.roleKind) {
      case "se":
      case "sa":
        return { seId: p.id };
      case "ae":
        return { aeId: p.id };
      case "rvp":
        return { rvpId: p.id };
      case "avp":
        return { avpName: p.name };
      case "se_lead":
      case "sa_lead":
      case "root":
        return { managerId: p.id };
      default:
        return {};
    }
  }, [selectedId, model]);
  const ribbon = buildRibbon(model, filters, ribbonScope);

  return (
    <div className="overview-wrap">
      <div className="overview-panels">
        <PanelRibbon
          ribbon={ribbon}
          selectedId={selectedId}
          panelSeId={panelSubject?.id ?? null}
          panelAeId={relSubject?.roleKind === "ae" ? relSubject.id : null}
          onSelect={select}
        />
        <PanelSubject
          subject={panelSubject}
          model={model}
          loads={loads}
          onSelect={select}
          autoPicked={!selectedId}
        />
        <PanelRelationships
          subject={relSubject}
          model={model}
          onSelect={select}
          openDrawer={openDrawer}
          autoPicked={!selectedId}
        />
      </div>
    </div>
  );
}

// -----------------------------------------------------------------
// Panel selection derivation
// -----------------------------------------------------------------

function derivePanels(
  model: NonNullable<ReturnType<typeof useStore.getState>["model"]>,
  selPerson: Person | null,
  loads: Map<string, SeLoad>,
  filters: import("../data/types").Filters,
): { panelSubject: Person | null; relSubject: Person | null } {
  // Helper: does an AE match the active filters?
  const aeMatchesFilters = (a: Person): boolean => {
    if (filters.segment && a.segmentKey !== filters.segment) return false;
    if (filters.roleType && a.roleType !== filters.roleType) return false;
    if (filters.rvpId && a.rvpId !== filters.rvpId) return false;
    if (filters.avp && a.rvpId) {
      const rvp = model.byId.get(a.rvpId);
      if (rvp?.avpName !== filters.avp) return false;
    }
    if (filters.search) {
      const blob = `${a.displayName} ${a.role_type}`.toLowerCase();
      if (!blob.includes(filters.search.toLowerCase())) return false;
    }
    return true;
  };
  // Helper: does this SE cover any AE that survives the filters?
  const seHasMatchingAe = (seId: string): boolean => {
    const ids = model.coveredAesBySe.get(seId) ?? [];
    for (const id of ids) {
      const a = model.byId.get(id);
      if (a && aeMatchesFilters(a)) return true;
    }
    return false;
  };

  // Default fallback — prefer an overloaded / balanced SE in SC Org that
  // covers at least one AE matching the active filters.
  function defaultSe(): Person | null {
    const candidates = model.byRole.se.filter((p) => p.segment === "SC Org");
    const ranked = candidates
      .map((p) => ({ p, ld: loads.get(p.id) }))
      .sort((a, b) => (b.ld?.loadPct ?? 0) - (a.ld?.loadPct ?? 0));
    for (const r of ranked) {
      if (seHasMatchingAe(r.p.id)) return r.p;
    }
    return ranked[0]?.p ?? candidates[0] ?? null;
  }

  if (!selPerson) {
    if (filters.seId) {
      const fromFilter = model.byId.get(filters.seId);
      if (fromFilter) {
        return { panelSubject: fromFilter, relSubject: fromFilter };
      }
    }
    const se = defaultSe();
    return { panelSubject: se, relSubject: se };
  }

  // V2 of Shape A: Panel 3's "relSubject" is just the selection itself —
  // the relationships fan-out scales 1..N AEs honestly so we no longer
  // pick an arbitrary "first AE". The one structural exception is AE
  // selection: Panel 2 reframes to the AE's covering SE (panelSubject),
  // while Panel 3 stays anchored on the AE (relSubject) so the panel
  // reads "this AE's relationships" with N=1.
  switch (selPerson.roleKind) {
    case "se":
    case "sa":
      return { panelSubject: selPerson, relSubject: selPerson };
    case "ae": {
      const se = selPerson.coveringSeId
        ? model.byId.get(selPerson.coveringSeId) ?? null
        : null;
      return { panelSubject: se, relSubject: selPerson };
    }
    case "rvp":
    case "avp":
    case "se_lead":
    case "sa_lead":
    case "root":
      return { panelSubject: selPerson, relSubject: selPerson };
    case "floater":
      return { panelSubject: defaultSe(), relSubject: selPerson };
  }
}

// -----------------------------------------------------------------
// Panel 1 — compact bipartite ribbon
// -----------------------------------------------------------------

type EdgePath = { d: string; seId: string; aeId: string; roleType: string };

function pathD(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const cx1 = x1 + dx * 0.5;
  const cx2 = x2 - dx * 0.5;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${cx1.toFixed(1)} ${y1.toFixed(1)} ${cx2.toFixed(1)} ${y2.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && (CSS as any).escape) return (CSS as any).escape(s);
  return s.replace(/["\\]/g, "\\$&");
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function PanelRibbon({
  ribbon,
  selectedId,
  panelSeId,
  panelAeId,
  onSelect,
}: {
  ribbon: Ribbon;
  selectedId: string | null;
  panelSeId: string | null;
  panelAeId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<EdgePath[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // V2 of Shape A: AE nodes get a small mint diamond glyph when they
  // have any deal-evidenced Solutions Architect partnership. The deal-
  // system AE name matches the node's displayName via the existing
  // nameMap resolution (same path PocPartnersStrip uses, so coverage
  // is consistent).
  const pocPartnersByAe = useStore((s) => s.deals?.pocPartnersByAe);

  const seGroups = ribbon.groups.filter((g) => g.side === "se");
  const salesGroups = ribbon.groups.filter((g) => g.side === "sales");

  useLayoutEffect(() => {
    if (!wrapRef.current) return;
    const wrap = wrapRef.current;
    let frame = 0;
    const compute = () => {
      const wrapRect = wrap.getBoundingClientRect();
      const newEdges: EdgePath[] = [];
      for (const e of ribbon.edges) {
        const seEl = wrap.querySelector<HTMLElement>(`[data-rb="${cssEscape(e.seId)}"]`);
        const aeEl = wrap.querySelector<HTMLElement>(`[data-rb="${cssEscape(e.aeId)}"]`);
        if (!seEl || !aeEl) continue;
        const sR = seEl.getBoundingClientRect();
        const aR = aeEl.getBoundingClientRect();
        newEdges.push({
          d: pathD(
            sR.right - wrapRect.left,
            sR.top + sR.height / 2 - wrapRect.top,
            aR.left - wrapRect.left,
            aR.top + aR.height / 2 - wrapRect.top,
          ),
          seId: e.seId,
          aeId: e.aeId,
          roleType: e.roleType,
        });
      }
      setEdges(newEdges);
      setSize({ w: wrapRect.width, h: wrapRect.height });
    };
    compute();
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(compute);
    });
    ro.observe(wrap);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [ribbon]);

  const focusedId = selectedId ?? null;
  const isHighlighted = (id: string) =>
    !focusedId
      ? id === panelSeId || id === panelAeId
      : id === focusedId ||
        ribbon.edges.some(
          (e) =>
            (e.seId === focusedId && e.aeId === id) ||
            (e.aeId === focusedId && e.seId === id),
        );

  const isEdgeRelated = (e: EdgePath) =>
    !focusedId ? false : e.seId === focusedId || e.aeId === focusedId;

  // Click an SE/AE node → just SELECT (keeps user in Overview, reframes
  // panels 2 & 3). Group-head / "+more" use onFocus to deep-dive.
  function onActivate(node: RibbonNode) {
    onSelect(node.id);
  }

  return (
    <section className="overview-panel overview-panel-ribbon" ref={wrapRef}>
      <header className="overview-panel-head">
        <span className="overview-panel-num">1</span>
        <div>
          <h3 className="overview-panel-title">Full org</h3>
          <p className="overview-panel-sub">SE → AE coverage at a glance.</p>
        </div>
      </header>

      <div
        className={"ovr-ribbon" + (focusedId ? " has-selection" : "")}
        onClick={(e) => {
          if (e.target === e.currentTarget) onSelect(null);
        }}
      >
        <svg
          className="ovr-ribbon-svg"
          width={size.w || "100%"}
          height={size.h || "100%"}
          viewBox={size.w ? `0 0 ${size.w} ${size.h}` : undefined}
          aria-hidden="true"
        >
          {edges.map((e) => {
            const r = roleStyle(e.roleType || "");
            const related = !focusedId || isEdgeRelated(e);
            return (
              <path
                key={`${e.seId}::${e.aeId}`}
                className={"ovr-ribbon-edge" + (related ? "" : " ovr-ribbon-edge-dim")}
                d={e.d}
                stroke={r.dot}
                fill="none"
              />
            );
          })}
        </svg>

        <div className="ovr-ribbon-col ovr-ribbon-col-se">
          <div className="ovr-ribbon-col-title">SE org (by manager)</div>
          {seGroups.map((g) => {
            const accent = managerAccent(g.label);
            const directs = g.nodeIds
              .map((id) => ribbon.nodes.get(id))
              .filter((n): n is RibbonNode => !!n);
            const visible = directs.slice(0, 3);
            const overflow = directs.length - visible.length;
            return (
              <div
                key={g.key}
                className={
                  "ovr-mgr-card" +
                  (selectedId === g.key ? " ovr-mgr-card-active" : "")
                }
                style={{ borderLeftColor: accent }}
              >
                <button
                  type="button"
                  className="ovr-mgr-head"
                  onClick={() => onSelect(g.key)}
                  title={`Reframe panels around ${g.label}`}
                >
                  <Avatar name={g.label} size="md" />
                  <span className="ovr-mgr-body">
                    <span className="ovr-mgr-name">{g.label}</span>
                    <span className="ovr-mgr-count">
                      {directs.length} {g.subLabel?.includes("Architect") ? "SAs" : "SEs"}
                    </span>
                  </span>
                </button>
                <div className="ovr-mgr-chips">
                  {visible.map((n) => (
                    <button
                      key={n.id}
                      type="button"
                      data-rb={n.id}
                      className={
                        "ovr-init-chip" +
                        (selectedId === n.id || panelSeId === n.id ? " ovr-init-chip-active" : "") +
                        (focusedId && !isHighlighted(n.id) ? " ovr-init-chip-dim" : "")
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        onActivate(n);
                      }}
                      title={`${n.label} — ${personTitle(n.person)}`}
                    >
                      {initials(n.label)}
                    </button>
                  ))}
                  {overflow > 0 && (
                    <button
                      type="button"
                      className="ovr-init-more"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(g.key);
                      }}
                    >
                      +{overflow} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="ovr-ribbon-col ovr-ribbon-col-sales">
          <div className="ovr-ribbon-col-title">Sales (by AVP / RVP)</div>
          {salesGroups.map((g) => {
            const sample = g.nodeIds.map((id) => ribbon.nodes.get(id)).find(Boolean);
            const seg = sample?.person.segmentKey ?? null;
            const accent = seg ? segmentStyle(seg).accent : "var(--text-secondary)";
            return (
              <div key={g.key} className="ovr-ribbon-group">
                <button
                  type="button"
                  className="ovr-ribbon-group-head"
                  style={{ borderLeftColor: accent }}
                  onClick={() => onSelect(g.key)}
                  title={`Reframe panels around ${g.label}`}
                >
                  <span className="ovr-rg-name">{g.label}</span>
                  {g.subLabel && <span className="ovr-rg-sub">{g.subLabel}</span>}
                  <span className="ovr-rg-count">{g.nodeIds.length}</span>
                </button>
                <div className="ovr-ribbon-group-body">
                  {g.nodeIds.slice(0, 3).map((id) => {
                    const n = ribbon.nodes.get(id);
                    if (!n) return null;
                    const r = roleStyle(n.person.roleType || "");
                    const partners = pocPartnersByAe?.get(n.person.displayName) ?? [];
                    const hasPoc = partners.length > 0;
                    const pocTitle = hasPoc
                      ? `SA partners: ${partners
                          .slice(0, 3)
                          .map((p) => `${p.poc} (${p.dealCount})`)
                          .join(", ")}${partners.length > 3 ? `, +${partners.length - 3}` : ""}`
                      : undefined;
                    return (
                      <button
                        key={id}
                        type="button"
                        data-rb={id}
                        className={
                          "ovr-ribbon-node ovr-ribbon-node-ae" +
                          (selectedId === id || panelAeId === id ? " ovr-ribbon-node-active" : "") +
                          (focusedId && !isHighlighted(id) ? " ovr-ribbon-node-dim" : "")
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          onActivate(n);
                        }}
                        style={{
                          borderColor: r.border,
                          ["--node-dot" as string]: r.dot,
                        }}
                        title={`${n.label} — ${personTitle(n.person)}${
                          hasPoc ? ` · ${pocTitle}` : ""
                        }`}
                      >
                        <span className="ovr-ribbon-node-dot" aria-hidden="true" />
                        <span className="ovr-ribbon-node-name">{n.label}</span>
                        {hasPoc && <PocMark size="sm" />}
                      </button>
                    );
                  })}
                  {g.nodeIds.length > 3 && (
                    <button
                      type="button"
                      className="ovr-ribbon-more"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(g.key);
                      }}
                    >
                      +{g.nodeIds.length - 3} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="overview-panel-foot">
        <strong>Geometry:</strong> bipartite ribbon (low LOD) to show coverage flows
        between SE org and Sales org at a glance.
      </p>
    </section>
  );
}

// -----------------------------------------------------------------
// Panel 2 — SE-centric
// -----------------------------------------------------------------

// PanelSubject: dispatches to the right rendering based on subject's kind.
//   - SE / SA → matrix-row view (manager chain → AEs by RVP → load)
//   - SE Manager / SA Manager / Root → team roster (direct reports + load bars)
//   - RVP → AE roster (chips by role-type)
//   - AVP → RVP roster (each RVP with their team size)
//   - null → empty state
function PanelSubject({
  subject,
  model,
  loads,
  onSelect,
  autoPicked,
}: {
  subject: Person | null;
  model: NonNullable<ReturnType<typeof useStore.getState>["model"]>;
  loads: Map<string, SeLoad>;
  onSelect: (id: string | null) => void;
  autoPicked?: boolean;
}) {
  if (!subject) {
    return (
      <section className="overview-panel overview-panel-se">
        <header className="overview-panel-head">
          <span className="overview-panel-num">2</span>
          <div>
            <h3 className="overview-panel-title">Subject panel</h3>
            <p className="overview-panel-sub">Click anyone to populate this panel.</p>
          </div>
        </header>
        <div className="overview-panel-empty">Pick a person on the left.</div>
      </section>
    );
  }
  switch (subject.roleKind) {
    case "se":
      return (
        <PanelSeMatrix
          se={subject}
          model={model}
          load={loads.get(subject.id) ?? null}
          onSelect={onSelect}
          autoPicked={autoPicked}
        />
      );
    case "sa":
      // V3 of Shape A: SAs route to a deal-derived engagement grid
      // (cols = covering SEs, cells = AEs they partnered on, badges =
      // deal counts) rather than reusing the SE matrix-row geometry,
      // because SAs have no asserted coverage to populate it with.
      return <PanelSaEngagements sa={subject} model={model} onSelect={onSelect} />;
    case "se_lead":
    case "sa_lead":
    case "root":
      return <PanelManagerRoster manager={subject} model={model} loads={loads} onSelect={onSelect} />;
    case "rvp":
      return <PanelRvpRoster rvp={subject} model={model} onSelect={onSelect} />;
    case "avp":
      return <PanelAvpRoster avp={subject} model={model} onSelect={onSelect} />;
    case "floater":
    case "ae":
      return (
        <section className="overview-panel overview-panel-se">
          <header className="overview-panel-head">
            <span className="overview-panel-num">2</span>
            <div>
              <h3 className="overview-panel-title">Subject panel</h3>
              <p className="overview-panel-sub">No SE-side context for this selection.</p>
            </div>
          </header>
          <div className="overview-panel-empty">{subject.displayName} doesn’t map to an SE-centric view.</div>
        </section>
      );
  }
}

// Matrix-row view (the original Panel 2 SE rendering, lifted out so the
// dispatcher above can pick it).
function PanelSeMatrix({
  se,
  model,
  load,
  onSelect,
  autoPicked,
}: {
  se: Person;
  model: NonNullable<ReturnType<typeof useStore.getState>["model"]>;
  load: SeLoad | null;
  onSelect: (id: string | null) => void;
  autoPicked?: boolean;
}) {
  // V2 of Shape A: matrix-cell AE chips render a small mint diamond
  // glyph when the (SE, AE) pair has any deal-evidenced SA partner.
  // The index is built once at deals snapshot load.
  const pocPartnersByPair = useStore((s) => s.deals?.pocPartnersByPair);

  const chain = managerChain(model, se.id).reverse();
  const coveredIds = model.coveredAesBySe.get(se.id) ?? [];
  // Group AEs by RVP
  const groups = new Map<string, Person[]>();
  for (const id of coveredIds) {
    const a = model.byId.get(id);
    if (!a || !a.rvpId) continue;
    if (!groups.has(a.rvpId)) groups.set(a.rvpId, []);
    groups.get(a.rvpId)!.push(a);
  }
  const orderedRvpIds = [...groups.keys()].sort((a, b) => {
    const ra = model.byId.get(a);
    const rb = model.byId.get(b);
    return (ra?.sort_order ?? 0) - (rb?.sort_order ?? 0);
  });

  return (
    <section className="overview-panel overview-panel-se">
      <header className="overview-panel-head">
        <span className="overview-panel-num">2</span>
        <div>
          <h3 className="overview-panel-title">
            SE-centric: <strong>{se.displayName}</strong>{" "}
            <span className="ovr-ae-title-arrow">→ matrix row</span>
          </h3>
          <p className="overview-panel-sub">
            {autoPicked ? (
              <>
                Showing the highest-loaded SE by default. Pick anyone in panel 1 to reframe.
              </>
            ) : (
              <>Manager chain → AEs by RVP → load.</>
            )}
          </p>
        </div>
      </header>

      <div className="ovr-se-chain">
        {chain.map((c) => (
          <button
            key={c.id}
            type="button"
            className="ovr-se-chain-pill"
            onClick={() => onSelect(c.id)}
          >
            <Avatar name={c.displayName} size="sm" />
            <span className="ovr-se-chain-text">
              <span className="ovr-se-chain-name">{c.displayName}</span>
              <span className="ovr-se-chain-sub">{personTitle(c)}</span>
            </span>
          </button>
        ))}
        <div className="ovr-se-chain-pill ovr-se-chain-pill-active">
          <Avatar name={se.displayName} roleType={se.roleType} size="sm" />
          <span className="ovr-se-chain-text">
            <span className="ovr-se-chain-name">{se.displayName}</span>
            <span className="ovr-se-chain-sub">{personTitle(se)}</span>
          </span>
        </div>
      </div>

      <div className="ovr-se-grid-wrap">
        <div className="ovr-se-grid-label">AEs covered across RVPs</div>
        {orderedRvpIds.length === 0 ? (
          <div className="overview-panel-empty">No AEs assigned in the asserted matrix.</div>
        ) : (
          <div
            className="ovr-se-grid"
            style={{ ["--cols" as string]: orderedRvpIds.length }}
          >
            {orderedRvpIds.map((rvpId) => {
              const rvp = model.byId.get(rvpId);
              const aes = groups.get(rvpId) ?? [];
              return (
                <div key={rvpId} className="ovr-se-grid-col">
                  <button
                    type="button"
                    className="ovr-se-grid-head"
                    onClick={() => rvp && onSelect(rvp.id)}
                    title={rvp ? `Reframe panels around ${rvp.displayName}` : undefined}
                  >
                    {rvp?.displayName ?? rvpId}
                  </button>
                  <div className="ovr-se-grid-cell">
                    {aes.slice(0, 4).map((a) => {
                      const r = roleStyle(a.roleType || "");
                      const pairPartners =
                        pocPartnersByPair?.get(
                          `${se.displayName}::${a.displayName}`,
                        ) ?? [];
                      const hasPoc = pairPartners.length > 0;
                      const pocTitle = hasPoc
                        ? `SA: ${pairPartners
                            .slice(0, 3)
                            .map((p) => `${p.poc} (${p.dealCount})`)
                            .join(", ")}`
                        : "";
                      return (
                        <button
                          key={a.id}
                          type="button"
                          className="ae-chip"
                          style={{
                            background: r.fill,
                            borderColor: r.border,
                            color: r.text,
                            ["--chip-dot" as string]: r.dot,
                          }}
                          onClick={() => onSelect(a.id)}
                          title={
                            hasPoc
                              ? `Show ${a.displayName} in panel 3 · ${pocTitle}`
                              : `Show ${a.displayName} in panel 3`
                          }
                        >
                          <span className="ae-chip-dot" aria-hidden="true" />
                          <span className="ae-chip-name">{a.displayName}</span>
                          {hasPoc && <PocMark size="sm" />}
                        </button>
                      );
                    })}
                    {aes.length > 4 && (
                      <span className="ovr-se-grid-more">+{aes.length - 4}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SA partners strip + load gauge are pinned to the BOTTOM of the
          panel via margin-top:auto on the gauge wrapper so the gauge
          always reads as the panel's "footer" anchor — visible regardless
          of how tall the matrix grows. */}
      <PocPartnersStrip subject={se} />

      {load && (
        <div className="ovr-se-load-anchor">
          <CompactLoad load={load} name={se.displayName} />
        </div>
      )}
    </section>
  );
}

function CompactLoad({ load, name }: { load: SeLoad; name: string }) {
  const pct = load.loadPct;
  const capped = Math.min(150, pct);
  const loadPos = (capped / 150) * 100;
  const targetPos = (100 / 150) * 100;
  const fadeWidth = Math.max(0, 100 - loadPos);
  return (
    <div className="ovr-se-load">
      <div className="ovr-se-load-head">
        <span className="ovr-se-load-label">
          {name} load
          <svg className="ovr-se-load-info" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
            <line x1="8" y1="6.5" x2="8" y2="11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="8" cy="4.5" r="0.9" fill="currentColor" />
          </svg>
        </span>
        <span className={"ovr-se-load-pct " + `load-fill-${load.bucket}`}>{pct}%</span>
        {load.bucket === "overloaded" && (
          <span className="focus-load-badge">OVERLOADED</span>
        )}
        {load.bucket === "balanced" && (
          <span className="focus-load-badge focus-load-badge-good">ON TARGET</span>
        )}
        {load.bucket === "slack" && (
          <span className="focus-load-badge focus-load-badge-info">SLACK</span>
        )}
      </div>
      <div className="ovr-se-load-meter">
        <div className="ovr-se-load-target" style={{ left: `${targetPos}%` }} />
        <div className="ovr-se-load-fade" style={{ width: `${fadeWidth}%` }} />
        <div className={`ovr-se-load-marker load-fill-${load.bucket}`} style={{ left: `${loadPos}%` }} />
      </div>
      <div className="ovr-se-load-meta">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
        <span>150%</span>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------
// Panel 2 alt-modes: roster views for managers, RVPs, AVPs.
// -----------------------------------------------------------------

function PanelManagerRoster({
  manager,
  model,
  loads,
  onSelect,
}: {
  manager: Person;
  model: NonNullable<ReturnType<typeof useStore.getState>["model"]>;
  loads: Map<string, SeLoad>;
  onSelect: (id: string | null) => void;
}) {
  const chain = managerChain(model, manager.id).reverse();
  const directIds = model.reportsByManager.get(manager.id) ?? [];
  // Only individual contributors (SE / SA) belong in a manager's team roster.
  // The roster sometimes attaches sales-side personnel (RVPs) to SE managers
  // due to historical "manager_name" entries; filter them out so the panel
  // reads as the SE/SA team only.
  const directs = directIds
    .map((id) => model.byId.get(id))
    .filter((p): p is Person => !!p && (p.roleKind === "se" || p.roleKind === "sa"));
  const directLoads = directs
    .map((p) => ({ p, ld: loads.get(p.id) ?? null }))
    .sort((a, b) => (b.ld?.loadPct ?? 0) - (a.ld?.loadPct ?? 0));

  // Aggregate team load: total covered AEs / total target.
  let totCovered = 0;
  let totTarget = 0;
  for (const { ld } of directLoads) {
    if (!ld) continue;
    totCovered += ld.coveredCount ?? 0;
    totTarget += ld.primaryTarget ?? 0;
  }
  const teamPct = totTarget > 0 ? Math.round((totCovered / totTarget) * 100) : 0;
  const teamBucket: SeLoad["bucket"] =
    teamPct >= 110 ? "overloaded" : teamPct >= 90 ? "balanced" : teamPct >= 25 ? "slack" : "empty";

  return (
    <section className="overview-panel overview-panel-se">
      <header className="overview-panel-head">
        <span className="overview-panel-num">2</span>
        <div>
          <h3 className="overview-panel-title">
            Team-centric: <strong>{manager.displayName}</strong>{" "}
            <span className="ovr-ae-title-arrow">→ team roster</span>
          </h3>
          <p className="overview-panel-sub">
            {directs.length} direct report{directs.length === 1 ? "" : "s"} · team load{" "}
            <span className={`load-fill-${teamBucket}`}>{teamPct}%</span>
          </p>
        </div>
      </header>

      <div className="ovr-se-chain">
        {chain.map((c) => (
          <button
            key={c.id}
            type="button"
            className="ovr-se-chain-pill"
            onClick={() => onSelect(c.id)}
          >
            <Avatar name={c.displayName} size="sm" />
            <span className="ovr-se-chain-text">
              <span className="ovr-se-chain-name">{c.displayName}</span>
              <span className="ovr-se-chain-sub">{personTitle(c)}</span>
            </span>
          </button>
        ))}
        <div className="ovr-se-chain-pill ovr-se-chain-pill-active">
          <Avatar name={manager.displayName} size="sm" />
          <span className="ovr-se-chain-text">
            <span className="ovr-se-chain-name">{manager.displayName}</span>
            <span className="ovr-se-chain-sub">{personTitle(manager)}</span>
          </span>
        </div>
      </div>

      <div className="ovr-roster-wrap">
        <div className="ovr-roster-label">
          Direct reports (click to drill into matrix row)
        </div>
        <div className="ovr-roster-list">
          {directLoads.length === 0 ? (
            <div className="overview-panel-empty">No direct reports.</div>
          ) : (
            directLoads.map(({ p, ld }) => {
              const pct = ld?.loadPct ?? 0;
              const bucket = ld?.bucket ?? "empty";
              const aeCount = ld?.coveredCount ?? 0;
              const target = ld?.primaryTarget ?? 0;
              const loadPos = (Math.min(150, pct) / 150) * 100;
              const fadeWidth = Math.max(0, 100 - loadPos);
              return (
                <button
                  key={p.id}
                  type="button"
                  className="ovr-roster-row"
                  onClick={() => onSelect(p.id)}
                  title={`Reframe panels around ${p.displayName}`}
                >
                  <Avatar name={p.displayName} size="sm" />
                  <span className="ovr-roster-text">
                    <span className="ovr-roster-name">{p.displayName}</span>
                    <span className="ovr-roster-sub">{personTitle(p)}</span>
                  </span>
                  <span className="ovr-roster-meta">
                    <span className="ovr-roster-bar" aria-hidden="true">
                      <span
                        className="ovr-roster-bar-target"
                        style={{ left: `${(100 / 150) * 100}%` }}
                      />
                      <span
                        className="ovr-roster-bar-fill"
                        style={{ width: `${fadeWidth}%` }}
                      />
                      <span
                        className={`ovr-roster-bar-marker load-fill-${bucket}`}
                        style={{ left: `${loadPos}%` }}
                      />
                    </span>
                    <span className={`ovr-roster-pct load-fill-${bucket}`}>
                      {pct}%
                    </span>
                    <span className="ovr-roster-count">
                      {aeCount}
                      {target ? `/${target}` : ""} AEs
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      <PocPartnersStrip subject={manager} />
    </section>
  );
}

function PanelRvpRoster({
  rvp,
  model,
  onSelect,
}: {
  rvp: Person;
  model: NonNullable<ReturnType<typeof useStore.getState>["model"]>;
  onSelect: (id: string | null) => void;
}) {
  const aeIds = model.aesByRvp.get(rvp.id) ?? [];
  const aes = aeIds
    .map((id) => model.byId.get(id))
    .filter((p): p is Person => !!p)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  return (
    <section className="overview-panel overview-panel-se">
      <header className="overview-panel-head">
        <span className="overview-panel-num">2</span>
        <div>
          <h3 className="overview-panel-title">
            RVP-centric: <strong>{rvp.displayName}</strong>{" "}
            <span className="ovr-ae-title-arrow">→ team AEs</span>
          </h3>
          <p className="overview-panel-sub">
            {rvp.avpName ? `Reports to ${rvp.avpName}` : "AVP unknown"} ·{" "}
            {segmentLabel(rvp.segment)} · {aes.length} AE{aes.length === 1 ? "" : "s"}
          </p>
        </div>
      </header>

      <div className="ovr-roster-wrap">
        <div className="ovr-roster-label">AEs on this RVP’s team</div>
        <div className="ovr-roster-list">
          {aes.length === 0 ? (
            <div className="overview-panel-empty">No AEs on this RVP’s row.</div>
          ) : (
            aes.map((a) => {
              const r = roleStyle(a.roleType || "");
              const cover = a.coveringSeId ? model.byId.get(a.coveringSeId) ?? null : null;
              return (
                <button
                  key={a.id}
                  type="button"
                  className="ovr-roster-row"
                  onClick={() => onSelect(a.id)}
                >
                  <Avatar name={a.displayName} roleType={a.roleType} size="sm" />
                  <span className="ovr-roster-text">
                    <span className="ovr-roster-name">{a.displayName}</span>
                    <span className="ovr-roster-sub">
                      {personTitle(a)}
                      {cover ? ` · covered by ${cover.displayName}` : ""}
                    </span>
                  </span>
                  {a.roleType && (
                    <span
                      className="chip chip-role"
                      style={{
                        background: r.fill,
                        borderColor: r.border,
                        color: r.text,
                        ["--role-color" as string]: r.dot,
                      }}
                    >
                      {a.roleType}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      <PocPartnersStrip subject={rvp} />
    </section>
  );
}

function PanelAvpRoster({
  avp,
  model,
  onSelect,
}: {
  avp: Person;
  model: NonNullable<ReturnType<typeof useStore.getState>["model"]>;
  onSelect: (id: string | null) => void;
}) {
  const rvps = model.byRole.rvp
    .filter((r) => r.avpName === avp.name)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const totalAes = rvps.reduce((s, r) => s + (model.aesByRvp.get(r.id)?.length ?? 0), 0);

  return (
    <section className="overview-panel overview-panel-se">
      <header className="overview-panel-head">
        <span className="overview-panel-num">2</span>
        <div>
          <h3 className="overview-panel-title">
            AVP-centric: <strong>{avp.displayName}</strong>{" "}
            <span className="ovr-ae-title-arrow">→ RVP roster</span>
          </h3>
          <p className="overview-panel-sub">
            {rvps.length} RVP{rvps.length === 1 ? "" : "s"} · {totalAes} AE
            {totalAes === 1 ? "" : "s"}
          </p>
        </div>
      </header>

      <div className="ovr-roster-wrap">
        <div className="ovr-roster-label">RVPs reporting up</div>
        <div className="ovr-roster-list">
          {rvps.length === 0 ? (
            <div className="overview-panel-empty">No RVPs assigned to this AVP.</div>
          ) : (
            rvps.map((r) => {
              const ct = model.aesByRvp.get(r.id)?.length ?? 0;
              return (
                <button
                  key={r.id}
                  type="button"
                  className="ovr-roster-row"
                  onClick={() => onSelect(r.id)}
                >
                  <Avatar name={r.displayName} size="sm" />
                  <span className="ovr-roster-text">
                    <span className="ovr-roster-name">{r.displayName}</span>
                    <span className="ovr-roster-sub">
                      RVP · {segmentLabel(r.segment)}
                    </span>
                  </span>
                  <span className="ovr-roster-count">{ct} AEs</span>
                </button>
              );
            })
          )}
        </div>
      </div>

      <PocPartnersStrip subject={avp} />
    </section>
  );
}

// -----------------------------------------------------------------
// Panel 2 — SA-centric engagement grid (V3 of Shape A).
//
// SAs don't have asserted coverage, so reusing the SE matrix-row geometry
// would be a lie. Instead we show the SA's actual deal footprint: columns
// are the covering SEs they partnered with, cells are the AEs they
// supported under each SE, and each cell carries a deal-count badge.
// Suppresses the bench (the SA *is* the partner) and shows engagement
// totals instead.
// -----------------------------------------------------------------

function PanelSaEngagements({
  sa,
  model,
  onSelect,
}: {
  sa: Person;
  model: NonNullable<ReturnType<typeof useStore.getState>["model"]>;
  onSelect: (id: string | null) => void;
}) {
  const deals = useStore((s) => s.deals);
  const dealsLoading = useStore((s) => s.dealsLoading);
  const dealsError = useStore((s) => s.dealsError);

  const eng: SaEngagements = saEngagements(model, sa, deals);
  const chain = managerChain(model, sa.id).reverse();

  return (
    <section className="overview-panel overview-panel-se">
      <header className="overview-panel-head">
        <span className="overview-panel-num">2</span>
        <div>
          <h3 className="overview-panel-title">
            Solutions Architect: <strong>{sa.displayName}</strong>{" "}
            <span className="ovr-ae-title-arrow">→ engagement grid</span>
          </h3>
          <p className="overview-panel-sub">
            {sa.manager_name ? `Reports to ${sa.manager_name}` : "Solutions Architect"} ·
            cells show AEs the SA partnered with, badged by deal count.
          </p>
        </div>
      </header>

      {/* Manager chain — always SA-tinted (mint) at the SA pill. */}
      <div className="ovr-se-chain">
        {chain.map((c) => (
          <button
            key={c.id}
            type="button"
            className="ovr-se-chain-pill"
            onClick={() => onSelect(c.id)}
          >
            <Avatar name={c.displayName} size="sm" />
            <span className="ovr-se-chain-text">
              <span className="ovr-se-chain-name">{c.displayName}</span>
              <span className="ovr-se-chain-sub">{personTitle(c)}</span>
            </span>
          </button>
        ))}
        <div className="ovr-se-chain-pill ovr-se-chain-pill-active ovr-se-chain-pill-sa">
          <Avatar name={sa.displayName} size="sm" />
          <span className="ovr-se-chain-text">
            <span className="ovr-se-chain-name">{sa.displayName}</span>
            <span className="ovr-se-chain-sub">{personTitle(sa)}</span>
          </span>
        </div>
      </div>

      {eng.columns.length === 0 ? (
        <div className="ovr-se-grid-wrap">
          <div className="ovr-se-grid-label">Engagements grouped by covering SE</div>
          <div className="overview-panel-empty">
            {dealsError
              ? "Deals unavailable — try again later."
              : dealsLoading || !deals
              ? "Loading deals…"
              : "No SA engagements in current window. Try widening the window picker."}
          </div>
        </div>
      ) : (
        <div className="ovr-se-grid-wrap">
          <div className="ovr-se-grid-label">Engagements grouped by covering SE</div>
          <div
            className="ovr-se-grid"
            style={{ ["--cols" as string]: Math.min(eng.columns.length, 4) }}
          >
            {eng.columns.map((col) => (
              <div key={col.se.id} className="ovr-se-grid-col">
                <button
                  type="button"
                  className="ovr-se-grid-head ovr-sa-engage-head"
                  onClick={() => onSelect(col.se.id)}
                  title={`Reframe panels around ${col.se.displayName}`}
                >
                  <span>{col.se.displayName}</span>
                  <span className="ovr-sa-engage-deals">
                    {col.totalDealCount} deal{col.totalDealCount === 1 ? "" : "s"}
                  </span>
                </button>
                <div className="ovr-se-grid-cell ovr-sa-engage-cell">
                  {col.aes.map(({ ae, dealCount }) => {
                    const r = roleStyle(ae.roleType || "");
                    return (
                      <button
                        key={ae.id}
                        type="button"
                        className="ae-chip ovr-sa-engage-chip"
                        style={{
                          background: r.fill,
                          borderColor: r.border,
                          color: r.text,
                          ["--chip-dot" as string]: r.dot,
                        }}
                        onClick={() => onSelect(ae.id)}
                        title={`${ae.displayName} · ${dealCount} deal${
                          dealCount === 1 ? "" : "s"
                        } with ${sa.displayName}`}
                      >
                        <span className="ae-chip-dot" aria-hidden="true" />
                        <span className="ae-chip-name">{ae.displayName}</span>
                        <span className="ovr-sa-engage-count">{dealCount}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="ovr-sa-engage-meta">
        <div className="ovr-sa-engage-meta-stat">
          <span className="ovr-sa-engage-meta-label">Total engagements</span>
          <span className="ovr-sa-engage-meta-val">
            {eng.totalDeals} deal{eng.totalDeals === 1 ? "" : "s"}
          </span>
        </div>
        <div className="ovr-sa-engage-meta-stat">
          <span className="ovr-sa-engage-meta-label">SEs partnered with</span>
          <span className="ovr-sa-engage-meta-val">{eng.totalSes}</span>
        </div>
        <div className="ovr-sa-engage-meta-stat">
          <span className="ovr-sa-engage-meta-label">AEs partnered with</span>
          <span className="ovr-sa-engage-meta-val">{eng.totalAes}</span>
        </div>
      </div>
    </section>
  );
}

// -----------------------------------------------------------------
// Panel 3 — Relationships (adaptive fan-out)
//
// V2 of Shape A. Replaces the dual-chain "AE-centric" geometry. The
// fan-out scales 1..N AEs honestly: chain at the top, AE-side groups
// below (one per RVP, or per covering SE for RVP-selection inversion).
// All clicks `selectPerson` only — no Focus routing from inside this
// panel.
// -----------------------------------------------------------------

function PanelRelationships({
  subject,
  model,
  onSelect,
  openDrawer,
  autoPicked,
}: {
  subject: Person | null;
  model: NonNullable<ReturnType<typeof useStore.getState>["model"]>;
  onSelect: (id: string | null) => void;
  openDrawer: (id: string) => void;
  autoPicked?: boolean;
}) {
  const deals = useStore((s) => s.deals);
  const pocPartnersByAe = useStore((s) => s.deals?.pocPartnersByAe);
  const selectedId = useStore((s) =>
    s.selection?.kind === "person" ? s.selection.id : null,
  );

  if (!subject) {
    return (
      <section className="overview-panel overview-panel-ae">
        <header className="overview-panel-head">
          <span className="overview-panel-num">3</span>
          <div>
            <h3 className="overview-panel-title">Relationships</h3>
            <p className="overview-panel-sub">Click anyone to populate this panel.</p>
          </div>
        </header>
        <div className="overview-panel-empty">Pick a person.</div>
      </section>
    );
  }

  const fanout = selectionFanout(model, subject, deals);

  return (
    <section className="overview-panel overview-panel-ae">
      <header className="overview-panel-head">
        <span className="overview-panel-num">3</span>
        <div>
          <h3 className="overview-panel-title">
            {fanout.verb}: <strong>{subject.displayName}</strong>{" "}
            <span className="ovr-ae-title-arrow">→ {fanout.scopeText}</span>
          </h3>
          <p className="overview-panel-sub">
            {autoPicked ? (
              <>Auto-selected to populate the panel. Pick anyone to reframe.</>
            ) : (
              relationshipsSubtitle(fanout)
            )}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost overview-panel-cta"
          onClick={() => openDrawer(subject.id)}
          title="Open quick-info drawer"
        >
          Details
        </button>
      </header>

      {/* Top chain — manager chain for SE-side selections, commercial
          chain (AVP) for RVP/AVP selections. The subject pill terminates
          the chain when `showSubjectInChain` is set. */}
      <div className="ovr-rel-chain">
        {fanout.chain.map((p, i) => (
          <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ChainPill p={p} onSelect={onSelect} />
            {(i < fanout.chain.length - 1 || fanout.showSubjectInChain) && (
              <span className="ovr-rel-chain-arrow">→</span>
            )}
          </span>
        ))}
        {fanout.showSubjectInChain && (
          <ChainPill p={subject} onSelect={onSelect} active />
        )}
      </div>

      {fanout.groups.length > 0 ? (
        <>
          <div
            className={
              "ovr-rel-bridge" +
              (fanout.side === "comm" ? " ovr-rel-bridge-comm" : "")
            }
            aria-hidden="true"
          />

          {(fanout.totalAes > 1 || fanout.isSa) && (
            <div className="ovr-rel-summary">
              <span className="ovr-rel-summary-stat">
                <strong>{fanout.totalAes}</strong> AE{fanout.totalAes === 1 ? "" : "s"}
              </span>
              {fanout.totalRvps > 0 && (
                <span className="ovr-rel-summary-stat">
                  <strong>{fanout.totalRvps}</strong>{" "}
                  {fanout.side === "comm" ? "covering SEs" : "RVPs"}
                </span>
              )}
              {fanout.totalAvps > 0 && fanout.side !== "comm" && (
                <span className="ovr-rel-summary-stat">
                  <strong>{fanout.totalAvps}</strong> AVP{fanout.totalAvps === 1 ? "" : "s"}
                </span>
              )}
              {fanout.isSa && fanout.totalDeals > 0 && (
                <span className="ovr-rel-summary-stat">
                  <strong>{fanout.totalDeals}</strong> deals
                </span>
              )}
            </div>
          )}

          <div className="ovr-rel-fanout">
            {fanout.groups.map((g) => (
              <FanoutGroupView
                key={g.key}
                group={g}
                selectedId={selectedId}
                onSelect={onSelect}
                openDrawer={openDrawer}
                pocPartnersByAe={pocPartnersByAe ?? null}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="ovr-rel-empty">{relationshipsEmptyHint(fanout)}</div>
      )}

      {/* Bench: aggregate SA partners across whatever's in scope. We
          suppress it for SA selections — the SA *is* the partner, and
          showing them in their own bench is redundant. The summary
          stats above carry their engagement totals instead. */}
      {!fanout.isSa && <PocPartnersStrip subject={subject} />}
    </section>
  );
}

function relationshipsSubtitle(fanout: ReturnType<typeof selectionFanout>): string {
  if (fanout.isSa) return "Engagements grouped by RVP, with deal counts per AE.";
  if (fanout.side === "comm") {
    return fanout.totalAes === 0
      ? "No AEs in scope."
      : "AEs in this book, grouped by who covers them on the SE side.";
  }
  return fanout.totalAes === 0
    ? "No AEs in scope."
    : "AEs in scope, grouped by their RVP and AVP.";
}

function relationshipsEmptyHint(fanout: ReturnType<typeof selectionFanout>): string {
  if (fanout.isSa) return "No SA engagements in the current deals window. Try widening the window.";
  if (fanout.side === "comm") return "No AEs assigned in the asserted matrix.";
  return "No AEs in scope.";
}

function ChainPill({
  p,
  onSelect,
  active,
}: {
  p: Person;
  onSelect: (id: string | null) => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={"ovr-se-chain-pill" + (active ? " ovr-se-chain-pill-active" : "")}
      onClick={() => onSelect(p.id)}
      title={`Reframe panels around ${p.displayName}`}
    >
      <Avatar name={p.displayName} roleType={p.roleType} size="sm" />
      <span className="ovr-se-chain-text">
        <span className="ovr-se-chain-name">{p.displayName}</span>
        <span className="ovr-se-chain-sub">{personTitle(p)}</span>
      </span>
    </button>
  );
}

// Single fan-out group: head pill (RVP+AVP, OR covering SE) + AE cards.
function FanoutGroupView({
  group,
  selectedId,
  onSelect,
  openDrawer,
  pocPartnersByAe,
}: {
  group: FanoutGroup;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  openDrawer: (id: string) => void;
  pocPartnersByAe: Map<string, Array<{ poc: string; dealCount: number }>> | null;
}) {
  const head = group.headPerson;
  const headLabel = group.label;
  const headTail = group.rvp ? "· RVP" : group.subLabel ? `· ${group.subLabel}` : "";

  return (
    <div className="ovr-rel-group">
      <div className="ovr-rel-group-head">
        <button
          type="button"
          className="ovr-rel-rvp-pill"
          onClick={() => head && onSelect(head.id)}
          title={head ? `Reframe panels around ${head.displayName}` : undefined}
          disabled={!head}
        >
          {head && <Avatar name={head.displayName} size="sm" />}
          <span>{headLabel}</span>
          {headTail && <span className="ovr-rel-rvp-pill-tail">{headTail}</span>}
        </button>
        {group.avpName && (
          <button
            type="button"
            className="ovr-rel-avp-pill"
            onClick={() => group.avpName && onSelect(group.avpName)}
            title={`Reframe panels around ${group.avpName}`}
          >
            {group.avpName} · AVP
          </button>
        )}
      </div>
      <div className="ovr-rel-group-cards">
        {group.aes.map((f) => {
          const partners = pocPartnersByAe?.get(f.ae.displayName) ?? [];
          const hasPoc = partners.length > 0;
          const pocTitle = hasPoc
            ? `SA: ${partners
                .slice(0, 3)
                .map((p) => `${p.poc} (${p.dealCount})`)
                .join(", ")}`
            : "";
          return (
            <button
              key={f.ae.id}
              type="button"
              className={
                "ovr-rel-ae-card" +
                (selectedId === f.ae.id ? " ovr-rel-ae-card-active" : "")
              }
              onClick={() => onSelect(f.ae.id)}
              onDoubleClick={() => openDrawer(f.ae.id)}
              title={
                hasPoc
                  ? `${f.ae.displayName} · ${pocTitle} · double-click for details`
                  : `Select ${f.ae.displayName} · double-click for details`
              }
            >
              <Avatar name={f.ae.displayName} roleType={f.ae.roleType} size="sm" />
              <span className="ovr-rel-ae-card-text">
                <span className="ovr-rel-ae-card-name">{f.ae.displayName}</span>
                <span className="ovr-rel-ae-card-role">
                  {f.ae.roleType || segmentLabel(f.ae.segment)}
                </span>
              </span>
              {f.dealCount !== undefined && (
                <span className="ovr-rel-ae-count">{f.dealCount}</span>
              )}
              {hasPoc && <PocMark size="sm" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
