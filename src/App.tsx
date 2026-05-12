import { useEffect } from "react";
import { useStore } from "./store";
import { useUrlSync } from "./store/url";
import { loadPeople } from "./data/load";
import { loadDealsSnapshot } from "./data/deals";
import {
  displayNameFromDirectory,
  ensureProfilesLoaded,
  hasManagerData,
  managerOf,
} from "./data/profiles";
import { setProfilesAdapter } from "./store/selectors";
import { setDirectoryResolver } from "./data/normalize";
import { dateRangeFor } from "./data/fiscal";
import { VIEWS, VIEW_BY_KEY } from "./config";
import { Tabs } from "./components/Tabs";
import { KpiStrip } from "./components/KpiStrip";
import { FilterRail } from "./components/FilterRail";
import { Search } from "./components/Search";
import { PersonDrawer } from "./components/PersonDrawer";
import { Overview } from "./views/Overview";
import { SegmentMatrix } from "./views/SegmentMatrix";
import { Discrepancies } from "./views/Discrepancies";
import { Focus } from "./views/Focus";
import { Settings } from "./views/Settings";
import { loadAllConfig, getSnapshot, subscribe } from "./data/appdb";
import { EMPTY_SETTINGS } from "./data/types";
import type { Settings as SettingsT } from "./data/types";

const VIEW_DESCRIPTIONS: Record<string, string> = {
  fullOrg: "Three live perspectives — full org, SE-centric, AE-centric — that stay linked as you click.",
  focus: "Pick anyone — the canvas reframes around them with the right geometry.",
  corpNL: "Corp New Logo coverage matrix — RVPs across, SEs down, AEs in cells.",
  corpUpsell: "Corp Upsell coverage matrix — RVPs across, SEs down, AEs in cells.",
  ent: "Enterprise / SR Corp coverage matrix — RVPs across, SEs down, AEs in cells.",
  discrepancies: "Where the asserted roster differs from observed deal activity.",
  settings: "Capacity targets, AVP overrides, and source-data wiring — persisted to AppDB.",
};

