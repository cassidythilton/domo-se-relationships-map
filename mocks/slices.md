---
shaping: true
---

# Shape A — Slices

Implementation plan for **Shape A — POC Architects as first-class citizens** (see `mocks/shape-a.html` for visual reference). Built on top of the breadboard from the shaping pass.

Each slice ends in something demo-able. Slices are vertical (each touches data → store → UI as needed).

## Reference

- **Shaping ground truth:** Shape A breadboard in conversation transcript and `mocks/shape-a.html`.
- **Visual mocks:** `mocks/shape-a.html` (open in browser); pre-rendered PNGs in `mocks/shots/`.
- **Constraints:** all clicks select-only (no Focus routing); `displayName` everywhere; mint (`#ADD4C1`) is the SA accent; Domo Blue stays exclusive to selection/focus; reuse existing `dealsSnapshot.pocPartners*` aggregations (no new SQL).

---

## Slice plan

| V | Title | Demo-able | Status |
|---|-------|-----------|--------|
| V1 | POC partner strip in SE matrix | Pick an SE → see partner avatars + counts under the matrix grid (replacing today's `<PocPartnersLine>` text). Click a partner pill → SA gets selected and panels reframe. | ✅ Shipped |
| V2 | Adaptive Panel 3 fan-out + AE-side annotations | Panel 3 honest for every selection kind (drops the "first AE only" inaccuracy). Mint diamond glyphs appear on AE chips in matrix and on AE nodes in Panel 1. Strip extends to manager / RVP / AVP roster panels. | ✅ Shipped |
| V3 | SA-centric panels | Click an SA → Panel 2 = engagement grid (cols = covering SEs, badges = deal counts); Panel 3 = engagement fan-out grouped by RVP; bench suppressed on SA Panel 3, replaced with stat strip. | ✅ Shipped |
| V4 | Discrepancies POC coverage section | Four new row groups: AEs with active pipeline & no SA partner, observed pairs missing from asserted matrix, unmapped POC names, idle SAs. | ✅ Shipped |

---

## V1 — POC partner strip in SE matrix

**Goal:** Replace the inline text caption (`<PocPartnersLine>`) under `PanelSeMatrix` with a richer, brand-consistent partner strip that's clickable.

### Affordances

| Place | Affordance | Mechanism |
|-------|------------|-----------|
| `src/styles/index.css` | New tokens: `--poc-mint`, `--poc-mint-mark`, `--poc-mint-soft`, `--poc-mint-text` | Added to `:root`; mint hue derived from `#ADD4C1` (Laura's manager accent) |
| `src/styles/index.css` | `.ovr-poc-strip`, `.ovr-poc-strip-head`, `.ovr-poc-strip-title`, `.ovr-poc-strip-window`, `.ovr-poc-pill`, `.ovr-poc-pill-name`, `.ovr-poc-pill-count`, `.ovr-poc-pill-more`, `.ovr-poc-strip-empty` | New CSS classes; mint border-only treatment |
| `src/store/selectors.ts` | `pocPartnersForSubject(subject, model, deals)` | Branches on `subject.roleKind`: `se`/`sa` → `pocPartnersBySc.get(displayName)`; others → empty in V1 (extended in V2) |
| `src/store/selectors.ts` | `resolvePocPartner(name, model)` | Helper that resolves a deal-system name to a roster `Person`: try `byId`, then scan `displayName`. Returns `null` when unmapped. |
| `src/components/PocPartnersStrip.tsx` (new) | `<PocPartnersStrip>` component | Header + top-3 outlined avatar pills + "+N more" + empty/loading states; clicks resolved via `resolvePocPartner` and dispatched through `selectPerson` |
| `src/views/Overview.tsx` | `PanelSeMatrix` body | Replace `<PocPartnersLine seName={...} />` with `<PocPartnersStrip subject={se} />`. `<PocPartnersLine>` retained for `PanelManagerRoster`/`PanelAe` until V2. |

### Wiring

- Strip is a pure component; reads `useStore.deals` itself (consistent with how `<PocPartnersLine>` works today). `subject` prop drives the lookup; window text comes from `useStore.dealsWindow`.
- Click handler: `resolvePocPartner(name, model)?.id` → `selectPerson(id)`. Unresolved names render as inert (cursor:default, no click).

### Acceptance

1. Loading state: while `dealsLoading`, strip shows muted "loading deals…" subhead.
2. Error state: if `dealsError`, strip shows muted "deals unavailable".
3. Empty state: if no partners for the subject, strip shows muted "no POC partners on recent deals".
4. Visual: matches `mocks/shape-a.html` State 1's POC Architect partners strip.
5. Smoke test (`npm run smoke`) still passes — no model/selector regressions.
6. Existing screens unaffected: Panel 3 still uses `<PocPartnersLine>`; manager/RVP/AVP roster panels still use `<PocPartnersLine>`.

---

## V2 — Adaptive Panel 3 fan-out + AE-side annotations

**Goal:** Replace today's "first AE only" Panel 3 with the adaptive fan-out geometry; add the mint diamond glyph to AE chips and Panel 1 AE nodes; extend the partner strip to manager / RVP / AVP roster variants of Panel 2.

### Affordances

| Place | Affordance | Mechanism |
|-------|------------|-----------|
| `src/data/deals.ts` | `pocOnPair: Set<string>` index | Built at snapshot-load time, keyed `${sc}::${ae}`. Added to `DealsSnapshot` shape. |
| `src/store/selectors.ts` | Extend `pocPartnersForSubject` | Add manager/RVP/AVP/root branches: union over `reportsByManager` / `aesByRvp` / RVPs-under-AVP. |
| `src/store/selectors.ts` | `selectionFanout(model, selection): { subject, side, groups }` | Returns Panel 3 data: `subject` Person, `side: "tech" \| "comm"` (which chain on top), `groups: Array<{ rvp, avp, aes }>` |
| `src/components/PocMark.tsx` (new) | `<PocMark size?>` | Small mint diamond glyph, used inline as AE-corner badge. Two preset sizes: `sm` (Panel 1 ribbon nodes, matrix cells), `md` (fan-out cards). |
| `src/views/Overview.tsx` | `PanelRibbon` AE node | Render `<PocMark>` overlay when `pocPartnersByAe.get(ae.displayName)` is non-empty |
| `src/views/Overview.tsx` | `PanelSeMatrix` AE chip | Render `<PocMark>` overlay when `pocOnPair.has(${se.displayName}::${ae.displayName})` |
| `src/views/Overview.tsx` | `PanelAe` (rename `<PanelRelationships>`) | Replace dual-chain layout with `<PanelRelationships>` driven by `selectionFanout`. Bench docked under the fan-out, aggregated label when N>1, per-AE label when N=1. |
| `src/views/Overview.tsx` | `PanelManagerRoster` / `PanelRvpRoster` / `PanelAvpRoster` | Replace `<PocPartnersLine>` with `<PocPartnersStrip>` |
| `src/views/Overview.tsx` | `derivePanels` | Adjust Panel 3 derivation to no longer pick a "first AE" — return the selection itself as the relationships subject |

### Acceptance

1. Panel 3 always reflects the full scope of the selection (no arbitrary "first AE" fallback).
2. `<PocMark>` appears on every AE chip / node where deal-evidenced POC participation exists.
3. Strip variants render correctly across `PanelManagerRoster` / `PanelRvpRoster` / `PanelAvpRoster`.
4. Visual: matches Shape A mock states 1, 5, 6.
5. Smoke test passes; ribbon/matrix selectors unchanged in shape (only consumers add overlays).

---

## V3 — SA-centric panels

**Goal:** When an SA is selected, Panel 2 reframes to the engagement grid and Panel 3 reframes to the SA's by-RVP fan-out (with deal-count badges and no bench).

### Affordances

| Place | Affordance | Mechanism |
|-------|------------|-----------|
| `src/store/selectors.ts` | `saEngagements(sa, model, deals)` | Returns `Array<{ se: Person; aes: Array<{ ae: Person; dealCount: number; rvp: Person \| null; avp: string \| null }> }>`, sorted by deal count desc |
| `src/views/Overview.tsx` | `<PanelSaEngagements>` (new) | Subject panel for SA selection; manager chain (Laura → SA, mint accent) + engagement grid + meta footer |
| `src/views/Overview.tsx` | `derivePanels` | New `case "sa"` branch: returns SA as `panelSubject`, no `panelAe` (Panel 3 uses `selectionFanout` directly with deals-derived AEs) |
| `src/views/Overview.tsx` | Panel 3 SA branch in `<PanelRelationships>` | When subject is SA, build fan-out from `pocPartners` (not coverage edges), with deal-count badges per AE; suppress bench; render stat strip `N AEs · K RVPs · M SEs · D deals · $X pipeline` |

### Acceptance

1. Click any SA chip in Laura's group → panels reframe; no Focus route.
2. SA Panel 2 = engagement grid mock-perfect.
3. SA Panel 3 = by-RVP fan-out with deal-count badges; no bench.
4. Empty state when SA has zero engagements in current window: graceful "no POC engagements in <window>".

---

## V4 — Discrepancies POC coverage section

**Goal:** Four new SA-relevant row groups in the Discrepancies view.

### Affordances

| Place | Affordance | Mechanism |
|-------|------------|-----------|
| `src/store/selectors.ts` | `pocCoverageGaps(model, deals)` | Returns `{ uncoveredAesWithPipeline, observedNotAsserted, unmappedNames, idleSas }`; pure derivations |
| `src/views/Discrepancies.tsx` | New "POC Architect coverage" section | Standard discrepancy section; same row pattern as existing groups |

### Acceptance

1. Each row group renders only when its data is non-empty.
2. Rows are clickable → `selectPerson` (no Focus route).
3. Mock-fidelity: matches Shape A State 4.

---

## Notes

- `<PocPartnersLine>` stays as a fallback during V1 → V2 to avoid breaking the panels not yet migrated. Removed entirely at end of V2.
- The fan-out's `<PanelRelationships>` replaces today's `PanelAe` component; selection-side dispatch still happens in `<PanelAe>` callsites — only the geometry changes.
- Color discipline: every new mint usage is sourced from a single token (`--poc-mint` family). Domo Blue (`--accent`) is never used for POC chrome.
