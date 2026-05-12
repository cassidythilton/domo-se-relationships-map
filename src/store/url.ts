import { useEffect, useRef } from "react";
import type { State } from "./index";
import { useStore } from "./index";

const KEYS = ["view", "seg", "role", "avp", "rvp", "se", "q", "person"];

function buildParams(s: State): URLSearchParams {
  const p = new URLSearchParams();
  if (s.view) p.set("view", s.view);
  if (s.filters.segment) p.set("seg", s.filters.segment);
  if (s.filters.roleType) p.set("role", s.filters.roleType);
  if (s.filters.avp) p.set("avp", s.filters.avp);
  if (s.filters.rvpId) p.set("rvp", s.filters.rvpId);
  if (s.filters.seId) p.set("se", s.filters.seId);
  if (s.filters.search) p.set("q", s.filters.search);
  if (s.selection?.kind === "person") p.set("person", s.selection.id);
  if (s.selection?.kind === "rvp") p.set("rvp", s.selection.id);
  if (s.selection?.kind === "avp") p.set("avp", s.selection.name);
  return p;
}

/**
 * A navigation key captures the parts of state that constitute a real
 * "screen" the user might want to revisit via browser back/forward:
 *   - the active lens/view
 *   - the selected entity (person / rvp / avp / segment)
 *
 * Other state changes (filters, search, drawer toggling) are incidental
 * and update the URL via replaceState rather than pushing a new history
 * entry. That way the browser back button always feels meaningful.
 */
function navigationKey(s: State): string {
  const sel = s.selection;
  let selKey = "none";
  if (sel?.kind === "person") selKey = `person:${sel.id}`;
  else if (sel?.kind === "rvp") selKey = `rvp:${sel.id}`;
  else if (sel?.kind === "avp") selKey = `avp:${sel.name}`;
  else if (sel?.kind === "segment") selKey = `seg:${sel.segment}`;
  return `${s.view}|${selKey}`;
}

export function useUrlSync(): void {
  const apply = useStore((s) => s.applyUrl);
  const lastNav = useRef<string | null>(null);
  const programmatic = useRef<boolean>(false);

  // Hydrate from URL on mount + react to browser back / forward.
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if ([...params.keys()].some((k) => KEYS.includes(k))) {
      apply(params);
    }
    lastNav.current = navigationKey(useStore.getState());

    function onPop() {
      programmatic.current = true;
      const p = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      apply(p);
      lastNav.current = navigationKey(useStore.getState());
      programmatic.current = false;
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [apply]);

  // Keep the URL in sync with state changes. Push history on navigations,
  // replace on everything else.
  useEffect(() => {
    return useStore.subscribe((s) => {
      if (programmatic.current) return; // popstate is reading state into URL
      const next = "#" + buildParams(s).toString();
      if (window.location.hash === next) return;

      const navNow = navigationKey(s);
      if (navNow !== lastNav.current) {
        window.history.pushState(null, "", next);
        lastNav.current = navNow;
      } else {
        window.history.replaceState(null, "", next);
      }
    });
  }, []);
}
