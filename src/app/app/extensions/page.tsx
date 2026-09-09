"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

type MappedUser = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  role: string;
  sipPasswordSet?: boolean;
  phoneMode?: "desk" | "sip";
};

type PbxExt = {
  number: string;
  username?: string;
  status?: string;
  type?: string;
  port?: string;
  mqttError?: string;
  mapped: MappedUser[];
};

type PbxTrunk = {
  name: string;
  type: string;
  status: string;
  port?: string;
  vbat?: string;
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  extension: string;
  isActive: boolean;
  sipPasswordSet?: boolean;
  phoneMode?: "desk" | "sip";
};

type LineKind = "sip" | "fxs" | "fxo" | "sim" | "other";

type LineView = {
  kind: LineKind;
  title: string;
  detail: string;
};

const CALL_LIMITS = [
  {
    value: "1",
    label: "Office only",
    example: "Can ring other extensions (1001, 8001). Cannot call mobiles or landlines.",
  },
  {
    value: "2",
    label: "Local numbers",
    example: "Same-city / local area. Blocks STD and international.",
  },
  {
    value: "3",
    label: "Anywhere in India",
    example: "Local + STD. Typical for agents. Blocks international (ISD).",
  },
  {
    value: "4",
    label: "Worldwide",
    example: "No extra dial limit from this app, including ISD.",
  },
] as const;

function presenceClass(status?: string) {
  const p = String(status || "");
  if (/inuse|talk|busy|answer/i.test(p)) return "live";
  if (/ring/i.test(p)) return "ring";
  if (/unavail|missing|fail|unknown|disconnect/i.test(p)) return "dead";
  if (!p) return "dead";
  return "idle";
}

function isSipExt(e: PbxExt) {
  const t = String(e.type || "SIP").toUpperCase();
  return t === "SIP" || t === "";
}

function lineKind(type?: string, name?: string): LineKind {
  const blob = `${type || ""} ${name || ""}`.toUpperCase();
  if (/GSM|SIM|3G|4G|LTE|MOBILE/.test(blob)) return "sim";
  if (/\bFXS\b/.test(blob)) return "fxs";
  if (/\bFXO\b/.test(blob)) return "fxo";
  if (/\bSIP\b/.test(blob)) return "sip";
  return "other";
}

function extensionLine(e: PbxExt): LineView {
  const kind = lineKind(e.type);
  if (kind === "fxs") {
    return { kind, title: "FXS analog", detail: e.port ? `Port ${e.port}` : "Handset port" };
  }
  if (kind === "sim") {
    return { kind, title: "SIM card", detail: e.port ? `Port ${e.port}` : e.type || "GSM" };
  }
  if (kind === "fxo") {
    return { kind, title: "FXO", detail: e.port ? `Port ${e.port}` : "PSTN" };
  }
  return { kind: "sip", title: "SIP", detail: "VoIP extension" };
}

function trunkLine(t: PbxTrunk): LineView {
  const kind = lineKind(t.type, t.name);
  if (kind === "sim") {
    const port = t.port && t.port !== "0" ? `Port ${t.port}` : "";
    return { kind, title: "SIM card", detail: [t.name, port].filter(Boolean).join(" · ") || "GSM / mobile" };
  }
  if (kind === "fxo") {
    return { kind, title: "FXO trunk", detail: t.port ? `Port ${t.port}` : t.name };
  }
  if (kind === "sip") {
    return { kind, title: "SIP trunk", detail: t.name };
  }
  return { kind: "other", title: t.type || "Trunk", detail: t.name };
}

function NeronSipSteps() {
  return (
    <ol className="softphone-steps">
      <li>
        In <b>Neron admin</b> → <b>Extension</b> → <b>SIP</b>, open the number (example <code>1001</code>).
      </li>
      <li>
        Leave <b>client address / IP</b> empty (not your PC, not <code>192.168.0.106:5060</code>). After this browser
        registers, Neron fills that itself.
      </li>
      <li>
        SIP address is <code>sip:1001@192.168.0.180</code> (the PBX). Copy the SIP password, map it here, then Register
        in this app.
      </li>
    </ol>
  );
}

