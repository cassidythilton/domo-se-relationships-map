import { useStore } from "../store";
import {
  WINDOW_LABELS,
  dateRangeFor,
} from "../data/fiscal";
import type { WindowKey } from "../data/fiscal";

const ORDER: WindowKey[] = [
  "current_quarter",
  "current_fy_to_date",
  "trailing_12_months",
  "trailing_24_months",
];

export function WindowPicker() {
  const window = useStore((s) => s.dealsWindow);
  const setWindow = useStore((s) => s.setDealsWindow);
  const loading = useStore((s) => s.dealsLoading);
  const error = useStore((s) => s.dealsError);
  const range = dateRangeFor(window);

  return (
    <div
      className="window-picker"
      title={`Deals scope: NAM, ${range.label} (${range.start.toISOString().slice(0, 10)} \u2192 ${range.end.toISOString().slice(0, 10)})`}
    >
      <span className="window-label">
        Deals window
        {loading && <span className="window-spinner" aria-label="Loading deals" />}
        {error && <span className="window-error" title={error}>error</span>}
      </span>
      <div className="window-toggle" role="group" aria-label="Deal window">
        {ORDER.map((w) => (
          <button
            key={w}
            type="button"
            className={"window-btn" + (window === w ? " active" : "")}
            onClick={() => setWindow(w)}
            aria-pressed={window === w}
          >
            {WINDOW_LABELS[w]}
          </button>
        ))}
      </div>
    </div>
  );
}
