import { useMemo } from "react";
import { useStore } from "../store";
import { applyFilters, buildMatrix } from "../store/selectors";
import type { MatrixCell } from "../store/selectors";
import { podColor, rgba } from "../config";
import { Legend } from "../components/Legend";
import { RepCircle } from "../components/RepCircle";
import type { Person } from "../data/types";

const SEGMENT_TITLES: Record<string, string> = {
  "Corp NL": "Corp NL",
  "Corp Upsell": "Corp Upsell",
  ENT: "Enterprise",
};

type Props = {
  segmentKey: string;
};

export function CoverageMatrix({ segmentKey }: Props) {
  const model = useStore((s) => s.model);
  const filters = useStore((s) => s.filters);
  const density = useStore((s) => s.density);
  const selectPod = useStore((s) => s.selectPod);
  const setView = useStore((s) => s.setView);

  const data = useMemo(() => {
    if (!model) return null;
    const filtered = applyFilters(model, { ...filters, segment: segmentKey });
    return buildMatrix(model, segmentKey, filtered);
  }, [model, filters, segmentKey]);

  if (!model || !data) return null;

  const { columns, rows, cellMap, outsideByCol, outsideNoCol, segmentLeads } = data;
  const roleTypes = [...new Set(model.people
    .filter((p) => p.tier === "L4" && p.segment === segmentKey)
    .map((p) => p.role_type)
    .filter(Boolean))];

  function jumpToReverse(pod: string) {
    selectPod(pod);
    setView("reverse");
  }

  return (
    <div className="swimlane">
      <h2 className="swimlane-title">{SEGMENT_TITLES[segmentKey] ?? segmentKey}</h2>
      <div
        className="swim-grid"
        style={{
          gridTemplateColumns: `${density >= 2 ? "minmax(80px, 110px)" : "0px"} repeat(${columns.length}, minmax(0, 1fr))`,
        }}
      >
        <div className="swim-corner" aria-hidden="true" />
        {columns.map((c) => {
          const lead = segmentLeads.find((p) => p.name === c);
          return (
            <div
              key={c}
              className="swim-col-header"
              style={{ background: podColor(c) }}
              title={lead ? `${c} \u2014 click to see who covers this pod` : c}
              onClick={() => jumpToReverse(c)}
            >
              {c}
            </div>
          );
        })}
        {density >= 2 &&
          rows.map((r) => (
            <Row
              key={r}
              row={r}
              columns={columns}
              cellMap={cellMap}
              showCircles={density >= 3}
            />
          ))}
      </div>

      {density >= 3 && (outsideByCol.size > 0 || outsideNoCol.length > 0) && (
        <div
          className="swim-outside"
          style={{
            gridTemplateColumns: `minmax(80px, 110px) repeat(${columns.length}, minmax(0, 1fr))`,
          }}
        >
          <div className="swim-outside-label">Unassigned</div>
          {columns.map((c) => (
            <div
              key={c}
              className="swim-cell"
              style={{ background: rgba(podColor(c), 0.4) }}
            >
              {(outsideByCol.get(c) ?? []).map((rep) => (
                <RepCircle key={rep.name} rep={rep} />
              ))}
            </div>
          ))}
          {outsideNoCol.length > 0 && (
            <div className="swim-floaters">
              {outsideNoCol.map((rep) => (
                <RepCircle key={rep.name} rep={rep} />
              ))}
            </div>
          )}
        </div>
      )}

      {density >= 3 && roleTypes.length > 0 && <Legend roleTypes={roleTypes} />}
    </div>
  );
}

function Row({
  row,
  columns,
  cellMap,
  showCircles,
}: {
  row: string;
  columns: string[];
  cellMap: Map<string, MatrixCell>;
  showCircles: boolean;
}) {
  return (
    <>
      <div className="swim-row-label">{row}</div>
      {columns.map((c) => {
        const cell = cellMap.get(`${c}::${row}`);
        const empty = !cell || cell.all.length === 0;
        const noPrimary = !empty && (cell?.primary.length ?? 0) === 0;
        const noBackup = !empty && (cell?.primary.length ?? 0) > 0 && (cell?.backup.length ?? 0) === 0;
        const hasOverlay = (cell?.overlay.length ?? 0) > 0;
        const className =
          "swim-cell" +
          (noPrimary ? " cell-no-primary" : "") +
          (noBackup && !noPrimary ? " cell-no-backup" : "");
        return (
          <div
            key={c}
            className={className}
            style={{ background: rgba(podColor(c), 0.35) }}
          >
            {showCircles && cell && cell.all.length > 0 && (
              <RepStack reps={cell.primary} role="Primary" />
            )}
            {showCircles && cell && (
              <RepStack reps={cell.backup} role="Backup" />
            )}
            {showCircles && cell && (
              <RepStack reps={cell.overlay} role="Overlay" />
            )}
            {hasOverlay && <span className="swim-cell-overlay-dot" aria-hidden="true" />}
          </div>
        );
      })}
    </>
  );
}

function RepStack({ reps, role }: { reps: Person[]; role: "Primary" | "Backup" | "Overlay" }) {
  if (!reps || reps.length === 0) return null;
  return (
    <>
      {reps.map((rep) => (
        <RepCircle key={`${role}-${rep.name}`} rep={rep} role={role} />
      ))}
    </>
  );
}
