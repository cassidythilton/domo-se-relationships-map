import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { buildRibbon } from "../store/selectors";
import type { Ribbon, RibbonGroup, RibbonNode } from "../store/selectors";
import { managerAccent, roleStyle, segmentStyle } from "../config";
import { Avatar } from "../components/Avatar";

// Bipartite "ribbon" view of the full org. Left column is the SE / SA tree
// grouped by lead; right column is the Sales side grouped by AVP → RVP.
// Edges are SE → AE coverage, drawn as quadratic Bezier curves between
// the two columns. Selection (click any node) lights up its incident edges
// and dims everything else.

export function FullOrg() {
  const model = useStore((s) => s.model);
  const filters = useStore((s) => s.filters);
  const sel = useStore((s) => s.selection);
  const select = useStore((s) => s.selectPerson);
  const focusOn = useStore((s) => s.focusOnPerson);
  const openDrawer = useStore((s) => s.openPersonDrawer);

  const ribbon = useMemo<Ribbon | null>(
    () => (model ? buildRibbon(model, filters) : null),
    [model, filters],
  );

  if (!model || !ribbon) {
    return <div className="state state-empty">Loading…</div>;
  }

  const seGroups = ribbon.groups.filter((g) => g.side === "se");
  const salesGroups = ribbon.groups.filter((g) => g.side === "sales");
  const selectedId = sel?.kind === "person" ? sel.id : null;

  const totalNodes = ribbon.nodes.size;

  return (
    <div className="ribbon-wrap">
      <header className="ribbon-header">
        <div>
          <h2 className="ribbon-title">Full org</h2>
          <p className="ribbon-subtitle">
            SE / SA org on the left, Sales org on the right. Lines are SE → AE coverage.
            Click any node to highlight its relationships. {totalNodes} of {model.people.length} people in view.
          </p>
        </div>
        {salesGroups.length > 0 && (
          <RibbonLegend />
        )}
      </header>

      <RibbonCanvas
        ribbon={ribbon}
        seGroups={seGroups}
        salesGroups={salesGroups}
        selectedId={selectedId}
        onSelect={select}
        onActivate={(node) => {
          // Single-click in the ribbon picks how to drill: SEs / managers
          // jump into Focus; AEs open the quick-info drawer.
          if (node.side === "se") focusOn(node.id);
          else openDrawer(node.id);
        }}
      />
    </div>
  );
}

function RibbonLegend() {
  return (
    <div className="ribbon-legend" aria-hidden="true">
      <span className="ribbon-legend-line">
        <svg width="36" height="14" viewBox="0 0 36 14" aria-hidden="true">
          <path d="M2 7 Q 18 -3 34 7" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
        </svg>
        <span>covers</span>
      </span>
    </div>
  );
}

