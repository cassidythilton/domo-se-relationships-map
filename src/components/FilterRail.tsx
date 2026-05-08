import { useStore } from "../store";
import type { LoadBucket } from "../data/types";

export function FilterRail() {
  const model = useStore((s) => s.model);
  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const reset = useStore((s) => s.resetFilters);
  if (!model) return null;

  return (
    <aside className="filter-rail" aria-label="Filters">
      <h3>Refine</h3>

      <Select
        label="Segment"
        value={filters.segment}
        options={model.segments}
        onChange={(v) => setFilters({ segment: v })}
      />
      <Select
        label="Manager"
        value={filters.manager}
        options={model.managers}
        onChange={(v) => setFilters({ manager: v })}
      />
      <Select
        label="Role type"
        value={filters.roleType}
        options={model.roleTypes}
        onChange={(v) => setFilters({ roleType: v })}
      />
      {model.hasSpecializationData && (
        <Select
          label="Specialization"
          value={filters.specialization}
          options={model.specializations}
          onChange={(v) => setFilters({ specialization: v })}
        />
      )}
      {model.rampStatuses.length > 0 && (
        <Select
          label="Ramp status"
          value={filters.rampStatus}
          options={model.rampStatuses}
          onChange={(v) => setFilters({ rampStatus: v })}
        />
      )}
      {model.hasCoverageData && (
        <>
          <div className="filter-row">
            <label>Load</label>
            <div className="tri-toggle">
              {(["overloaded", "balanced", "slack"] as LoadBucket[]).map((b) => (
                <button
                  key={b}
                  className={"tri-btn" + (filters.loadBucket === b ? " active" : "")}
                  onClick={() => setFilters({ loadBucket: filters.loadBucket === b ? null : b })}
                  type="button"
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
          <Tri
            label="Has Primary"
            value={filters.hasPrimary}
            onChange={(v) => setFilters({ hasPrimary: v })}
          />
          <Tri
            label="Has Backup"
            value={filters.hasBackup}
            onChange={(v) => setFilters({ hasBackup: v })}
          />
        </>
      )}

      <button className="filter-clear" onClick={reset}>
        Reset all filters
      </button>
    </aside>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: string[];
  onChange: (v: string | null) => void;
}) {
  return (
    <div className="filter-row">
      <label>{label}</label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function Tri({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  return (
    <div className="filter-row">
      <label>{label}</label>
      <div className="tri-toggle">
        <button
          className={"tri-btn" + (value === null ? " active" : "")}
          onClick={() => onChange(null)}
          type="button"
        >
          Any
        </button>
        <button
          className={"tri-btn" + (value === true ? " active" : "")}
          onClick={() => onChange(true)}
          type="button"
        >
          Yes
        </button>
        <button
          className={"tri-btn" + (value === false ? " active" : "")}
          onClick={() => onChange(false)}
          type="button"
        >
          No
        </button>
      </div>
    </div>
  );
}
