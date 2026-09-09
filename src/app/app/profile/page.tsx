"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useCalls, type CallFrom } from "@/lib/calls";
import { PhoneModePicker } from "@/components/PhoneModePicker";
import { useSoftphone } from "@/lib/softphone";
import { phoneModeLabel } from "@ipbs/shared";
import { SipRegisterHint } from "@/components/SipRegisterHint";

function roleLabel(role: string) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

type CrmLink = {
  id: string;
  crmUserId: string;
  label: string;
  token?: string;
  tokenPrefix: string;
  extension: string;
};

function CrmTokenCard({
  mobile,
  extension,
}: {
  userId: string;
  mobile: string;
  extension: string;
}) {
  const [links, setLinks] = useState<CrmLink[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  async function reload() {
    setLinks(await api<CrmLink[]>("/auth/crm-links"));
  }

  useEffect(() => {
    void reload().catch((e) => setError(e instanceof Error ? e.message : "Could not load CRM token"));
  }, []);

  async function copy(id: string, token: string) {
    await navigator.clipboard.writeText(token);
    setCopied(id);
  }

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const first = links[0];
      if (first) {
        await api(`/auth/crm-links/${first.id}/rotate`, { method: "POST" });
      } else {
        await api("/auth/crm-links", {
          method: "POST",
          body: JSON.stringify({ crmUserId: mobile, label: "CRM user" }),
        });
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate token");
    } finally {
      setBusy(false);
    }
  }

  const link = links[0];
  const token = link?.token || "";

  return (
    <section className="people-table" style={{ marginBottom: 16 }}>
      <div className="dir-toolbar">
        <div>
          <h3>CRM link token</h3>
          <p className="muted">
            Stored on this profile for reconnecting the third-party CRM user to extension {extension || "—"}. Send as{" "}
            <code>X-Agent-Token</code>. Regenerating replaces the old token.
          </p>
        </div>
      </div>
      {error ? <p className="error" style={{ padding: "0 22px" }}>{error}</p> : null}
      <div className="kv-row">
        <span className="kv-label">Token</span>
        <span className="kv-value kv-with-action">
          {token ? <code className="token-inline">{token}</code> : <span className="muted">Not generated yet</span>}
          {token ? (
            <button className="btn ghost btn-tiny" type="button" onClick={() => void copy("token", token)}>
              {copied === "token" ? "Copied" : "Copy"}
            </button>
          ) : null}
          <button className="btn ghost btn-tiny" type="button" disabled={busy || !extension} onClick={() => void generate()}>
            {busy ? "Saving…" : token ? "Regenerate" : "Generate token"}
          </button>
        </span>
      </div>
      {link ? (
        <div className="kv-row">
          <span className="kv-label">CRM user id</span>
          <span className="kv-value">{link.label ? `${link.label} · ${link.crmUserId}` : link.crmUserId}</span>
        </div>
      ) : null}
    </section>
  );
}

