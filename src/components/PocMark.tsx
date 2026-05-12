// Small mint diamond glyph that overlays an AE pill / chip / node when
// the AE has any deal-evidenced Solutions Architect partnership.
// Visually consistent with the title glyph on <PocPartnersStrip> so the
// UI's "this means an SA was involved" signal reads the same in every
// context.
//
// Pure CSS rectangle rotated 45°. Positioned absolute by `.ovr-poc-mark*`
// in src/styles/index.css; the parent must be `position: relative` (we
// added that to `.ae-chip` and `.ovr-ribbon-node` in V2).

type Size = "sm" | "md" | "lg";

const SIZE_CLASS: Record<Size, string> = {
  sm: "ovr-poc-mark ovr-poc-mark-sm",
  md: "ovr-poc-mark",
  lg: "ovr-poc-mark ovr-poc-mark-lg",
};

type Props = {
  size?: Size;
  /** Optional title for tooltip. Caller usually provides "SA: <name1>, <name2>". */
  title?: string;
};

export function PocMark({ size = "md", title }: Props) {
  return <span className={SIZE_CLASS[size]} aria-hidden="true" title={title} />;
}
