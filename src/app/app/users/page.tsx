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

  return (
    <>
      <div className="user-toolbar">
        <div>
          <p className="eyebrow">Access</p>
          <h1 className="page-title">Users & extensions</h1>
          <p className="muted">
            People in {org?.name || "this business"} only. Mobile number is the unique login ID (OTP 123456 until SMS
            is connected). Map a login to one PBX extension.{" "}
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

      <section className="people-table">
        <div className="people-head">
          <span>User</span>
          <span>Role</span>
          <span>Extension</span>
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
    </>
  );
}
