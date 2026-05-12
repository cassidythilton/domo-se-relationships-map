import { useMemo } from "react";
import { useStore } from "../store";
import { managerChain } from "../data/normalize";
import {
  buildSeLoads,
  loadBucketLabel,
  saEngagements,
  selectionFanout,
  type SaEngagements,
  type SelectionFanout,
} from "../store/selectors";
import type { Person, SeLoad } from "../data/types";
import { personTitle, segmentLabel } from "../data/types";
import { WINDOW_LABELS } from "../data/fiscal";
import { roleStyle } from "../config";
import { Avatar } from "../components/Avatar";
import { PocMark } from "../components/PocMark";

// Adaptive focus lens — picks the best geometry for whatever’s selected.
//   * SE / SA  → manager chain on top + matrix-row of AEs covered + load gauge
//   * AE       → dual chain: SE side (AE ← SE ← Mgr ← Cassidy) + Sales side (AE → RVP → AVP)
//   * RVP      → column of all SEs covering this RVP, with their AEs
//   * AVP      → mini-matrix of RVPs under this AVP
//   * SE Mgr   → ribbon strip of their SEs with AE clusters
//   * none     → empty-state with prominent search prompt + recently used SEs

export function Focus() {
  const model = useStore((s) => s.model);
  const sel = useStore((s) => s.selection);
  const select = useStore((s) => s.selectPerson);
  const setSearchOpen = useStore((s) => s.setSearchOpen);

  const person = useMemo(() => {
    if (!model || sel?.kind !== "person") return null;
    return model.byId.get(sel.id) ?? null;
  }, [model, sel]);

  const loads = useMemo(() => (model ? buildSeLoads(model) : new Map<string, SeLoad>()), [model]);

  if (!model) return <div className="state state-empty">Loading…</div>;

  if (!person) {
    return <FocusEmpty model={model} loads={loads} onSearch={() => setSearchOpen(true)} onPick={select} />;
  }

  switch (person.roleKind) {
    case "se":
      return <FocusSe person={person} load={loads.get(person.id)} onSelect={select} />;
    case "sa":
      // SAs have no asserted coverage — the SE-matrix geometry is empty
      // for them. Route to a Focus view driven by the deal-derived
      // engagement footprint (covering-SE grid + by-RVP fan-out).
      return <FocusSa person={person} onSelect={select} />;
    case "ae":
      return <FocusAe person={person} onSelect={select} />;
    case "rvp":
      return <FocusRvp rvp={person} loads={loads} onSelect={select} />;
    case "avp":
    case "se_lead":
    case "sa_lead":
    case "root":
      return <FocusManager person={person} loads={loads} onSelect={select} />;
    case "floater":
      return <FocusFloater person={person} onSelect={select} />;
  }
}

// ---------- Empty state ----------

