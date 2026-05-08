import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";

type Result =
  | { kind: "person"; id: string; name: string; sub: string }
  | { kind: "pod"; name: string; sub: string }
  | { kind: "specialization"; name: string; sub: string };

export function Search() {
  const open = useStore((s) => s.searchOpen);
  const setOpen = useStore((s) => s.setSearchOpen);
  const model = useStore((s) => s.model);
  const selectPerson = useStore((s) => s.selectPerson);
  const selectPod = useStore((s) => s.selectPod);
  const setView = useStore((s) => s.setView);
  const setFilters = useStore((s) => s.setFilters);

  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Open with cmd+k / ctrl+k.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  useEffect(() => {
    if (open) {
      setQ("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const results = useMemo<Result[]>(() => {
    if (!model || !q.trim()) return [];
    const term = q.trim().toLowerCase();
    const out: Result[] = [];
    for (const p of model.people) {
      if (
        p.name.toLowerCase().includes(term) ||
        (p.role_type || "").toLowerCase().includes(term) ||
        (p.email || "").toLowerCase().includes(term)
      ) {
        out.push({
          kind: "person",
          id: p.id,
          name: p.name,
          sub: `${p.role_type || p.tier} \u2022 ${p.segment}`,
        });
      }
      if (out.length > 30) break;
    }
    for (const pod of model.pods) {
      if (pod.name.toLowerCase().includes(term)) {
        out.push({
          kind: "pod",
          name: pod.name,
          sub: `${pod.totalSCs} SCs \u2022 ${pod.primaryCount} Primary`,
        });
      }
      if (out.length > 50) break;
    }
    for (const spec of model.specializations) {
      if (spec.toLowerCase().includes(term)) {
        out.push({
          kind: "specialization",
          name: spec,
          sub: "Specialization",
        });
      }
      if (out.length > 60) break;
    }
    return out.slice(0, 30);
  }, [model, q]);

  if (!open) return null;

  function pick(r: Result) {
    if (r.kind === "person") {
      selectPerson(r.id);
    } else if (r.kind === "pod") {
      selectPod(r.name);
      setView("reverse");
    } else {
      setFilters({ specialization: r.name });
      setView("specialist");
    }
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = results[cursor];
      if (r) pick(r);
    }
  }

  return (
    <div className="search-overlay" onClick={() => setOpen(false)}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="search-input"
          placeholder="Search people, pods, specializations…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setCursor(0);
          }}
          onKeyDown={onKeyDown}
        />
        <ul className="search-results">
          {results.map((r, i) => (
            <li
              key={`${r.kind}-${"id" in r ? r.id : r.name}`}
              className={"search-result" + (i === cursor ? " selected" : "")}
              onClick={() => pick(r)}
              onMouseEnter={() => setCursor(i)}
            >
              <span className="search-result-title">
                {"name" in r ? r.name : ""}
              </span>
              <span className="search-result-sub">{r.sub}</span>
            </li>
          ))}
          {results.length === 0 && q && (
            <li className="search-result">
              <span className="search-result-sub">No matches</span>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
