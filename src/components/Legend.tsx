import { roleAccent, softTint } from "../config";

type Props = {
  roleTypes: string[];
};

export function Legend({ roleTypes }: Props) {
  if (!roleTypes || roleTypes.length === 0) return null;
  return (
    <div className="legend" aria-label="Role type legend">
      {roleTypes.map((t) => {
        const accent = roleAccent(t);
        return (
          <div key={t} className="legend-item">
            <span
              className="legend-swatch"
              style={{ background: softTint(accent, 0.93, 0.03), boxShadow: `0 0 0 2px ${accent} inset` }}
            />
            <span className="legend-label">{t}</span>
          </div>
        );
      })}
    </div>
  );
}
