"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, API_URL } from "@/lib/api";
import { ExtensionSelect, type PbxExtensionOption } from "@/components/ExtensionSelect";
import { useSession } from "@/lib/session";
import { localNumberInput, normalizeLocalNumber } from "@ipbs/shared";

type HuntStep = { extension: string; timeoutSec: number; role: "mapped" | "sticky" | "overflow" };

type Route = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  matchType: "all" | "did" | "caller_prefix";
  matchValue: string;
  stickyLastAgent: boolean;
  stickyDays: number;
  ringTimeoutSec: number;
  queueNumber: string;
  notes: string;
  steps: Array<{ id?: string; extension: string; timeoutSec: number; sortOrder: number }>;
};

type Decision = {
  id: string;
  caller: string;
  did: string;
  mappedExtension?: string;
  stickyExtension: string;
  firstExtension: string;
  huntJson: string;
  reason: string;
  status: string;
  createdAt: string;
  route?: { name: string } | null;
};

type Preview = {
  caller: string;
  did: string;
  mappedExtension: string;
  stickyExtension: string;
  firstExtension: string;
  reason: string;
  hunt: HuntStep[];
  route: { id: string; name: string; queueNumber: string } | null;
};

type Mapping = {
  id: string;
  phone: string;
  matchKey: string;
  extension: string;
  name: string;
  notes: string;
  enabled: boolean;
};

type FormState = {
  name: string;
  enabled: boolean;
  priority: number;
  matchType: Route["matchType"];
  matchValue: string;
  stickyLastAgent: boolean;
  stickyDays: number;
  ringTimeoutSec: number;
  queueNumber: string;
  notes: string;
  steps: Array<{ extension: string; timeoutSec: number }>;
};

const emptyForm = (): FormState => ({
  name: "Ring last agent",
  enabled: true,
  priority: 10,
  matchType: "all",
  matchValue: "",
  stickyLastAgent: true,
  stickyDays: 7,
  ringTimeoutSec: 20,
  queueNumber: "",
  notes: "",
  steps: [],
});

function fromRoute(r: Route): FormState {
  return {
    name: r.name,
    enabled: r.enabled,
    priority: r.priority,
    matchType: r.matchType,
    matchValue: r.matchValue,
    stickyLastAgent: r.stickyLastAgent,
    stickyDays: r.stickyDays,
    ringTimeoutSec: r.ringTimeoutSec,
    queueNumber: r.queueNumber,
    notes: r.notes,
    steps: r.steps.length
      ? r.steps.map((s) => ({ extension: s.extension, timeoutSec: s.timeoutSec }))
      : [{ extension: "", timeoutSec: r.ringTimeoutSec || 20 }],
  };
}

function huntLabel(route: Route) {
  const overflow = route.steps.map((s) => s.extension).filter(Boolean);
  if (route.stickyLastAgent && overflow.length) {
    return `Callback rings the last desk that called them, then ${overflow.join(" → ")}`;
  }
  if (route.stickyLastAgent) return "Callback rings the last desk that called them";
  return overflow.length ? `Rings ${overflow.join(" → ")}` : "No destinations";
}

