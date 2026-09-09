"use client";

import { useState } from "react";

export function sipAor(extension?: string, host?: string) {
  const ext = String(extension || "").trim();
  const h = String(host || "").trim();
  if (!ext || !h) return "";
  return `sip:${ext}@${h}`;
}

export function SipRegisterHint({
  extension,
  host,
  wsUrl,
}: {
  extension?: string;
  host?: string;
  wsUrl?: string;
}) {
  const [copied, setCopied] = useState("");
  const aor = sipAor(extension, host);

  async function copy(label: string, value: string) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(label);
  }

  return (
    <div className="sip-hint">
      <p className="muted" style={{ marginTop: 0 }}>
        Register as the <b>PBX</b>, not this PC. <code>192.168.0.106</code> is a client address — leave it blank on
        Neron (Extension → SIP). The URI is{" "}
        <code>{aor || "sip:EXT@192.168.0.180"}</code>. This browser uses WebSocket {wsUrl || "ws://PBX:8088/ws"}, not
        UDP 5060.
      </p>
      <div className="kv-row">
        <span className="kv-label">SIP address</span>
        <span className="kv-value kv-with-action">
          <code>{aor || "Map an extension and set SIP host first"}</code>
          {aor ? (
            <button className="btn ghost btn-tiny" type="button" onClick={() => void copy("uri", aor)}>
              {copied === "uri" ? "Copied" : "Copy"}
            </button>
          ) : null}
        </span>
      </div>
      <div className="kv-row">
        <span className="kv-label">SIP server</span>
        <span className="kv-value">{host || "—"}</span>
      </div>
      <div className="kv-row">
        <span className="kv-label">WebSocket</span>
        <span className="kv-value kv-with-action">
          <code>{wsUrl || "—"}</code>
          {wsUrl ? (
            <button className="btn ghost btn-tiny" type="button" onClick={() => void copy("ws", wsUrl)}>
              {copied === "ws" ? "Copied" : "Copy"}
            </button>
          ) : null}
        </span>
      </div>
    </div>
  );
}
