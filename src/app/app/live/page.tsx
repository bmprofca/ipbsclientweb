"use client";

import Link from "next/link";
import { api } from "@/lib/api";
import { useCalls } from "@/lib/calls";
import { useSession } from "@/lib/session";

export default function LivePage() {
  const { live } = useCalls();
  const { user } = useSession();

  async function inbound() {
    await api("/calls/simulate-inbound", {
      method: "POST",
      body: JSON.stringify({ toExtension: user?.extension || "1100" }),
    });
  }

  return (
    <>
      <div className="top">
        <div>
          <p className="muted">Wallboard</p>
          <h1>Live calls</h1>
          {["owner", "admin", "supervisor"].includes(user?.role || "") && (
            <p className="muted">
              Simulate uses inbound rules (last agent, then overflow).{" "}
              <Link href="/app/inbound">Manage inbound →</Link>
            </p>
          )}
        </div>
        {["owner", "admin", "supervisor"].includes(user?.role || "") && (
          <button className="btn ghost" onClick={() => void inbound()}>
            Simulate inbound
          </button>
        )}
      </div>
      <section className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>State</th>
              <th>From</th>
              <th>To</th>
              <th>Direction</th>
              <th>Agent</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {live.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  No live legs. Place a click-to-call from the dialer.
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
                <td>{c.direction}</td>
                <td>{c.agentName || c.agentExtension || "—"}</td>
                <td>{String(c.duration)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
