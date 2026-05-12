import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { managerOf, useProfilesReady } from "../data/profiles";
import { saveConfig } from "../data/appdb";
import { STATIC_ORG_MAP } from "../data/normalize";
import {
  DEFAULT_CAPACITY_TARGETS,
  DEFAULT_APP_DEFAULTS,
} from "../data/types";
import type { Settings as SettingsT, SegmentKey } from "../data/types";
import { Avatar } from "../components/Avatar";
import {
  appendNewRoster,
  clearAutoSeedFlag,
  lastAutoSeedAt,
  replaceAllRoster,
  upsertRoster,
} from "../data/rosterDb";
import {
  ROSTER_COLUMNS,
  ROSTER_CSV_TEMPLATE,
  ROSTER_JSON_TEMPLATE,
  diffRoster,
  parseAndValidate,
  rosterToCsv,
  rosterToJson,
} from "../data/rosterIO";
import type { ParseResult, UploadMode } from "../data/rosterIO";

const SEGMENTS: { key: SegmentKey; label: string }[] = [
  { key: "Corp NL", label: "Corp New Logo" },
  { key: "Corp Upsell", label: "Corp Upsell" },
  { key: "ENT", label: "Enterprise / SR Corp" },
];

const LANDING_LENSES: { key: string; label: string }[] = [
  { key: "fullOrg", label: "Full org" },
  { key: "focus", label: "Focus" },
  { key: "corpNL", label: "Corp New Logo" },
  { key: "corpUpsell", label: "Corp Upsell" },
  { key: "ent", label: "Enterprise" },
  { key: "discrepancies", label: "Discrepancies" },
];

const DEALS_WINDOWS: { key: string; label: string }[] = [
  { key: "current_quarter", label: "Current quarter" },
  { key: "current_fy_to_date", label: "FY to date" },
  { key: "trailing_12_months", label: "Trailing 12 months" },
  { key: "trailing_24_months", label: "Trailing 24 months" },
];


