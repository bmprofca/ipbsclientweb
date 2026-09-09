"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";

function daysLeft(iso: string) {
  if (!iso) return null;
  const ms = Date.parse(iso) - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export default function BillingPage() {
  const { org, orgName, refresh, user } = useSession();
  const [name, setName] = useState(orgName);
  const [billingEmail, setBillingEmail] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<{ name: string; billingEmail?: string }>("/org")
      .then((row) => {
        setName(row.name);
        setBillingEmail(row.billingEmail || "");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load billing"));
  }, []);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSaved("");
    try {
      await api("/org/billing", {
        method: "PUT",
        body: JSON.stringify({ name, billingEmail }),
      });
      await refresh();
      setSaved("Business details saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  const left = daysLeft(org?.trialEndsAt || "");
  const seats = org?.seats || 0;
  const used = org?.seatsUsed || 0;

  return (
    <>
      <div className="user-toolbar">
        <div>
          <p className="eyebrow">This business</p>
          <h1 className="page-title">Subscription</h1>
          <p className="muted">
            Plan, seats, and company profile for {orgName}. Users, PBX, inbound, and CRM
            masters belong only to this workspace.
          </p>
        </div>
      </div>
      {error ? <p className="error">{error}</p> : null}
      {saved ? <p className="auth-ok">{saved}</p> : null}

      <div className="billing-cards">
        <div className="stat-card">
          <span>Plan</span>
          <b>{org?.planLabel || "Trial"}</b>
        </div>
        <div className="stat-card">
          <span>Status</span>
          <b className={org?.locked ? "warn" : ""}>{org?.status || "trial"}</b>
        </div>
        <div className="stat-card">
          <span>Seats</span>
          <b>
            {used} / {seats}
          </b>
        </div>
        <div className="stat-card">
          <span>Trial</span>
          <b>
            {org?.status === "trial" && left !== null
              ? left > 0
                ? `${left} day${left === 1 ? "" : "s"} left`
                : "Ended"
              : "—"}
          </b>
        </div>
      </div>

      <form className="card form-card" onSubmit={onSave}>
        <div className="form-card-head">
          <h2>Company profile</h2>
          <p className="muted">Shown in the console for every user in this business.</p>
        </div>
        <label className="field">
          <span>Business name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="field">
          <span>Billing contact</span>
          <input
            value={billingEmail}
            onChange={(e) => setBillingEmail(e.target.value)}
            placeholder={user?.email}
          />
        </label>
        <button className="btn" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </form>
    </>
  );
}
