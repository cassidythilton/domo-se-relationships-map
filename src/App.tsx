import { useEffect } from "react";
import { useStore } from "./store";
import { useUrlSync } from "./store/url";
import { loadPeople } from "./data/load";
import { VIEWS, VIEW_BY_KEY } from "./config";
import { Tabs } from "./components/Tabs";
import { DetailToggle } from "./components/DetailToggle";
import { KpiStrip } from "./components/KpiStrip";
import { FilterRail } from "./components/FilterRail";
import { Search } from "./components/Search";
import { PersonDrawer } from "./components/PersonDrawer";
import { OrgChart } from "./views/OrgChart";
import { CoverageMatrix } from "./views/CoverageMatrix";
import { ReverseCoverage } from "./views/ReverseCoverage";
import { SpecialistMap } from "./views/SpecialistMap";
import { CapacityLoad } from "./views/CapacityLoad";
import { Roadmap } from "./views/Roadmap";

export function App() {
  const setRows = useStore((s) => s.setRows);
  const setError = useStore((s) => s.setError);
  const error = useStore((s) => s.loadError);
  const model = useStore((s) => s.model);
  const view = useStore((s) => s.view);
  const density = useStore((s) => s.density);
  const setView = useStore((s) => s.setView);
  const setDensity = useStore((s) => s.setDensity);
  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const railOpen = useStore((s) => s.filterRailOpen);
  const toggleRail = useStore((s) => s.toggleFilterRail);
  const setSearchOpen = useStore((s) => s.setSearchOpen);

  useUrlSync();

  useEffect(() => {
    loadPeople()
      .then(setRows)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [setRows, setError]);

  const cfg = VIEW_BY_KEY.get(view);

  // When the view is a segment view, automatically apply that segment as a filter
  // for the KPI strip / shared model. Analytics views show the full picture.
  useEffect(() => {
    if (!cfg) return;
    if (cfg.group === "segment" && cfg.segmentFilter) {
      if (filters.segment !== cfg.segmentFilter) setFilters({ segment: cfg.segmentFilter });
    }
  }, [view, cfg, filters.segment, setFilters]);

  if (error) {
    return (
      <div className="state state-error">
        <h2>Couldn't load Sales Org data</h2>
        <pre>{error}</pre>
      </div>
    );
  }
  if (!model) {
    return <div className="state state-loading">Loading…</div>;
  }

  const activeFilterCount = countActiveFilters();

  return (
    <div className="app">
      <header className="app-header">
        <h1>Sales Org Visualizer</h1>
        <Tabs views={VIEWS} active={view} onChange={setView} />
        <div className="app-header-actions">
          <button className="icon-btn" onClick={() => setSearchOpen(true)} title="Search (⌘K)">
            <span>Search</span>
            <span className="kbd">⌘K</span>
          </button>
        </div>
      </header>

      <KpiStrip />

      <div className="toolbar">
        <div className="toolbar-left">
          <button
            className={"icon-btn" + (railOpen ? " active" : "")}
            onClick={toggleRail}
            aria-pressed={railOpen}
          >
            Filters {activeFilterCount > 0 && `(${activeFilterCount})`}
          </button>
          {filters.search && (
            <span className="filter-summary">
              search: "{filters.search}"
              <button
                className="icon-btn"
                style={{ padding: "2px 6px" }}
                onClick={() => setFilters({ search: "" })}
              >
                ×
              </button>
            </span>
          )}
        </div>
        <div className="toolbar-right">
          {cfg && (
            <DetailToggle
              level={density}
              available={cfg.densities}
              onChange={setDensity}
            />
          )}
        </div>
      </div>

      <main className="canvas">
        {railOpen && <FilterRail />}
        <div className="canvas-main">{renderView(view)}</div>
      </main>

      <Search />
      <PersonDrawer />
    </div>
  );

  function countActiveFilters() {
    let n = 0;
    if (filters.segment) n++;
    if (filters.manager) n++;
    if (filters.roleType) n++;
    if (filters.specialization) n++;
    if (filters.rampStatus) n++;
    if (filters.loadBucket) n++;
    if (filters.hasPrimary !== null) n++;
    if (filters.hasBackup !== null) n++;
    return n;
  }
}

function renderView(view: string) {
  switch (view) {
    case "scOrg":
      return <OrgChart />;
    case "corpNL":
      return <CoverageMatrix segmentKey="Corp NL" />;
    case "corpUpsell":
      return <CoverageMatrix segmentKey="Corp Upsell" />;
    case "ent":
      return <CoverageMatrix segmentKey="ENT" />;
    case "reverse":
      return <ReverseCoverage />;
    case "specialist":
      return <SpecialistMap />;
    case "capacity":
      return <CapacityLoad />;
    case "roadmap":
      return <Roadmap />;
    default:
      return null;
  }
}
