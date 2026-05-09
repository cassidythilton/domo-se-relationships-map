import { useEffect } from "react";
import { useStore } from "./store";
import { useUrlSync } from "./store/url";
import { loadPeople } from "./data/load";
import { loadDealsSnapshot } from "./data/deals";
import { dateRangeFor } from "./data/fiscal";
import { VIEWS, VIEW_BY_KEY } from "./config";
import { Tabs } from "./components/Tabs";
import { DetailToggle } from "./components/DetailToggle";
import { KpiStrip } from "./components/KpiStrip";
import { FilterRail } from "./components/FilterRail";
import { Search } from "./components/Search";
import { PersonDrawer } from "./components/PersonDrawer";
import { WindowPicker } from "./components/WindowPicker";
import { OrgChart } from "./views/OrgChart";
import { CoverageMatrix } from "./views/CoverageMatrix";
import { ReverseCoverage } from "./views/ReverseCoverage";
import { SpecialistMap } from "./views/SpecialistMap";
import { CapacityLoad } from "./views/CapacityLoad";
import { Discrepancies } from "./views/Discrepancies";
import { Roadmap } from "./views/Roadmap";

const VIEW_DESCRIPTIONS: Record<string, string> = {
  scOrg: "Solutions Consulting org chart with manager hierarchy.",
  corpNL: "Asserted coverage matrix for the Corporate New Logo segment.",
  corpUpsell: "Asserted coverage matrix for the Corporate Upsell segment.",
  ent: "Asserted coverage matrix for the Enterprise segment.",
  reverse: "Pick a pod to see every SC covering it, plus the management chain.",
  specialist: "Pod × specialization heatmap. Cells highlight uncovered specializations.",
  capacity: "Per-SC load with target lines. Red = overloaded, grey = slack.",
  discrepancies: "Where the asserted roster differs from observed Salesforce activity (NAM only).",
  roadmap: "What's intentionally not yet built, and what's coming next.",
};

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
  const dealsWindow = useStore((s) => s.dealsWindow);
  const setDeals = useStore((s) => s.setDeals);
  const setDealsLoading = useStore((s) => s.setDealsLoading);
  const setDealsError = useStore((s) => s.setDealsError);

  useUrlSync();

  useEffect(() => {
    loadPeople()
      .then(setRows)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [setRows, setError]);

  // Lazy-load deals snapshot whenever the window changes.
  useEffect(() => {
    let cancelled = false;
    setDealsLoading(true);
    const range = dateRangeFor(dealsWindow);
    loadDealsSnapshot(range)
      .then((snap) => { if (!cancelled) setDeals(snap); })
      .catch((e: unknown) => {
        if (!cancelled) setDealsError(e instanceof Error ? e.message : String(e));
      });
    return () => { cancelled = true; };
  }, [dealsWindow, setDeals, setDealsError, setDealsLoading]);

  const cfg = VIEW_BY_KEY.get(view);
  const subtitle = VIEW_DESCRIPTIONS[view] ?? "";

  useEffect(() => {
    if (!cfg) return;
    if (cfg.group === "segment" && cfg.segmentFilter) {
      if (filters.segment !== cfg.segmentFilter) setFilters({ segment: cfg.segmentFilter });
    }
  }, [view, cfg, filters.segment, setFilters]);

  if (error) {
    return (
      <div className="state state-error">
        <div>
          <h2>Couldn't load Sales Org data</h2>
          <pre>{error}</pre>
        </div>
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
        <div className="app-header-left">
          <h1 className="app-title">Sales Org Visualizer</h1>
          <p className="app-subtitle">{subtitle}</p>
        </div>
        <div className="app-header-actions">
          <button
            className="btn"
            onClick={() => setSearchOpen(true)}
            title="Search (⌘K)"
            type="button"
          >
            <span>Search</span>
            <span className="kbd">⌘K</span>
          </button>
        </div>
      </header>

      <div className="tab-bar">
        <Tabs views={VIEWS} active={view} onChange={setView} />
      </div>

      <KpiStrip />

      <div className="toolbar">
        <div className="toolbar-left">
          <button
            className={"btn" + (railOpen ? " btn-active" : "")}
            onClick={toggleRail}
            aria-pressed={railOpen}
            type="button"
          >
            Filters {activeFilterCount > 0 && <span className="kbd" style={{ marginLeft: 4 }}>{activeFilterCount}</span>}
          </button>
          {filters.search && (
            <span className="filter-summary">
              search: "{filters.search}"
              <button onClick={() => setFilters({ search: "" })} aria-label="Clear search">×</button>
            </span>
          )}
        </div>
        <div className="toolbar-right">
          <WindowPicker />
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
    case "discrepancies":
      return <Discrepancies />;
    case "roadmap":
      return <Roadmap />;
    default:
      return null;
  }
}
