import palettes from "./palettes.json" with { type: "json" };
import views from "./views.json" with { type: "json" };
import type {
  AeRoleType,
  Density,
  LensKey,
  SegmentKey,
  ViewConfigEntry,
} from "../data/types";

type RoleTypeStyle = { fill: string; border: string; text: string; dot: string };
type SegmentStyle = { accent: string; soft: string };
type ManagerStyle = { accent: string };

type Palettes = {
  brand: {
    primary: string;
    primaryHover: string;
    secondary: string;
    neutrals: string[];
    accents: string[];
  };
  roleTypes: Record<string, RoleTypeStyle>;
  segments: Record<string, SegmentStyle>;
  managers: Record<string, ManagerStyle>;
};

export const PALETTES: Palettes = palettes as unknown as Palettes;

export const VIEWS: ViewConfigEntry[] = (views.views as Array<{
  key: string;
  label: string;
  group: string;
  segmentFilter?: string;
  defaultDensity: number;
  densities: number[];
}>).map((v) => ({
  key: v.key as LensKey,
  label: v.label,
  group: v.group as ViewConfigEntry["group"],
  segmentFilter: v.segmentFilter as SegmentKey | undefined,
  defaultDensity: v.defaultDensity as Density,
  densities: v.densities as Density[],
}));

export const VIEW_BY_KEY: Map<LensKey, ViewConfigEntry> = new Map(
  VIEWS.map((v) => [v.key, v]),
);

const FALLBACK_ROLE_STYLE: RoleTypeStyle = {
  fill: "var(--surface-hover)",
  border: "var(--border-light)",
  text: "var(--text-secondary)",
  dot: "var(--text-secondary)",
};

export function roleStyle(roleType: AeRoleType | string): RoleTypeStyle {
  return PALETTES.roleTypes[roleType] ?? FALLBACK_ROLE_STYLE;
}

export function roleAccent(roleType: AeRoleType | string): string {
  return roleStyle(roleType).dot;
}

export function segmentStyle(segment: string): SegmentStyle {
  return (
    PALETTES.segments[segment] ?? {
      accent: "var(--text-secondary)",
      soft: "var(--surface-hover)",
    }
  );
}

export function managerAccent(name: string): string {
  return PALETTES.managers[name]?.accent ?? "var(--text-secondary)";
}

/** Convert a hex or oklch color to a soft tinted background. */
export function softTint(color: string, lightness = 0.96, chroma = 0.025): string {
  // If oklch, swap L and C; else fall back to derived neutral tint.
  const m = color.match(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)/i);
  if (m) {
    return `oklch(${lightness} ${chroma} ${m[1]})`;
  }
  return "var(--surface-hover)";
}
