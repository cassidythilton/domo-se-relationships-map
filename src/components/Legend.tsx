import { roleStyle } from "../config";

type Props = {
  roleTypes: string[];
};

export function Legend({ roleTypes }: Props) {
  if (!roleTypes || roleTypes.length === 0) return null;
  return (
    <div className="legend" aria-label="Role type legend">
      {roleTypes.map((t) => {
        const r = roleStyle(t);
        return (
          <div key={t} className="legend-item">
            <span
              className="legend-swatch"
              style={{ background: r.fill, borderColor: r.border, color: r.dot }}
            >
              <span className="legend-dot" style={{ background: r.dot }} />
            </span>
            <span className="legend-label">{t}</span>
          </div>
        );
      })}
    </div>
  );
}