export function Settings() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const setSaving = useStore((s) => s.setSettingsSaving);
  const saving = useStore((s) => s.settingsSaving);
  const settingsLoaded = useStore((s) => s.settingsLoaded);
  const settingsError = useStore((s) => s.settingsError);
  const profiles = useProfilesReady();

  // Local working copy. Resets when persisted settings change.
  const [draft, setDraft] = useState<SettingsT>(settings);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => setDraft(settings), [settings]);

  const dirty = useMemo(() => {
    if (JSON.stringify(draft.capacityTargets) !== JSON.stringify(settings.capacityTargets)) return true;
    if (JSON.stringify(draft.avpOverrides) !== JSON.stringify(settings.avpOverrides)) return true;
    if (JSON.stringify(draft.defaults) !== JSON.stringify(settings.defaults)) return true;
    return false;
  }, [draft, settings]);

  async function save() {
    setSaving(true);
    setStatusMsg(null);
    const errors: string[] = [];
    const r1 = await saveConfig("capacityTargets", draft.capacityTargets);
    if (!r1.ok) errors.push(`capacity targets: ${r1.error}`);
    const r2 = await saveConfig("avpOverrides", draft.avpOverrides);
    if (!r2.ok) errors.push(`AVP overrides: ${r2.error}`);
    const r3 = await saveConfig("defaults", draft.defaults);
    if (!r3.ok) errors.push(`defaults: ${r3.error}`);
    setSaving(false);
    if (errors.length === 0) {
      setSettings(draft); // applies immediately to model
      setStatusMsg("Saved.");
      setTimeout(() => setStatusMsg(null), 2400);
    } else {
      setStatusMsg(`Save failed: ${errors.join("; ")}`);
    }
  }

  function resetToDefaults() {
    setDraft({
      capacityTargets: { ...DEFAULT_CAPACITY_TARGETS },
      avpOverrides: {},
      defaults: { ...DEFAULT_APP_DEFAULTS },
    });
  }

  function discardChanges() {
    setDraft(settings);
  }

  const knownAvps = useMemo(() => {
    const set = new Set(STATIC_ORG_MAP.avps.map((a) => a.name));
    for (const v of Object.values(draft.avpOverrides)) {
      if (v) set.add(v);
    }
    return [...set];
  }, [draft.avpOverrides]);

  return (
    <div className="settings-wrap">
      <header className="settings-header">
        <div>
          <h2 className="settings-title">Settings</h2>
          <p className="settings-subtitle">
            Capacity targets, sales hierarchy overrides, and source-data wiring.
            All changes persist to the <code>SovConfig</code> AppDB collection
            and apply across every lens immediately.
          </p>
        </div>
        <div className="settings-status">
          {!settingsLoaded && <span className="muted">Loading…</span>}
          {settingsError && (
            <span className="settings-status-error" title={settingsError}>
              AppDB error
            </span>
          )}
          {statusMsg && (
            <span className="settings-status-ok">{statusMsg}</span>
          )}
        </div>
      </header>

      {/* Roster */}
      <RosterSection />

      {/* Capacity Targets */}
      <section className="settings-card">
        <div className="settings-card-head">
          <div>
            <h3 className="settings-card-title">Capacity targets</h3>
            <p className="settings-card-sub">
              Ideal AEs per SE in each segment. Drives the Overloaded SEs metric,
              the matrix load bars, and the Focus load gauge. Changes take effect
              instantly across every lens.
            </p>
          </div>
        </div>
        <div className="settings-grid-3">
          {SEGMENTS.map((s) => (
            <div key={s.key} className="settings-field">
              <label className="settings-field-label">{s.label}</label>
              <div className="settings-ratio">
                <span className="settings-ratio-prefix">1 SE :</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  step={1}
                  value={draft.capacityTargets[s.key] ?? DEFAULT_CAPACITY_TARGETS[s.key]}
                  onChange={(e) => {
                    const n = Math.max(1, Math.min(20, Number(e.target.value) || 1));
                    setDraft((d) => ({
                      ...d,
                      capacityTargets: { ...d.capacityTargets, [s.key]: n },
                    }));
                  }}
                />
                <span className="settings-ratio-suffix">AEs</span>
              </div>
              <span className="settings-field-hint">
                default {DEFAULT_CAPACITY_TARGETS[s.key]}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* AVP Overrides */}
      <section className="settings-card">
        <div className="settings-card-head">
          <div>
            <h3 className="settings-card-title">Sales hierarchy overrides</h3>
            <p className="settings-card-sub">
              Quick-fix the RVP → AVP mapping without editing the source JSON.
              Values here win over the static <code>orgMap.json</code> defaults.
              When the userProfiles dataset has manager data, suggested AVPs
              show as one-click apply buttons.
            </p>
          </div>
        </div>
        <div className="settings-rvp-list">
          {STATIC_ORG_MAP.rvps.map((rvp) => {
            const def = rvp.avp ?? "";
            const override = draft.avpOverrides[rvp.rosterName] ?? "";
            const effective = override || def;
            const suggestion =
              profiles.ready && !override ? managerOf(rvp.fullName) ?? null : null;
            const showSuggestion =
              suggestion && suggestion !== def && suggestion !== effective;
            return (
              <div key={rvp.rosterName} className="settings-rvp-row">
                <div className="settings-rvp-from">
                  <Avatar name={rvp.fullName} size="sm" />
                  <span>
                    <span className="settings-rvp-name">{rvp.fullName}</span>
                    <span className="settings-rvp-sub">RVP · {rvp.segment}</span>
                  </span>
                </div>
                <span className="settings-rvp-arrow" aria-hidden="true">→</span>
                <select
                  className="settings-select"
                  value={effective}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDraft((d) => {
                      const next = { ...d.avpOverrides };
                      if (v === def || v === "") {
                        delete next[rvp.rosterName];
                      } else {
                        next[rvp.rosterName] = v;
                      }
                      return { ...d, avpOverrides: next };
                    });
                  }}
                >
                  <option value="">— no AVP —</option>
                  {knownAvps.map((a) => (
                    <option key={a} value={a}>
                      {a}{a === def ? "  (default)" : ""}
                    </option>
                  ))}
                </select>
                {showSuggestion && (
                  <button
                    type="button"
                    className="settings-suggest"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        avpOverrides: {
                          ...d.avpOverrides,
                          [rvp.rosterName]: suggestion!,
                        },
                      }))
                    }
                    title="Apply manager from userProfiles dataset"
                  >
                    Use {suggestion}
                  </button>
                )}
                {override && override !== def && (
                  <span className="settings-rvp-tag">override</span>
                )}
                {!override && def === "" && !showSuggestion && (
                  <span className="settings-rvp-tag settings-rvp-tag-warn">
                    AVP unknown
                  </span>
                )}
              </div>
            );
          })}
        </div>
        {!profiles.ready && (
          <p className="settings-card-foot muted">
            Loading user-profile dataset to surface AVP suggestions…
          </p>
        )}
      </section>

      {/* Default experience */}
      <section className="settings-card">
        <div className="settings-card-head">
          <div>
            <h3 className="settings-card-title">Default experience</h3>
            <p className="settings-card-sub">
              Where the app lands on open and what deals window the Discrepancies
              lens uses by default.
            </p>
          </div>
        </div>
        <div className="settings-grid-2">
          <div className="settings-field">
            <label className="settings-field-label">Landing lens</label>
            <select
              className="settings-select"
              value={draft.defaults.landingLens}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  defaults: {
                    ...d.defaults,
                    landingLens: e.target.value as SettingsT["defaults"]["landingLens"],
                  },
                }))
              }
            >
              {LANDING_LENSES.map((l) => (
                <option key={l.key} value={l.key}>{l.label}</option>
              ))}
            </select>
            <span className="settings-field-hint">
              default {DEFAULT_APP_DEFAULTS.landingLens}
            </span>
          </div>
          <div className="settings-field">
            <label className="settings-field-label">Deals window</label>
            <select
              className="settings-select"
              value={draft.defaults.dealsWindow}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  defaults: { ...d.defaults, dealsWindow: e.target.value },
                }))
              }
            >
              {DEALS_WINDOWS.map((w) => (
                <option key={w.key} value={w.key}>{w.label}</option>
              ))}
            </select>
            <span className="settings-field-hint">
              applied on next page load
            </span>
          </div>
        </div>
      </section>

      {/* Source data audit */}
      <section className="settings-card">
        <div className="settings-card-head">
          <div>
            <h3 className="settings-card-title">Source data</h3>
            <p className="settings-card-sub">
              Read-only view of the wired Domo aliases. The roster lives in
              AppDB now (managed via the Roster section above) — no more
              standalone roster dataset to keep in sync.
            </p>
          </div>
        </div>
        <div className="settings-source-list">
          <DataSourceRow
            alias="SovRoster"
            datasetId="(AppDB collection)"
            role="Asserted roster — source of truth"
            note="Edit via the Roster section above (download CSV/JSON, edit, upload). Auto-seeded from the bundled v2 CSV on first publish."
          />
          <DataSourceRow
            alias="userProfiles"
            datasetId="45dca03b-dc39-4704-9a6f-fbe2b5e0177b"
            role="User directory (avatars + manager hierarchy)"
            note="Powers profile photos, full-name resolution, and live AVP suggestions in Discrepancies."
          />
          <DataSourceRow
            alias="salesDeals"
            datasetId="eac44ae6-6463-44ab-ad5a-6294977873ff"
            role="Live opportunity activity"
            note="Used only by the Discrepancies lens; loads lazily on tab visit."
          />
          <DataSourceRow
            alias="SovConfig"
            datasetId="(AppDB collection)"
            role="App settings persistence"
            note="Stores capacity targets, AVP overrides, and default experience prefs."
          />
        </div>
      </section>

      <div className="settings-actions">
        <button
          type="button"
          className="btn btn-active"
          onClick={save}
          disabled={!dirty || saving}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button
          type="button"
          className="btn"
          onClick={discardChanges}
          disabled={!dirty || saving}
        >
          Discard
        </button>
        <button
          type="button"
          className="btn"
          onClick={resetToDefaults}
          disabled={saving}
        >
          Reset to defaults
        </button>
        <span className="settings-actions-hint">
          {dirty ? "Unsaved changes" : "All settings synced"}
        </span>
      </div>
    </div>
  );
}

