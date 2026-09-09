"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useSoftphone } from "@/lib/softphone";
import { SipRegisterHint } from "@/components/SipRegisterHint";
import { useCalls } from "@/lib/calls";
import { api } from "@/lib/api";
import { phoneMatchKey, extractCallerPhone } from "@ipbs/shared";

const PAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

function stepClass(state: "ok" | "run" | "fail" | "wait" | "warn") {
  return `sip-step ${state}`;
}

export function Softphone() {
  const phone = useSoftphone();
  const { callFrom, popup } = useCalls();
  const [open, setOpen] = useState(true);
  const [digits, setDigits] = useState("");
  const [password, setPassword] = useState("");
  const [lookup, setLookup] = useState({ name: "", phone: "" });
  const autoTried = useRef(false);
  const autoDialed = useRef(false);

  const remote = phone.incoming?.from || phone.remoteNumber;
  useEffect(() => {
    if (!remote) {
      setLookup({ name: "", phone: "" });
      return;
    }
    const num = extractCallerPhone(remote) || remote;
    const key = phoneMatchKey(num);
    if (popup && (phoneMatchKey(popup.callerPhone || popup.from) === key || phoneMatchKey(popup.from) === key)) {
      setLookup({
        name: popup.callerName || "",
        phone: popup.callerPhone || popup.from || num,
      });
      if (popup.callerName) return;
    }
    let cancelled = false;
    void api<{ name: string; phone: string }>(`/contacts/lookup?phone=${encodeURIComponent(num)}`)
      .then((row) => {
        if (!cancelled) {
          setLookup({
            name: row.name || phone.incoming?.name || popup?.callerName || "",
            phone: row.phone || num,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setLookup({ name: phone.incoming?.name || popup?.callerName || "", phone: num });
      });
    return () => {
      cancelled = true;
    };
  }, [remote, popup?.callerName, popup?.callerPhone, popup?.from, phone.incoming?.name]);

  useEffect(() => {
    if (callFrom !== "sip") {
      autoTried.current = false;
      return;
    }
    if (autoTried.current) return;
    if (!phone.micOk) return;
    if (!phone.hasPassword || !phone.sipHost || !phone.sipWsUrl) return;
    if (phone.sipState === "registered" || phone.sipState === "registering") return;
    autoTried.current = true;
    void (async () => {
      await api("/org/extension/register", { method: "POST" }).catch(() => undefined);
      await phone.ensureRegistered().catch(() => undefined);
    })();
  }, [callFrom, phone]);
  const logEnd = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const n = params.get("dial");
    if (!n) return;
    sessionStorage.setItem("ipbs_pending_dial", n.replace(/[^\d+*#]/g, ""));
    setDigits(n.replace(/[^\d+*#]/g, ""));
    params.delete("dial");
    const qs = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, []);

  useEffect(() => {
    if (autoDialed.current) return;
    if (phone.sipState !== "registered" || phone.callState !== "idle") return;
    const n = sessionStorage.getItem("ipbs_pending_dial");
    if (!n) return;
    autoDialed.current = true;
    sessionStorage.removeItem("ipbs_pending_dial");
    setDigits(n);
    phone.call(n);
  }, [phone.call, phone.callState, phone.sipState]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: "end" });
  }, [phone.log]);

  function onPad(n: string) {
    if (phone.callState === "active" || phone.callState === "inviting" || phone.callState === "ringing") {
      phone.sendDtmf(n);
      return;
    }
    setDigits((d) => (d + n).slice(0, 16));
  }

  async function onConnect(e: FormEvent) {
    e.preventDefault();
    try {
      await api("/org/extension/register", { method: "POST" }).catch(() => undefined);
      await phone.ensureRegistered(password);
    } catch {
      /* phone.error is set */
    }
  }

  const inCall =
    phone.callState === "inviting" ||
    phone.callState === "ringing" ||
    phone.callState === "active";
  const registered = phone.sipState === "registered";
  const headerOn = registered && phone.wsState === "connected";

  const extStep = phone.extension ? "ok" : "fail";
  const micStep = phone.micOk ? "ok" : "fail";
  const hostStep = phone.sipHost && phone.sipWsUrl ? "ok" : "fail";
  const wsStep =
    phone.wsState === "connected"
      ? "ok"
      : phone.wsState === "connecting"
        ? "run"
        : phone.wsState === "failed"
          ? "fail"
          : "wait";
  const sipStep =
    phone.sipState === "registered"
      ? "ok"
      : phone.sipState === "registering"
        ? "run"
        : phone.sipState === "failed"
          ? "fail"
          : "wait";
  const callStep =
    phone.callState === "active"
      ? "ok"
      : phone.callState === "inviting" || phone.callState === "ringing"
        ? "run"
        : phone.callState === "failed"
          ? "fail"
          : phone.callState === "ended"
            ? "wait"
            : "wait";

  const wsLabel =
    phone.wsState === "connected"
      ? "Connected"
      : phone.wsState === "connecting"
        ? "Connecting…"
        : phone.wsState === "failed"
          ? "Not connected"
          : "Not connected";
  const sipLabel =
    phone.sipState === "registered"
      ? "Registered"
      : phone.sipState === "registering"
        ? "Registering…"
        : phone.sipState === "failed"
          ? "Not registered"
          : "Not registered";
  const callLabel =
    phone.callState === "inviting"
      ? `Calling ${phone.remoteNumber}…`
      : phone.callState === "ringing"
        ? `Ringing ${phone.remoteNumber}`
        : phone.callState === "active"
          ? `In call ${phone.remoteNumber}`
          : phone.callState === "failed"
            ? "Call failed"
            : phone.callState === "ended"
              ? "Call ended"
              : "Idle";

  if (callFrom !== "sip") return null;

  return (
    <aside className={`softphone${open ? "" : " collapsed"}`}>
      <button
        className="softphone-toggle"
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={`status ${headerOn ? "on" : "off"}`}>
          <i />
          {headerOn ? "Online" : "Offline"}
        </span>
        <b>Softphone {phone.extension ? `· ${phone.extension}` : ""}</b>
        <span className="muted">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="softphone-body">
          <ol className="sip-steps">
            <li className={stepClass(extStep)}>
              <span>1. Extension</span>
              <b>{phone.extension || "Not mapped"}</b>
            </li>
            <li className={stepClass(micStep)}>
              <span>2. Microphone</span>
              <b>{phone.micOk ? "Allowed" : "Required"}</b>
            </li>
            <li className={stepClass(hostStep)}>
              <span>3. SIP server (PBX)</span>
              <b>{phone.sipHost || "Not set"}</b>
            </li>
            <li className={stepClass(wsStep)}>
              <span>4. WebSocket</span>
              <b>{wsLabel}</b>
            </li>
            <li className={stepClass(sipStep)}>
              <span>5. SIP register</span>
              <b>{sipLabel}</b>
            </li>
            <li className={stepClass(callStep)}>
              <span>6. Call</span>
              <b>{callLabel}</b>
            </li>
          </ol>

          {phone.micNotice ? <p className="warn-msg">{phone.micNotice}</p> : null}
          {phone.error ? <p className="error">{phone.error}</p> : null}

          <SipRegisterHint extension={phone.extension} host={phone.sipHost} wsUrl={phone.sipWsUrl} />

          <div className="sip-log" aria-live="polite">
            {phone.log.length === 0 ? (
              <p className="muted">Plug in a headset or microphone, click Allow, then Register. Softphone will not connect without it.</p>
            ) : (
              phone.log.map((line, i) => (
                <p key={`${line.at}-${i}`} className={`sip-log-${line.level}`}>
                  <span>{line.at}</span> {line.msg}
                </p>
              ))
            )}
            <div ref={logEnd} />
          </div>

          {!registered && (
            <form className="softphone-auth" onSubmit={onConnect}>
              <label className="field">
                <span>SIP password (extension {phone.extension || "—"})</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={phone.hasPassword ? "Saved — click Connect" : "From PBX extension"}
                />
              </label>
              <p className="muted" style={{ margin: 0 }}>
                {phone.sipWsUrl || "WebSocket URL not set"}
              </p>
              <div className="btn-row">
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => void phone.enableMic()}
                >
                  {phone.micOk ? "Microphone on" : "Allow microphone"}
                </button>
                <button
                  className="btn"
                  disabled={
                    phone.wsState === "connecting" ||
                    phone.sipState === "registering" ||
                    !phone.micOk
                  }
                >
                  {phone.wsState === "connecting" || phone.sipState === "registering"
                    ? "Registering…"
                    : phone.micOk
                      ? "Register on PBX"
                      : "Allow microphone first"}
                </button>
              </div>
            </form>
          )}

          {registered && !inCall && (
            <>
              <input
                className="phone-input compact"
                placeholder="10 digits, 0 added auto"
                value={digits}
                onChange={(e) => setDigits(e.target.value.replace(/[^\d+*#]/g, ""))}
              />
              <div className="dial">
                {PAD.map((n) => (
                  <button key={n} type="button" onClick={() => onPad(n)}>
                    {n}
                  </button>
                ))}
              </div>
              <div className="btn-row" style={{ marginTop: 10 }}>
                {!phone.micOk && (
                  <button className="btn ghost" type="button" onClick={() => void phone.enableMic()}>
                    Retry microphone
                  </button>
                )}
                <button
                  className="btn mint"
                  type="button"
                  disabled={!digits || !phone.micOk}
                  onClick={() => phone.call(digits)}
                >
                  {phone.micOk ? "Call" : "Allow microphone first"}
                </button>
                <button className="btn ghost" type="button" onClick={phone.disconnect}>
                  Disconnect
                </button>
              </div>
            </>
          )}

          {phone.callState === "ringing" && phone.incoming && (
            <div className="softphone-incoming">
              <p className="muted">Incoming</p>
              <h3>{lookup.name || phone.incoming.name || lookup.phone || phone.incoming.from}</h3>
              <p className="popup-phone">Mobile {lookup.phone || phone.incoming.from}</p>
              <div className="btn-row">
                <button className="btn mint" type="button" onClick={phone.answer}>
                  Answer
                </button>
                <button className="btn danger" type="button" onClick={phone.hangup}>
                  Decline
                </button>
              </div>
            </div>
          )}

          {(phone.callState === "inviting" ||
            phone.callState === "active" ||
            (phone.callState === "ringing" && !phone.incoming)) && (
            <div className="softphone-active">
              <p className="muted">
                {phone.callState === "inviting"
                  ? "Calling"
                  : phone.callState === "ringing"
                    ? "Ringing"
                    : "On call"}
              </p>
              <h3>{lookup.name || lookup.phone || phone.remoteNumber}</h3>
              <p className="popup-phone">Mobile {lookup.phone || phone.remoteNumber}</p>
              <div className="dial">
                {PAD.map((n) => (
                  <button key={n} type="button" onClick={() => onPad(n)}>
                    {n}
                  </button>
                ))}
              </div>
              <div className="btn-row" style={{ marginTop: 10 }}>
                <button className="btn ghost" type="button" onClick={() => phone.mute(!phone.muted)}>
                  {phone.muted ? "Unmute" : "Mute"}
                </button>
                <button className="btn danger" type="button" onClick={phone.hangup}>
                  Hang up
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
