"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useCalls } from "@/lib/calls";
import { useSession } from "@/lib/session";
import { CallFromToggle } from "@/components/CallFromToggle";
import { localNumberInput } from "@ipbs/shared";

type Contact = {
  id: string;
  name: string;
  phone: string;
  company: string;
  email: string;
  crmContactId: string;
};

const KEYS: Array<{ digit: string; letters?: string }> = [
  { digit: "1" },
  { digit: "2", letters: "ABC" },
  { digit: "3", letters: "DEF" },
  { digit: "4", letters: "GHI" },
  { digit: "5", letters: "JKL" },
  { digit: "6", letters: "MNO" },
  { digit: "7", letters: "PQRS" },
  { digit: "8", letters: "TUV" },
  { digit: "9", letters: "WXYZ" },
  { digit: "*" },
  { digit: "0", letters: "+" },
  { digit: "#" },
];

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function formatDial(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)} ${d.slice(5)}`;
}

export default function DialerPage() {
  const { user } = useSession();
  const { clickToCall, callFrom } = useCalls();
  const [phone, setPhone] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<Contact[]>("/contacts").then(setContacts).catch(() => undefined);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      if (e.key >= "0" && e.key <= "9") setPhone((p) => localNumberInput(p + e.key));
      if (e.key === "Backspace") {
        e.preventDefault();
        setPhone((p) => p.slice(0, -1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.crmContactId.toLowerCase().includes(q),
    );
  }, [contacts, query]);

  async function dial(number: string, crm?: string) {
    setError("");
    setOk("");
    setBusy(true);
    try {
      await clickToCall(number, crm);
      setOk(`Calling ${formatDial(number.replace(/\D/g, "").slice(-10) || number)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Call failed");
    } finally {
      setBusy(false);
    }
  }

  function pad(n: string) {
    if (!/^\d$/.test(n)) return;
    setPhone((p) => localNumberInput(p + n));
  }

  function backspace() {
    setPhone((p) => p.slice(0, -1));
  }

  async function addContact(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setSaved("");
    setError("");
    try {
      await api("/contacts", {
        method: "POST",
        body: JSON.stringify({
          name: data.get("name"),
          phone: data.get("phone"),
          company: data.get("company"),
          crmContactId: data.get("crmContactId"),
        }),
      });
      form.reset();
      setContacts(await api<Contact[]>("/contacts"));
      setSaved("Contact saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save contact");
    }
  }

  return (
    <>
      <div className="user-toolbar">
        <div>
          <p className="eyebrow">Telephony</p>
          <h1 className="page-title">Click to call</h1>
          <p className="muted">
            {callFrom === "desk"
              ? `Extension ${user?.extension || "1001"} auto-answers, then the customer number rings.`
              : `Softphone ${user?.extension || "—"} places the call in this browser. A headset is required.`}
          </p>
        </div>
      </div>

      <div className="dialer-grid">
        <section className="panel dialer-card">
          <div className="panel-head">
            <h3>Dialer</h3>
          </div>
          <CallFromToggle />
          <div className="dial-display">
            <input
              aria-label="Number to dial"
              placeholder="10-digit number"
              value={formatDial(phone)}
              maxLength={11}
              inputMode="numeric"
              onChange={(e) => setPhone(localNumberInput(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && phone && !busy) {
                  e.preventDefault();
                  void dial(phone);
                }
              }}
            />
            <button className="dial-back" type="button" onClick={backspace} disabled={!phone} aria-label="Backspace">
              ⌫
            </button>
          </div>
          <div className="dial-pad">
            {KEYS.map((k) => (
              <button key={k.digit} type="button" onClick={() => pad(k.digit)}>
                <b>{k.digit}</b>
                {k.letters ? <span>{k.letters}</span> : <span>&nbsp;</span>}
              </button>
            ))}
          </div>
          {error ? (
            <p className="error">{error}</p>
          ) : ok ? (
            <p className="ok-msg">{ok}</p>
          ) : (
            <p className="muted dial-hint">Leading 0 is added automatically</p>
          )}
          <div className="dial-actions">
            <button className="btn mint" disabled={busy || !phone} onClick={() => void dial(phone)}>
              {busy ? "Connecting…" : "Call"}
            </button>
            <button className="btn ghost" type="button" onClick={() => setPhone("")}>
              Clear
            </button>
          </div>
        </section>

        <section className="people-table dial-directory">
          <div className="dir-toolbar">
            <div>
              <h3>Directory</h3>
              <p className="muted">{contacts.length} saved contact{contacts.length === 1 ? "" : "s"}</p>
            </div>
            <input
              className="dir-search"
              placeholder="Search name or number"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="dir-list">
          <div className="dir-head">
            <span>Contact</span>
            <span>Number</span>
            <span className="align-right">Action</span>
          </div>
          {visible.length === 0 ? (
            <div className="people-empty">
              {contacts.length === 0
                ? "No saved contacts yet. Add one below to keep a click-to-call directory."
                : "No contacts match that search."}
            </div>
          ) : (
            visible.map((c) => (
              <div key={c.id} className="dir-row">
                <div className="people-user">
                  <div className="avatar">{initials(c.name || c.phone)}</div>
                  <div className="user-id">
                    <b>{c.name || "Unnamed"}</b>
                    <span className="muted">{c.company || c.crmContactId || "Directory"}</span>
                  </div>
                </div>
                <span className="mono">{c.phone}</span>
                <div className="align-right">
                  <button
                    className="btn mint btn-tiny"
                    type="button"
                    disabled={busy}
                    onClick={() => void dial(c.phone, c.crmContactId)}
                  >
                    Call
                  </button>
                </div>
              </div>
            ))
          )}
          </div>
          <form className="dir-add" onSubmit={addContact}>
            <div className="dir-add-grid">
              <label className="field">
                <span>Name</span>
                <input name="name" placeholder="Contact name" required />
              </label>
              <label className="field">
                <span>Phone</span>
                <input name="phone" placeholder="10 digits" required />
              </label>
              <label className="field">
                <span>Company</span>
                <input name="company" placeholder="Optional" />
              </label>
              <label className="field">
                <span>CRM id</span>
                <input name="crmContactId" placeholder="Optional" />
              </label>
            </div>
            {saved ? <p className="ok-msg">{saved}</p> : null}
            <button className="btn ghost" type="submit">
              Save contact
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
