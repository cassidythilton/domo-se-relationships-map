import { useEffect } from "react";
import type { State } from "./index";
import { useStore } from "./index";

const KEYS = [
  "view",
  "d",
  "seg",
  "mgr",
  "role",
  "spec",
  "ramp",
  "load",
  "p",
  "b",
  "q",
  "person",
  "pod",
];

function buildParams(s: State): URLSearchParams {
  const p = new URLSearchParams();
  if (s.view) p.set("view", s.view);
  if (s.density && s.density !== 1) p.set("d", String(s.density));
  if (s.filters.segment) p.set("seg", s.filters.segment);
  if (s.filters.manager) p.set("mgr", s.filters.manager);
  if (s.filters.roleType) p.set("role", s.filters.roleType);
  if (s.filters.specialization) p.set("spec", s.filters.specialization);
  if (s.filters.rampStatus) p.set("ramp", s.filters.rampStatus);
  if (s.filters.loadBucket) p.set("load", s.filters.loadBucket);
  if (s.filters.hasPrimary !== null) p.set("p", s.filters.hasPrimary ? "1" : "0");
  if (s.filters.hasBackup !== null) p.set("b", s.filters.hasBackup ? "1" : "0");
  if (s.filters.search) p.set("q", s.filters.search);
  if (s.selectedPersonId) p.set("person", s.selectedPersonId);
  if (s.selectedPod) p.set("pod", s.selectedPod);
  return p;
}

export function useUrlSync(): void {
  const apply = useStore((s) => s.applyUrl);

  // On first mount, hydrate state from URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if ([...params.keys()].some((k) => KEYS.includes(k))) {
      apply(params);
    }
  }, [apply]);

  // Subscribe and write URL on changes.
  useEffect(() => {
    return useStore.subscribe((s) => {
      const params = buildParams(s);
      const next = "#" + params.toString();
      if (window.location.hash !== next) {
        window.history.replaceState(null, "", next);
      }
    });
  }, []);
}
