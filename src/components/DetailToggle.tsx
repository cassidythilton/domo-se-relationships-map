import type { Density } from "../data/types";

const ALL: { value: Density; label: string }[] = [
  { value: 1, label: "Overview" },
  { value: 2, label: "Teams" },
  { value: 3, label: "Full Detail" },
];

type Props = {
  level: Density;
  available: Density[];
  onChange: (d: Density) => void;
};

export function DetailToggle({ level, available, onChange }: Props) {
  if (available.length <= 1) return null;
  const items = ALL.filter((i) => available.includes(i.value));
  return (
    <div className="detail-toggle" role="group" aria-label="Detail level">
      {items.map((n) => (
        <button
          key={n.value}
          className={"detail-btn" + (level === n.value ? " detail-btn-active" : "")}
          onClick={() => onChange(n.value)}
          aria-pressed={level === n.value}
        >
          <span className="detail-num">L{n.value}</span>
          <span className="detail-lbl">{n.label}</span>
        </button>
      ))}
    </div>
  );
}
