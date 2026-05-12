import { create } from "zustand";
import type {
  DerivedModel,
  Density,
  Filters,
  LensKey,
  Person,
  RawPerson,
  Selection,
  Settings,
  ViewKey,
} from "../data/types";
import { EMPTY_FILTERS, EMPTY_SETTINGS } from "../data/types";
import { normalize } from "../data/normalize";
import { VIEW_BY_KEY } from "../config";
import type { DealsSnapshot } from "../data/deals";
import type { WindowKey } from "../data/fiscal";
import { DEFAULT_WINDOW } from "../data/fiscal";

export type State = {
  rawRows: RawPerson[] | null;
  model: DerivedModel | null;
  loadError: string | null;
  view: LensKey;
  density: Density;
  filters: Filters;
  selection: Selection;
  searchOpen: boolean;
  filterRailOpen: boolean;
  drawerOpen: boolean;
  // Deals layer (loaded after roster)
  dealsWindow: WindowKey;
  deals: DealsSnapshot | null;
  dealsLoading: boolean;
  dealsError: string | null;
  // Settings (persisted to AppDB SovConfig)
  settings: Settings;
  settingsLoaded: boolean;
  settingsError: string | null;
  settingsSaving: boolean;
};

export type Actions = {
  setRows: (rows: RawPerson[]) => void;
  setError: (msg: string) => void;
  setView: (v: LensKey) => void;
  setDensity: (d: Density) => void;
  setFilters: (patch: Partial<Filters>) => void;
  resetFilters: () => void;
  selectPerson: (id: string | null) => void;
  setSelection: (sel: Selection) => void;
  /** Set selection + open the quick-info drawer. */
  openPersonDrawer: (id: string) => void;
  setDrawerOpen: (open: boolean) => void;
  /** Set selection + switch to the Focus lens. */
  focusOnPerson: (id: string) => void;
  setSearchOpen: (open: boolean) => void;
  toggleFilterRail: () => void;
  applyUrl: (params: URLSearchParams) => void;
  setDealsWindow: (w: WindowKey) => void;
  setDeals: (snap: DealsSnapshot) => void;
  setDealsLoading: (loading: boolean) => void;
  setDealsError: (msg: string | null) => void;
  /** Replace settings in memory (called after AppDB load or save). */
  setSettings: (s: Settings) => void;
  setSettingsLoaded: (loaded: boolean) => void;
  setSettingsError: (msg: string | null) => void;
  setSettingsSaving: (saving: boolean) => void;
  /** Re-normalize the model with the current settings applied. */
  refreshModel: () => void;
  /** Re-fetch the roster from AppDB (called after upload mutations). */
  reloadRosterFromAppDb: () => Promise<void>;
};

