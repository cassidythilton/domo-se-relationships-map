import { useMemo } from "react";
import { useStore } from "../store";
import { buildSpecialistMap } from "../store/selectors";
import { podColor } from "../config";

export function SpecialistMap() {
  const model = useStore((s) => s.model);
  const setSelectedPod = useStore((s) => s.selectPod);
  const setView = useStore((s) => s.setView);
  const setFilters = useStore((s) => s.setFilters);

  const data = useMemo(() => (model ? buildSpecialistMap(model) : null), [model]);

  if (!model) return null;
  if (!data || data.specializations.length === 0) {
    return (
      <div className="state state-empty">
        No <code>specializations</code> data yet. Add a comma-separated{" "}
        <code>specializations</code> column (e.g. <code>DE, AI, ISV, Healthcare</code>) to enable
        the Specialist Map.
      </div>
    );
  }

  const cellSize = "minmax(56px, 1fr)";
  const cols = `minmax(140px, 200px) repeat(${data.specializations.length}, ${cellSize})`;

  return (
    <div className="specmap-wrap">
      <div className="muted" style={{ marginBottom: 8 }}>
        Pod × specialization. Cells show the count of SCs covering the pod with that specialization.
        Empty cells are gaps. Green cells indicate at least one Primary SC carries the
        specialization. Click a row to view that pod's full coverage.
      </div>
      <div className="specmap-grid" style={{ gridTemplateColumns: cols }}>
        <div className="specmap-corner" />
        {data.specializations.map((s) => (
          <div
            key={s}
            className="specmap-col-label"
            onClick={() => {
              setFilters({ specialization: s });
            }}
            title={`Filter to ${s}`}
            style={{ cursor: "pointer" }}
          >
            {s}
          </div>
        ))}
        {data.pods.map((pod) => (
          <RowCells
            key={pod}
            pod={pod}
            specs={data.specializations}
            cells={data.cells}
            onPodClick={() => {
              setSelectedPod(pod);
              setView("reverse");
            }}
          />
        ))}
      </div>
    </div>
  );
}

function RowCells({
  pod,
  specs,
  cells,
  onPodClick,
}: {
  pod: string;
  specs: string[];
  cells: Map<string, { count: number; primaryCount: number }>;
  onPodClick: () => void;
}) {
  return (
    <>
      <div
        className="specmap-row-label"
        style={{ background: podColor(pod), cursor: "pointer" }}
        onClick={onPodClick}
      >
        {pod}
      </div>
      {specs.map((s) => {
        const cell = cells.get(`${pod}::${s}`);
        const count = cell?.count ?? 0;
        const primaryCount = cell?.primaryCount ?? 0;
        const className =
          "specmap-cell" +
          (count === 0 ? " gap" : "") +
          (primaryCount > 0 ? " has-primary" : "");
        return (
          <div
            key={s}
            className={className}
            title={`${pod} × ${s}: ${count} SCs (${primaryCount} Primary)`}
          >
            {count === 0 ? "—" : count}
          </div>
        );
      })}
    </>
  );
}