export default function ProfilePage() {
  const { user, refresh } = useSession();
  const { callFrom, setCallFrom } = useCalls();
  const phone = useSoftphone();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [modeOpen, setModeOpen] = useState(false);
  const [passOpen, setPassOpen] = useState(false);
  const [draftMode, setDraftMode] = useState<CallFrom>("desk");

  function openMode() {
    setDraftMode(callFrom);
    setError("");
    setModeOpen(true);
  }

  async function saveMode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setOk("");
    try {
      await setCallFrom(draftMode);
      setModeOpen(false);
      setOk(
        draftMode === "sip"
          ? "Softphone is active. Allow a microphone, then Register on Click to call."
          : "Hard phone is active. The browser will not register SIP.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not switch phone");
    } finally {
      setBusy(false);
    }
  }

  async function saveSip(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const el = e.currentTarget;
    const sipPassword = String(new FormData(el).get("sipPassword") || "");
    if (!sipPassword) {
      setError("Enter the SIP password from the Neron extension.");
      return;
    }
    setBusy(true);
    setError("");
    setOk("");
    try {
      await api("/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({ sipPassword }),
      });
      await refresh();
      el.reset();
      setPassOpen(false);
      setOk("SIP password updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save password");
    } finally {
      setBusy(false);
    }
  }

  if (!user) return <p className="muted">Loading profile…</p>;

  const devices: Array<{ id: CallFrom; name: string; hint: string }> = [
    { id: "desk", name: "Hard phone", hint: "Desk set auto-answers this extension" },
    { id: "sip", name: "Softphone", hint: "This browser · headset required" },
  ];

  return (
    <>
      <div className="user-toolbar">
        <div>
          <p className="eyebrow">Account</p>
          <h1 className="page-title">Profile</h1>
          <p className="muted">
            {user.name} · {user.mobile || user.email}
          </p>
        </div>
        <div className="toolbar-actions">
          <button className="btn ghost" type="button" onClick={() => setPassOpen(true)}>
            SIP password
          </button>
          <button className="btn" type="button" onClick={openMode}>
            Change active phone
          </button>
        </div>
      </div>
      {error && !modeOpen && !passOpen ? <p className="error">{error}</p> : null}
      {ok ? <p className="ok-msg">{ok}</p> : null}

      <section className="people-table" style={{ marginBottom: 16 }}>
        <div className="dir-toolbar">
          <div>
            <h3>Account</h3>
            <p className="muted">Mobile OTP login mapped to a Neron SIP extension</p>
          </div>
        </div>
        <div className="kv-row">
          <span className="kv-label">Name</span>
          <span className="kv-value">{user.name}</span>
        </div>
        <div className="kv-row">
          <span className="kv-label">Mobile</span>
          <span className="kv-value">{user.mobile || "—"}</span>
        </div>
        <div className="kv-row">
          <span className="kv-label">Email</span>
          <span className="kv-value">{user.email || "—"}</span>
        </div>
        <div className="kv-row">
          <span className="kv-label">Role</span>
          <span className="kv-value">{roleLabel(user.role)}</span>
        </div>
        <div className="kv-row">
          <span className="kv-label">Extension</span>
          <span className="kv-value ext-read">{user.extension || "—"}</span>
        </div>
        <div style={{ padding: "12px 22px 16px" }}>
          <SipRegisterHint extension={user.extension} host={phone.sipHost} wsUrl={phone.sipWsUrl} />
        </div>
      </section>

      <CrmTokenCard userId={user.id} mobile={user.mobile || user.email} extension={user.extension} />

      <section className="people-table">
        <div className="dir-toolbar">
          <div>
            <h3>Phones</h3>
            <p className="muted">Same extension · only one device is used at a time</p>
          </div>
        </div>
        <div className="phone-head">
          <span>Device</span>
          <span>Extension</span>
          <span>Status</span>
          <span className="align-right">Actions</span>
        </div>
        {devices.map((d) => {
          const active = callFrom === d.id;
          return (
            <div key={d.id} className="phone-row">
              <div className="user-id">
                <b>{d.name}</b>
                <span className="muted">{d.hint}</span>
              </div>
              <span className="ext-read">{user.extension || "—"}</span>
              <div>
                <span className={`pill ${active ? "live" : "dead"}`}>{active ? "Active" : "Standby"}</span>
              </div>
              <div className="align-right btn-row" style={{ justifyContent: "flex-end" }}>
                {d.id === "sip" ? (
                  <button className="btn ghost btn-tiny" type="button" onClick={() => setPassOpen(true)}>
                    SIP password
                  </button>
                ) : null}
                {d.id === "sip" && !phone.micOk ? (
                  <button className="btn ghost btn-tiny" type="button" onClick={() => void phone.enableMic()}>
                    Allow mic
                  </button>
                ) : null}
                <button
                  className={active ? "btn ghost btn-tiny" : "btn mint btn-tiny"}
                  type="button"
                  disabled={active}
                  onClick={openMode}
                >
                  {active ? "In use" : "Use this"}
                </button>
              </div>
            </div>
          );
        })}
      </section>

      {modeOpen && (
        <div className="modal-back" onClick={() => setModeOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Change active phone</h2>
            <p className="muted">
              Extension {user.extension || "—"} can have a desk set and a browser softphone. Only the selected device
              is used for this login.
            </p>
            <form onSubmit={saveMode}>
              <PhoneModePicker value={draftMode} onChange={setDraftMode} extension={user.extension} />
              {error ? <p className="error">{error}</p> : null}
              <div className="btn-row">
                <button className="btn" disabled={busy}>
                  {busy ? "Saving…" : `Use ${phoneModeLabel(draftMode)}`}
                </button>
                <button type="button" className="btn ghost" onClick={() => setModeOpen(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {passOpen && (
        <div className="modal-back" onClick={() => setPassOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>SIP password</h2>
            <p className="muted">
              Must match the password on Neron extension {user.extension || "—"}. Required for the browser softphone.
            </p>
            <form onSubmit={saveSip}>
              <label className="field">
                <span>New SIP password</span>
                <input
                  name="sipPassword"
                  type="password"
                  required
                  autoComplete="off"
                  autoFocus
                  placeholder={user.sipPasswordSet ? "Enter a new password" : "From the Neron extension"}
                />
              </label>
              {error ? <p className="error">{error}</p> : null}
              <div className="btn-row">
                <button className="btn" disabled={busy}>
                  {busy ? "Saving…" : "Save password"}
                </button>
                <button type="button" className="btn ghost" onClick={() => setPassOpen(false)}>
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
