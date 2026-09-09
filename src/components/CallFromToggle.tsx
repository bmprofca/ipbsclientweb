"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useCalls, type CallFrom } from "@/lib/calls";
import { useSoftphone } from "@/lib/softphone";

const OPTIONS: { id: CallFrom; label: string }[] = [
  { id: "desk", label: "Hard phone" },
  { id: "sip", label: "Softphone" },
];

type ExtState = {
  extension: string;
  status: string;
  type: string;
  registered: boolean;
};

export function CallFromToggle() {
  const { callFrom, setCallFrom, extension } = useCalls();
  const phone = useSoftphone();
  const [pbx, setPbx] = useState<ExtState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function refresh() {
    const row = await api<ExtState>("/org/extension").catch(() => null);
    if (row) setPbx(row);
  }

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 8000);
    return () => clearInterval(t);
  }, [extension, phone.sipState]);

  async function register() {
    setBusy(true);
    setMsg("");
    try {
      if (callFrom === "sip") {
        const mic = await phone.enableMic();
        if (!mic) {
          setMsg("Allow a headset or microphone, then register the softphone.");
          return;
        }
      } else {
        phone.disconnect();
      }
      const prep = await api<{ message?: string; registered?: boolean; status?: string }>(
        "/org/extension/register",
        { method: "POST" },
      );
      if (callFrom === "sip") {
        await phone.ensureRegistered();
      }
      await refresh();
      setMsg(
        callFrom === "desk"
          ? `Extension ${extension} is ready on the PBX.`
          : prep.message || `Extension ${extension} registered`,
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Register failed");
    } finally {
      setBusy(false);
    }
  }

  const statusLabel =
    phone.sipState === "registered"
      ? "SIP registered"
      : pbx?.status && pbx.status !== "Unknown"
        ? pbx.status
        : "Idle";
  const onPbx = pbx?.registered || phone.sipState === "registered" || /idle|inuse|busy|ring/i.test(statusLabel);
  const failMsg = /fail|not |could not|enter |allow /i.test(msg);

  return (
    <div className="call-from-wrap">
      <div className="call-from-row">
        <span className="call-from-label">Place call from</span>
        <div className="call-from" role="group" aria-label="Place call from">
          {OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={callFrom === opt.id ? "on" : ""}
              onClick={() => void setCallFrom(opt.id)}
            >
              {opt.label}
              {extension ? ` ${extension}` : ""}
            </button>
          ))}
        </div>
      </div>
      <div className="ext-reg">
        <span className={`pill ${onPbx ? "live" : "dead"}`}>
          {extension || "—"} · {statusLabel}
        </span>
        {callFrom === "sip" && !phone.micOk && (
          <button className="btn ghost btn-tiny" type="button" onClick={() => void phone.enableMic()}>
            Allow microphone
          </button>
        )}
        <button
          className="btn ghost btn-tiny"
          type="button"
          disabled={busy || !extension || (callFrom === "sip" && !phone.micOk)}
          onClick={() => void register()}
        >
          {busy ? "Registering…" : `Register ${extension || "ext"}`}
        </button>
      </div>
      <p className={failMsg ? "error" : "muted"}>{msg || "\u00a0"}</p>
    </div>
  );
}
