"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useCalls } from "@/lib/calls";
import { useSession } from "@/lib/session";
import { CallFromToggle } from "@/components/CallFromToggle";
import { localNumberInput } from "@ipbs/shared";

type Dash = {
  org: { name: string; pbxMode: string };
  pbx: { ok: boolean; message: string; device?: { name?: string } };
  stats: {
    live: number;
    ringing: number;
    talking: number;
    today: number;
    answered: number;
    agents: number;
    avgTalk: number;
  };
  live: Array<{
    uuid: string;
    from: string;
    to: string;
    state: string;
    direction: string;
    duration: number | string;
    agentName?: string;
  }>;
  recent: Array<{
    id: string;
    from: string;
    to: string;
    state: string;
    startedAt: string;
    duration: number;
    user?: { name: string; extension: string } | null;
  }>;
  team: Array<{
    id: string;
    name: string;
    role: string;
    extension: string;
    presence: string;
    isActive: boolean;
    phoneMode?: string;
  }>;
};

type Contact = { id: string; name: string; phone: string; company: string; crmContactId: string };

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function presenceClass(p: string) {
  if (p === "Talking" || p === "InUse") return "live";
  if (p === "Ringing") return "ring";
  if (p === "Unmapped") return "dead";
  return "idle";
}

export default function DashboardPage() {
  const { user } = useSession();
  const { clickToCall, live: socketLive, callFrom } = useCalls();
  const [data, setData] = useState<Dash | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState("");

  async function load() {
    const [dash, dir] = await Promise.all([
      api<Dash>("/dashboard"),
      api<Contact[]>("/contacts").catch(() => [] as Contact[]),
    ]);
    setData(dash);
    setContacts(dir);
  }

  useEffect(() => {
    void load().catch(() => undefined);
    const id = setInterval(() => {
      setClock(
        new Date().toLocaleString(undefined, {
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (socketLive.length) {
      setData((prev) => (prev ? { ...prev, live: socketLive, stats: { ...prev.stats, live: socketLive.length } } : prev));
    }
  }, [socketLive]);

  const live = data?.live ?? [];

  const stats = useMemo(
    () =>
      data
        ? [
            { label: "Live legs", value: String(data.stats.live), hint: `${data.stats.talking} talking` },
            { label: "Ringing", value: String(data.stats.ringing), hint: "Waiting to answer" },
            { label: "Calls today", value: String(data.stats.today), hint: `${data.stats.answered} answered` },
            { label: "Agents", value: String(data.stats.agents), hint: `avg talk ${data.stats.avgTalk}s` },
          ]
        : [],
    [data],
  );

  async function dial(number: string, crm?: string) {
    setError("");
    setBusy(true);
    try {
      await clickToCall(number, crm);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Call failed");
    } finally {
      setBusy(false);
    }
  }

  async function quickDial(e: FormEvent) {
    e.preventDefault();
    if (phone) await dial(phone);
  }

  return (
    <>
      <div className="dash-hero">
        <div>
          <p className="muted">
            {greeting()}, {user?.name?.split(" ")[0]}
          </p>
          <h1>Operations dashboard</h1>
        </div>
        <div className="dash-meta">
          <span className={`pill ${data?.pbx.ok ? "live" : "dead"}`}>
            PBX {data?.org.pbxMode || "…"} {data?.pbx.ok ? "online" : "check"}
          </span>
          <span className={`pill ${user?.extension ? "live" : "ring"}`}>
            Your ext {user?.extension || "unmapped"}
          </span>
          <span className="muted">{clock}</span>
        </div>
      </div>

      <div className="kpis">
        {stats.map((s) => (
          <article className="kpi" key={s.label}>
            <span>{s.label}</span>
            <b>{s.value}</b>
            <em>{s.hint}</em>
          </article>
        ))}
      </div>

      <div className="grid dash-grid">
        <section className="panel">
          <div className="panel-head">
            <h3>Live calls</h3>
            <Link href="/app/live" className="muted">
              Wallboard →
            </Link>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>State</th>
                <th>From</th>
                <th>To</th>
                <th>Agent</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {live.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No live legs. Originate from Click to call or the pad on the right.
                  </td>
                </tr>
              )}
              {live.map((c) => (
                <tr key={c.uuid}>
                  <td>
                    <span className={`pill ${c.state === "answered" ? "live" : "ring"}`}>
                      {c.state}
                    </span>
                  </td>
                  <td>{c.from}</td>
                  <td>{c.to}</td>
                  <td>{c.agentName || "—"}</td>
                  <td>{String(c.duration)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3>Quick dial</h3>
            <Link href="/app/dial" className="muted">
              Full dialer →
            </Link>
          </div>
          <CallFromToggle />
          <form onSubmit={quickDial} className="quick-dial">
            <input
              className="phone-input compact"
              placeholder="10-digit number"
              value={phone}
              maxLength={10}
              inputMode="numeric"
              onChange={(e) => setPhone(localNumberInput(e.target.value))}
            />
            <button className="btn mint" disabled={busy || !phone}>
              {busy ? "Connecting…" : "Call"}
            </button>
          </form>
          {error ? <p className="error">{error}</p> : (
            <p className="muted" style={{ marginTop: 8 }}>
              {callFrom === "desk"
                ? `Desk ${user?.extension || "1001"} auto-answers. No microphone needed.`
                : `Softphone ${user?.extension || "1001"} needs a headset in this browser.`}
            </p>
          )}
          <div className="favs">
            {contacts.slice(0, 3).map((c) => (
              <button
                key={c.id}
                type="button"
                className="fav"
                onClick={() => void dial(c.phone, c.crmContactId)}
              >
                <b>{c.name}</b>
                <span>{c.phone}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <div className="grid dash-grid" style={{ marginTop: 16 }}>
        <section className="panel">
          <div className="panel-head">
            <h3>Recent CDR</h3>
            <Link href="/app/cdr" className="muted">
              All records →
            </Link>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>From</th>
                <th>To</th>
                <th>Agent</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(data?.recent || []).length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No calls logged yet today.
                  </td>
                </tr>
              )}
              {(data?.recent || []).map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.startedAt).toLocaleTimeString()}</td>
                  <td>{r.from}</td>
                  <td>{r.to}</td>
                  <td>{r.user?.name || "—"}</td>
                  <td>
                    <span className="pill dead">{r.state}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h3>Team presence</h3>
            <Link href="/app/users" className="muted">
              Manage →
            </Link>
          </div>
          <ul className="team">
            {(data?.team || []).map((m) => (
              <li key={m.id}>
                <div>
                  <b>{m.name}</b>
                  <span className="muted">
                    {m.role}
                    {m.extension ? ` · ${m.extension}` : " · no extension"}
                  </span>
                </div>
                <div className="team-end">
                  <span className={`pill ${m.phoneMode === "sip" ? "idle" : "live"}`}>
                    {m.phoneMode === "sip" ? "Softphone" : "Hard phone"}
                  </span>
                  <span className={`pill ${presenceClass(m.presence)}`}>{m.presence}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