export const useStore = create<State & Actions>((set) => ({
  rawRows: null,
  model: null,
  loadError: null,
  view: "fullOrg",
  density: 1,
  filters: { ...EMPTY_FILTERS },
  selection: null,
  searchOpen: false,
  filterRailOpen: false,
  drawerOpen: false,
  dealsWindow: DEFAULT_WINDOW,
  deals: null,
  dealsLoading: false,
  dealsError: null,
  settings: { ...EMPTY_SETTINGS },
  settingsLoaded: false,
  settingsError: null,
  settingsSaving: false,

  setRows: (rows) =>
    set((s) => ({
      rawRows: rows,
      model: normalize(rows, s.settings),
      loadError: null,
    })),
  setError: (msg) => set(() => ({ loadError: msg })),
  setView: (v) =>
    set(() => {
      const cfg = VIEW_BY_KEY.get(v);
      const next: Partial<State> = {
        view: v,
        density: cfg?.defaultDensity ?? 1,
      };
      // Auto-apply segment filter for segment lenses
      if (cfg?.group === "segment" && cfg?.segmentFilter) {
        next.filters = { ...EMPTY_FILTERS, segment: cfg.segmentFilter };
      }
      return next as State;
    }),
  setDensity: (d) => set(() => ({ density: d })),
  setFilters: (patch) =>
    set((s) => ({ filters: { ...s.filters, ...patch } })),
  resetFilters: () => set(() => ({ filters: { ...EMPTY_FILTERS } })),
  selectPerson: (id) =>
    set(() => ({
      selection: id ? { kind: "person", id } : null,
      drawerOpen: id ? false : false,
    })),
  setSelection: (sel) => set(() => ({ selection: sel, drawerOpen: false })),
  openPersonDrawer: (id) =>
    set(() => ({
      selection: { kind: "person", id },
      drawerOpen: true,
    })),
  setDrawerOpen: (open) => set(() => ({ drawerOpen: open })),
  focusOnPerson: (id) =>
    set((s) => {
      const cfg = VIEW_BY_KEY.get("focus");
      return {
        selection: { kind: "person", id },
        view: "focus",
        density: cfg?.defaultDensity ?? s.density,
        drawerOpen: false,
      };
    }),
  setSearchOpen: (open) => set(() => ({ searchOpen: open })),
  toggleFilterRail: () => set((s) => ({ filterRailOpen: !s.filterRailOpen })),
  setDealsWindow: (w) => set(() => ({ dealsWindow: w, deals: null })),
  setDeals: (snap) => set(() => ({ deals: snap, dealsLoading: false, dealsError: null })),
  setDealsLoading: (loading) => set(() => ({ dealsLoading: loading })),
  setDealsError: (msg) => set(() => ({ dealsError: msg, dealsLoading: false })),
  setSettings: (s) =>
    set((state) => ({
      settings: s,
      // Re-normalize so AVP overrides take effect immediately
      model: state.rawRows ? normalize(state.rawRows, s) : state.model,
    })),
  setSettingsLoaded: (loaded) => set(() => ({ settingsLoaded: loaded })),
  setSettingsError: (msg) => set(() => ({ settingsError: msg })),
  setSettingsSaving: (saving) => set(() => ({ settingsSaving: saving })),
  refreshModel: () =>
    set((state) =>
      state.rawRows
        ? { model: normalize(state.rawRows, state.settings) }
        : {},
    ),
  reloadRosterFromAppDb: async () => {
    const mod = await import("../data/load");
    const rows = await mod.loadPeople();
    set((state) => ({
      rawRows: rows,
      model: normalize(rows, state.settings),
    }));
  },

  applyUrl: (params) =>
    set((s) => {
      const view = (params.get("view") as LensKey) || s.view;
      const cfg = VIEW_BY_KEY.get(view);
      const filters: Filters = {
        ...EMPTY_FILTERS,
        segment: (params.get("seg") as Filters["segment"]) || null,
        roleType: (params.get("role") as Filters["roleType"]) || null,
        avp: params.get("avp") || null,
        rvpId: params.get("rvp") || null,
        seId: params.get("se") || null,
        search: params.get("q") || "",
      };
      const personId = params.get("person");
      const rvpId = params.get("rvp");
      const avpName = params.get("avp");
      const sel: Selection = personId
        ? { kind: "person", id: personId }
        : rvpId
          ? { kind: "rvp", id: rvpId }
          : avpName
            ? { kind: "avp", name: avpName }
            : null;
      return {
        view,
        density: cfg?.defaultDensity ?? 1,
        filters,
        selection: sel,
      };
    }),
}));

function _selectPersonImpl(_state: State, _id: string | null) {
  // exported below for typing convenience
}
void _selectPersonImpl;

// Derived helper hooks.
export function usePerson(id: string | null): Person | null {
  return useStore((s) => (id && s.model ? s.model.byId.get(id) ?? null : null));
}

export function useSelectedPerson(): Person | null {
  return useStore((s) => {
    if (!s.model || !s.selection) return null;
    if (s.selection.kind === "person") return s.model.byId.get(s.selection.id) ?? null;
    return null;
  });
}

// Re-export ViewKey alias so existing imports still work
export type { ViewKey };