function DataSourceRow({
  alias,
  datasetId,
  role,
  note,
}: {
  alias: string;
  datasetId: string;
  role: string;
  note: string;
}) {
  return (
    <div className="settings-source-row">
      <div>
        <div className="settings-source-alias">
          <code>{alias}</code>
          <span className="settings-source-id">{datasetId}</span>
        </div>
        <div className="settings-source-role">{role}</div>
      </div>
      <div className="settings-source-note">{note}</div>
    </div>
  );
}

// =====================================================================
// Roster section — the heart of the AppDB-driven roster management
// =====================================================================

const ROSTER_FIELDS = ROSTER_COLUMNS.join(", ");

type UploadStaging = {
  fileName: string;
  format: "csv" | "json";
  parse: ParseResult;
  mode: UploadMode;
};

function RosterSection() {
  const model = useStore((s) => s.model);
  const rawRows = useStore((s) => s.rawRows);
  const refreshFromAppDb = useStore((s) => s.reloadRosterFromAppDb);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [staging, setStaging] = useState<UploadStaging | null>(null);
  const [busy, setBusy] = useState<null | "applying">(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [seedBanner, setSeedBanner] = useState<string | null>(() => lastAutoSeedAt());

  const peopleCount = rawRows?.length ?? 0;
  const aeCount = model?.byRole.ae.length ?? 0;
  const seCount =
    (model?.byRole.se.filter((p) => p.segment === "SC Org").length ?? 0) +
    (model?.byRole.sa.length ?? 0);
  const rvpCount = model?.byRole.rvp.length ?? 0;

  function downloadBlob(filename: string, content: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function downloadCurrent(format: "csv" | "json") {
    if (!rawRows) return;
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "csv") {
      downloadBlob(`sov-roster-${stamp}.csv`, rosterToCsv(rawRows), "text/csv");
    } else {
      downloadBlob(`sov-roster-${stamp}.json`, rosterToJson(rawRows), "application/json");
    }
  }

  function downloadTemplate(format: "csv" | "json") {
    if (format === "csv") {
      downloadBlob("sov-roster-template.csv", ROSTER_CSV_TEMPLATE, "text/csv");
    } else {
      downloadBlob("sov-roster-template.json", ROSTER_JSON_TEMPLATE, "application/json");
    }
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    setStatusMsg(null);
    setErrorMsg(null);
    const text = await file.text();
    const format: "csv" | "json" = file.name.toLowerCase().endsWith(".json") ? "json" : "csv";
    const parse = parseAndValidate(text, format);
    if (parse.errors.length > 0) {
      setErrorMsg(parse.errors.join("; "));
      return;
    }
    setStaging({ fileName: file.name, format, parse, mode: "upsert" });
  }

  const stagedDiff = useMemo(() => {
    if (!staging || !rawRows) return null;
    return diffRoster(rawRows, staging.parse.rows, staging.mode);
  }, [staging, rawRows]);

  async function applyUpload() {
    if (!staging) return;
    setBusy("applying");
    setStatusMsg(null);
    setErrorMsg(null);
    let result;
    if (staging.mode === "replace") {
      result = await replaceAllRoster(staging.parse.rows);
    } else if (staging.mode === "append") {
      result = await appendNewRoster(staging.parse.rows);
    } else {
      result = await upsertRoster(staging.parse.rows);
    }
    setBusy(null);
    if (!result.ok) {
      setErrorMsg(result.error ?? "Upload failed.");
      return;
    }
    setStatusMsg(
      `${labelForMode(staging.mode)} · added ${result.added}, updated ${result.updated}, removed ${result.removed}`,
    );
    setStaging(null);
    await refreshFromAppDb();
    // Clear the auto-seed banner once the user takes action of their own.
    if (seedBanner) {
      clearAutoSeedFlag();
      setSeedBanner(null);
    }
  }

  function dismissSeedBanner() {
    clearAutoSeedFlag();
    setSeedBanner(null);
  }

  return (
    <section className="settings-card roster-section">
      <div className="settings-card-head">
        <div>
          <h3 className="settings-card-title">Roster</h3>
          <p className="settings-card-sub">
            The asserted org — every person, their team, and the relationships
            between them — lives in the <code>SovRoster</code> AppDB collection.
            Download the current state, edit it in any spreadsheet or text
            editor, and upload it back.
          </p>
        </div>
        <div className="roster-stats">
          <Stat label="People" value={peopleCount} />
          <Stat label="SE / SA" value={seCount} />
          <Stat label="AEs" value={aeCount} />
          <Stat label="RVPs" value={rvpCount} />
        </div>
      </div>

      {seedBanner && (
        <div className="roster-seed-banner">
          <div>
            <strong>Auto-seeded from the bundled v2 roster.</strong>{" "}
            <span className="muted">
              First time on this build — the previous Domo dataset was imported
              into AppDB. Download, edit, and re-upload to make changes.
            </span>
          </div>
          <button type="button" className="btn btn-ghost" onClick={dismissSeedBanner}>
            Dismiss
          </button>
        </div>
      )}

      <div className="roster-actions">
        <div className="roster-actions-group">
          <span className="roster-actions-label">Download current</span>
          <button type="button" className="btn" onClick={() => downloadCurrent("csv")} disabled={peopleCount === 0}>
            CSV
          </button>
          <button type="button" className="btn" onClick={() => downloadCurrent("json")} disabled={peopleCount === 0}>
            JSON
          </button>
        </div>
        <div className="roster-actions-group">
          <span className="roster-actions-label">Empty template</span>
          <button type="button" className="btn" onClick={() => downloadTemplate("csv")}>
            CSV
          </button>
          <button type="button" className="btn" onClick={() => downloadTemplate("json")}>
            JSON
          </button>
        </div>
        <div className="roster-actions-group">
          <span className="roster-actions-label">Upload</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json,text/csv,application/json"
            onChange={onFileChosen}
            style={{ display: "none" }}
          />
          <button
            type="button"
            className="btn btn-active"
            onClick={() => fileInputRef.current?.click()}
            disabled={!!busy}
          >
            Choose file…
          </button>
        </div>
      </div>

      {errorMsg && <div className="roster-error">{errorMsg}</div>}
      {statusMsg && <div className="roster-success">{statusMsg}</div>}

      {staging && stagedDiff && (
        <div className="roster-stage">
          <div className="roster-stage-head">
            <div>
              <div className="roster-stage-file">
                <span className="roster-stage-tag">{staging.format.toUpperCase()}</span>
                <span className="roster-stage-name">{staging.fileName}</span>
                <span className="muted">· {staging.parse.rows.length} valid row{staging.parse.rows.length === 1 ? "" : "s"}</span>
              </div>
              {staging.parse.warnings.length > 0 && (
                <details className="roster-stage-warnings">
                  <summary>{staging.parse.warnings.length} warning{staging.parse.warnings.length === 1 ? "" : "s"}</summary>
                  <ul>
                    {staging.parse.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </details>
              )}
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStaging(null)}
              disabled={!!busy}
            >
              Cancel
            </button>
          </div>

          <div className="roster-mode-row">
            <span className="roster-actions-label">Mode</span>
            {(["replace", "append", "upsert"] as UploadMode[]).map((m) => (
              <label key={m} className={"roster-mode" + (staging.mode === m ? " roster-mode-active" : "")}>
                <input
                  type="radio"
                  name="roster-mode"
                  checked={staging.mode === m}
                  onChange={() => setStaging({ ...staging, mode: m })}
                />
                <span>
                  <strong>{labelForMode(m)}</strong>
                  <em>{descriptionForMode(m)}</em>
                </span>
              </label>
            ))}
          </div>

          <div className="roster-diff">
            <DiffStat label="Add" count={stagedDiff.added.length} tone="good" sample={stagedDiff.added} />
            <DiffStat label="Update" count={stagedDiff.updated.length} tone="info" sample={stagedDiff.updated} />
            <DiffStat label="Remove" count={stagedDiff.removed.length} tone="danger" sample={stagedDiff.removed} />
            <DiffStat label="Unchanged" count={stagedDiff.unchanged.length} tone="neutral" />
          </div>

          <div className="roster-stage-actions">
            <button
              type="button"
              className="btn btn-active"
              onClick={applyUpload}
              disabled={busy === "applying"}
            >
              {busy === "applying" ? "Applying…" : `Apply ${labelForMode(staging.mode)}`}
            </button>
            <span className="muted" style={{ fontSize: 11 }}>
              Field contract: <code>{ROSTER_FIELDS}</code>
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="roster-stat">
      <div className="roster-stat-value">{value}</div>
      <div className="roster-stat-label">{label}</div>
    </div>
  );
}

function DiffStat({
  label,
  count,
  tone,
  sample,
}: {
  label: string;
  count: number;
  tone: "good" | "info" | "danger" | "neutral";
  sample?: string[];
}) {
  return (
    <div className={`roster-diff-stat roster-diff-${tone}`} title={sample?.slice(0, 12).join("\n") || undefined}>
      <div className="roster-diff-count">{count}</div>
      <div className="roster-diff-label">{label}</div>
    </div>
  );
}

function labelForMode(m: UploadMode): string {
  switch (m) {
    case "replace": return "Replace all";
    case "append":  return "Add new only";
    case "upsert":  return "Update + add";
  }
}

function descriptionForMode(m: UploadMode): string {
  switch (m) {
    case "replace": return "Wipe AppDB and insert every uploaded row.";
    case "append":  return "Insert only rows whose name doesn’t already exist.";
    case "upsert":  return "Update existing rows by name, add net-new rows. No deletes.";
  }
}
