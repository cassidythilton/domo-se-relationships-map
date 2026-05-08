import palettes from "./palettes.json";
import views from "./views.json";
import type { Density, ViewConfigEntry, ViewKey } from "../data/types";

type Palettes = {
  managers: Record<string, { accent: string }>;
  pods: Record<string, { accent: string }>;
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

// Hash a string to a stable hue so unknown keys get a deterministic
// (and tasteful) cool-family color. Keeps the new manager/pod palette
// extensible without code changes.
function hashHue(key: string, base = 200, span = 80): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return base + (Math.abs(h) % span);
}

/**
 * Accent color used for left borders, dots, and small color hints.
 * For known managers/pods we read from palettes.json. Unknown names
 * fall back to a hashed cool-family OKLCH so the design stays cohesive.
 */
export function podAccent(name: string): string {
  return PALETTES.pods[name]?.accent ?? `oklch(0.63 0.10 ${hashHue(name)})`;
}

export function managerAccent(name: string): string {
  return PALETTES.managers[name]?.accent ?? `oklch(0.63 0.10 ${hashHue(name)})`;
}

export function roleAccent(roleType: string): string {
  return PALETTES.roleTypes[roleType] ?? `oklch(0.55 0.07 ${hashHue(roleType, 220, 60)})`;
}

/**
 * Soft tint of a pod color for backgrounds. Brings any oklch() down to
 * a near-white tint while preserving hue family.
 */
export function softTint(oklchColor: string, lightness = 0.96, chroma = 0.025): string {
  // Extract the H from "oklch(L C H)" or "oklch(L C H / A)"
  const m = oklchColor.match(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)/i);
  const hue = m ? m[1] : "240";
  return `oklch(${lightness} ${chroma} ${hue})`;
}

/** Extract just the hue from an oklch() string, defaulting to a cool blue. */
export function hueOf(oklchColor: string, fallback = 240): number {
  const m = oklchColor.match(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)/i);
  return m ? Number(m[1]) : fallback;
}
