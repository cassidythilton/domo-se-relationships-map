import { useMemo } from "react";
import { useStore } from "../store";
import { buildSegmentMatrix, ROLE_TYPE_KEYS } from "../store/selectors";
import type { SegmentMatrix as MatrixData } from "../store/selectors";
import { roleStyle, segmentStyle } from "../config";
import { Avatar } from "../components/Avatar";
import { Legend } from "../components/Legend";
import type { Person, SeLoad, SegmentKey } from "../data/types";

type Props = { segmentKey: SegmentKey };

export function SegmentMatrix({ segmentKey }: Props) {
  const model = useStore((s) => s.model);
  const filters = useStore((s) => s.filters);
  const sel = useStore((s) => s.selection);
  const select = useStore((s) => s.selectPerson);

  const focusOn = useStore((s) => s.focusOnPerson);
  const openDrawer = useStore((s) => s.openPersonDrawer);

  const matrix = useMemo<MatrixData | null>(
    () => (model ? buildSegmentMatrix(model, segmentKey, filters) : null),
    [model, segmentKey, filters],
  );

  if (!model || !matrix) {
    return <div className="state state-empty">Loading…</div>;
  }

  const selectedId = sel?.kind === "person" ? sel.id : null;
  const seg = segmentStyle(segmentKey);
  const lead = matrix.segmentLeadName ? model.byId.get(matrix.segmentLeadName) : null;

  return (
    <div className="matrix-wrap" style={{ ["--seg-accent" as string]: seg.accent }}>
      <header className="matrix-header">
        <div>
          <h2 className="matrix-title">
            <span className="matrix-title-dot" style={{ background: seg.accent }} />
            {matrix.segmentLabel}
          </h2>
          <p className="matrix-subtitle">
            {lead && (
              <>
                SE team:{" "}
                <button type="button" className="matrix-link" onClick={() => select(lead.id)}>
                  {lead.displayName}
                </button>{" "}
                ·{" "}
              </>
            )}
            {matrix.coveredAes} of {matrix.totalAes} AEs covered ·{" "}
            {matrix.rvpIds.length} RVPs · {matrix.seIds.length} SEs ·{" "}
            <span className="matrix-target">target {matrix.seToAeRatio} AEs / SE</span>
          </p>
        </div>
        <Legend roleTypes={[...ROLE_TYPE_KEYS] as string[]} />
      </header>

      <div
        className={"matrix-table" + (selectedId ? " has-selection" : "")}
        style={{ ["--rvp-count" as string]: matrix.rvpIds.length }}
      >
        <div className="matrix-corner" aria-hidden="true" />

        {matrix.rvpIds.map((rvpId) => {
          const rvp = matrix.rvpById.get(rvpId);
          const isSelected = selectedId === rvpId;
          return (
            <button
              key={`hdr-${rvpId}`}
              type="button"
              className={"matrix-col-head" + (isSelected ? " matrix-selected" : "")}
              onClick={() => rvp && select(isSelected ? null : rvp.id)}
            >
              <span className="matrix-col-head-name">
                {rvp?.displayName ?? rvp?.name ?? rvpId}
              </span>
              {rvp?.avpName ? (
                <span className="matrix-col-head-sub">{rvp.avpName}</span>
              ) : (
                <span className="matrix-col-head-sub matrix-col-head-sub-missing">
                  AVP unknown
                </span>
              )}
            </button>
          );
        })}

        <div className="matrix-load-corner" aria-hidden="true">Load</div>

        {matrix.seIds.map((seId) => {
          const se = matrix.seById.get(seId);
          if (!se) return null;
          const load = matrix.loadBySe.get(seId);
          const isSeSelected = selectedId === seId;
          const rowDimmed =
            !!selectedId &&
            !isSeSelected &&
            !rowHasSelected(seId, selectedId, matrix);
          return (
            <RowFragment
              key={`row-${seId}`}
              se={se}
              load={load}
              isSeSelected={isSeSelected}
              rowDimmed={rowDimmed}
              rvpIds={matrix.rvpIds}
              matrix={matrix}
              selectedId={selectedId}
              onFocusSe={(id) => {
                if (id) focusOn(id);
                else select(null);
              }}
              onPickAe={openDrawer}
            />
          );
        })}
      </div>

      {matrix.floaters.length > 0 && (
        <div className="matrix-floaters">
          <div className="matrix-floaters-head">
            <span>Unplaced AEs ({matrix.floaters.length})</span>
            <span className="muted">no SE assigned in matrix — needs roster cleanup</span>
          </div>
          <div className="matrix-floaters-body">
            {matrix.floaters.map((p) => (
              <AeChip
                key={p.id}
                person={p}
                isSelected={selectedId === p.id}
                isRelated={!selectedId || selectedId === p.id}
                onClick={openDrawer}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RowFragment({
  se,
  load,
  isSeSelected,
  rowDimmed,
  rvpIds,
  matrix,
  selectedId,
  onFocusSe,
  onPickAe,
}: {
  se: Person;
  load: SeLoad | undefined;
  isSeSelected: boolean;
  rowDimmed: boolean;
  rvpIds: string[];
  matrix: MatrixData;
  selectedId: string | null;
  onFocusSe: (id: string | null) => void;
  onPickAe: (id: string) => void;
}) {
  return (
    <>
      <button
        type="button"
        className={
          "matrix-row-head" +
          (isSeSelected ? " matrix-selected" : "") +
          (rowDimmed ? " matrix-dim" : "")
        }
        onClick={() => onFocusSe(isSeSelected ? null : se.id)}
        title={`Open ${se.displayName} in Focus`}
      >
        <Avatar name={se.displayName} size="sm" />
        <span className="matrix-row-head-text">
          <span className="matrix-row-head-name">{se.displayName}</span>
          <span className={"matrix-row-head-load" + (load ? ` load-${load.bucket}` : "")}>
            {load && load.coveredCount > 0
              ? `${load.coveredCount} AE${load.coveredCount === 1 ? "" : "s"} · ${load.loadPct}%`
              : "no coverage"}
          </span>
        </span>
      </button>
      {rvpIds.map((rvpId) => {
        const cell = matrix.cells.get(`${rvpId}::${se.id}`);
        const cellSelected =
          selectedId === se.id ||
          selectedId === rvpId ||
          (cell?.aes.some((a) => a.id === selectedId) ?? false);
        return (
          <div
            key={`${rvpId}::${se.id}`}
            className={
              "matrix-cell" +
              (cellSelected ? " matrix-cell-active" : "") +
              (rowDimmed && !cellSelected ? " matrix-dim" : "")
            }
          >
            {cell?.aes.length ? (
              cell.aes.map((a) => (
                <AeChip
                  key={a.id}
                  person={a}
                  isSelected={selectedId === a.id}
                  isRelated={
                    !selectedId ||
                    selectedId === a.id ||
                    selectedId === se.id ||
                    selectedId === rvpId
                  }
                  onClick={onPickAe}
                />
              ))
            ) : (
              <span className="matrix-cell-empty" aria-hidden="true">—</span>
            )}
          </div>
        );
      })}
      <LoadCell load={load} dim={rowDimmed} target={matrix.seToAeRatio} />
    </>
  );
}

function LoadCell({
  load,
  dim,
  target,
}: {
  load: SeLoad | undefined;
  dim: boolean;
  target: number;
}) {
  const pct = load?.loadPct ?? 0;
  // visual fill capped at 150%
  const fillPct = Math.min(150, pct);
  const widthPct = (fillPct / 150) * 100;
  const bucketClass = load ? `load-fill-${load.bucket}` : "";
  return (
    <div
      className={
        "matrix-load-cell" + (dim ? " matrix-dim" : "")
      }
      title={
        load && load.primarySegment
          ? `Primary: ${load.primarySegment} · target ${target} AEs · ${load.coveredCount} covered (${pct}%)`
          : "no coverage"
      }
    >
      <div className="matrix-load-bar">
        <div
          className={`matrix-load-bar-fill ${bucketClass}`}
          style={{ width: `${widthPct}%` }}
        />
        {/* 100% target tick line */}
        <div className="matrix-load-bar-target" style={{ left: `${(100 / 150) * 100}%` }} />
      </div>
      <span className={"matrix-load-pct " + bucketClass}>
        {load && load.coveredCount > 0 ? `${pct}%` : "—"}
      </span>
    </div>
  );
}

function rowHasSelected(seId: string, selectedId: string, matrix: MatrixData): boolean {
  for (const rvpId of matrix.rvpIds) {
    const cell = matrix.cells.get(`${rvpId}::${seId}`);
    if (!cell) continue;
    if (cell.aes.some((a) => a.id === selectedId)) return true;
  }
  return false;
}

function AeChip({
  person,
  isSelected,
  isRelated,
  onClick,
}: {
  person: Person;
  isSelected: boolean;
  isRelated: boolean;
  onClick: (id: string) => void;
}) {
  const r = roleStyle(person.roleType || "");
  return (
    <button
      type="button"
      className={
        "ae-chip" +
        (isSelected ? " ae-chip-selected" : "") +
        (isRelated ? "" : " ae-chip-dim")
      }
      onClick={(e) => {
        e.stopPropagation();
        onClick(person.id);
      }}
      title={`${person.displayName}${person.roleType ? " — " + person.roleType : ""}`}
      style={{
        background: r.fill,
        borderColor: r.border,
        color: r.text,
        ["--chip-dot" as string]: r.dot,
      }}
    >
      <span className="ae-chip-dot" aria-hidden="true" />
      <span className="ae-chip-name">{person.displayName}</span>
    </button>
  );
}