export default function InboundPage() {
  const { user } = useSession();
  const canEdit = ["owner", "admin"].includes(user?.role || "");
  const [routes, setRoutes] = useState<Route[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Route | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [caller, setCaller] = useState("");
  const [did, setDid] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [docsOpen, setDocsOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");

  const [mapPhone, setMapPhone] = useState("");
  const [mapExt, setMapExt] = useState("");
  const [mapName, setMapName] = useState("");
  const [mapNotes, setMapNotes] = useState("");
  const [editingMap, setEditingMap] = useState<Mapping | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapMenuId, setMapMenuId] = useState<string | null>(null);
  const [pbxExts, setPbxExts] = useState<PbxExtensionOption[]>([]);
  const [pbxExtsReady, setPbxExtsReady] = useState(false);
  const [moreOptions, setMoreOptions] = useState(false);

  async function load() {
    const [r, d, m, org, exts] = await Promise.all([
      api<Route[]>("/inbound/routes"),
      api<Decision[]>("/inbound/decisions"),
      api<Mapping[]>("/inbound/mappings"),
      api<{ crmApiKey?: string }>("/org").catch(() => ({ crmApiKey: "" })),
      api<PbxExtensionOption[]>("/org/extensions").catch(() => [] as PbxExtensionOption[]),
    ]);
    setRoutes(r);
    setDecisions(d);
    setMappings(m);
    setApiKey(org.crmApiKey || "");
    setPbxExts(exts);
    setPbxExtsReady(true);
  }

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Could not load inbound rules"));
  }, []);

  useEffect(() => {
    function close() {
      setMapMenuId(null);
    }
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const curl = useMemo(() => {
    const key = apiKey || "ipbs_your_api_key";
    return `curl -X POST ${API_URL}/v1/inbound/resolve \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${key}" \\
  -d '{"from":"7002695990","to":"1800123456"}'`;
  }, [apiKey]);

  function openCreate() {
    setForm(emptyForm());
    setEditing(null);
    setCreating(true);
    setMoreOptions(false);
    setError("");
  }

  function openEdit(route: Route) {
    setForm(fromRoute(route));
    setEditing(route);
    setCreating(false);
    setMoreOptions(false);
    setError("");
  }

  function closeModal() {
    setCreating(false);
    setEditing(null);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = {
        ...form,
        steps: form.steps.filter((s) => s.extension.trim()),
      };
      if (editing) {
        await api(`/inbound/routes/${editing.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        setMessage("Rule updated.");
      } else {
        await api("/inbound/routes", {
          method: "POST",
          body: JSON.stringify(body),
        });
        setMessage("Rule created.");
      }
      closeModal();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save rule");
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(route: Route) {
    await api(`/inbound/routes/${route.id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: !route.enabled }),
    });
    await load();
  }

  async function remove(route: Route) {
    if (!window.confirm(`Delete inbound rule “${route.name}”?`)) return;
    await api(`/inbound/routes/${route.id}`, { method: "DELETE" });
    setMessage("Rule deleted.");
    await load();
  }

  function openAddMap() {
    setEditingMap(null);
    setMapPhone("");
    setMapExt("");
    setMapName("");
    setMapNotes("");
    setMapOpen(true);
    setError("");
  }

  function openEditMap(row: Mapping) {
    setEditingMap(row);
    setMapPhone(localNumberInput(row.phone || row.matchKey));
    setMapExt(row.extension || "");
    setMapName(row.name || "");
    setMapNotes(row.notes || "");
    setMapOpen(true);
    setError("");
    setMapMenuId(null);
  }

  function closeMapModal() {
    setMapOpen(false);
    setEditingMap(null);
  }

  async function saveMapping(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = {
        phone: mapPhone,
        extension: mapExt,
        name: mapName,
        notes: mapNotes,
      };
      if (editingMap) {
        await api(`/inbound/mappings/${editingMap.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        setMessage("Caller map updated.");
      } else {
        await api("/inbound/mappings", {
          method: "POST",
          body: JSON.stringify(body),
        });
        setMessage("Caller map saved. That number will ring the mapped extension first.");
      }
      closeMapModal();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save map");
    } finally {
      setBusy(false);
    }
  }

  async function toggleMapping(row: Mapping) {
    await api(`/inbound/mappings/${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: !row.enabled }),
    });
    await load();
  }

  async function removeMapping(row: Mapping) {
    if (!window.confirm(`Remove map ${row.matchKey} → ${row.extension}?`)) return;
    await api(`/inbound/mappings/${row.id}`, { method: "DELETE" });
    if (editingMap?.id === row.id) closeMapModal();
    setMapMenuId(null);
    setMessage("Caller map removed.");
    await load();
  }

  async function resolve(live: boolean) {
    setBusy(true);
    setError("");
    try {
      const from = normalizeLocalNumber(caller);
      if (!from) throw new Error("Enter the caller’s 10-digit number");
      const data = await api<Preview>("/inbound/resolve", {
        method: "POST",
        body: JSON.stringify({ from, to: did.trim() }),
      });
      setPreview(data);
      if (live) {
        await api("/calls/simulate-inbound", {
          method: "POST",
          body: JSON.stringify({ from, toExtension: data.firstExtension || user?.extension || "1000" }),
        });
        setMessage(`Ringing ${data.firstExtension || "fallback"} first. ${data.reason}`);
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resolve failed");
    } finally {
      setBusy(false);
    }
  }

  const modalOpen = creating || Boolean(editing);

  return (
    <>
      <div className="user-toolbar">
        <div>
          <p className="eyebrow">Routing</p>
          <h1 className="page-title">Inbound call management</h1>
          <p className="muted">
            Two simple paths: pin a VIP number to a desk, or let everyone else ring the last person who called them.
          </p>
        </div>
        <div className="toolbar-actions">
          <button className="btn ghost" type="button" onClick={() => setDocsOpen((v) => !v)}>
            {docsOpen ? "Hide API" : "API docs"}
          </button>
          {canEdit && (
            <button className="btn" type="button" onClick={openCreate}>
              New rule
            </button>
          )}
        </div>
      </div>
      {error && !mapOpen && !modalOpen ? <p className="error">{error}</p> : null}
      {message ? <p className="muted">{message}</p> : null}

      <section className="hint-panel inbound-how">
        <ol>
          <li>
            <b>Caller maps</b> — pin a mobile number to one desk. That caller always rings that extension. Last-agent
            is ignored for mapped numbers.
          </li>
          <li>
            <b>Last agent rule</b> — for everyone else, a callback rings the same extension that last called them
            (within the remember window). Optional backup desks ring if nobody answers.
          </li>
        </ol>
      </section>

      {docsOpen && (
        <section className="panel inbound-docs">
          <h3>Public resolve API</h3>
          <p className="muted">
            Same <code>X-API-Key</code> as CRM hub. Full reference: <code>docs/inbound-api.md</code> in the repo.
          </p>
          <pre className="inbound-pre">{curl}</pre>
          <p className="muted">
            JWT: <code>GET/POST /inbound/mappings</code>, <code>GET/POST /inbound/routes</code>,{" "}
            <code>POST /inbound/resolve</code>
          </p>
        </section>
      )}

      <section className="people-table maps-table">
        <div className="maps-toolbar">
          <div>
            <h3>Caller maps</h3>
            <p className="muted">
              {mappings.length} number{mappings.length === 1 ? "" : "s"} always ring a chosen desk (last-agent skipped)
            </p>
          </div>
          {canEdit && (
            <button className="btn" type="button" onClick={openAddMap}>
              Add map
            </button>
          )}
        </div>
        <div className={`people-head maps-head${canEdit ? "" : " maps-readonly"}`}>
          <span>Caller</span>
          <span>Extension</span>
          <span>Label</span>
          <span>Status</span>
          {canEdit && <span className="align-right">Actions</span>}
        </div>
        {mappings.length === 0 && (
          <div className="people-empty">
            No maps yet. Click Add map to pin a number such as 7002695990 to extension 1001.
          </div>
        )}
        {mappings.map((row) => (
          <div key={row.id} className={`people-row maps-row ${row.enabled ? "" : "inactive"}${canEdit ? "" : " maps-readonly"}`}>
            <div className="user-id">
              <b>{row.matchKey || row.phone}</b>
              <span className="muted">{row.notes || "Rings mapped extension first"}</span>
            </div>
            <div className="ext-read">{row.extension}</div>
            <div>{row.name || "—"}</div>
            <div>
              <span className={`status ${row.enabled ? "on" : "off"}`}>
                <i />
                {row.enabled ? "On" : "Off"}
              </span>
            </div>
            {canEdit && (
              <div className="align-right">
                <div className="menu-wrap">
                  <button
                    className="kebab"
                    type="button"
                    aria-label={`Actions for ${row.matchKey}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMapMenuId((id) => (id === row.id ? null : row.id));
                    }}
                  >
                    <span />
                    <span />
                    <span />
                  </button>
                  {mapMenuId === row.id && (
                    <div className="menu" onClick={(e) => e.stopPropagation()}>
                      <button type="button" onClick={() => openEditMap(row)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMapMenuId(null);
                          void toggleMapping(row);
                        }}
                      >
                        {row.enabled ? "Disable" : "Enable"}
                      </button>
                      <button type="button" onClick={() => void removeMapping(row)}>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </section>

      <div className="grid dash-grid">
        <section className="panel">
          <div className="panel-head">
            <h3>Rules</h3>
            <span className="muted">{routes.length} configured</span>
          </div>
          {routes.length === 0 && (
            <p className="muted">No rule yet. Create one so callbacks ring the last desk that called this person.</p>
          )}
          {routes.map((route) => (
            <div key={route.id} className="inbound-rule">
              <div className="inbound-rule-top">
                <div>
                  <b>{route.name}</b>
                  <span className={`pill ${route.enabled ? "live" : "dead"}`}>
                    {route.enabled ? "On" : "Off"}
                  </span>
                  <span className="pill idle">P{route.priority}</span>
                </div>
                {canEdit && (
                  <div className="btn-row">
                    <button className="btn ghost btn-tiny" type="button" onClick={() => openEdit(route)}>
                      Edit
                    </button>
                    <button className="btn ghost btn-tiny" type="button" onClick={() => void toggleEnabled(route)}>
                      {route.enabled ? "Disable" : "Enable"}
                    </button>
                    <button className="btn ghost btn-tiny" type="button" onClick={() => void remove(route)}>
                      Delete
                    </button>
                  </div>
                )}
              </div>
              <div className="hunt-chain">
                {route.stickyLastAgent && (
                  <span className="hunt-chip sticky">Last desk that called them ({route.stickyDays}d)</span>
                )}
                {route.steps.map((s) => (
                  <span key={`${route.id}-${s.extension}`} className="hunt-chip">
                    {s.extension}
                    <em>{s.timeoutSec}s</em>
                  </span>
                ))}
              </div>
              <p className="muted inbound-meta">
                Match: {route.matchType === "all" ? "all inbound" : `${route.matchType} ${route.matchValue || ""}`}
                {route.queueNumber ? ` · PBX queue ${route.queueNumber}` : ""}
                {route.notes ? ` · ${route.notes}` : ""}
              </p>
              <p className="muted">{huntLabel(route)}</p>
            </div>
          ))}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3>Try a callback</h3>
          </div>
          <label className="field">
            <span>Caller number</span>
            <input
              placeholder="10 digits, 0 added auto"
              value={caller}
              maxLength={10}
              inputMode="numeric"
              onChange={(e) => setCaller(localNumberInput(e.target.value))}
            />
          </label>
          <label className="field">
            <span>DID / inbound number (optional)</span>
            <input placeholder="If you match by DID" value={did} onChange={(e) => setDid(e.target.value)} />
          </label>
          <div className="btn-row">
            <button className="btn ghost" type="button" disabled={busy} onClick={() => void resolve(false)}>
              Preview hunt
            </button>
            <button className="btn mint" type="button" disabled={busy} onClick={() => void resolve(true)}>
              Simulate inbound
            </button>
          </div>
          {preview && (
            <div className="inbound-preview">
              <p>
                <b>First ring:</b> {preview.firstExtension || "—"}
              </p>
              <div className="hunt-chain">
                {preview.hunt.map((h) => (
                  <span
                    key={`${h.role}-${h.extension}`}
                    className={`hunt-chip ${h.role === "sticky" ? "sticky" : ""} ${h.role === "mapped" ? "mapped" : ""}`}
                  >
                    {h.extension}
                    <em>{h.role} · {h.timeoutSec}s</em>
                  </span>
                ))}
              </div>
              <p className="muted">{preview.reason}</p>
            </div>
          )}
        </section>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head">
          <h3>Routing decisions</h3>
          <span className="muted">Last {decisions.length}</span>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Caller</th>
              <th>First ring</th>
              <th>Mapped</th>
              <th>Sticky</th>
              <th>Status</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {decisions.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  No inbound decisions yet. Place an outbound call, then simulate that number calling back.
                </td>
              </tr>
            )}
            {decisions.map((row) => (
              <tr key={row.id}>
                <td>{new Date(row.createdAt).toLocaleString()}</td>
                <td>{row.caller}</td>
                <td>{row.firstExtension || "—"}</td>
                <td>{row.mappedExtension || "—"}</td>
                <td>{row.stickyExtension || "—"}</td>
                <td>
                  <span
                    className={`pill ${
                      row.status === "answered" ? "live" : row.status === "overflow" ? "ring" : row.status === "missed" ? "dead" : "idle"
                    }`}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="muted">{row.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {mapOpen && (
        <div className="modal-back" onClick={closeMapModal}>
          <div className="modal" role="dialog" aria-labelledby="map-modal-title" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2 id="map-modal-title">{editingMap ? "Edit caller map" : "Add caller map"}</h2>
                <p className="muted">
                  This number always rings the chosen desk. Last-agent does not apply to mapped numbers.
                </p>
              </div>
              <button type="button" className="modal-close" aria-label="Close" onClick={closeMapModal}>
                ×
              </button>
            </div>
            <form onSubmit={saveMapping}>
              <label className="field">
                <span>Caller number</span>
                <input
                  placeholder="10 digits, 0 added auto"
                  value={mapPhone}
                  maxLength={10}
                  inputMode="numeric"
                  required
                  autoFocus
                  onChange={(e) => setMapPhone(localNumberInput(e.target.value))}
                />
              </label>
              <label className="field">
                <span>Ring extension</span>
                <ExtensionSelect
                  value={mapExt}
                  onChange={setMapExt}
                  extensions={pbxExts}
                  loading={!pbxExtsReady}
                  required
                  allowEmpty
                  emptyLabel="Select IP-PBX extension"
                />
              </label>
              <p className="muted" style={{ marginTop: -8 }}>
                {pbxExtsReady && !pbxExts.length
                  ? "No extensions from the PBX. Check MQTT on PBX settings, then type the number."
                  : "Live list from the Neron IP-PBX."}
              </p>
              <label className="field">
                <span>Label (optional)</span>
                <input
                  placeholder="VIP / account name"
                  value={mapName}
                  onChange={(e) => setMapName(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Notes (optional)</span>
                <textarea
                  rows={2}
                  placeholder="Why this caller is pinned"
                  value={mapNotes}
                  onChange={(e) => setMapNotes(e.target.value)}
                />
              </label>
              {error ? <p className="error">{error}</p> : null}
              <div className="btn-row">
                <button className="btn" disabled={busy}>
                  {busy ? "Saving…" : editingMap ? "Save map" : "Add map"}
                </button>
                <button type="button" className="btn ghost" onClick={closeMapModal}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="modal-back" onClick={closeModal}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>{editing ? "Edit inbound rule" : "New inbound rule"}</h2>
                <p className="muted">When they call back, ring the same desk that last called them.</p>
              </div>
              <button type="button" className="modal-close" aria-label="Close" onClick={closeModal}>
                ×
              </button>
            </div>
            <form className="modal-form" onSubmit={save}>
              <div className="modal-body">
                <ol className="inbound-order">
                  <li>
                    <b>Caller map</b>
                    <span>If this number is mapped, that desk rings. This rule is skipped.</span>
                  </li>
                  <li>
                    <b>Last agent</b>
                    <span>Otherwise ring the extension that last called this number.</span>
                  </li>
                  <li>
                    <b>Backup desks</b>
                    <span>Optional. Used only if last agent is unknown or does not answer.</span>
                  </li>
                </ol>

                <label className="field">
                  <span>Rule name</span>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </label>

                <label className="inbound-choice">
                  <input
                    type="checkbox"
                    checked={form.stickyLastAgent}
                    onChange={(e) => setForm({ ...form, stickyLastAgent: e.target.checked })}
                  />
                  <span>
                    <b>Ring last agent on callback</b>
                    <em>Does not apply to numbers in Caller maps.</em>
                  </span>
                </label>

                {form.stickyLastAgent && (
                  <div className="form-grid">
                    <label className="field">
                      <span>Remember last call for (days)</span>
                      <input
                        type="number"
                        min={1}
                        value={form.stickyDays}
                        onChange={(e) => setForm({ ...form, stickyDays: Number(e.target.value) })}
                      />
                    </label>
                    <label className="field">
                      <span>Ring that desk for (seconds)</span>
                      <input
                        type="number"
                        min={5}
                        value={form.ringTimeoutSec}
                        onChange={(e) => setForm({ ...form, ringTimeoutSec: Number(e.target.value) })}
                      />
                    </label>
                  </div>
                )}

                <div className="inbound-backup">
                  <p className="inbound-backup-title">If nobody answers, try these desks</p>
                  <p className="muted">Optional. Leave empty to only ring the last agent.</p>
                  {form.steps.map((step, i) => (
                    <div key={i} className="modal-split">
                      <label className="field">
                        <span>Backup desk {i + 1}</span>
                        <ExtensionSelect
                          value={step.extension}
                          onChange={(extension) => {
                            const steps = [...form.steps];
                            steps[i] = { ...step, extension };
                            setForm({ ...form, steps });
                          }}
                          extensions={pbxExts}
                          loading={!pbxExtsReady}
                          allowEmpty
                          emptyLabel="Select IP-PBX extension"
                        />
                      </label>
                      <label className="field">
                        <span>Ring for (sec)</span>
                        <input
                          type="number"
                          min={5}
                          value={step.timeoutSec}
                          onChange={(e) => {
                            const steps = [...form.steps];
                            steps[i] = { ...step, timeoutSec: Number(e.target.value) };
                            setForm({ ...form, steps });
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => setForm({ ...form, steps: form.steps.filter((_, j) => j !== i) })}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() =>
                      setForm({
                        ...form,
                        steps: [...form.steps, { extension: "", timeoutSec: form.ringTimeoutSec }],
                      })
                    }
                  >
                    Add backup desk
                  </button>
                </div>

                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setMoreOptions((v) => !v)}
                >
                  {moreOptions ? "Hide extra settings" : "Extra settings"}
                </button>

                {moreOptions && (
                  <div className="form-grid">
                    <label className="field">
                      <span>Who this applies to</span>
                      <select
                        value={form.matchType}
                        onChange={(e) => setForm({ ...form, matchType: e.target.value as Route["matchType"] })}
                      >
                        <option value="all">All inbound callers</option>
                        <option value="did">One incoming company number (DID)</option>
                        <option value="caller_prefix">Caller number starts with</option>
                      </select>
                    </label>
                    {form.matchType !== "all" && (
                      <label className="field">
                        <span>{form.matchType === "did" ? "Company number" : "Starts with"}</span>
                        <input
                          value={form.matchValue}
                          onChange={(e) => setForm({ ...form, matchValue: e.target.value })}
                          placeholder={form.matchType === "did" ? "1800123456" : "98"}
                        />
                      </label>
                    )}
                    <label className="field">
                      <span>Priority (lower runs first)</span>
                      <input
                        type="number"
                        value={form.priority}
                        onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                      />
                    </label>
                    <label className="field">
                      <span>PBX queue (optional)</span>
                      <input
                        value={form.queueNumber}
                        onChange={(e) => setForm({ ...form, queueNumber: e.target.value })}
                        placeholder="Only if you use a Neron queue"
                      />
                    </label>
                    <label className="field form-span switch-row">
                      <span>Rule is on</span>
                      <label className="switch">
                        <input
                          type="checkbox"
                          checked={form.enabled}
                          onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                        />
                      </label>
                    </label>
                    <label className="field form-span">
                      <span>Notes</span>
                      <textarea
                        rows={2}
                        value={form.notes}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      />
                    </label>
                  </div>
                )}
              </div>
              <div className="btn-row">
                <button className="btn" disabled={busy}>
                  {busy ? "Saving…" : editing ? "Save rule" : "Create rule"}
                </button>
                <button type="button" className="btn ghost" onClick={closeModal}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
