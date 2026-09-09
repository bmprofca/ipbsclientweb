"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  seats: number;
  users: number;
  calls: number;
  trialEndsAt: string | null;
  isPlatform: boolean;
  createdAt: string;
};

export default function TenantsPage() {
  const [rows, setRows] = useState<Tenant[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function reload() {
    setRows(await api<Tenant[]>("/admin/tenants"));
  }

  useEffect(() => {
    void reload().catch((e) => setError(e instanceof Error ? e.message : "Could not load businesses"));
  }, []);

  async function patch(id: string, body: Partial<Tenant>) {
    setBusy(id);
    setError("");
    try {
      await api(`/admin/tenants/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <div className="user-toolbar">
        <div>
          <p className="eyebrow">Platform</p>
          <h1 className="page-title">Businesses</h1>
          <p className="muted">
            Every subscribed company is isolated. Activate, suspend, or change seats
            without touching another tenant&apos;s users or PBX settings.
          </p>
        </div>
      </div>
      {error ? <p className="error">{error}</p> : null}
      <section className="people-table tenants-table">
        <div className="people-head tenants-head">
          <span>Business</span>
          <span>Plan</span>
          <span>Status</span>
          <span>Seats</span>
          <span>Users</span>
          <span className="align-right">Actions</span>
        </div>
        {rows.map((row) => (
          <div key={row.id} className="people-row tenants-row">
            <div>
              <b>{row.name}</b>
              <div className="muted">
                {row.slug}
                {row.isPlatform ? " · platform" : ""}
              </div>
            </div>
            <div>
              <select
                value={row.plan}
                disabled={busy === row.id}
                onChange={(e) => patch(row.id, { plan: e.target.value })}
              >
                <option value="trial">Trial</option>
                <option value="starter">Starter</option>
                <option value="growth">Growth</option>
                <option value="business">Business</option>
              </select>
            </div>
            <div>
              <select
                value={row.status}
                disabled={busy === row.id}
                onChange={(e) => patch(row.id, { status: e.target.value })}
              >
                <option value="trial">Trial</option>
                <option value="active">Active</option>
                <option value="past_due">Past due</option>
                <option value="suspended">Suspended</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <input
                className="seat-input"
                type="number"
                min={1}
                defaultValue={row.seats}
                disabled={busy === row.id}
                onBlur={(e) => {
                  const seats = Number(e.target.value);
                  if (seats && seats !== row.seats) void patch(row.id, { seats });
                }}
              />
            </div>
            <div>{row.users}</div>
            <div className="align-right btn-row">
              {row.status === "suspended" ? (
                <button className="btn ghost" disabled={busy === row.id} onClick={() => patch(row.id, { status: "active" })}>
                  Activate
                </button>
              ) : (
                <button className="btn ghost" disabled={busy === row.id} onClick={() => patch(row.id, { status: "suspended" })}>
                  Suspend
                </button>
              )}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
