import type { ViewConfigEntry, ViewKey } from "../data/types";

type Props = {
  views: ViewConfigEntry[];
  active: ViewKey;
  onChange: (key: ViewKey) => void;
};

export function Tabs({ views, active, onChange }: Props) {
  const segmentTabs = views.filter((v) => v.group === "segment");
  const analyticsTabs = views.filter((v) => v.group === "analytics");
  const refTabs = views.filter((v) => v.group === "reference");

  return (
    <nav className="tabs" role="tablist" aria-label="Views">
      {segmentTabs.map((v) => renderTab(v, active, onChange))}
      {analyticsTabs.length > 0 && <div className="tabs-divider" aria-hidden="true" />}
      {analyticsTabs.map((v) => renderTab(v, active, onChange))}
      {refTabs.length > 0 && <div className="tabs-divider" aria-hidden="true" />}
      {refTabs.map((v) => renderTab(v, active, onChange))}
    </nav>
  );
}

function renderTab(
  v: ViewConfigEntry,
  active: ViewKey,
  onChange: (key: ViewKey) => void,
) {
  const isActive = active === v.key;
  return (
    <button
      key={v.key}
      role="tab"
      aria-selected={isActive}
      className={"tab" + (isActive ? " tab-active" : "")}
      onClick={() => onChange(v.key)}
    >
      {v.label}
    </button>
  );
}