export default function ExtensionsPage() {
  const { user, refresh } = useSession();
  const [rows, setRows] = useState<PbxExt[]>([]);
  const [trunks, setTrunks] = useState<PbxTrunk[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState("");
  const [assigning, setAssigning] = useState<PbxExt | null>(null);
  const [callClassFor, setCallClassFor] = useState<PbxExt | null>(null);
  const [callClass, setCallClass] = useState("3");
  const [softphoneFor, setSoftphoneFor] = useState<PbxExt | "pick" | null>(null);

  async function reload() {
    const [extsRes, peopleRes, trunkRes] = await Promise.allSettled([
      api<PbxExt[]>("/org/extensions"),
      api<UserRow[]>("/users"),
      api<PbxTrunk[]>("/org/trunks"),
    ]);
    if (extsRes.status === "fulfilled") setRows(extsRes.value);
    else setRows([]);
    if (peopleRes.status === "fulfilled") setUsers(peopleRes.value);
    else setUsers([]);
    if (trunkRes.status === "fulfilled") setTrunks(trunkRes.value);
    else setTrunks([]);
    const fail = [extsRes, peopleRes].find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    if (fail) {
      const reason = fail.reason instanceof Error ? fail.reason.message : "Could not load extensions";
      setError(reason);
    } else {
      const mqttError = (extsRes.value[0]?.mqttError || "").trim();
      if (mqttError) setError(mqttError);
      else setError("");
    }
  }

  useEffect(() => {
    void reload().catch((e) => setError(e instanceof Error ? e.message : "Could not load extensions"));
  }, []);

  const unusedSip = useMemo(
    () =>
      rows
        .filter((e) => isSipExt(e) && e.mapped.length === 0)
        .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })),
    [rows],
  );

  const sipRows = useMemo(
    () =>
      rows
        .filter((e) => isSipExt(e))
        .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true })),
    [rows],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((e) => {
      const line = extensionLine(e);
      return (
        e.number.includes(q) ||
        (e.type || "").toLowerCase().includes(q) ||
        (e.status || "").toLowerCase().includes(q) ||
        (e.username || "").toLowerCase().includes(q) ||
        (e.port || "").toLowerCase().includes(q) ||
        line.title.toLowerCase().includes(q) ||
        line.detail.toLowerCase().includes(q) ||
        e.mapped.some((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      );
    });
  }, [rows, query]);

  const mappedCount = rows.filter((e) => e.mapped.length).length;
  const trunkCounts = useMemo(() => {
    const counts = { sip: 0, fxo: 0, sim: 0, other: 0 };
    for (const t of trunks) {
      const kind = trunkLine(t).kind;
      if (kind === "sip") counts.sip += 1;
      else if (kind === "fxo") counts.fxo += 1;
      else if (kind === "sim") counts.sim += 1;
      else counts.other += 1;
    }
    return counts;
  }, [trunks]);

  async function enable(number: string) {
    setBusy(number);
    setError("");
    setOk("");
    try {
      const res = await api<{ ok?: boolean; message?: string; status?: string }>(
        `/org/extensions/${encodeURIComponent(number)}/enable`,
        { method: "POST" },
      );
      await reload();
      setOk(res.message || `Login enabled for ${number}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not enable extension");
    } finally {
      setBusy("");
    }
  }

  async function saveCallClass(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!callClassFor) return;
    setBusy(callClassFor.number);
    setError("");
    setOk("");
    try {
      const res = await api<{ ok?: boolean; message?: string }>(
        `/org/extensions/${encodeURIComponent(callClassFor.number)}/permission`,
        { method: "POST", body: JSON.stringify({ permission: callClass }) },
      );
      const label = CALL_LIMITS.find((c) => c.value === callClass)?.label || callClass;
      setCallClassFor(null);
      await reload();
      setOk(`${callClassFor.number} can now dial: ${label.toLowerCase()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set call class");
    } finally {
      setBusy("");
    }
  }

  async function assign(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!assigning) return;
    const form = new FormData(e.currentTarget);
    const userId = String(form.get("userId") || "");
    if (!userId) return;
    setBusy(assigning.number);
    setError("");
    setOk("");
    try {
      await api(`/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ extension: assigning.number }),
      });
      setAssigning(null);
      await reload();
      setOk(`Mapped a user to ${assigning.number}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not map user");
    } finally {
      setBusy("");
    }
  }

  async function addSoftphone(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const userId = String(form.get("userId") || "");
    const number = String(form.get("extension") || "");
    const sipPassword = String(form.get("sipPassword") || "");
    const useNow = String(form.get("useNow") || "") === "yes";
    if (!userId || !number || !sipPassword) return;
    if (!sipRows.some((x) => x.number === number)) {
      setError("Pick a SIP extension that already exists on the Neron.");
      return;
    }
    setBusy(number);
    setError("");
    setOk("");
    try {
      await api(`/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({
          extension: number,
          sipPassword,
          ...(useNow ? { phoneMode: "sip" } : {}),
        }),
      });
      const enabled = await api<{ message?: string }>(`/org/extensions/${encodeURIComponent(number)}/enable`, {
        method: "POST",
      }).catch(() => ({ message: "" }));
      setSoftphoneFor(null);
      await reload();
      if (user?.id === userId) await refresh();
      const who = users.find((u) => u.id === userId);
      const self = user?.id === userId;
      setOk(
        `${enabled.message ? `${enabled.message} ` : ""}Mapped softphone ${number} to ${who?.name || "the user"}. ${
          self && useNow
            ? "Allow a microphone on Click to call, then Register."
            : self
              ? "On Click to call, switch Place call from to Softphone, allow a microphone, then Register."
              : "That user should switch Place call from to Softphone, allow a microphone, then Register."
        }`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not map softphone");
    } finally {
      setBusy("");
    }
  }

  async function refreshInventory() {
    setError("");
    try {
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not refresh");
    }
  }

  return (
    <>
      <div className="user-toolbar">
        <div>
          <p className="eyebrow">Telephony</p>
          <h1 className="page-title">Extensions</h1>
          <p className="muted">
            The Neron already owns the numbers. Map a portal user to a SIP extension, store that extension&apos;s SIP
            password, then Register from Click to call. This app cannot create extensions on the PBX. FXS analog
            ports cannot be a browser softphone.
          </p>
        </div>
        <div className="toolbar-actions">
          <input
            className="search"
            placeholder="Search number, line, or user"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn ghost" type="button" onClick={() => void refreshInventory()}>
            Refresh
          </button>
          <button className="btn" type="button" onClick={() => setSoftphoneFor("pick")}>
            Map softphone
          </button>
        </div>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {ok ? <p className="ok-msg">{ok}</p> : null}
      <p className="muted" style={{ marginTop: error || ok ? 0 : -8, marginBottom: 16 }}>
          {rows.length} on PBX · {mappedCount} mapped · {unusedSip.length} unused SIP
          {trunks.length
            ? ` · ${trunks.length} calling ${trunks.length === 1 ? "line" : "lines"}`
            : ""}
      </p>

      <section className="people-table ext-section">
        <div className="maps-toolbar">
          <div>
            <h3>Calling lines</h3>
            <p className="muted">
              Live SIP trunks, FXO (PSTN), and SIM / GSM from <code>trunk_list</code>. Outbound from an extension
              follows Neron routes — MQTT cannot bind a trunk to a specific extension.
            </p>
          </div>
          <p className="muted">
            {trunkCounts.sip} SIP · {trunkCounts.fxo} FXO · {trunkCounts.sim} SIM
            {trunkCounts.other ? ` · ${trunkCounts.other} other` : ""}
          </p>
        </div>
        {trunks.length === 0 ? (
          <div className="people-empty">
            No trunks returned from the PBX. Check MQTT, then add SIP / FXO / GSM lines in Neron admin.
          </div>
        ) : (
          <>
            <div className="trunk-head">
              <span>Line</span>
              <span>Name</span>
              <span>Status</span>
              <span>Port</span>
              <span>Battery</span>
            </div>
            {trunks.map((t) => {
              const line = trunkLine(t);
              return (
                <div key={`${t.type}-${t.name}-${t.port || ""}`} className="trunk-row">
                  <div className="line-cell">
                    <span className={`pill line-${line.kind}`}>{line.title}</span>
                    <span className="muted">{t.type || "Trunk"}</span>
                  </div>
                  <b className="ext-read">{t.name}</b>
                  <div>
                    <span className={`pill ${presenceClass(t.status)}`}>{t.status || "Unknown"}</span>
                  </div>
                  <span>{t.port || "—"}</span>
                  <span>{t.vbat || "—"}</span>
                </div>
              );
            })}
          </>
        )}
      </section>

      <section className="people-table ext-section">
        <div className="maps-toolbar">
          <div>
            <h3>PBX extensions</h3>
            <p className="muted">
              Line is SIP or analog (FXS). <b>Map softphone</b> stores the Neron SIP password for a portal user on that
              SIP number (desk set and browser can share the same extension; only one is active). Allowed calls limits
              how far they may dial.
            </p>
          </div>
        </div>
        <div className="ext-table-wrap">
          <div className="ext-head">
            <span>Extension</span>
            <span>Line</span>
            <span>Status</span>
            <span>Mapped user</span>
            <span className="align-right">Actions</span>
          </div>
          {visible.length === 0 ? (
            <div className="people-empty">
              {rows.length === 0
                ? error
                  ? `No extensions from the PBX (${error}). Mapped SIP numbers still appear here once a user has an extension on Users.`
                  : "No extensions returned from the PBX. Check MQTT on PBX settings, then create SIP/FXS numbers in Neron admin."
                : "No extensions match that search."}
            </div>
          ) : (
            visible.map((e) => {
              const line = extensionLine(e);
              return (
                <div key={e.number} className="ext-row">
                  <div className="user-id">
                    <b className="ext-read">{e.number}</b>
                    <span className="muted">{e.username && e.username !== e.number ? e.username : "PBX extension"}</span>
                  </div>
                  <div className="line-cell">
                    <span className={`pill line-${line.kind}`}>{line.title}</span>
                    <span className="muted">{line.detail}</span>
                  </div>
                  <div>
                    <span className={`pill ${presenceClass(e.status)}`}>{e.status || "Unknown"}</span>
                  </div>
                  <div className="ext-mapped">
                    {e.mapped.length === 0 ? (
                      <span className="muted">Not mapped</span>
                    ) : (
                      e.mapped.map((u) => (
                        <span key={u.id} className="hunt-chip" title={u.email}>
                          {u.name}
                          <em>
                            {u.role}
                            {u.sipPasswordSet ? " · softphone" : ""}
                            {u.phoneMode === "sip" ? " · active" : ""}
                          </em>
                        </span>
                      ))
                    )}
                  </div>
                  <div className="ext-actions">
                    <button
                      className="btn ghost btn-tiny"
                      type="button"
                      disabled={busy === e.number}
                      onClick={() => setAssigning(e)}
                    >
                      Map user
                    </button>
                    {isSipExt(e) ? (
                      <button
                        className="btn ghost btn-tiny"
                        type="button"
                        disabled={Boolean(busy)}
                        onClick={() => setSoftphoneFor(e)}
                      >
                        Map softphone
                      </button>
                    ) : null}
                    <button
                      className="btn mint btn-tiny"
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => void enable(e.number)}
                    >
                      {busy === e.number ? "Enabling…" : "Enable login"}
                    </button>
                    <button
                      className="btn ghost btn-tiny"
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => {
                        setCallClass("3");
                        setCallClassFor(e);
                      }}
                    >
                      Allowed calls
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {assigning && (
        <div className="modal-back" onClick={() => setAssigning(null)}>
          <div className="modal" onClick={(ev) => ev.stopPropagation()}>
            <h2>Map user to {assigning.number}</h2>
            <p className="muted">
              Assign a portal login to this existing PBX extension. The number must already exist on the Neron.
            </p>
            <form onSubmit={assign}>
              <label className="field">
                <span>Portal user</span>
                <select name="userId" required defaultValue={assigning.mapped[0]?.id || ""}>
                  <option value="" disabled>
                    Select a user
                  </option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} {u.extension ? `(now ${u.extension})` : "(unmapped)"}
                    </option>
                  ))}
                </select>
              </label>
              <div className="btn-row">
                <button className="btn" disabled={Boolean(busy)}>
                  {busy ? "Saving…" : "Save mapping"}
                </button>
                <button type="button" className="btn ghost" onClick={() => setAssigning(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {callClassFor && (
        <div className="modal-back" onClick={() => setCallClassFor(null)}>
          <div className="modal modal-wide" onClick={(ev) => ev.stopPropagation()}>
            <h2>Who can {callClassFor.number} call?</h2>
            <p className="muted">
              {callClassFor.mapped.length
                ? `${callClassFor.mapped.map((u) => u.name).join(" and ")} use this extension. `
                : "Nobody is mapped to this extension yet. "}
              Pick how far they may dial. Use this to stop costly ISD from a junior agent, while a supervisor can still
              call anywhere. The PBX still chooses FXO, SIP, or SIM — this only sets the limit.
            </p>
            <form onSubmit={saveCallClass}>
              <div className="call-limit-list" role="radiogroup" aria-label="Allowed calls">
                {CALL_LIMITS.map((c) => {
                  const on = callClass === c.value;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      className={`call-limit${on ? " on" : ""}`}
                      role="radio"
                      aria-checked={on}
                      onClick={() => setCallClass(c.value)}
                    >
                      <span className="call-limit-dot" aria-hidden />
                      <span>
                        <b>{c.label}</b>
                        <span className="muted">{c.example}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="btn-row">
                <button className="btn" disabled={Boolean(busy)}>
                  {busy ? "Saving…" : "Save"}
                </button>
                <button type="button" className="btn ghost" onClick={() => setCallClassFor(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {softphoneFor && (
        <div className="modal-back" onClick={() => setSoftphoneFor(null)}>
          <div className="modal modal-wide" onClick={(ev) => ev.stopPropagation()}>
            <h2>
              Map softphone
              {softphoneFor !== "pick" ? ` to ${softphoneFor.number}` : ""}
            </h2>
            {sipRows.length === 0 ? (
              <>
                <p className="muted">
                  No SIP extensions are on the Neron. This app cannot create a number. Add a SIP extension in Neron
                  admin (not FXS), then refresh.
                </p>
                <NeronSipSteps />
                <div className="btn-row" style={{ marginTop: 16 }}>
                  <button className="btn" type="button" onClick={() => void refreshInventory()}>
                    Refresh inventory
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setSoftphoneFor(null)}>
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="muted">
                  Pick a SIP extension that already exists on the Neron and a portal user. Paste the SIP password from
                  that extension on the PBX. The same number can stay on a desk phone; only one device is active at a
                  time.
                </p>
                <form onSubmit={addSoftphone}>
                  <label className="field">
                    <span>SIP extension</span>
                    <select
                      name="extension"
                      required
                      defaultValue={softphoneFor === "pick" ? sipRows[0]?.number || "" : softphoneFor.number}
                      disabled={softphoneFor !== "pick"}
                    >
                      {(softphoneFor === "pick" ? sipRows : [softphoneFor]).map((e) => (
                        <option key={e.number} value={e.number}>
                          {e.number}
                          {e.status ? ` · ${e.status}` : ""}
                          {e.mapped.length ? ` · ${e.mapped.map((u) => u.name).join(", ")}` : " · not mapped"}
                        </option>
                      ))}
                    </select>
                    {softphoneFor !== "pick" ? <input type="hidden" name="extension" value={softphoneFor.number} /> : null}
                  </label>
                  <label className="field">
                    <span>Portal user</span>
                    <select
                      name="userId"
                      required
                      defaultValue={
                        (softphoneFor !== "pick" && softphoneFor.mapped[0]?.id) || user?.id || users[0]?.id || ""
                      }
                    >
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} {u.extension ? `(now ${u.extension})` : "(no extension)"}
                          {u.sipPasswordSet ? " · SIP password saved" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>SIP password from the Neron</span>
                    <input
                      name="sipPassword"
                      type="password"
                      required
                      minLength={1}
                      autoComplete="off"
                      placeholder="Must match this extension on the PBX"
                    />
                  </label>
                  <label className="check">
                    <input type="checkbox" name="useNow" value="yes" defaultChecked />
                    Make this the active phone (Place call from Softphone)
                  </label>
                  <p className="muted">
                    After save: Click to call → allow microphone → Register. Desk and softphone cannot both be
                    registered at once.
                  </p>
                  <div className="btn-row">
                    <button className="btn" disabled={Boolean(busy)}>
                      {busy ? "Saving…" : "Save mapping"}
                    </button>
                    <button type="button" className="btn ghost" onClick={() => setSoftphoneFor(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
