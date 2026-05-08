import palettes from "./palettes.json";
import views from "./views.json";
import type { Density, ViewConfigEntry, ViewKey } from "../data/types";

type Palettes = {
  managers: Record<string, { bg: string; fg: string }>;
  l1: { bg: string; fg: string };
  pods: Record<string, string>;
  roleTypes: Record<string, string>;
};

export const PALETTES: Palettes = palettes as Palettes;

export const VIEWS: ViewConfigEntry[] = (views.views as Array<{
  key: string;
  label: string;
  group: string;
  segmentFilter?: string;
  defaultDensity: number;
  densities: number[];
}>).map((v) => ({
  key: v.key as ViewKey,
  label: v.label,
  group: v.group as ViewConfigEntry["group"],
  segmentFilter: v.segmentFilter,
  defaultDensity: v.defaultDensity as Density,
  densities: v.densities as Density[],
}));

export const VIEW_BY_KEY: Map<ViewKey, ViewConfigEntry> = new Map(
  VIEWS.map((v) => [v.key, v]),
);

// Hash-based fallback color so unknown keys never break the UI.
function hashColor(key: string, lightness = 80): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 55%, ${lightness}%)`;
}

export function podColor(name: string): string {
  return PALETTES.pods[name] ?? hashColor(name, 86);
}

export function managerColor(name: string): { bg: string; fg: string } {
  return PALETTES.managers[name] ?? { bg: hashColor(name, 60), fg: "#FFFFFF" };
}

export function roleColor(roleType: string): string {
  return PALETTES.roleTypes[roleType] ?? hashColor(roleType, 78);
}

export function readableTextOn(bg: string): string {
  // Works for hex; for hsl() fall back to dark.
  if (!bg.startsWith("#")) return "#222";
  const t = bg.replace("#", "");
  const r = parseInt(t.slice(0, 2), 16);
  const g = parseInt(t.slice(2, 4), 16);
  const b = parseInt(t.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? "#222" : "#fff";
}

export function tint(hex: string, amount: number): string {
  if (!hex.startsWith("#")) return hex;
  const t = hex.replace("#", "");
  const r = parseInt(t.slice(0, 2), 16);
  const g = parseInt(t.slice(2, 4), 16);
  const b = parseInt(t.slice(4, 6), 16);
  const lift = (n: number) => Math.round(n + (255 - n) * amount);
  const hex2 = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hex2(lift(r))}${hex2(lift(g))}${hex2(lift(b))}`;
}

export function rgba(hex: string, alpha: number): string {
  if (!hex.startsWith("#")) return hex;
  const t = hex.replace("#", "");
  const r = parseInt(t.slice(0, 2), 16);
  const g = parseInt(t.slice(2, 4), 16);
  const b = parseInt(t.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
