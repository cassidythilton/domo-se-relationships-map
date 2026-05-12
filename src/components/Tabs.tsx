import type { LensKey, ViewConfigEntry } from "../data/types";

type Props = {
  views: ViewConfigEntry[];
  active: LensKey;
  onChange: (key: LensKey) => void;
};

const ICONS: Record<string, string> = {
  fullOrg: "M3 5h7v6H3zM14 5h7v6h-7zM3 13h7v6H3zM14 13h7v6h-7z",
  focus: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v8M8 12h8",
  corpNL: "M4 4h4v8H4zM10 4h4v16h-4zM16 4h4v12h-4z",
  corpUpsell: "M4 4h4v8H4zM10 4h4v16h-4zM16 4h4v12h-4z",
  ent: "M4 4h4v8H4zM10 4h4v16h-4zM16 4h4v12h-4z",
  discrepancies: "M12 2 1 21h22zM12 9v6m0 3v.01",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8 1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
};

export function Tabs({ views, active, onChange }: Props) {
  const overview = views.filter((v) => v.group === "overview");
  const segments = views.filter((v) => v.group === "segment");
  const ops = views.filter((v) => v.group === "ops");
  const config = views.filter((v) => v.group === "config");

  return (
    <nav className="lens-tabs" role="tablist" aria-label="Lenses">
      {overview.map((v) => renderTab(v, active, onChange))}
      {segments.length > 0 && <span className="lens-tabs-divider" aria-hidden="true" />}
      {segments.map((v) => renderTab(v, active, onChange))}
      {ops.length > 0 && <span className="lens-tabs-divider" aria-hidden="true" />}
      {ops.map((v) => renderTab(v, active, onChange))}
      {config.length > 0 && <span className="lens-tabs-grow" aria-hidden="true" />}
      {config.map((v) => renderTab(v, active, onChange))}
    </nav>
  );
}

function renderTab(
  v: ViewConfigEntry,
  active: LensKey,
  onChange: (key: LensKey) => void,
) {
  const isActive = active === v.key;
  return (
    <button
      key={v.key}
      role="tab"
      aria-selected={isActive}
      className={"lens-tab" + (isActive ? " lens-tab-active" : "")}
      onClick={() => onChange(v.key)}
      type="button"
    >
      <svg className="lens-tab-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d={ICONS[v.key] ?? ICONS.fullOrg} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{v.label}</span>
    </button>
  );
}