function FocusEmpty({
  model,
  loads,
  onSearch,
  onPick,
}: {
  model: ReturnType<typeof useStore.getState>["model"] extends infer M ? NonNullable<M> : never;
  loads: Map<string, SeLoad>;
  onSearch: () => void;
  onPick: (id: string) => void;
}) {
  // Surface the most-loaded SEs as one-click picks.
  const overloadedSes = [...loads.values()]
    .filter((l) => l.bucket === "overloaded")
    .sort((a, b) => b.loadPct - a.loadPct)
    .slice(0, 6);
  const slackSes = [...loads.values()]
    .filter((l) => l.bucket === "slack")
    .sort((a, b) => a.loadPct - b.loadPct)
    .slice(0, 6);

  return (
    <div className="focus-wrap">
      <div className="focus-empty">
        <h2 className="focus-empty-title">Pick anyone in the org</h2>
        <p className="focus-empty-sub">
          Click an SE, SA, AE, RVP, or AVP from the matrix or the full org — or search.
          The canvas reframes around them with the geometry that fits the question.
        </p>
        <button className="btn focus-empty-search" onClick={onSearch} type="button">
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <line x1="9" y1="9" x2="13" y2="13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <span>Search the org</span>
          <span className="kbd">⌘K</span>
        </button>
      </div>

      {overloadedSes.length > 0 && (
        <div className="focus-shortcut">
          <h3 className="focus-shortcut-title">Overloaded SEs</h3>
          <div className="focus-shortcut-grid">
            {overloadedSes.map((l) => {
              const p = model.byId.get(l.seId);
              if (!p) return null;
              return <PickerCard key={l.seId} person={p} load={l} onClick={() => onPick(p.id)} />;
            })}
          </div>
        </div>
      )}

      {slackSes.length > 0 && (
        <div className="focus-shortcut">
          <h3 className="focus-shortcut-title">SEs with slack</h3>
          <div className="focus-shortcut-grid">
            {slackSes.map((l) => {
              const p = model.byId.get(l.seId);
              if (!p) return null;
              return <PickerCard key={l.seId} person={p} load={l} onClick={() => onPick(p.id)} />;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PickerCard({
  person,
  load,
  onClick,
}: {
  person: Person;
  load: SeLoad;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`focus-picker focus-picker-${load.bucket}`} onClick={onClick}>
      <Avatar name={person.displayName} size="md" />
      <div className="focus-picker-text">
        <div className="focus-picker-name">{person.displayName}</div>
        <div className="focus-picker-sub">
          {load.coveredCount} AE{load.coveredCount === 1 ? "" : "s"} · {load.loadPct}%
        </div>
      </div>
    </button>
  );
}

// ---------- SE-centric ----------

function FocusSe({
  person,
  load,
  onSelect,
}: {
  person: Person;
  load: SeLoad | undefined;
  onSelect: (id: string | null) => void;
}) {
  const model = useStore((s) => s.model)!;
  const chain = managerChain(model, person.id).reverse(); // root first
  const coveredIds = model.coveredAesBySe.get(person.id) ?? [];

  // Group covered AEs by RVP
  const groups = new Map<string, Person[]>();
  for (const aeId of coveredIds) {
    const ae = model.byId.get(aeId);
    if (!ae || !ae.rvpId) continue;
    if (!groups.has(ae.rvpId)) groups.set(ae.rvpId, []);
    groups.get(ae.rvpId)!.push(ae);
  }
  const orderedRvpIds = [...groups.keys()].sort((a, b) => {
    const ra = model.byId.get(a);
    const rb = model.byId.get(b);
    return (ra?.sort_order ?? 0) - (rb?.sort_order ?? 0);
  });

  return (
    <div className="focus-wrap">
      <FocusHeader chain={chain} person={person} kindLabel="Solutions Engineer" onSelect={onSelect} />

      <div className="focus-section focus-section-row">
        <h3 className="focus-section-title">AEs covered across RVPs</h3>
        {orderedRvpIds.length === 0 ? (
          <div className="focus-empty-line">No AEs assigned in the asserted matrix.</div>
        ) : (
          <div className="focus-rvp-grid" style={{ ["--rvp-count" as string]: orderedRvpIds.length }}>
            {orderedRvpIds.map((rvpId) => {
              const rvp = model.byId.get(rvpId);
              const aes = groups.get(rvpId) ?? [];
              return (
                <div key={rvpId} className="focus-rvp-col">
                  <button
                    type="button"
                    className="focus-rvp-head"
                    onClick={() => rvp && onSelect(rvp.id)}
                    title={rvp?.avpName ? `Reports to ${rvp.avpName}` : "AVP unknown"}
                  >
                    <span className="focus-rvp-name">{rvp?.displayName ?? rvpId}</span>
                    {rvp?.avpName ? (
                      <span className="focus-rvp-sub">{rvp.avpName}</span>
                    ) : (
                      <span className="focus-rvp-sub focus-rvp-sub-missing">AVP unknown</span>
                    )}
                  </button>
                  <div className="focus-rvp-cell">
                    {aes.map((a) => {
                      const r = roleStyle(a.roleType || "");
                      return (
                        <button
                          key={a.id}
                          type="button"
                          className="ae-chip"
                          style={{
                            background: r.fill,
                            borderColor: r.border,
                            color: r.text,
                            ["--chip-dot" as string]: r.dot,
                          }}
                          onClick={() => onSelect(a.id)}
                        >
                          <span className="ae-chip-dot" aria-hidden="true" />
                          <span className="ae-chip-name">{a.displayName}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {load && <LoadGauge load={load} target={load.primaryTarget} name={person.displayName} />}
    </div>
  );
}

// ---------- Solutions Architect (SA) Focus ----------
//
// SAs don't carry asserted SE↔AE coverage; their relationships are
// deal-derived. The Focus view shows two complementary slices of the
// same engagement footprint:
//   1. By covering SE — "who did I partner with on the SE side?"
//   2. By RVP fan-out — "which sales books did I touch?"
// Plus a stats strip tied to the active deals window so the numbers
// are unambiguous.

function FocusSa({
  person,
  onSelect,
}: {
  person: Person;
  onSelect: (id: string | null) => void;
}) {
  const model = useStore((s) => s.model)!;
  const deals = useStore((s) => s.deals);
  const dealsLoading = useStore((s) => s.dealsLoading);
  const dealsError = useStore((s) => s.dealsError);
  const dealsWindow = useStore((s) => s.dealsWindow);

  const chain = managerChain(model, person.id).reverse();
  const engagements: SaEngagements = saEngagements(model, person, deals);
  const fanout: SelectionFanout = selectionFanout(model, person, deals);
  const windowLabel = WINDOW_LABELS[dealsWindow];

  return (
    <div className="focus-wrap">
      <FocusHeader
        chain={chain}
        person={person}
        kindLabel="Solutions Architect"
        onSelect={onSelect}
      />

      <header className="focus-rvp-header">
        <div className="focus-rvp-head-left">
          <h2 className="focus-rvp-title">{person.displayName}</h2>
          <p className="focus-rvp-subtitle">
            Solutions Architect ·{" "}
            {person.manager_name ? (
              <>reports to <strong>{person.manager_name}</strong></>
            ) : (
              "SC Org"
            )}{" "}
            · <span className="focus-sa-window">{windowLabel}</span>
          </p>
        </div>
        <div className="focus-rvp-stats">
          <Stat
            label="Deals partnered"
            value={String(engagements.totalDeals)}
            tone={engagements.totalDeals === 0 ? "neutral" : "good"}
          />
          <Stat label="SEs partnered" value={String(engagements.totalSes)} />
          <Stat label="AEs partnered" value={String(engagements.totalAes)} />
          <Stat label="RVPs touched" value={String(fanout.totalRvps)} />
        </div>
      </header>

      {engagements.columns.length === 0 ? (
        <FocusSaEmpty
          loading={dealsLoading}
          error={dealsError}
          hasDeals={!!deals}
          window={windowLabel}
        />
      ) : (
        <>
          {/* By covering SE — the primary slice. Each card shows one
              covering SE, their deal-count tally with this SA, and the
              AEs the SA partnered on under that SE. */}
          <div className="focus-section">
            <div className="focus-section-head">
              <h3 className="focus-section-title">Engagements by covering SE</h3>
              <span className="focus-section-sub">
                {engagements.columns.length} SE
                {engagements.columns.length === 1 ? "" : "s"} · sorted by deal count
              </span>
            </div>
            <div className="focus-rvp-cols">
              {engagements.columns.map((col) => (
                <div key={col.se.id} className="focus-rvp-card focus-sa-engage-card">
                  <button
                    type="button"
                    className="focus-rvp-card-head"
                    onClick={() => onSelect(col.se.id)}
                    title={`Reframe Focus around ${col.se.displayName}`}
                  >
                    <Avatar name={col.se.displayName} size="sm" />
                    <span className="focus-rvp-card-text">
                      <span className="focus-rvp-card-name">{col.se.displayName}</span>
                      <span className="focus-rvp-card-load focus-sa-engage-deals">
                        {col.totalDealCount} deal{col.totalDealCount === 1 ? "" : "s"}
                        {" · "}
                        {col.aes.length} AE{col.aes.length === 1 ? "" : "s"}
                      </span>
                    </span>
                  </button>
                  <div className="focus-rvp-card-aes focus-sa-engage-cell">
                    {col.aes.map(({ ae, dealCount }) => {
                      const r = roleStyle(ae.roleType || "");
                      return (
                        <button
                          key={ae.id}
                          type="button"
                          className="ae-chip focus-sa-engage-chip"
                          style={{
                            background: r.fill,
                            borderColor: r.border,
                            color: r.text,
                            ["--chip-dot" as string]: r.dot,
                          }}
                          onClick={() => onSelect(ae.id)}
                          title={`${ae.displayName} · ${dealCount} deal${
                            dealCount === 1 ? "" : "s"
                          } with ${person.displayName}`}
                        >
                          <span className="ae-chip-dot" aria-hidden="true" />
                          <span className="ae-chip-name">{ae.displayName}</span>
                          <span className="focus-sa-engage-count">{dealCount}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* By RVP — the complementary slice (sales-side perspective).
              Same AEs as above, regrouped by their commercial chain. */}
          {fanout.groups.length > 0 && (
            <div className="focus-section">
              <div className="focus-section-head">
                <h3 className="focus-section-title">Same AEs, by RVP</h3>
                <span className="focus-section-sub">
                  {fanout.totalRvps} RVP{fanout.totalRvps === 1 ? "" : "s"} ·{" "}
                  {fanout.totalAvps} AVP{fanout.totalAvps === 1 ? "" : "s"}
                </span>
              </div>
              <div className="focus-sa-fanout">
                {fanout.groups.map((g) => (
                  <div key={g.key} className="focus-sa-fanout-group">
                    <div className="focus-sa-fanout-head">
                      <button
                        type="button"
                        className="focus-sa-fanout-rvp"
                        onClick={() => g.headPerson && onSelect(g.headPerson.id)}
                        disabled={!g.headPerson}
                      >
                        {g.headPerson && <Avatar name={g.headPerson.displayName} size="sm" />}
                        <span>{g.label}</span>
                        <span className="focus-sa-fanout-tail">· RVP</span>
                      </button>
                      {g.avpName && (
                        <button
                          type="button"
                          className="focus-sa-fanout-avp"
                          onClick={() => g.avpName && onSelect(g.avpName)}
                        >
                          {g.avpName} · AVP
                        </button>
                      )}
                    </div>
                    <div className="focus-sa-fanout-cards">
                      {g.aes.map((f) => (
                        <button
                          key={f.ae.id}
                          type="button"
                          className="ovr-rel-ae-card"
                          onClick={() => onSelect(f.ae.id)}
                          title={`${f.ae.displayName} · ${f.dealCount ?? 0} deal${
                            f.dealCount === 1 ? "" : "s"
                          }`}
                        >
                          <Avatar
                            name={f.ae.displayName}
                            roleType={f.ae.roleType}
                            size="sm"
                          />
                          <span className="ovr-rel-ae-card-text">
                            <span className="ovr-rel-ae-card-name">
                              {f.ae.displayName}
                            </span>
                            <span className="ovr-rel-ae-card-role">
                              {f.ae.roleType || segmentLabel(f.ae.segment)}
                            </span>
                          </span>
                          {f.dealCount !== undefined && (
                            <span className="ovr-rel-ae-count">{f.dealCount}</span>
                          )}
                          <PocMark size="sm" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FocusSaEmpty({
  loading,
  error,
  hasDeals,
  window: windowLabel,
}: {
  loading: boolean;
  error: string | null;
  hasDeals: boolean;
  window: string;
}) {
  let message: string;
  if (error) {
    message = "Couldn't load deals data — the engagement view needs a live deals snapshot.";
  } else if (loading || !hasDeals) {
    message = "Loading deals…";
  } else {
    message = `No SA engagements in ${windowLabel}. Try widening the deals window from any panel header.`;
  }
  return (
    <div className="focus-sa-empty">
      <div className="focus-sa-empty-icon" aria-hidden="true">
        <PocMark size="lg" />
      </div>
      <div className="focus-sa-empty-text">
        <h3 className="focus-sa-empty-title">{message}</h3>
        <p className="focus-sa-empty-sub">
          Solutions Architects don't carry asserted SE↔AE coverage in the roster — every
          relationship comes from the live deals snapshot via the{" "}
          <code>PoC Sales Consultant</code> field on each opportunity.
        </p>
      </div>
    </div>
  );
}

function LoadGauge({ load, target, name }: { load: SeLoad; target: number; name?: string }) {
  const pct = load.loadPct;
  const capped = Math.min(150, pct);
  const loadPos = (capped / 150) * 100;
  const targetPos = (100 / 150) * 100;
  const fadeWidth = Math.max(0, 100 - loadPos);
  return (
    <div className="focus-load">
      <div className="focus-load-head">
        <span className="focus-load-label">{name ? `${name} load` : "Load"}</span>
        <span className={"focus-load-pct " + `load-fill-${load.bucket}`}>{pct}%</span>
        {load.bucket === "overloaded" && <span className="focus-load-badge">OVERLOADED</span>}
        {load.bucket === "slack" && <span className="focus-load-badge focus-load-badge-info">SLACK</span>}
        {load.bucket === "balanced" && <span className="focus-load-badge focus-load-badge-good">ON TARGET</span>}
      </div>
      <div className="focus-load-meter">
        <div className="focus-load-target" style={{ left: `${targetPos}%` }} aria-hidden="true">
          <span className="focus-load-target-label">target {target}</span>
        </div>
        <div className="focus-load-fade" style={{ width: `${fadeWidth}%` }} aria-hidden="true" />
        <div className={`focus-load-marker load-fill-${load.bucket}`} style={{ left: `${loadPos}%` }} aria-hidden="true" />
      </div>
      <div className="focus-load-meta">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
        <span>150%</span>
      </div>
      {load.primarySegment && (
        <div className="focus-load-detail">
          {load.coveredCount} AE{load.coveredCount === 1 ? "" : "s"} covered — primary segment{" "}
          <strong>{load.primarySegment}</strong> (ideal {target} per SE,{" "}
          {loadBucketLabel(load.bucket).toLowerCase()})
        </div>
      )}
    </div>
  );
}

// ---------- AE-centric ----------

function FocusAe({
  person,
  onSelect,
}: {
  person: Person;
  onSelect: (id: string | null) => void;
}) {
  const model = useStore((s) => s.model)!;
  const seId = person.coveringSeId;
  const se = seId ? model.byId.get(seId) : null;
  const seChain = se ? [se, ...managerChain(model, se.id)] : [];

  const rvp = person.rvpId ? model.byId.get(person.rvpId) : null;
  const avpName = rvp?.avpName ?? null;

  const r = roleStyle(person.roleType || "");

  return (
    <div className="focus-wrap focus-ae">
      <header className="focus-ae-header">
        <Avatar name={person.displayName} roleType={person.roleType} size="xl" />
        <div className="focus-ae-headtext">
          <h2 className="focus-ae-title">{person.displayName}</h2>
          <div className="focus-ae-sub">
            <span className="focus-ae-title-line">
              {personTitle(person)} · {segmentLabel(person.segment)}
            </span>
            {person.roleType && (
              <span
                className="chip chip-role"
                title="Role-type tag (informational)"
                style={{
                  background: r.fill,
                  borderColor: r.border,
                  color: r.text,
                  ["--role-color" as string]: r.dot,
                }}
              >
                {person.roleType}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="focus-ae-chains">
        <Chain
          title="Technical chain (SE side)"
          nodes={[
            ...seChain.reverse(),
            ...(se ? [] : []),
          ]}
          terminal={person}
          orientation="se"
          onSelect={onSelect}
        />

        <Chain
          title="Commercial chain (Sales side)"
          nodes={[
            ...(avpName ? [{ id: avpName, name: avpName, role: "AVP" }] : []),
            ...(rvp ? [{ id: rvp.id, name: rvp.displayName, role: "RVP" }] : []),
          ].map((n) =>
            "role" in n ? ({ id: n.id, name: n.name, role: n.role } as ChainNode) : n,
          )}
          terminal={person}
          orientation="sales"
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}

type ChainNode = { id: string; name: string; role?: string };

function Chain({
  title,
  nodes,
  terminal,
  orientation,
  onSelect,
}: {
  title: string;
  nodes: (Person | ChainNode)[];
  terminal: Person;
  orientation: "se" | "sales";
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className={`focus-chain focus-chain-${orientation}`}>
      <h4 className="focus-chain-title">{title}</h4>
      <ol className="focus-chain-list">
        {nodes.map((n) => {
          const isPerson = (n as Person).roleKind !== undefined;
          const p = isPerson ? (n as Person) : null;
          const sub = p ? roleLabel(p) : (n as ChainNode).role ?? "";
          const display = p ? p.displayName : n.name;
          return (
            <li key={n.id} className="focus-chain-node">
              <button
                type="button"
                className="focus-chain-card"
                onClick={() => onSelect(n.id)}
                title={`Focus on ${display}`}
              >
                <Avatar name={display} size="sm" />
                <span className="focus-chain-text">
                  <span className="focus-chain-name">{display}</span>
                  <span className="focus-chain-sub">{sub}</span>
                </span>
              </button>
              <span className="focus-chain-arm" aria-hidden="true" />
            </li>
          );
        })}
        <li className="focus-chain-node focus-chain-node-terminal">
          <div className="focus-chain-card focus-chain-card-terminal">
            <Avatar name={terminal.displayName} roleType={terminal.roleType} size="md" />
            <span className="focus-chain-text">
              <span className="focus-chain-name">{terminal.displayName}</span>
              <span className="focus-chain-sub">{personTitle(terminal)}</span>
            </span>
          </div>
        </li>
      </ol>
    </div>
  );
}

function roleLabel(p: Person): string {
  return personTitle(p);
}

// ---------- RVP-centric ----------

function FocusRvp({
  rvp,
  loads,
  onSelect,
}: {
  rvp: Person;
  loads: Map<string, SeLoad>;
  onSelect: (id: string | null) => void;
}) {
  const model = useStore((s) => s.model)!;
  // Chain header: AVP → RVP. The synthetic AVP person lives in byId now.
  const headerChain: Person[] = [];
  if (rvp.avpName) {
    const avpPerson = model.byId.get(rvp.avpName);
    if (avpPerson) headerChain.push(avpPerson);
  }
  const aeIds = model.aesByRvp.get(rvp.id) ?? [];
  // Group AEs by their covering SE
  const bySe = new Map<string, Person[]>();
  const uncovered: Person[] = [];
  for (const aeId of aeIds) {
    const ae = model.byId.get(aeId);
    if (!ae) continue;
    const seId = ae.coveringSeId;
    if (!seId) {
      uncovered.push(ae);
      continue;
    }
    if (!bySe.has(seId)) bySe.set(seId, []);
    bySe.get(seId)!.push(ae);
  }
  const orderedSeIds = [...bySe.keys()].sort((a, b) => {
    const sa = model.byId.get(a);
    const sb = model.byId.get(b);
    return (sa?.sort_order ?? 0) - (sb?.sort_order ?? 0);
  });

  return (
    <div className="focus-wrap">
      <FocusHeader
        chain={headerChain}
        person={rvp}
        kindLabel="RVP"
        onSelect={onSelect}
      />

      <header className="focus-rvp-header">
        <div className="focus-rvp-head-left">
          <h2 className="focus-rvp-title">{rvp.displayName}</h2>
          <p className="focus-rvp-subtitle">
            RVP · {segmentLabel(rvp.segment)} ·{" "}
            {rvp.avpName ? (
              <>reports to <strong>{rvp.avpName}</strong></>
            ) : (
              <span className="discrepancy-action">AVP unknown</span>
            )}
          </p>
        </div>
        <div className="focus-rvp-stats">
          <Stat label="AEs on team" value={String(aeIds.length)} />
          <Stat label="SEs covering" value={String(orderedSeIds.length)} />
          <Stat label="Uncovered" value={String(uncovered.length)} tone={uncovered.length === 0 ? "good" : "warn"} />
        </div>
      </header>

      <div className="focus-rvp-cols">
        {orderedSeIds.map((seId) => {
          const se = model.byId.get(seId);
          const aes = bySe.get(seId) ?? [];
          const load = loads.get(seId);
          return (
            <div key={seId} className="focus-rvp-card">
              <button
                type="button"
                className="focus-rvp-card-head"
                onClick={() => onSelect(seId)}
              >
                <Avatar name={se?.displayName ?? seId} size="sm" />
                <span className="focus-rvp-card-text">
                  <span className="focus-rvp-card-name">{se?.displayName ?? seId}</span>
                  {load && (
                    <span className={`focus-rvp-card-load load-${load.bucket}`}>
                      {load.coveredCount} AEs · {load.loadPct}%
                    </span>
                  )}
                </span>
              </button>
              <div className="focus-rvp-card-aes">
                {aes.map((a) => {
                  const r = roleStyle(a.roleType || "");
                  return (
                    <button
                      key={a.id}
                      type="button"
                      className="ae-chip"
                      style={{
                        background: r.fill,
                        borderColor: r.border,
                        color: r.text,
                        ["--chip-dot" as string]: r.dot,
                      }}
                      onClick={() => onSelect(a.id)}
                    >
                      <span className="ae-chip-dot" aria-hidden="true" />
                      <span className="ae-chip-name">{a.displayName}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {uncovered.length > 0 && (
        <div className="matrix-floaters">
          <div className="matrix-floaters-head">
            <span>Uncovered AEs ({uncovered.length})</span>
            <span className="muted">no SE in matrix row</span>
          </div>
          <div className="matrix-floaters-body">
            {uncovered.map((a) => {
              const r = roleStyle(a.roleType || "");
              return (
                <button
                  key={a.id}
                  type="button"
                  className="ae-chip"
                  style={{
                    background: r.fill,
                    borderColor: r.border,
                    color: r.text,
                    ["--chip-dot" as string]: r.dot,
                  }}
                  onClick={() => onSelect(a.id)}
                >
                  <span className="ae-chip-dot" aria-hidden="true" />
                  <span className="ae-chip-name">{a.displayName}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "good" | "warn" | "danger" | "neutral" }) {
  return (
    <div className={`focus-stat focus-stat-${tone}`}>
      <div className="focus-stat-value">{value}</div>
      <div className="focus-stat-label">{label}</div>
    </div>
  );
}

// ---------- SE Manager / AVP / Root ----------

function FocusManager({
  person,
  loads,
  onSelect,
}: {
  person: Person;
  loads: Map<string, SeLoad>;
  onSelect: (id: string | null) => void;
}) {
  const model = useStore((s) => s.model)!;

  // For SE managers / SA managers / root, "directs" come from the org tree.
  // For AVPs (no manager_name links), "directs" are the RVPs reporting to
  // this AVP — different shape, but rendered with the same card layout.
  //
  // SE-side manager rosters MUST exclude RVPs / AVPs / AEs even when the
  // raw `reportsByManager` data tags them as direct reports (this happens
  // because the v2 roster sometimes wired sales-side personnel under SE
  // manager names). We filter to SE/SA only so the manager view reads as
  // a proper "team of solutions engineers".
  const isAvp = person.roleKind === "avp";
  let directs: Person[];
  if (isAvp) {
    directs = model.byRole.rvp
      .filter((rvp) => rvp.avpName === person.name)
      .sort((a, b) => a.sort_order - b.sort_order);
  } else {
    const directIds = model.reportsByManager.get(person.id) ?? [];
    directs = directIds
      .map((id) => model.byId.get(id))
      .filter((p): p is Person => !!p && (p.roleKind === "se" || p.roleKind === "sa"))
      .sort((a, b) => {
        const la = loads.get(a.id)?.loadPct ?? 0;
        const lb = loads.get(b.id)?.loadPct ?? 0;
        return lb - la;
      });
  }

  // Walk up the chain (excluding self) so the header pills read root-first.
  const headerChain = managerChain(model, person.id).reverse();

  const isSeMgr =
    person.roleKind === "se_lead" || person.roleKind === "sa_lead" || person.roleKind === "root";

  // Aggregate load across SE/SA directs
  let teamCovered = 0;
  let teamOverloaded = 0;
  let teamSlack = 0;
  for (const d of directs) {
    const ld = loads.get(d.id);
    if (!ld) continue;
    teamCovered += ld.coveredCount;
    if (ld.bucket === "overloaded") teamOverloaded++;
    if (ld.bucket === "slack") teamSlack++;
  }

  // AVP stats: book size + SE coverage breadth
  let avpAeCount = 0;
  const avpCoveringSes = new Set<string>();
  let avpUncovered = 0;
  if (isAvp) {
    for (const rvp of directs) {
      const aeIds = model.aesByRvp.get(rvp.id) ?? [];
      avpAeCount += aeIds.length;
      for (const aid of aeIds) {
        const a = model.byId.get(aid);
        if (a?.coveringSeId) avpCoveringSes.add(a.coveringSeId);
        else avpUncovered++;
      }
    }
  }

  return (
    <div className="focus-wrap">
      <FocusHeader
        chain={headerChain}
        person={person}
        kindLabel={roleLabel(person)}
        onSelect={onSelect}
      />

      <header className="focus-rvp-header">
        <div className="focus-rvp-head-left">
          <h2 className="focus-rvp-title">{person.displayName}</h2>
          <p className="focus-rvp-subtitle">
            {roleLabel(person)} · {segmentLabel(person.segment)}
          </p>
        </div>
        {isSeMgr && directs.length > 0 && (
          <div className="focus-rvp-stats">
            <Stat label="Team size" value={String(directs.length)} />
            <Stat label="AEs covered" value={String(teamCovered)} />
            <Stat label="Overloaded" value={String(teamOverloaded)} tone={teamOverloaded > 1 ? "warn" : "good"} />
            <Stat label="With slack" value={String(teamSlack)} tone={teamSlack > 0 ? "warn" : "good"} />
          </div>
        )}
        {isAvp && (
          <div className="focus-rvp-stats">
            <Stat label="RVPs" value={String(directs.length)} />
            <Stat label="AEs in book" value={String(avpAeCount)} />
            <Stat label="SEs covering" value={String(avpCoveringSes.size)} />
            <Stat
              label="Uncovered"
              value={String(avpUncovered)}
              tone={avpUncovered === 0 ? "good" : "warn"}
            />
          </div>
        )}
      </header>

      <div className="focus-rvp-cols">
        {directs.map((d) => {
          const load = loads.get(d.id);
          const isRvpCard = d.roleKind === "rvp";
          // SE/SA card: AEs they cover. RVP card (under an AVP): AEs on
          // their team (a more useful overview at the AVP level).
          const aesUnder: Person[] = isRvpCard
            ? (model.aesByRvp.get(d.id) ?? [])
                .map((id) => model.byId.get(id))
                .filter((p): p is Person => !!p)
                .slice(0, 14)
            : (model.coveredAesBySe.get(d.id) ?? [])
                .map((id) => model.byId.get(id))
                .filter((p): p is Person => !!p)
                .slice(0, 14);
          return (
            <div key={d.id} className="focus-rvp-card">
              <button type="button" className="focus-rvp-card-head" onClick={() => onSelect(d.id)}>
                <Avatar name={d.displayName} size="sm" />
                <span className="focus-rvp-card-text">
                  <span className="focus-rvp-card-name">{d.displayName}</span>
                  {load ? (
                    <span className={`focus-rvp-card-load load-${load.bucket}`}>
                      {load.coveredCount} AEs · {load.loadPct}%
                    </span>
                  ) : isRvpCard ? (
                    <span className="focus-rvp-card-load">
                      {(model.aesByRvp.get(d.id) ?? []).length} AEs on team
                    </span>
                  ) : (
                    <span className="focus-rvp-card-load">{roleLabel(d)}</span>
                  )}
                </span>
              </button>
              {aesUnder.length > 0 && (
                <div className="focus-rvp-card-aes">
                  {aesUnder.map((a) => {
                    const r = roleStyle(a.roleType || "");
                    return (
                      <button
                        key={a.id}
                        type="button"
                        className="ae-chip"
                        style={{
                          background: r.fill,
                          borderColor: r.border,
                          color: r.text,
                          ["--chip-dot" as string]: r.dot,
                        }}
                        onClick={() => onSelect(a.id)}
                      >
                        <span className="ae-chip-dot" aria-hidden="true" />
                        <span className="ae-chip-name">{a.displayName}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Floater fallback ----------

function FocusFloater({
  person,
  onSelect,
}: {
  person: Person;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div className="focus-wrap">
      <FocusHeader chain={[]} person={person} kindLabel="Unassigned AE" onSelect={onSelect} />
      <div className="state-empty">
        This AE has no SE assigned in the matrix. Edit the source CSV row to set an
        <code> ae_row </code> short name pointing to the covering SE.
      </div>
    </div>
  );
}

// ---------- Shared header ----------

function FocusHeader({
  chain,
  person,
  kindLabel,
  onSelect,
}: {
  chain: Person[];
  person: Person;
  kindLabel: string;
  onSelect: (id: string | null) => void;
}) {
  return (
    <header className="focus-header">
      <ol className="focus-chain-pills">
        {chain.map((c) => (
          <li key={c.id}>
            <button type="button" className="focus-chain-pill" onClick={() => onSelect(c.id)}>
              <Avatar name={c.displayName} size="sm" />
              <span>
                <span className="focus-chain-pill-name">{c.displayName}</span>
                <span className="focus-chain-pill-sub">{roleLabel(c)}</span>
              </span>
            </button>
          </li>
        ))}
        <li>
          <div className="focus-chain-pill focus-chain-pill-active">
            <Avatar name={person.displayName} roleType={person.roleType} size="md" />
            <span>
              <span className="focus-chain-pill-name">{person.displayName}</span>
              <span className="focus-chain-pill-sub">{kindLabel}</span>
            </span>
          </div>
        </li>
      </ol>
    </header>
  );
}