export function App() {
  const setRows = useStore((s) => s.setRows);
  const setError = useStore((s) => s.setError);
  const error = useStore((s) => s.loadError);
  const model = useStore((s) => s.model);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const filters = useStore((s) => s.filters);
  const setFilters = useStore((s) => s.setFilters);
  const railOpen = useStore((s) => s.filterRailOpen);
  const toggleRail = useStore((s) => s.toggleFilterRail);
  const setSearchOpen = useStore((s) => s.setSearchOpen);
  const dealsWindow = useStore((s) => s.dealsWindow);
  const setDeals = useStore((s) => s.setDeals);
  const setDealsLoading = useStore((s) => s.setDealsLoading);
  const setDealsError = useStore((s) => s.setDealsError);

  // Deals snapshot powers Discrepancies, the Solutions Architect overlay in
  // Overview / Focus, and any segment-matrix annotations. Load it as soon
  // as the user lands on any of those.
  const dealsNeeded =
    view === "discrepancies" ||
    view === "fullOrg" ||
    view === "focus" ||
    view === "corpNL" ||
    view === "corpUpsell" ||
    view === "ent";

  useUrlSync();

  useEffect(() => {
    loadPeople()
      .then(setRows)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [setRows, setError]);

  // Kick the profile dataset early so the first render has photos, the
  // live AVP suggestions show up in Discrepancies, and abbreviated CSV
  // names ("Mike N") resolve to full directory names ("Mike Newcomb").
  const refreshModel = useStore((s) => s.refreshModel);
  useEffect(() => {
    setProfilesAdapter({ managerOf, hasManagerData });
    setDirectoryResolver(displayNameFromDirectory);
    ensureProfilesLoaded().then(() => {
      // After the directory loads, re-normalize so any names that fell
      // through the static nameMap get the directory's full names too.
      refreshModel();
    });
    return () => {
      setProfilesAdapter(null);
      setDirectoryResolver(null);
    };
  }, [refreshModel]);

  // Hydrate settings from AppDB on mount and subscribe to live updates so
  // saves from the Settings tab take effect everywhere immediately.
  const setSettings = useStore((s) => s.setSettings);
  const setSettingsLoaded = useStore((s) => s.setSettingsLoaded);
  const setSettingsError = useStore((s) => s.setSettingsError);
  const setViewAction = useStore((s) => s.setView);
  const setDealsWindowAction = useStore((s) => s.setDealsWindow);
  useEffect(() => {
    function applySnapshot() {
      const snap = getSnapshot();
      const next: SettingsT = {
        capacityTargets: { ...EMPTY_SETTINGS.capacityTargets },
        avpOverrides: {},
        defaults: { ...EMPTY_SETTINGS.defaults },
      };
      if (snap.capacityTargets?.value) {
        next.capacityTargets = {
          ...next.capacityTargets,
          ...snap.capacityTargets.value,
        };
      }
      if (snap.avpOverrides?.value) {
        next.avpOverrides = { ...snap.avpOverrides.value };
      }
      if (snap.defaults?.value) {
        next.defaults = { ...next.defaults, ...(snap.defaults.value as Record<string, never>) };
      }
      setSettings(next);
      setSettingsLoaded(snap.ready);
      setSettingsError(snap.error);
    }
    let firstLoad = true;
    function applyAndMaybeRoute() {
      applySnapshot();
      if (firstLoad) {
        firstLoad = false;
        // Honor `defaults.landingLens` only if the URL didn’t already pin
        // a different view (URL sync runs before this).
        const params = new URLSearchParams(
          window.location.hash.replace(/^#/, ""),
        );
        const snap = getSnapshot();
        const landing = snap.defaults?.value?.landingLens as
          | string
          | undefined;
        if (landing && !params.get("view")) {
          setViewAction(landing as Parameters<typeof setViewAction>[0]);
        }
        const dealsWin = snap.defaults?.value?.dealsWindow as
          | string
          | undefined;
        if (dealsWin) {
          setDealsWindowAction(dealsWin as Parameters<typeof setDealsWindowAction>[0]);
        }
      }
    }
    loadAllConfig().then(applyAndMaybeRoute);
    const unsubscribe = subscribe(applySnapshot);
    return () => unsubscribe();
  }, [setSettings, setSettingsLoaded, setSettingsError, setViewAction, setDealsWindowAction]);

  // Lazy-load deals snapshot only when (a) the user is on the Discrepancies
  // lens and (b) the window changes. Other lenses don’t need it.
  useEffect(() => {
    if (!dealsNeeded) return;
    let cancelled = false;
    setDealsLoading(true);
    const range = dateRangeFor(dealsWindow);
    loadDealsSnapshot(range)
      .then((snap) => { if (!cancelled) setDeals(snap); })
      .catch((e: unknown) => {
        if (!cancelled) setDealsError(e instanceof Error ? e.message : String(e));
      });
    return () => { cancelled = true; };
  }, [dealsNeeded, dealsWindow, setDeals, setDealsError, setDealsLoading]);

  const cfg = VIEW_BY_KEY.get(view);
  const subtitle = VIEW_DESCRIPTIONS[view] ?? "";

  // Auto-apply the segment filter when the user lands on a segment lens
  // (handles URL hydration where view changed but filters didn't).
  useEffect(() => {
    if (!cfg) return;
    if (cfg.group === "segment" && cfg.segmentFilter) {
      if (filters.segment !== cfg.segmentFilter) setFilters({ segment: cfg.segmentFilter });
    }
  }, [view, cfg, filters.segment, setFilters]);

  // Global Escape: clear selection when no modal is open. Search and
  // PersonDrawer manage their own Escape handling; we only run if both
  // are closed and there's something selected to clear.
  const selection = useStore((s) => s.selection);
  const drawerOpen = useStore((s) => s.drawerOpen);
  const searchOpen = useStore((s) => s.searchOpen);
  const selectPerson = useStore((s) => s.selectPerson);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (drawerOpen || searchOpen) return;
      if (selection) {
        e.preventDefault();
        selectPerson(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen, searchOpen, selection, selectPerson]);

  // Resolve the selected person's display name for the toolbar pill.
  const selectedPerson =
    selection?.kind === "person" && model
      ? model.byId.get(selection.id) ?? null
      : null;

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
          <p className="app-subtitle">SE / SA ↔ AE relationships</p>
        </div>
        <div className="app-header-actions">
          <button
            className="btn"
            onClick={() => setSearchOpen(true)}
            title="Search (⌘K)"
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <line x1="9" y1="9" x2="13" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span>Search</span>
            <span className="kbd">⌘K</span>
          </button>
        </div>
      </header>

      <KpiStrip />

      <div className="lens-bar">
        <Tabs views={VIEWS} active={view} onChange={setView} />
      </div>

      <div className="toolbar">
        <div className="toolbar-left">
          <button
            className="btn btn-icon"
            onClick={() => window.history.back()}
            title="Back (browser history)"
            aria-label="Back"
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M8.5 2.5 4 7l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            className={"btn" + (railOpen ? " btn-active" : "")}
            onClick={toggleRail}
            aria-pressed={railOpen}
            type="button"
          >
            Filters
            {activeFilterCount > 0 && (
              <span className="kbd" style={{ marginLeft: 4 }}>{activeFilterCount}</span>
            )}
          </button>
          {selectedPerson && (
            <span className="selection-pill" title="Clear selection (Esc)">
              <span className="selection-pill-label">Selected</span>
              <span className="selection-pill-name">{selectedPerson.displayName}</span>
              <button
                onClick={() => selectPerson(null)}
                aria-label="Clear selection"
                type="button"
              >
                ×
              </button>
            </span>
          )}
          {filters.search && (
            <span className="filter-summary">
              search: "{filters.search}"
              <button onClick={() => setFilters({ search: "" })} aria-label="Clear search">×</button>
            </span>
          )}
          {subtitle && <span className="lens-description">{subtitle}</span>}
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
    if (filters.roleType) n++;
    if (filters.avp) n++;
    if (filters.rvpId) n++;
    if (filters.seId) n++;
    return n;
  }
}

function renderView(view: string) {
  switch (view) {
    case "fullOrg":
      return <Overview />;
    case "focus":
      return <Focus />;
    case "corpNL":
      return <SegmentMatrix segmentKey="Corp NL" />;
    case "corpUpsell":
      return <SegmentMatrix segmentKey="Corp Upsell" />;
    case "ent":
      return <SegmentMatrix segmentKey="ENT" />;
    case "discrepancies":
      return <Discrepancies />;
    case "settings":
      return <Settings />;
    default:
      return null;
  }
}