function RibbonCanvas({
  ribbon,
  seGroups,
  salesGroups,
  selectedId,
  onSelect,
  onActivate,
}: {
  ribbon: Ribbon;
  seGroups: RibbonGroup[];
  salesGroups: RibbonGroup[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onActivate: (node: RibbonNode) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState<EdgePath[]>([]);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // After layout, compute edge geometry from DOM rects.
  useLayoutEffect(() => {
    if (!wrapRef.current) return;
    const wrap = wrapRef.current;
    let frame = 0;

    const compute = () => {
      const wrapRect = wrap.getBoundingClientRect();
      const newEdges: EdgePath[] = [];
      for (const e of ribbon.edges) {
        const seEl = wrap.querySelector<HTMLElement>(
          `[data-node-id="${cssEscape(e.seId)}"]`,
        );
        const aeEl = wrap.querySelector<HTMLElement>(
          `[data-node-id="${cssEscape(e.aeId)}"]`,
        );
        if (!seEl || !aeEl) continue;
        const sR = seEl.getBoundingClientRect();
        const aR = aeEl.getBoundingClientRect();
        const x1 = sR.right - wrapRect.left;
        const y1 = sR.top + sR.height / 2 - wrapRect.top;
        const x2 = aR.left - wrapRect.left;
        const y2 = aR.top + aR.height / 2 - wrapRect.top;
        newEdges.push({
          d: pathD(x1, y1, x2, y2),
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

  // Compute "is related" for an edge given the selection
  const isEdgeRelated = (e: EdgePath) => {
    if (!selectedId) return true;
    return e.seId === selectedId || e.aeId === selectedId;
  };
  const isNodeRelated = (id: string) => {
    if (!selectedId) return true;
    if (id === selectedId) return true;
    // Related if there's an edge connecting selectedId and id (either direction)
    for (const e of ribbon.edges) {
      if ((e.seId === selectedId && e.aeId === id) ||
          (e.aeId === selectedId && e.seId === id)) {
        return true;
      }
    }
    return false;
  };

  return (
    <div
      className={"ribbon-canvas" + (selectedId ? " has-selection" : "")}
      ref={wrapRef}
      onClick={(e) => {
        if (e.target === e.currentTarget) onSelect(null);
      }}
    >
      <svg
        className="ribbon-svg"
        width={size.w || "100%"}
        height={size.h || "100%"}
        viewBox={size.w ? `0 0 ${size.w} ${size.h}` : undefined}
        aria-hidden="true"
      >
        {edges.map((e) => {
          const r = roleStyle(e.roleType || "");
          const related = isEdgeRelated(e);
          return (
            <path
              key={`${e.seId}::${e.aeId}`}
              className={"ribbon-edge" + (related ? "" : " ribbon-edge-dim")}
              d={e.d}
              stroke={r.dot}
              fill="none"
            />
          );
        })}
      </svg>

      <div className="ribbon-col ribbon-col-se">
        <div className="ribbon-col-title">SE / SA Org</div>
        {seGroups.map((g) => (
          <RibbonSeGroup
            key={g.key}
            group={g}
            ribbon={ribbon}
            selectedId={selectedId}
            isNodeRelated={isNodeRelated}
            onActivate={onActivate}
          />
        ))}
        {seGroups.length === 0 && (
          <div className="ribbon-group-empty">No SEs match the current filters</div>
        )}
      </div>

      <div className="ribbon-col ribbon-col-sales">
        <div className="ribbon-col-title">Sales Org</div>
        {salesGroups.map((g) => (
          <RibbonSalesGroup
            key={g.key}
            group={g}
            ribbon={ribbon}
            selectedId={selectedId}
            isNodeRelated={isNodeRelated}
            onActivate={onActivate}
          />
        ))}
        {salesGroups.length === 0 && (
          <div className="ribbon-group-empty">No AEs match the current filters</div>
        )}
      </div>
    </div>
  );
}

function RibbonSeGroup({
  group,
  ribbon,
  selectedId,
  isNodeRelated,
  onActivate,
}: {
  group: RibbonGroup;
  ribbon: Ribbon;
  selectedId: string | null;
  isNodeRelated: (id: string) => boolean;
  onActivate: (node: RibbonNode) => void;
}) {
  const accent = managerAccent(group.label);
  return (
    <div className="ribbon-group ribbon-group-se">
      <div className="ribbon-group-head" style={{ borderLeftColor: accent }}>
        <span className="ribbon-group-label">{group.label}</span>
        {group.subLabel && <span className="ribbon-group-sub">{group.subLabel}</span>}
        <span className="ribbon-group-count">{group.nodeIds.length}</span>
      </div>
      <div className="ribbon-group-body">
        {group.nodeIds.map((id) => {
          const node = ribbon.nodes.get(id);
          if (!node) return null;
          return (
            <RibbonNodeChip
              key={id}
              node={node}
              side="se"
              accent={accent}
              isSelected={selectedId === id}
              isRelated={isNodeRelated(id)}
              onActivate={onActivate}
            />
          );
        })}
        {group.nodeIds.length === 0 && (
          <div className="ribbon-group-empty">No SEs in current filters</div>
        )}
      </div>
    </div>
  );
}

function RibbonSalesGroup({
  group,
  ribbon,
  selectedId,
  isNodeRelated,
  onActivate,
}: {
  group: RibbonGroup;
  ribbon: Ribbon;
  selectedId: string | null;
  isNodeRelated: (id: string) => boolean;
  onActivate: (node: RibbonNode) => void;
}) {
  // Resolve segment from one of the nodes (all share the same RVP and therefore segment)
  const sample = group.nodeIds.map((id) => ribbon.nodes.get(id)).find(Boolean);
  const seg = sample?.person.segmentKey ?? null;
  const accent = seg ? segmentStyle(seg).accent : "var(--text-secondary)";
  return (
    <div className="ribbon-group ribbon-group-sales">
      <div className="ribbon-group-head" style={{ borderLeftColor: accent }}>
        <span className="ribbon-group-label">{group.label}</span>
        {group.subLabel && <span className="ribbon-group-sub">{group.subLabel}</span>}
        <span className="ribbon-group-count">{group.nodeIds.length}</span>
      </div>
      <div className="ribbon-group-body">
        {group.nodeIds.map((id) => {
          const node = ribbon.nodes.get(id);
          if (!node) return null;
          return (
            <RibbonNodeChip
              key={id}
              node={node}
              side="sales"
              accent={accent}
              isSelected={selectedId === id}
              isRelated={isNodeRelated(id)}
              onActivate={onActivate}
            />
          );
        })}
        {group.nodeIds.length === 0 && (
          <div className="ribbon-group-empty">No AEs in current filters</div>
        )}
      </div>
    </div>
  );
}

function RibbonNodeChip({
  node,
  side,
  isSelected,
  isRelated,
  onActivate,
}: {
  node: RibbonNode;
  side: "se" | "sales";
  accent: string;
  isSelected: boolean;
  isRelated: boolean;
  onActivate: (node: RibbonNode) => void;
}) {
  const r = node.person.roleType ? roleStyle(node.person.roleType) : null;
  return (
    <button
      type="button"
      className={
        "ribbon-node ribbon-node-" + side +
        (isSelected ? " ribbon-node-selected" : "") +
        (isRelated ? "" : " ribbon-node-dim")
      }
      data-node-id={node.id}
      onClick={(e) => {
        e.stopPropagation();
        onActivate(node);
      }}
      style={r ? { ["--node-tint" as string]: r.fill, ["--node-edge" as string]: r.border } : undefined}
    >
      <Avatar
        name={node.label}
        roleType={node.person.roleType}
        size="sm"
      />
      <span className="ribbon-node-text">
        <span className="ribbon-node-name">{node.label}</span>
        {node.subLabel && (
          <span className="ribbon-node-sub">{node.subLabel}</span>
        )}
      </span>
    </button>
  );
}

// Edge geometry helpers --------------------------------------------------

type EdgePath = {
  d: string;
  seId: string;
  aeId: string;
  roleType: string;
};

function pathD(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const cx1 = x1 + dx * 0.5;
  const cx2 = x2 - dx * 0.5;
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${cx1.toFixed(1)} ${y1.toFixed(1)} ${cx2.toFixed(1)} ${y2.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

function cssEscape(s: string): string {
  if (typeof CSS !== "undefined" && (CSS as any).escape) {
    return (CSS as any).escape(s);
  }
  return s.replace(/["\\]/g, "\\$&");
}
