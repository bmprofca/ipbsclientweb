"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { LiveCall, useCalls } from "@/lib/calls";
import { parseContactSheet } from "@/lib/excel";
import { localNumberInput, normalizeLocalNumber } from "@ipbs/shared";
import { useSoftphone } from "@/lib/softphone";

type Group = {
  id: string;
  name: string;
  description: string;
  _count?: { contacts: number };
};

type Client = {
  id: string;
  name: string;
  phone: string;
  email: string;
  company: string;
  notes: string;
  crmContactId: string;
  dialState: string;
};

type BulkStatus = {
  campaign: { id: string; status: string; groupId: string; group?: { name: string }; mode?: string } | null;
  current: { id: string; name: string; phone: string; dialState: string } | null;
  voice?: {
    scriptName?: string;
    spokenText?: string;
    keys?: Array<{ digit: string; label: string; disposition: string }>;
  } | null;
  total: number;
  pending: number;
  calling: number;
  done: number;
  failed: number;
  skipped: number;
};

type VoiceScript = { id: string; name: string; source: string };

const TEMPLATE = `name,phone,email,company,notes,crmContactId
Neha Kapoor,9876543210,neha@lotusretail.in,Lotus Retail,VIP lead,CRM-1001
Arjun Nair,9123456780,arjun@coastal.logistics,Coastal Logistics,,CRM-1002
`;

function phoneKey(phone: string) {
  return phone.replace(/\D/g, "").slice(-10);
}

function dialLabel(state: string) {
  if (state === "calling") return "Calling";
  if (state === "done") return "Done";
  if (state === "failed") return "Failed";
  if (state === "skipped") return "Skipped";
  if (state === "idle") return "Not in run";
  if (state === "pending") return "Waiting";
  return state || "Waiting";
}

function statePill(state: string) {
  if (state === "calling" || state === "ringing") return "ring";
  if (state === "done" || state === "oncall") return "live";
  if (state === "failed") return "fail";
  if (state === "skipped") return "dead";
  return "idle";
}

function rowStatus(c: Client, liveMap: Map<string, LiveCall>, currentId?: string) {
  const liveRow = liveMap.get(phoneKey(c.phone));
  if (liveRow) {
    if (liveRow.state === "active") return { pill: "live" as const, label: "On call" };
    if (liveRow.state === "ringing" || liveRow.state === "originating" || liveRow.state === "inviting") {
      return { pill: "ring" as const, label: "Ringing" };
    }
    return { pill: "ring" as const, label: liveRow.state };
  }
  if (c.id === currentId && c.dialState === "calling") return { pill: "ring" as const, label: "Calling" };
  return { pill: statePill(c.dialState), label: dialLabel(c.dialState) };
}

