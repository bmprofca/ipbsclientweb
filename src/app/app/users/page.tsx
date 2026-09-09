"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { ExtensionSelect, type PbxExtensionOption } from "@/components/ExtensionSelect";
import { PhoneModePicker } from "@/components/PhoneModePicker";
import { useSession } from "@/lib/session";
import { useCalls, type CallFrom } from "@/lib/calls";
import { phoneModeLabel } from "@ipbs/shared";

type UserRow = {
  id: string;
  email: string;
  mobile: string;
  name: string;
  role: string;
  extension: string;
  isActive: boolean;
  sipPasswordSet?: boolean;
  phoneMode?: CallFrom;
  crmLinkCount?: number;
  crmLinkId?: string;
  crmUserId?: string;
  crmToken?: string;
  crmTokenPrefix?: string;
};

type CrmLinkRow = {
  id: string;
  crmUserId: string;
  label: string;
  tokenPrefix: string;
  token?: string;
  extension: string;
  lastUsedAt: string | null;
  createdAt: string;
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function roleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function UsersPage() {
  const { user, org, refresh } = useSession();
  const { setCallFrom } = useCalls();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [phones, setPhones] = useState<UserRow | null>(null);
  const [linking, setLinking] = useState<UserRow | null>(null);
  const [links, setLinks] = useState<CrmLinkRow[]>([]);
  const [mintedToken, setMintedToken] = useState("");
  const [crmUserId, setCrmUserId] = useState("");
  const [crmLabel, setCrmLabel] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [phoneMode, setPhoneMode] = useState<CallFrom>("desk");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pbxExts, setPbxExts] = useState<PbxExtensionOption[]>([]);

  async function reload() {
    setRows(await api<UserRow[]>("/users"));
  }

  useEffect(() => {
    void reload().catch((e) => setError(e instanceof Error ? e.message : "Could not load users"));
    void api<PbxExtensionOption[]>("/org/extensions")
      .then(setPbxExts)
      .catch(() => setPbxExts([]));
  }, []);

  useEffect(() => {
    function close() {
      setMenuId(null);
    }
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.mobile || "").includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q) ||
        u.extension.includes(q),
    );
  }, [rows, query]);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      await api("/users", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          mobile: form.get("mobile"),
          email: form.get("email"),
          role: form.get("role"),
          extension: form.get("extension"),
          sipPassword: form.get("sipPassword"),
          phoneMode: form.get("phoneMode") || "desk",
        }),
      });
      setAddOpen(false);
      await reload();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add user");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      await api(`/users/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.get("name"),
          mobile: form.get("mobile"),
          role: form.get("role"),
          extension: form.get("extension"),
          isActive: form.get("isActive") === "on",
          sipPassword: form.get("sipPassword") || undefined,
          phoneMode: form.get("phoneMode") || editing.phoneMode || "desk",
        }),
      });
      setEditing(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update user");
    } finally {
      setBusy(false);
    }
  }

  async function savePhones(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!phones) return;
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const sipPassword = String(form.get("sipPassword") || "");
    try {
      await api(`/users/${phones.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          phoneMode,
          ...(sipPassword ? { sipPassword } : {}),
        }),
      });
      if (user?.id === phones.id) {
        await setCallFrom(phoneMode);
        await refresh();
      }
      setPhones(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update phones");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(u: UserRow) {
    await api(`/users/${u.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !u.isActive }),
    });
    setMenuId(null);
    await reload();
    await refresh();
  }

  async function openCrmLink(u: UserRow) {
    setError("");
    setMintedToken("");
    setCrmUserId("");
    setCrmLabel("");
    setCopiedId("");
    setLinking(u);
    try {
      setLinks(await api<CrmLinkRow[]>(`/users/${u.id}/crm-links`));
    } catch (err) {
      setLinks([]);
      setError(err instanceof Error ? err.message : "Could not load CRM links");
    }
  }

  async function mintCrmLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!linking) return;
    setBusy(true);
    setError("");
    setCopiedId("");
    try {
      const minted = await api<{ token: string }>(`/users/${linking.id}/crm-links`, {
        method: "POST",
        body: JSON.stringify({ crmUserId, label: crmLabel }),
      });
      setMintedToken(minted.token);
      setLinks(await api<CrmLinkRow[]>(`/users/${linking.id}/crm-links`));
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create CRM link");
    } finally {
      setBusy(false);
    }
  }

  async function revokeCrmLink(linkId: string) {
    if (!linking) return;
    setBusy(true);
    setError("");
    try {
      await api(`/users/${linking.id}/crm-links/${linkId}`, { method: "DELETE" });
      if (mintedToken) setMintedToken("");
      setLinks(await api<CrmLinkRow[]>(`/users/${linking.id}/crm-links`));
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke token");
    } finally {
      setBusy(false);
    }
  }

  async function rotateModalLink(linkId: string) {
    if (!linking) return;
    setBusy(true);
    setError("");
    try {
      const rotated = await api<{ token: string }>(`/users/${linking.id}/crm-links/${linkId}/rotate`, {
        method: "POST",
      });
      setMintedToken(rotated.token);
      setLinks(await api<CrmLinkRow[]>(`/users/${linking.id}/crm-links`));
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not regenerate token");
    } finally {
      setBusy(false);
    }
  }

  async function copyValue(id: string, value: string) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopiedId(id);
  }

  async function generateRowToken(u: UserRow) {
    if (!u.extension) {
      setError("Map a PBX extension on this user first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (u.crmLinkId) {
        await api(`/users/${u.id}/crm-links/${u.crmLinkId}/rotate`, { method: "POST" });
      } else {
        await api(`/users/${u.id}/crm-links`, {
          method: "POST",
          body: JSON.stringify({ crmUserId: u.mobile || u.email || u.id, label: u.name }),
        });
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate CRM token");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="users-page">
      <div className="user-toolbar">
        <div>
          <p className="eyebrow">Access</p>
          <h1 className="page-title">Users & extensions</h1>
          <p className="muted">
            People in {org?.name || "this business"} only. Mobile number is the unique login ID (OTP 123456 until SMS
            is connected). Map a login to one PBX extension, then issue a CRM link token so the third-party CRM user
            can dial and hang up on that extension.{" "}
            {org ? `${org.seatsUsed} of ${org.seats} seats used` : `${rows.length} people`} ·{" "}
            {rows.filter((u) => u.isActive).length} active
          </p>
        </div>
        <div className="toolbar-actions">
          <input
            className="search"
            placeholder="Search name, mobile, or extension"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Link href="/app/extensions" className="btn ghost">
            PBX inventory
          </Link>
          <button
            className="btn"
            onClick={() => setAddOpen(true)}
            disabled={Boolean(org && org.seatsUsed >= org.seats)}
            title={org && org.seatsUsed >= org.seats ? "Seat limit reached" : "Add user"}
          >
            Add user
          </button>
        </div>
      </div>
      {error ? <p className="error">{error}</p> : null}

      <section className="people-table users-table">
        <div className="people-head">
          <span>User</span>
          <span>Role</span>
          <span>Extension</span>
          <span>CRM token</span>
          <span>Phone</span>
          <span>Status</span>
          <span className="align-right">Actions</span>
        </div>
        {visible.map((u) => (
          <div key={u.id} className={`people-row ${u.isActive ? "" : "inactive"}`}>
            <div className="people-user">
              <div className="user-avatar">{initials(u.name)}</div>
              <div className="user-id">
                <b>{u.name}</b>
                <span className="muted">{u.mobile || u.email}</span>
              </div>
            </div>
            <div>
              <span className={`pill role-${u.role}`}>{roleLabel(u.role)}</span>
            </div>
            <div className="ext-read">{u.extension || "—"}</div>
            <div className="token-cell">
              {u.crmToken ? (
                <>
                  <code className="token-chip" title={u.crmToken}>
                    {u.crmToken}
                  </code>
                  <div className="token-actions">
                    <button
                      type="button"
                      className="btn ghost btn-tiny"
                      onClick={(e) => {
                        e.stopPropagation();
                        void copyValue(u.id, u.crmToken || "");
                      }}
                    >
                      {copiedId === u.id ? "Copied" : "Copy"}
                    </button>
                    <button
                      type="button"
                      className="btn ghost btn-tiny"
                      disabled={busy}
                      onClick={(e) => {
                        e.stopPropagation();
                        void generateRowToken(u);
                      }}
                    >
                      Regenerate
                    </button>
                  </div>
                </>
              ) : u.crmLinkId ? (
                <div className="token-actions">
                  <span className="muted">Hidden</span>
                  <button
                    type="button"
                    className="btn ghost btn-tiny"
                    disabled={busy}
                    onClick={() => void generateRowToken(u)}
                  >
                    Show new
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn ghost btn-tiny"
                  disabled={busy || !u.extension}
                  onClick={() => void generateRowToken(u)}
                >
                  Generate
                </button>
              )}
            </div>
            <div>
              <span className={`pill ${u.phoneMode === "sip" ? "idle" : "live"}`}>
                {phoneModeLabel(u.phoneMode)}
              </span>
            </div>
            <div>
              <span className={`status ${u.isActive ? "on" : "off"}`}>
                <i />
                {u.isActive ? "Active" : "Disabled"}
              </span>
            </div>
            <div className="align-right">
              <div className="menu-wrap">
                <button
                  className="kebab"
                  type="button"
                  aria-label={`Actions for ${u.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuId((id) => (id === u.id ? null : u.id));
                  }}
                >
                  <span />
                  <span />
                  <span />
                </button>
                {menuId === u.id && (
                  <div className="menu" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuId(null);
                        setPhones(u);
                        setPhoneMode(u.phoneMode === "sip" ? "sip" : "desk");
                      }}
                    >
                      Manage phones
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuId(null);
                        void openCrmLink(u);
                      }}
                    >
                      Link CRM user
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMenuId(null);
                        setEditing(u);
                      }}
                    >
                      Edit
                    </button>
                    <button type="button" onClick={() => void toggleActive(u)}>
                      {u.isActive ? "Disable" : "Enable"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <div className="people-empty">No users match that search.</div>
        )}
      </section>

      {addOpen && (
        <div className="modal-back" onClick={() => setAddOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Add user</h2>
            <p className="muted">
              Extension must exist on the Neron first. Create the phone in PBX admin, then map it here.
            </p>
            <form onSubmit={create}>
              <label className="field">
                <span>Full name</span>
                <input name="name" required autoFocus />
              </label>
              <label className="field">
                <span>Mobile number</span>
                <input name="mobile" inputMode="tel" required placeholder="10-digit mobile" />
              </label>
              <div className="modal-split">
                <label className="field">
                  <span>Role</span>
                  <select name="role" defaultValue="agent">
                    <option value="agent">Agent</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="admin">Admin</option>
                    <option value="owner">Owner</option>
                  </select>
                </label>
                <label className="field">
                  <span>SIP extension</span>
                  <ExtensionSelect name="extension" extensions={pbxExts} />
                </label>
              </div>
              <label className="field">
                <span>SIP password</span>
                <input name="sipPassword" type="password" placeholder="SIP password from the Neron extension" />
              </label>
              <label className="field">
                <span>Active phone</span>
                <select name="phoneMode" defaultValue="desk">
                  <option value="desk">Hard phone</option>
                  <option value="sip">Softphone</option>
                </select>
              </label>
              <div className="btn-row">
                <button className="btn" disabled={busy}>
                  {busy ? "Saving…" : "Create user"}
                </button>
                <button type="button" className="btn ghost" onClick={() => setAddOpen(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-back" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Edit user</h2>
            <p className="muted">
              {editing.mobile || editing.email}. Pick an existing PBX extension — this app does not create phones on the Neron.
            </p>
            <form onSubmit={saveEdit}>
              <label className="field">
                <span>Full name</span>
                <input name="name" defaultValue={editing.name} required autoFocus />
              </label>
              <label className="field">
                <span>Mobile number</span>
                <input name="mobile" defaultValue={editing.mobile} inputMode="tel" required />
              </label>
              <div className="modal-split">
                <label className="field">
                  <span>Role</span>
                  <select name="role" defaultValue={editing.role}>
                    <option value="agent">Agent</option>
                    <option value="supervisor">Supervisor</option>
                    <option value="admin">Admin</option>
                    <option value="owner">Owner</option>
                  </select>
                </label>
                <label className="field">
                  <span>SIP extension</span>
                  <ExtensionSelect
                    name="extension"
                    defaultValue={editing.extension}
                    extensions={pbxExts}
                  />
                </label>
              </div>
              <label className="field">
                <span>SIP password</span>
                <input
                  name="sipPassword"
                  type="password"
                  placeholder={
                    editing.sipPasswordSet
                      ? "Leave blank to keep current"
                      : "SIP password from the Neron extension"
                  }
                />
              </label>
              <label className="field">
                <span>Active phone</span>
                <select name="phoneMode" defaultValue={editing.phoneMode === "sip" ? "sip" : "desk"}>
                  <option value="desk">Hard phone</option>
                  <option value="sip">Softphone</option>
                </select>
              </label>
              <label className="check">
                <input name="isActive" type="checkbox" defaultChecked={editing.isActive} />
                Active user
              </label>
              <div className="btn-row">
                <button className="btn" disabled={busy}>
                  {busy ? "Saving…" : "Save changes"}
                </button>
                <button type="button" className="btn ghost" onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {phones && (
        <div className="modal-back" onClick={() => setPhones(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Phones · {phones.name}</h2>
            <p className="muted">
              {phones.email}. Extension {phones.extension || "unmapped"} can register a desk set and a browser
              softphone. Only the active one is used for click-to-call.
            </p>
            <form onSubmit={savePhones}>
              <PhoneModePicker
                value={phoneMode}
                onChange={setPhoneMode}
                extension={phones.extension}
              />
              <label className="field">
                <span>SIP password</span>
                <input
                  name="sipPassword"
                  type="password"
                  autoComplete="off"
                  placeholder={
                    phones.sipPasswordSet
                      ? "Leave blank to keep current"
                      : "Required for softphone"
                  }
                />
              </label>
              <div className="btn-row">
                <button className="btn" disabled={busy}>
                  {busy ? "Saving…" : "Save phones"}
                </button>
                <button type="button" className="btn ghost" onClick={() => setPhones(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {linking && (
        <div className="modal-back" onClick={() => setLinking(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>CRM link · {linking.name}</h2>
            <p className="muted">
              Bind this IPBS login ({linking.mobile || linking.email}) and extension{" "}
              <b>{linking.extension || "unmapped"}</b> to one CRM user. Store the token on that CRM user. Click-to-call
              and hangup then always use this extension — the CRM does not send email or extension on each request.
            </p>
            {!linking.extension ? (
              <p className="error">Map a PBX extension on this user first.</p>
            ) : (
              <form onSubmit={mintCrmLink}>
                <label className="field">
                  <span>CRM user id</span>
                  <input
                    value={crmUserId}
                    onChange={(e) => setCrmUserId(e.target.value)}
                    required
                    autoFocus
                    placeholder="id from the third-party CRM"
                  />
                </label>
                <label className="field">
                  <span>Label (optional)</span>
                  <input
                    value={crmLabel}
                    onChange={(e) => setCrmLabel(e.target.value)}
                    placeholder="CRM display name"
                  />
                </label>
                <div className="btn-row">
                  <button className="btn" disabled={busy}>
                    {busy ? "Creating…" : "Create link token"}
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setLinking(null)}>
                    Close
                  </button>
                </div>
              </form>
            )}
            {mintedToken ? (
              <div className="token-reveal">
                <p>
                  This token stays on the user profile. Copy it for the CRM as <code>X-Agent-Token</code>. Regenerating
                  replaces the old value (reconnect the CRM with the new token).
                </p>
                <code className="token-value">{mintedToken}</code>
                <button
                  className="btn ghost btn-tiny"
                  type="button"
                  onClick={() => void copyValue("minted", mintedToken)}
                >
                  {copiedId === "minted" ? "Copied" : "Copy token"}
                </button>
              </div>
            ) : null}
            {links.length > 0 ? (
              <div className="link-list">
                <p className="muted">Active CRM links — copy anytime, or regenerate to reconnect</p>
                {links.map((row) => (
                  <div key={row.id} className="link-row">
                    <div>
                      <b>{row.label || row.crmUserId}</b>
                      <code className="token-inline">{row.token || `${row.tokenPrefix}…`}</code>
                      <span className="muted">
                        {row.crmUserId} · ext {row.extension || "—"}
                      </span>
                    </div>
                    <div className="btn-row">
                      {row.token ? (
                        <button
                          type="button"
                          className="btn ghost btn-tiny"
                          onClick={() => void copyValue(row.id, row.token || "")}
                        >
                          {copiedId === row.id ? "Copied" : "Copy"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn ghost btn-tiny"
                        disabled={busy}
                        onClick={() => void rotateModalLink(row.id)}
                      >
                        Regenerate
                      </button>
                      <button
                        type="button"
                        className="btn ghost btn-tiny"
                        disabled={busy}
                        onClick={() => void revokeCrmLink(row.id)}
                      >
                        Revoke
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No CRM users linked yet.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
