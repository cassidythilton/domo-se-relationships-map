import { roleColor } from "../config";

type Props = {
  roleTypes: string[];
};

export function Legend({ roleTypes }: Props) {
  if (!roleTypes || roleTypes.length === 0) return null;
  return (
    <div className="legend" aria-label="Role type legend">
      {roleTypes.map((t) => (
        <div key={t} className="legend-item">
          <span className="legend-swatch" style={{ background: roleColor(t) }} />
          <span className="legend-label">{t}</span>
        </div>
      ))}
    </div>
  );
}
