"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Cdr = {
  id: string;
  uuid: string;
  from: string;
  to: string;
  state: string;
  direction: string;
  startedAt: string;
  duration: number;
  billsec: number;
  hangupCause: string;
  recordingFile?: string;
  dtmf?: string;
  user?: { name: string; extension: string } | null;
};

export default function CdrPage() {
  const [rows, setRows] = useState<Cdr[]>([]);

  useEffect(() => {
    void api<Cdr[]>("/calls/cdr").then(setRows);
  }, []);

  return (
    <>
      <div className="top">
        <div>
          <p className="muted">History</p>
          <h1>Call detail records</h1>
        </div>
      </div>
      <section className="panel">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>From</th>
              <th>To</th>
              <th>Agent</th>
              <th>State</th>
              <th>Sec</th>
              <th>Cause</th>
              <th>DTMF</th>
              <th>Recording</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.startedAt).toLocaleString()}</td>
                <td>{r.from}</td>
                <td>{r.to}</td>
                <td>{r.user?.name || r.user?.extension || "—"}</td>
                <td>{r.state}</td>
                <td>{r.duration}</td>
                <td className="muted">{r.hangupCause || "—"}</td>
                <td>{r.dtmf || "—"}</td>
                <td className="muted">{r.recordingFile || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
