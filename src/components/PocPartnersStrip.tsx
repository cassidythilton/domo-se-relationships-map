// V1 of Shape A — Solutions Architect partner strip.
//
// A compact, brand-consistent replacement for the inline footer caption
// that used to live under Panel 2's SE matrix row. Renders the top-N
// SAs that partnered on the subject's recent deals, each as an outlined
// mint pill with a deal-count badge. Click a pill → the SA is selected
// (which lets the rest of the panels reframe in place; we never route
// to Focus from here).
//
// V1 supports SE / SA / AE subjects. Manager / RVP / AVP variants landed
// in V2 (the strip is shipped across every Panel 2 roster variant now).

import { useStore } from "../store";
import { pocPartnersForSubject, type PocPartner } from "../store/selectors";
import { Avatar } from "./Avatar";
import { WINDOW_LABELS } from "../data/fiscal";
import type { Person } from "../data/types";

type Props = {
  /** Subject driving the lookup. SE / SA → bySc; AE → byAe. */
  subject: Person | null;
  /** Maximum pills to render before showing "+N more". Default 3. */
  topN?: number;
};

export function PocPartnersStrip({ subject, topN = 3 }: Props) {
  const model = useStore((s) => s.model);
  const deals = useStore((s) => s.deals);
  const dealsLoading = useStore((s) => s.dealsLoading);
  const dealsError = useStore((s) => s.dealsError);
  const dealsWindow = useStore((s) => s.dealsWindow);
  const select = useStore((s) => s.selectPerson);
  const selectedId = useStore((s) =>
    s.selection?.kind === "person" ? s.selection.id : null,
  );

  const partners: PocPartner[] = model
    ? pocPartnersForSubject(subject, deals, model)
    : [];
  const visible = partners.slice(0, topN);
  const overflow = Math.max(0, partners.length - visible.length);
  const windowLabel = WINDOW_LABELS[dealsWindow];

  return (
    <div className="ovr-poc-strip">
      <div className="ovr-poc-strip-head">
        <span className="ovr-poc-strip-title">Solutions Architect partners</span>
        <span className="ovr-poc-strip-window">{windowLabel}</span>
      </div>
      {renderBody(
        visible,
        overflow,
        selectedId,
        select,
        dealsLoading,
        dealsError,
        deals,
      )}
    </div>
  );
}

function renderBody(
  visible: PocPartner[],
  overflow: number,
  selectedId: string | null,
  select: (id: string | null) => void,
  dealsLoading: boolean,
  dealsError: string | null,
  deals: ReturnType<typeof useStore.getState>["deals"],
) {
  if (visible.length > 0) {
    return (
      <div className="ovr-poc-strip-pills">
        {visible.map((p) => {
          const id = p.person?.id ?? null;
          const isActive = id !== null && id === selectedId;
          const inert = id === null;
          const className =
            "ovr-poc-pill" +
            (inert ? " ovr-poc-pill-inert" : "") +
            (isActive ? " ovr-poc-pill-active" : "");
          const label = p.person?.displayName ?? p.name;
          return (
            <button
              key={p.name}
              type="button"
              className={className}
              onClick={() => {
                if (id) select(id);
              }}
              disabled={inert}
              title={
                inert
                  ? `${label} — name not in roster`
                  : `${label} · ${p.dealCount} deal${p.dealCount === 1 ? "" : "s"}`
              }
            >
              <Avatar name={label} size="sm" />
              <span className="ovr-poc-pill-name">{label}</span>
              <span className="ovr-poc-pill-count">{p.dealCount}</span>
            </button>
          );
        })}
        {overflow > 0 && (
          <span className="ovr-poc-pill-more">+{overflow} more</span>
        )}
      </div>
    );
  }
  if (dealsError) {
    return <span className="ovr-poc-strip-empty">deals unavailable</span>;
  }
  if (dealsLoading || !deals) {
    return <span className="ovr-poc-strip-empty">loading deals…</span>;
  }
  return (
    <span className="ovr-poc-strip-empty">
      no Solutions Architect partners on recent deals
    </span>
  );
}
