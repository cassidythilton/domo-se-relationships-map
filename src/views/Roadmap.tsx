const ROADMAP = [
  {
    title: "Account-level coverage",
    body: "Wire an accounts dataset (account_id, owner_ae_id, ARR, industry) and an account_coverage join. Adds an Account Coverage Map view and unlocks ARR-weighted load metrics.",
  },
  {
    title: "Editable Planner mode (write-back)",
    body: "Drag-and-drop reps between pods; persist proposed changes to an AppDB collection (coverage_drafts) so re-orgs can be staged, reviewed, and exported as CSV without touching production data.",
  },
  {
    title: "Time slider & historical snapshots",
    body: "Append a snapshot_date column or maintain a snapshots collection; add a quarterly time scrubber to compare coverage and ratios QoQ.",
  },
  {
    title: "Sankey: Manager → SC → Pod → AE",
    body: "Executive-grade flow diagram of the full alignment chain for QBRs and leadership reviews. Renders best when paired with account data.",
  },
  {
    title: "Per-pod overlay allocation",
    body: "Today overlay_alloc_pct splits evenly across overlay_pods. Allow per-pod splits via a CSV like 'PodA:15,PodB:10' once data is collected at that grain.",
  },
  {
    title: "Configurable palettes via AppDB",
    body: "Lift palette JSON into an AppDB collection so SC leadership can edit colors and view set without a redeploy.",
  },
];

export function Roadmap() {
  return (
    <div className="roadmap-wrap">
      <h2>What's next</h2>
      <p className="roadmap-intro">
        These items were intentionally deferred from v2 to keep scope tight. Each is a clean next
        slice; they don't depend on each other.
      </p>
      <div className="roadmap-list">
        {ROADMAP.map((r) => (
          <div className="roadmap-item" key={r.title}>
            <h3>{r.title}</h3>
            <p>{r.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
