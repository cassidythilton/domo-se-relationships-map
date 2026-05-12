import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { searchPeople } from "../store/selectors";
import type { SearchResult } from "../store/selectors";

export function Search() {
  const open = useStore((s) => s.searchOpen);
  const setOpen = useStore((s) => s.setSearchOpen);
  const model = useStore((s) => s.model);
  const selectPerson = useStore((s) => s.selectPerson);
  const setView = useStore((s) => s.setView);

  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const results = useMemo<SearchResult[]>(
    () => (model && q.trim() ? searchPeople(model, q) : []),
    [model, q],
  );

  if (!open) return null;

  function pick(r: SearchResult) {
    selectPerson(r.id);
    setView("focus");
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, Math.max(results.length - 1, 0)));
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
          placeholder="Search SEs, AEs, RVPs, AVPs…"
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
              key={r.id}
              className={"search-result" + (i === cursor ? " selected" : "")}
              onClick={() => pick(r)}
              onMouseEnter={() => setCursor(i)}
            >
              <span className="search-result-title">{r.name}</span>
              <span className="search-result-sub">{r.sub}</span>
            </li>
          ))}
          {results.length === 0 && q && (
            <li className="search-result">
              <span className="search-result-sub">No matches</span>
            </li>
          )}
          {results.length === 0 && !q && (
            <li className="search-result">
              <span className="search-result-sub">
                Start typing to search the org…
              </span>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