export default function ClientsPage() {
  const { clickToCall, callFrom, setCallFrom, live, myCall } = useCalls();
  const phone = useSoftphone();
  const fileRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [addGroup, setAddGroup] = useState(false);
  const [addClient, setAddClient] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [entryName, setEntryName] = useState("");
  const [entryPhone, setEntryPhone] = useState("");
  const [addedCount, setAddedCount] = useState(0);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [bulk, setBulk] = useState<BulkStatus | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [scripts, setScripts] = useState<VoiceScript[]>([]);
  const [voiceScriptId, setVoiceScriptId] = useState("");
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const group = groups.find((g) => g.id === groupId);
  const open = Boolean(groupId);

  async function loadGroups() {
    const rows = await api<Group[]>("/contacts/groups");
    setGroups(rows);
    return rows;
  }

  async function loadClients(id: string) {
    const g = await api<{ contacts: Client[] }>(`/contacts/groups/${id}`);
    setClients(g.contacts || []);
  }

  async function loadBulk() {
    setBulk(await api<BulkStatus>("/calls/bulk"));
  }

  useEffect(() => {
    void loadGroups()
      .then(() => loadBulk())
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load lists"));
    void api<VoiceScript[]>("/voice/scripts")
      .then(setScripts)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    function close() {
      setMenuId(null);
    }
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  useEffect(() => {
    const active = bulk?.campaign?.status === "running" || bulk?.campaign?.status === "paused";
    if (!active) return;
    const t = setInterval(() => {
      void loadBulk();
      const gid = bulk?.campaign?.groupId || groupId;
      if (gid) void loadClients(gid);
    }, 1500);
    return () => clearInterval(t);
  }, [bulk?.campaign?.status, bulk?.campaign?.groupId, groupId]);

  useEffect(() => {
    if (!groupId) return;
    void loadClients(groupId);
    void loadBulk();
  }, [groupId, myCall?.uuid, myCall?.state, live.length]);

  useEffect(() => {
    setSelected((ids) => ids.filter((id) => clients.some((c) => c.id === id)));
  }, [clients]);

  const visibleGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || open) return groups;
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.description.toLowerCase().includes(q),
    );
  }, [groups, query, open]);

  const visibleClients = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.notes.toLowerCase().includes(q),
    );
  }, [clients, query]);

  async function openGroup(id: string) {
    setQuery("");
    setMenuId(null);
    setSelected([]);
    setGroupId(id);
    setMessage("");
    setError("");
    await loadClients(id);
    await loadBulk();
  }

  function backToGroups() {
    setGroupId("");
    setClients([]);
    setQuery("");
    setMenuId(null);
    setSelected([]);
    void loadGroups();
  }

  async function createGroup(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const created = await api<Group>("/contacts/groups", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          description: form.get("description"),
        }),
      });
      setAddGroup(false);
      await loadGroups();
      await openGroup(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create group");
    } finally {
      setBusy(false);
    }
  }

  async function saveClient(e: FormEvent<HTMLFormElement>, id?: string) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const name = entryName.trim();
    const phone = normalizeLocalNumber(entryPhone);
    if (phone.length !== 11) {
      setError("Enter a 10-digit number. 0 is added automatically.");
      setBusy(false);
      return;
    }
    try {
      await api(id ? `/contacts/${id}` : "/contacts", {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify({ name: name || phone, phone, groupId }),
      });
      await loadClients(groupId);
      await loadGroups();
      if (id) {
        setEditing(null);
        setAddClient(false);
        setMessage("Customer updated.");
      } else {
        setAddedCount((n) => n + 1);
        setEntryName("");
        setEntryPhone("");
        setMessage(`Added ${name || phone}. Enter the next person, or click Done.`);
        requestAnimationFrame(() => nameRef.current?.focus());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save customer");
    } finally {
      setBusy(false);
    }
  }

  function openAddModal() {
    setEditing(null);
    setEntryName("");
    setEntryPhone("");
    setAddedCount(0);
    setError("");
    setAddClient(true);
    requestAnimationFrame(() => nameRef.current?.focus());
  }

  function openEditModal(c: Client) {
    setAddClient(false);
    setEntryName(c.name);
    setEntryPhone(localNumberInput(c.phone));
    setError("");
    setEditing(c);
  }

  function closeEntryModal() {
    setAddClient(false);
    setEditing(null);
    setEntryName("");
    setEntryPhone("");
  }

  async function removeClient(id: string) {
    if (!confirm("Remove this customer from the group?")) return;
    setMenuId(null);
    await api(`/contacts/${id}`, { method: "DELETE" });
    await loadClients(groupId);
    await loadGroups();
  }

  async function removeGroup(id: string) {
    if (!confirm("Delete this group and all of its customers?")) return;
    setMenuId(null);
    await api(`/contacts/groups/${id}`, { method: "DELETE" });
    if (groupId === id) backToGroups();
    else await loadGroups();
  }

  async function importFile(file: File) {
    if (!groupId) return;
    setBusy(true);
    setError("");
    try {
      const rows = await parseContactSheet(file);
      const res = await api<{ imported: number; skipped: number }>("/contacts/import", {
        method: "POST",
        body: JSON.stringify({ groupId, rows }),
      });
      setMessage(`Imported ${res.imported} customers${res.skipped ? `, skipped ${res.skipped}` : ""}.`);
      await loadClients(groupId);
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function startBulk() {
    if (!groupId) return;
    if (voiceScriptId && callFrom !== "sip") {
      setError("Preloaded voice needs Softphone. Switch it on Profile, then start the campaign.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (voiceScriptId) {
        phone.armPbxInvite();
        const mic = await phone.enableMic();
        if (!mic) {
          setError("Allow a microphone so the script can play into the call.");
          setBusy(false);
          return;
        }
        await setCallFrom("sip");
        await phone.ensureRegistered().catch(() => undefined);
      }
      setBulk(
        await api<BulkStatus>("/calls/bulk/start", {
          method: "POST",
          body: JSON.stringify({
            groupId,
            reset: true,
            voiceScriptId: voiceScriptId || undefined,
            contactIds: selected.length ? selected : undefined,
          }),
        }),
      );
      setCampaignOpen(false);
      setMessage(
        voiceScriptId
          ? `Voice campaign started for ${selected.length || customerCount} number${(selected.length || customerCount) === 1 ? "" : "s"}. The script plays through this browser.`
          : `Campaign started for ${selected.length || customerCount} number${(selected.length || customerCount) === 1 ? "" : "s"}. Hang up when finished; the next number dials automatically.`,
      );
      await loadClients(groupId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start campaign");
    } finally {
      setBusy(false);
    }
  }

  async function pauseBulk() {
    setBulk(await api<BulkStatus>("/calls/bulk/pause", { method: "POST" }));
  }

  async function resumeBulk() {
    setBulk(await api<BulkStatus>("/calls/bulk/resume", { method: "POST" }));
  }

  async function skipBulk() {
    setBusy(true);
    try {
      setBulk(await api<BulkStatus>("/calls/bulk/skip", { method: "POST" }));
      if (groupId) await loadClients(groupId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not skip");
    } finally {
      setBusy(false);
    }
  }

  async function stopBulk() {
    if (!confirm("Stop bulk calling? The current call will hang up and the rest of the list will not dial.")) return;
    setBusy(true);
    setError("");
    try {
      setBulk(await api<BulkStatus>("/calls/bulk/stop", { method: "POST" }));
      if (groupId) await loadClients(groupId);
      setMessage("Bulk calling stopped.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not stop");
    } finally {
      setBusy(false);
    }
  }

  function parsePastedNumbers(text: string) {
    const rows: Record<string, string>[] = [];
    const seen = new Set<string>();
    for (const part of text.split(/[\n,;]+/)) {
      const phone = normalizeLocalNumber(part);
      if (phone.length !== 11 || seen.has(phone)) continue;
      seen.add(phone);
      rows.push({ phone, name: phone });
    }
    return rows;
  }

  async function importPasted() {
    if (!groupId) return;
    const rows = parsePastedNumbers(pasteText);
    if (!rows.length) {
      setError("Paste at least one phone number (one per line).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await api<{ imported: number; skipped: number }>("/contacts/import", {
        method: "POST",
        body: JSON.stringify({ groupId, rows }),
      });
      setMessage(`Mapped ${res.imported} numbers${res.skipped ? `, skipped ${res.skipped} duplicates` : ""}.`);
      setPasteOpen(false);
      setPasteText("");
      await loadClients(groupId);
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not map numbers");
    } finally {
      setBusy(false);
    }
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ipbs-client-list.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const customerCount = group?._count?.contacts ?? clients.length;
  const bulkHere = bulk?.campaign && bulk.campaign.groupId === groupId;
  const bulkActive =
    bulk?.campaign &&
    (bulk.campaign.status === "running" || bulk.campaign.status === "paused");
  const liveMap = useMemo(() => {
    const map = new Map<string, LiveCall>();
    for (const row of live) {
      if (row.state === "ended") continue;
      const key = phoneKey(row.to);
      if (key) map.set(key, row);
    }
    return map;
  }, [live]);
  const visibleIds = visibleClients.map((c) => c.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
  const someVisibleSelected = visibleIds.some((id) => selected.includes(id));
  const callCount = selected.length || customerCount;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
    }
  }, [someVisibleSelected, allVisibleSelected]);

  function toggleOne(id: string) {
    setSelected((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function toggleAllVisible() {
    if (allVisibleSelected) {
      setSelected((ids) => ids.filter((id) => !visibleIds.includes(id)));
      return;
    }
    setSelected((ids) => [...new Set([...ids, ...visibleIds])]);
  }

  return (
    <>
      <div className="user-toolbar">
        <div>
          <p className="eyebrow">Directory</p>
          <h1 className="page-title">{open ? group?.name : "Client list"}</h1>
          <p className="muted">
            {open
              ? `${customerCount} customer${customerCount === 1 ? "" : "s"} in this group${
                  selected.length ? ` · ${selected.length} selected` : ""
                }`
              : `${groups.length} group${groups.length === 1 ? "" : "s"} · click a group to open its customers`}
          </p>
        </div>
        <div className="toolbar-actions">
          {open ? (
            <button className="btn ghost" type="button" onClick={backToGroups}>
              All groups
            </button>
          ) : null}
          <input
            className="search"
            placeholder={open ? "Search name or number" : "Search groups"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {bulkActive ? (
            <button className="btn danger" type="button" onClick={() => void stopBulk()} disabled={busy}>
              Stop campaign
            </button>
          ) : null}
          {open ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv,.txt,.tsv"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importFile(file);
                }}
              />
              <button className="btn ghost" type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
                Import Excel
              </button>
              <button className="btn ghost" type="button" onClick={() => setPasteOpen(true)}>
                Paste numbers
              </button>
              <button className="btn" type="button" onClick={openAddModal}>
                Add customer
              </button>
              {bulkHere && (bulk.campaign?.status === "running" || bulk.campaign?.status === "paused") ? null : (
                <button
                  className="btn mint"
                  type="button"
                  onClick={() => {
                    setError("");
                    setCampaignOpen(true);
                  }}
                  disabled={busy || clients.length === 0}
                >
                  {selected.length ? `Start campaign (${selected.length})` : "Start campaign"}
                </button>
              )}
            </>
          ) : (
            <>
              <button className="btn ghost" type="button" onClick={downloadTemplate}>
                Excel template
              </button>
              <button className="btn" type="button" onClick={() => setAddGroup(true)}>
                New group
              </button>
            </>
          )}
        </div>
      </div>
      {message ? <p className="muted">{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {open && bulkHere && bulk ? (
        <section className="people-table" style={{ marginBottom: 16 }}>
          <div className="dir-toolbar">
            <div>
              <h3>
                Campaign{" "}
                <span className={`pill ${bulk.campaign!.status === "running" ? "ring" : bulk.campaign!.status === "paused" ? "idle" : "dead"}`}>
                  {bulk.campaign!.status}
                </span>
              </h3>
              <p className="muted">
                {bulk.current
                  ? `Now: ${bulk.current.name} · ${bulk.current.phone}`
                  : "Waiting for the next number"}
                {bulk.voice?.scriptName ? ` · ${bulk.voice.scriptName}` : " · Live agent"}
              </p>
              <p className="muted">
                {bulk.campaign!.mode === "voice"
                  ? "Preloaded audio plays through this browser. Hard phone will ring the list but will not play the script."
                  : "Live agent — you talk. Hang up to dial the next number."}
              </p>
            </div>
            <div className="btn-row">
              {bulk.campaign?.status === "running" ? (
                <>
                  <button className="btn ghost btn-tiny" type="button" onClick={() => void skipBulk()} disabled={busy}>
                    Next
                  </button>
                  <button className="btn ghost btn-tiny" type="button" onClick={() => void pauseBulk()}>
                    Pause
                  </button>
                  <button className="btn danger btn-tiny" type="button" onClick={() => void stopBulk()} disabled={busy}>
                    Stop campaign
                  </button>
                </>
              ) : bulk.campaign?.status === "paused" ? (
                <>
                  <button className="btn btn-tiny" type="button" onClick={() => void resumeBulk()}>
                    Resume
                  </button>
                  <button className="btn danger btn-tiny" type="button" onClick={() => void stopBulk()} disabled={busy}>
                    Stop campaign
                  </button>
                </>
              ) : null}
            </div>
          </div>
          <div className="campaign-stats">
            <div>
              <span>Done</span>
              <b>{bulk.done}</b>
            </div>
            <div>
              <span>Failed</span>
              <b>{bulk.failed}</b>
            </div>
            <div>
              <span>Skipped</span>
              <b>{bulk.skipped || 0}</b>
            </div>
            <div>
              <span>Remaining</span>
              <b>
                {bulk.pending} / {bulk.total}
              </b>
            </div>
          </div>
          {bulk.voice?.spokenText ? (
            <div className="kv-row">
              <span className="kv-label">Playing</span>
              <span className="kv-value">{bulk.voice.spokenText}</span>
            </div>
          ) : null}
          <div className="campaign-meter-wrap">
            <div className="bulk-meter" aria-hidden="true">
              <i
                style={{
                  width: `${bulk.total ? Math.round(((bulk.done + bulk.failed + (bulk.skipped || 0)) / bulk.total) * 100) : 0}%`,
                }}
              />
            </div>
          </div>
        </section>
      ) : null}

      {!open && (
        <section className="people-table">
          <div className="groups-head">
            <span>Group</span>
            <span>Description</span>
            <span>Customers</span>
            <span className="align-right">Actions</span>
          </div>
          {visibleGroups.map((g) => {
            const count = g._count?.contacts ?? 0;
            return (
              <div key={g.id} className="groups-row" onClick={() => void openGroup(g.id)}>
                <div className="user-id">
                  <b>{g.name}</b>
                </div>
                <span className="muted">{g.description || "—"}</span>
                <span className="count-pill">{count}</span>
                <div className="align-right" onClick={(e) => e.stopPropagation()}>
                  <div className="menu-wrap">
                    <button
                      className="kebab"
                      type="button"
                      aria-label={`Actions for ${g.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuId((id) => (id === g.id ? null : g.id));
                      }}
                    >
                      <span />
                      <span />
                      <span />
                    </button>
                    {menuId === g.id && (
                      <div className="menu" onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => void openGroup(g.id)}>
                          Open
                        </button>
                        <button type="button" onClick={() => void removeGroup(g.id)}>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {visibleGroups.length === 0 && (
            <div className="people-empty">No groups yet. Create a group, then add or import customers.</div>
          )}
        </section>
      )}

      {open && (
        <section className="people-table">
          {clients.length > 0 ? (
            <div className="select-bar">
              <span>
                {selected.length ? (
                  <>
                    <b>{selected.length}</b> selected
                  </>
                ) : (
                  <>Tick rows to call a subset, or start the campaign for everyone.</>
                )}
              </span>
              {selected.length ? (
                <button className="link-btn" type="button" onClick={() => setSelected([])}>
                  Clear
                </button>
              ) : (
                <button className="link-btn" type="button" onClick={toggleAllVisible}>
                  Select all
                </button>
              )}
            </div>
          ) : null}
          <div className="cust-head">
            <span>SL</span>
            <span>
              <input
                ref={selectAllRef}
                className="cust-check"
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleAllVisible}
                aria-label="Select all visible customers"
                disabled={visibleClients.length === 0}
              />
            </span>
            <span>Customer</span>
            <span>Number</span>
            <span>Company</span>
            <span>Notes</span>
            <span>Status</span>
            <span className="align-right">Actions</span>
          </div>
          {visibleClients.map((c) => {
            const sl = clients.findIndex((row) => row.id === c.id) + 1;
            const picked = selected.includes(c.id);
            const status = rowStatus(c, liveMap, bulkHere ? bulk?.current?.id : undefined);
            const onThisCall = Boolean(liveMap.get(phoneKey(c.phone))) || c.dialState === "calling";
            return (
              <div
                key={c.id}
                className={`cust-row${onThisCall ? " current" : ""}${picked ? " picked" : ""}`}
              >
                <span className="cust-sl">{sl}</span>
                <span>
                  <input
                    className="cust-check"
                    type="checkbox"
                    checked={picked}
                    onChange={() => toggleOne(c.id)}
                    aria-label={`Select ${c.name}`}
                  />
                </span>
                <div className="user-id">
                  <b>{c.name}</b>
                  <span className="muted">{c.email || c.crmContactId || "—"}</span>
                </div>
                <span className="ext-read">{c.phone}</span>
                <span className="cust-company">{c.company || "—"}</span>
                <span className="cust-notes muted">{c.notes || "—"}</span>
                <span className={`pill cust-status ${status.pill}`}>{status.label}</span>
                <div className="align-right">
                  <div className="row-actions">
                    <button
                      className="btn mint btn-tiny"
                      type="button"
                      onClick={() => void clickToCall(c.phone, c.crmContactId)}
                    >
                      Call
                    </button>
                    <div className="menu-wrap">
                      <button
                        className="kebab"
                        type="button"
                        aria-label={`Actions for ${c.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuId((id) => (id === c.id ? null : c.id));
                        }}
                      >
                        <span />
                        <span />
                        <span />
                      </button>
                      {menuId === c.id && (
                        <div className="menu" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => {
                              setMenuId(null);
                              openEditModal(c);
                            }}
                          >
                            Edit
                          </button>
                          <button type="button" onClick={() => void removeClient(c.id)}>
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {visibleClients.length === 0 && (
            <div className="people-empty">
              <p>No customers in this group yet.</p>
              <div className="btn-row" style={{ marginTop: 12 }}>
                <button className="btn mint" type="button" onClick={openAddModal}>
                  Add name and number
                </button>
                <button className="btn ghost" type="button" onClick={() => setPasteOpen(true)}>
                  Paste numbers
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {addGroup && (
        <div className="modal-back" onClick={() => setAddGroup(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>New group</h2>
            <p className="muted">A group is a calling list. Open it to add or import customers.</p>
            <form onSubmit={createGroup}>
              <label className="field">
                <span>Group name</span>
                <input name="name" required autoFocus placeholder="Mumbai leads" />
              </label>
              <label className="field">
                <span>Description (optional)</span>
                <input name="description" placeholder="April outbound" />
              </label>
              <div className="btn-row">
                <button className="btn" disabled={busy}>
                  {busy ? "Saving…" : "Create group"}
                </button>
                <button type="button" className="btn ghost" onClick={() => setAddGroup(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {(addClient || editing) && (
        <div className="modal-back" onClick={closeEntryModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editing ? "Edit customer" : "Add name and number"}</h2>
            <p className="muted">
              {editing
                ? "Update this person on the calling list."
                : addedCount > 0
                  ? `${addedCount} added. Keep going one by one, then click Done.`
                  : "Type the 10-digit number only. 0 is added automatically. Click Done when the list is ready."}
            </p>
            <form onSubmit={(e) => void saveClient(e, editing?.id)}>
              <label className="field">
                <span>Name</span>
                <input
                  ref={nameRef}
                  value={entryName}
                  onChange={(e) => setEntryName(e.target.value)}
                  placeholder="Mubarak Ali"
                  autoFocus
                  required
                />
              </label>
              <label className="field">
                <span>Number (10 digits)</span>
                <input
                  value={entryPhone}
                  onChange={(e) => setEntryPhone(localNumberInput(e.target.value))}
                  placeholder="10 digits, 0 added auto — 7002695990"
                  inputMode="numeric"
                  maxLength={10}
                  required
                />
                <p className="muted" style={{ margin: 0 }}>
                  {entryPhone.length === 10
                    ? `Will dial ${normalizeLocalNumber(entryPhone)}`
                    : "Type 10 digits. 0 is added automatically."}
                </p>
              </label>
              {error ? <p className="error">{error}</p> : null}
              <div className="btn-row">
                <button className="btn mint" disabled={busy}>
                  {busy ? "Saving…" : editing ? "Save" : "Save and add next"}
                </button>
                <button type="button" className="btn ghost" onClick={closeEntryModal}>
                  {editing ? "Cancel" : addedCount > 0 ? "Done" : "Cancel"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pasteOpen && (
        <div className="modal-back" onClick={() => setPasteOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Map numbers</h2>
            <p className="muted">
              Paste 10-digit numbers, one per line. 0 is prefixed automatically.
            </p>
            <label className="field">
              <span>Numbers</span>
              <textarea
                rows={10}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={"10 digits each, 0 added auto\n7002695990\n9876543210"}
                autoFocus
              />
            </label>
            <div className="btn-row">
              <button className="btn mint" type="button" disabled={busy} onClick={() => void importPasted()}>
                {busy ? "Saving…" : "Add to list"}
              </button>
              <button type="button" className="btn ghost" onClick={() => setPasteOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {campaignOpen && group && (
        <div className="modal-back" onClick={() => setCampaignOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Start campaign</h2>
            <p className="muted">
              {group.name} · {selected.length
                ? `${selected.length} selected of ${customerCount}`
                : `all ${callCount} number${callCount === 1 ? "" : "s"}`}
              . Preloaded audio plays through this browser. Hard phone will ring the list but will not play the script.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void startBulk();
              }}
            >
              <label className="field">
                <span>Mode</span>
                <select
                  value={voiceScriptId}
                  onChange={(e) => setVoiceScriptId(e.target.value)}
                >
                  <option value="">Live agent — you talk</option>
                  {scripts.map((s) => (
                    <option key={s.id} value={s.id}>
                      Preloaded voice · {s.name}
                      {s.source === "recording" ? " (recorded)" : " (TTS)"}
                    </option>
                  ))}
                </select>
              </label>
              {voiceScriptId ? (
                <p className="muted">
                  {callFrom !== "sip" ? (
                    <>
                      Switch Profile to Softphone, allow a microphone, then start.{" "}
                      <Link href="/app/profile" className="link-btn">
                        Open Profile →
                      </Link>
                    </>
                  ) : !phone.micOk ? (
                    <>Allow a microphone so the script mixes into the call.</>
                  ) : (
                    <>Softphone is ready. The script plays after each customer answers.</>
                  )}
                </p>
              ) : (
                <p className="muted">Live agent can use a hard phone or softphone. Hang up to dial the next number.</p>
              )}
              {scripts.length === 0 ? (
                <p className="muted">
                  No voice scripts yet.{" "}
                  <Link href="/app/voice" className="link-btn">
                    Create one on Voice →
                  </Link>
                </p>
              ) : null}
              {error ? <p className="error">{error}</p> : null}
              <div className="btn-row">
                <button
                  className="btn mint"
                  disabled={
                    busy ||
                    (Boolean(voiceScriptId) && callFrom !== "sip")
                  }
                >
                  {busy ? "Starting…" : selected.length ? `Start campaign (${selected.length})` : "Start campaign"}
                </button>
                {voiceScriptId && callFrom === "sip" && !phone.micOk ? (
                  <button className="btn ghost" type="button" onClick={() => void phone.enableMic()}>
                    Allow microphone
                  </button>
                ) : null}
                <button type="button" className="btn ghost" onClick={() => setCampaignOpen(false)}>
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
