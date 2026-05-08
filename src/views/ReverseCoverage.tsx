import { useEffect, useMemo } from "react";
import { useStore } from "../store";
import { buildReverse } from "../store/selectors";
import { podColor, roleColor, readableTextOn } from "../config";
import type { Person } from "../data/types";

const ROLE_LABELS: Record<string, string> = {
  Primary: "Primary SCs",
  Backup: "Backup SCs",
  Overlay: "Overlay specialists",
  Manager: "Manager chain",
};

export function ReverseCoverage() {
  const model = useStore((s) => s.model);
  const selectedPod = useStore((s) => s.selectedPod);
  const setSelectedPod = useStore((s) => s.selectPod);
  const select = useStore((s) => s.selectPerson);

  // Auto-select first pod if none chosen
  useEffect(() => {
    if (!selectedPod && model && model.pods.length > 0) {
      setSelectedPod(model.pods[0].name);
    }
  }, [selectedPod, model, setSelectedPod]);

  const reverse = useMemo(() => {
    if (!model || !selectedPod) return null;
    return buildReverse(model, selectedPod);
  }, [model, selectedPod]);

  if (!model) return null;

  if (model.pods.length === 0) {
    return (
      <div className="state state-empty">
        No pod data yet. Populate <code>primary_pod</code> / <code>backup_pod</code> / <code>overlay_pods</code>{" "}
        in the dataset to enable Reverse Coverage. Until then, the matrix views still work using the legacy{" "}
        <code>team_column</code> data.
      </div>
    );
  }

  return (
    <div className="reverse-layout">
      <div className="pod-list">
        {model.pods.map((p) => (
          <div
            key={p.name}
            className={"pod-list-item" + (p.name === selectedPod ? " active" : "")}
            onClick={() => setSelectedPod(p.name)}
            style={{ borderLeftColor: podColor(p.name) }}
          >
            <span>{p.name}</span>
            <span className="pod-counts">
              <span
                className={"pod-count" + (p.primaryCount === 0 ? " pod-count-no-primary" : "")}
                title="Primary SCs"
              >
                P {p.primaryCount}
              </span>
              <span className="pod-count" title="Backup SCs">
                B {p.backupCount}
              </span>
              <span className="pod-count" title="Overlay SCs">
                O {p.overlayCount}
              </span>
            </span>
          </div>
        ))}
      </div>

      <div className="reverse-detail">
        {selectedPod && reverse && (
          <>
            <h2 style={{ marginTop: 0 }}>{selectedPod}</h2>
            <p className="muted">
              All SCs touching this pod, grouped by role on the pod, plus the SC management chain.
            </p>
            {(["Primary", "Backup", "Overlay", "Manager"] as const).map((role) => {
              const items = reverse.entries.filter((e) => e.role === role);
              if (items.length === 0) {
                if (role === "Primary") {
                  return (
                    <div key={role} className="reverse-group">
                      <div className="reverse-group-title">
                        {ROLE_LABELS[role]}
                        <span style={{ color: "var(--danger)" }}>none assigned</span>
                      </div>
                    </div>
                  );
                }
                return null;
              }
              return (
                <div key={role} className="reverse-group">
                  <div className="reverse-group-title">
                    <span>{ROLE_LABELS[role]}</span>
                    <span>{items.length}</span>
                  </div>
                  {items.map((e) => (
                    <PersonRow
                      key={`${role}-${e.person.id}`}
                      person={e.person}
                      allocationPct={e.allocationPct}
                      onClick={() => select(e.person.id)}
                    />
                  ))}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function PersonRow({
  person,
  allocationPct,
  onClick,
}: {
  person: Person;
  allocationPct: number;
  onClick: () => void;
}) {
  const bg = roleColor(person.role_type);
  const fg = readableTextOn(bg);
  return (
    <div className="reverse-card" onClick={onClick}>
      <div
        className="rep-circle"
        style={{ background: bg, color: fg, cursor: "pointer" }}
        title={person.role_type || "role n/a"}
      >
        {person.name.split(" ").map((s) => s[0]).join("").slice(0, 2)}
      </div>
      <div>
        <div className="reverse-card-name">{person.name}</div>
        <div className="reverse-card-meta">
          {person.role_type || person.tier}
          {person.specializationList.length > 0 && (
            <> • {person.specializationList.join(", ")}</>
          )}
          {person.ramp_status && person.ramp_status !== "active" && (
            <> • {person.ramp_status}</>
          )}
        </div>
      </div>
      {allocationPct > 0 && (
        <div className="reverse-card-alloc">{allocationPct}%</div>
      )}
    </div>
  );
}
