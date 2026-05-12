import { useStore } from "../store";
import { ROLE_TYPE_KEYS } from "../store/selectors";
import type { AeRoleType, SegmentKey } from "../data/types";

const SEGMENT_OPTIONS: SegmentKey[] = ["Corp NL", "Corp Upsell", "ENT"];

export function FilterRail() {
  const model = useStore((s) => s.model);
  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const reset = useStore((s) => s.resetFilters);
  if (!model) return null;

  return (
    <aside className="filter-rail" aria-label="Filters">
      <h3>Refine</h3>

      <FilterGroup label="Segment">
        <ChipToggle
          active={filters.segment === null}
          onClick={() => setFilters({ segment: null })}
          tone="neutral"
        >
          All
        </ChipToggle>
        {SEGMENT_OPTIONS.map((s) => (
          <ChipToggle
            key={s}
            active={filters.segment === s}
            onClick={() => setFilters({ segment: filters.segment === s ? null : s })}
            tone="segment"
          >
            {s}
          </ChipToggle>
        ))}
      </FilterGroup>

      <FilterGroup label="AE role-type">
        <ChipToggle
          active={filters.roleType === null}
          onClick={() => setFilters({ roleType: null })}
          tone="neutral"
        >
          All
        </ChipToggle>
        {ROLE_TYPE_KEYS.map((rt) => (
          <ChipToggle
            key={rt}
            active={filters.roleType === rt}
            onClick={() =>
              setFilters({ roleType: filters.roleType === rt ? null : (rt as AeRoleType) })
            }
            tone="role"
            roleType={rt}
          >
            {rt}
          </ChipToggle>
        ))}
      </FilterGroup>

      {model.avps.length > 0 && (
        <FilterGroup label="AVP">
          <ChipToggle
            active={filters.avp === null}
            onClick={() => setFilters({ avp: null })}
            tone="neutral"
          >
            All
          </ChipToggle>
          {model.avps.map((a) => (
            <ChipToggle
              key={a}
              active={filters.avp === a}
              onClick={() => setFilters({ avp: filters.avp === a ? null : a })}
              tone="neutral"
            >
              {a}
            </ChipToggle>
          ))}
        </FilterGroup>
      )}

      <button className="filter-clear" onClick={reset} type="button">
        Reset all filters
      </button>
    </aside>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="filter-group">
      <div className="filter-group-label">{label}</div>
      <div className="filter-chip-row">{children}</div>
    </div>
  );
}

function ChipToggle({
  active,
  onClick,
  children,
  tone,
  roleType,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone: "neutral" | "segment" | "role";
  roleType?: string;
}) {
  return (
    <button
      type="button"
      className={`filter-chip filter-chip-${tone}${active ? " filter-chip-active" : ""}`}
      data-role-type={roleType}
      onClick={onClick}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}
