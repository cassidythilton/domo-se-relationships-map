import { create } from "zustand";
import type {
  DerivedModel,
  Density,
  Filters,
  Person,
  RawPerson,
  ViewKey,
} from "../data/types";
import { EMPTY_FILTERS } from "../data/types";
import { normalize } from "../data/normalize";
import { VIEW_BY_KEY } from "../config";
import type { DealsSnapshot } from "../data/deals";
import type { WindowKey } from "../data/fiscal";
import { DEFAULT_WINDOW } from "../data/fiscal";

export type State = {
  rawRows: RawPerson[] | null;
  model: DerivedModel | null;
  loadError: string | null;
  view: ViewKey;
  density: Density;
  filters: Filters;
  selectedPersonId: string | null;
  selectedPod: string | null;
  searchOpen: boolean;
  filterRailOpen: boolean;
  // Deals layer (loaded after roster)
  dealsWindow: WindowKey;
  deals: DealsSnapshot | null;
  dealsLoading: boolean;
  dealsError: string | null;
};

export type Actions = {
  setRows: (rows: RawPerson[]) => void;
  setError: (msg: string) => void;
  setView: (v: ViewKey) => void;
  setDensity: (d: Density) => void;
  setFilters: (patch: Partial<Filters>) => void;
  resetFilters: () => void;
  selectPerson: (id: string | null) => void;
  selectPod: (pod: string | null) => void;
  setSearchOpen: (open: boolean) => void;
  toggleFilterRail: () => void;
  applyUrl: (params: URLSearchParams) => void;
  setDealsWindow: (w: WindowKey) => void;
  setDeals: (snap: DealsSnapshot) => void;
  setDealsLoading: (loading: boolean) => void;
  setDealsError: (msg: string | null) => void;
};

export const useStore = create<State & Actions>((set) => ({
  rawRows: null,
  model: null,
  loadError: null,
  view: "scOrg",
  density: 1,
  filters: { ...EMPTY_FILTERS },
  selectedPersonId: null,
  selectedPod: null,
  searchOpen: false,
  filterRailOpen: false,
  dealsWindow: DEFAULT_WINDOW,
  deals: null,
  dealsLoading: false,
  dealsError: null,

  setRows: (rows) =>
    set(() => ({
      rawRows: rows,
      model: normalize(rows),
      loadError: null,
    })),
  setError: (msg) => set(() => ({ loadError: msg })),
  setView: (v) =>
    set(() => {
      const cfg = VIEW_BY_KEY.get(v);
      return {
        view: v,
        density: cfg?.defaultDensity ?? 1,
        selectedPod: null,
      };
    }),
  setDensity: (d) => set(() => ({ density: d })),
  setFilters: (patch) =>
    set((s) => ({ filters: { ...s.filters, ...patch } })),
  resetFilters: () => set(() => ({ filters: { ...EMPTY_FILTERS } })),
  selectPerson: (id) => set(() => ({ selectedPersonId: id })),
  selectPod: (pod) => set(() => ({ selectedPod: pod })),
  setSearchOpen: (open) => set(() => ({ searchOpen: open })),
  toggleFilterRail: () => set((s) => ({ filterRailOpen: !s.filterRailOpen })),
  setDealsWindow: (w) => set(() => ({ dealsWindow: w, deals: null })),
  setDeals: (snap) => set(() => ({ deals: snap, dealsLoading: false, dealsError: null })),
  setDealsLoading: (loading) => set(() => ({ dealsLoading: loading })),
  setDealsError: (msg) => set(() => ({ dealsError: msg, dealsLoading: false })),

  applyUrl: (params) =>
    set((s) => {
      const view = (params.get("view") as ViewKey) || s.view;
      const density = (Number(params.get("d")) || s.density) as Density;
      const cfg = VIEW_BY_KEY.get(view);
      const finalDensity = (cfg?.densities.includes(density) ? density : cfg?.defaultDensity ?? 1) as Density;
      const filters: Filters = {
        ...EMPTY_FILTERS,
        segment: params.get("seg") || null,
        manager: params.get("mgr") || null,
        roleType: params.get("role") || null,
        specialization: params.get("spec") || null,
        rampStatus: params.get("ramp") || null,
        loadBucket: (params.get("load") as Filters["loadBucket"]) || null,
        hasPrimary: parseTri(params.get("p")),
        hasBackup: parseTri(params.get("b")),
        search: params.get("q") || "",
      };
      return {
        view,
        density: finalDensity,
        filters,
        selectedPersonId: params.get("person") || null,
        selectedPod: params.get("pod") || null,
      };
    }),
}));

function parseTri(v: string | null): boolean | null {
  if (v === "1") return true;
  if (v === "0") return false;
  return null;
}

// Derived helper hooks.
export function usePerson(id: string | null): Person | null {
  return useStore((s) => (id && s.model ? s.model.byId.get(id) ?? null : null));
}
