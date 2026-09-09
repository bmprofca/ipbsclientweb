"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type Org = {
  pbxMode: string;
  onyxBaseUrl: string;
  onyxGateway: string;
  mqttHost: string;
  mqttPort: string;
  mqttToken: string;
  mqttUsername: string;
  mqttPasswordSet: boolean;
  mqttClientId: string;
  mqttTls: boolean;
  mqttDebug: boolean;
  mqttEnabled: boolean;
  sipHost?: string;
  sipWsUrl?: string;
};

function yesNo(v: boolean) {
  return v ? "On" : "Off";
}

function adapterLabel(mode: string) {
  if (mode === "mqtt") return "MQTT (Neron NXG)";
  if (mode === "onyx") return "OnyxCXM HTTP";
  return "Mock (lab)";
}

function randomHex(bytes: number) {
  const bytesArr = new Uint8Array(bytes);
  crypto.getRandomValues(bytesArr);
  return Array.from(bytesArr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function newClientId() {
  return `ipbs-${randomHex(4)}`;
}

function newToken() {
  return `nxg-${randomHex(12)}`;
}

export default function PbxPage() {
  const [org, setOrg] = useState<Org | null>(null);
  const [editing, setEditing] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [tls, setTls] = useState(false);
  const [debug, setDebug] = useState(false);
  const [clientId, setClientId] = useState("");
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState("");
  const [status, setStatus] = useState<"idle" | "ok" | "fail">("idle");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const data = await api<Org>("/org");
    setOrg(data);
    setEnabled(data.mqttEnabled);
    setTls(data.mqttTls);
    setDebug(data.mqttDebug);
  }

  useEffect(() => {
    void load();
  }, []);

  function openEdit() {
    if (!org) return;
    setEnabled(org.mqttEnabled);
    setTls(org.mqttTls);
    setDebug(org.mqttDebug);
    setClientId(org.mqttClientId || newClientId());
    setToken(org.mqttToken);
    setCopied("");
    setEditing(true);
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const form = new FormData(e.currentTarget);
    try {
      await api("/org/pbx", {
        method: "PUT",
        body: JSON.stringify({
          mqttEnabled: enabled,
          pbxMode: enabled ? "mqtt" : form.get("fallbackMode"),
          mqttHost: form.get("mqttHost"),
          mqttPort: form.get("mqttPort"),
          mqttUsername: form.get("mqttUsername"),
          mqttPassword: form.get("mqttPassword") || undefined,
          mqttClientId: clientId,
          mqttToken: token,
          mqttTls: tls,
          mqttDebug: debug,
          onyxBaseUrl: form.get("onyxBaseUrl"),
          onyxGateway: form.get("onyxGateway"),
          sipHost: form.get("sipHost"),
          sipWsUrl: form.get("sipWsUrl"),
        }),
      });
      setEditing(false);
      await load();
      setMessage("Settings saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function ping() {
    const res = await api<{ ok: boolean; message: string; device?: { name?: string } }>(
      "/org/pbx/test",
      { method: "POST" },
    );
    setStatus(res.ok ? "ok" : "fail");
    setMessage(
      `${res.ok ? "Connected" : "Disconnected"} — ${res.message}${res.device?.name ? ` (${res.device.name})` : ""}`,
    );
  }

  if (!org) return <p className="muted">Loading API Manager…</p>;

  const rows: Array<[string, string]> = [
    ["MQTT API", yesNo(org.mqttEnabled)],
    ["Status", status === "ok" ? "Connected" : "Disconnected"],
    ["Host", org.mqttHost || "—"],
    ["Port", org.mqttPort || "—"],
    ["Username", org.mqttUsername || "—"],
    ["Password", org.mqttPasswordSet ? "••••••••" : "Not set"],
    ["Client ID (IPBS)", org.mqttClientId || "—"],
    ["Token", org.mqttToken || "—"],
    ["Enable TLS", yesNo(org.mqttTls)],
    ["Debug", yesNo(org.mqttDebug)],
    ["Active adapter", adapterLabel(org.pbxMode)],
    ["OnyxCXM base URL", org.onyxBaseUrl || "—"],
    ["Onyx gateway", org.onyxGateway || "—"],
    ["SIP host", org.sipHost || "—"],
    ["SIP WebSocket", org.sipWsUrl || "—"],
  ];

  return (
    <>
      <div className="user-toolbar">
        <div>
          <p className="eyebrow">IP-PBX server</p>
          <h1 className="page-title">API Manager</h1>
          <p className="muted">
            MQTT broker settings for this business only. Extensions are created on the PBX; this portal maps them to
            your users.{" "}
            <Link href="/app/extensions" className="link-btn">
              View PBX inventory →
            </Link>{" "}
            Cloud API over Tailscale: keep host <code>192.168.0.180</code> —{" "}
            <Link href="/app/docs" className="link-btn">
              Tailscale process →
            </Link>
          </p>
        </div>
        <div className="toolbar-actions">
          <span className={`status ${status === "ok" ? "on" : "off"}`}>
            <i />
            {status === "ok" ? "Connected" : "Disconnected"}
          </span>
          <button className="btn ghost" type="button" onClick={() => void ping()}>
            Test connection
          </button>
          <button className="btn" type="button" onClick={openEdit}>
            Edit
          </button>
        </div>
      </div>
      {message ? <p className="muted">{message}</p> : null}

      <section className="hint-panel">
        <p>
          Fill these on the Neron page <b>System → API</b> (
          <code>/admin/system/api</code>
          ), then Save. Token must match this app. Client ID must be different.
        </p>
      </section>

      <section className="people-table">
        <div className="kv-head">
          <span>Neron API field</span>
          <span>Value to enter</span>
        </div>
        {(
          [
            ["MQTT API / Enable", "On"],
            ["Host", "127.0.0.1"],
            ["Port", org.mqttPort || "1883"],
            ["Username", org.mqttUsername || "(leave blank)"],
            ["Password", org.mqttPasswordSet ? "(same as IPBS)" : "(leave blank)"],
            ["Client ID", "neron-nxg-01"],
            ["Token", org.mqttToken || "n20v-ipbs-1001"],
            ["Enable TLS", "Off"],
            ["Debug", "On until Status = Connected"],
          ] as Array<[string, string]>
        ).map(([label, value]) => (
          <div key={label} className="kv-row">
            <span className="kv-label">{label}</span>
            <span className="kv-value">
              <code>{value}</code>
            </span>
          </div>
        ))}
      </section>

      <section className="people-table">
        <div className="kv-head">
          <span>Field</span>
          <span>Value</span>
        </div>
        {rows.map(([label, value]) => (
          <div key={label} className="kv-row">
            <span className="kv-label">{label}</span>
            <span className="kv-value">{value}</span>
          </div>
        ))}
      </section>

      {editing && (
        <div className="modal-back" onClick={() => setEditing(false)}>
          <div
            className="modal modal-wide"
            role="dialog"
            aria-labelledby="edit-api-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <h2 id="edit-api-title">Edit API Manager</h2>
                <p className="muted">
                  Same Host, Port, Username, Password and Token as the NXG API Manager. Client ID
                  must differ from the PBX.
                </p>
              </div>
              <button
                type="button"
                className="modal-close"
                aria-label="Close"
                onClick={() => setEditing(false)}
              >
                ×
              </button>
            </div>
            <form className="modal-form" onSubmit={save}>
              <div className="modal-body">
                <section className="form-card">
                  <div className="form-card-head">
                    <h3>MQTT broker</h3>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => setEnabled(e.target.checked)}
                      />
                      Enable MQTT API
                    </label>
                  </div>
                  <p className="muted" style={{ margin: "0 0 12px" }}>
                    Use the office LAN IP (<code>192.168.0.180</code>) even when the API is in the cloud. Tailscale
                    subnet routing carries MQTT; do not point this at a public WAN address.
                  </p>
                  <div className="form-grid">
                    <label className="field">
                      <span>Host *</span>
                      <input
                        name="mqttHost"
                        defaultValue={org.mqttHost || "192.168.0.180"}
                        required={enabled}
                        placeholder="192.168.0.180"
                      />
                    </label>
                    <label className="field">
                      <span>Port *</span>
                      <input
                        name="mqttPort"
                        defaultValue={org.mqttPort || "1883"}
                        required={enabled}
                        placeholder="1883"
                      />
                    </label>
                    <label className="field">
                      <span>Username</span>
                      <input
                        name="mqttUsername"
                        defaultValue={org.mqttUsername}
                        placeholder="Leave blank if the broker has no auth"
                      />
                    </label>
                    <label className="field">
                      <span>Password</span>
                      <input
                        name="mqttPassword"
                        type="password"
                        placeholder={org.mqttPasswordSet ? "Leave blank to keep current" : ""}
                      />
                    </label>
                    <label className="field form-span">
                      <span>Client ID (IPBS only) *</span>
                      <div className="field-action">
                        <input
                          name="mqttClientId"
                          value={clientId}
                          onChange={(e) => setClientId(e.target.value)}
                          required={enabled}
                          placeholder="ipbs-cti"
                        />
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => setClientId(newClientId())}
                        >
                          Generate
                        </button>
                      </div>
                    </label>
                    <label className="field form-span">
                      <span>Token (shared with NXG) *</span>
                      <div className="field-action">
                        <input
                          name="mqttToken"
                          value={token}
                          onChange={(e) => setToken(e.target.value)}
                          required={enabled}
                          placeholder="n20v-ipbs-1001"
                        />
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => {
                            setToken(newToken());
                            setCopied("");
                          }}
                        >
                          Generate
                        </button>
                        <button
                          type="button"
                          className="btn ghost"
                          disabled={!token}
                          onClick={async () => {
                            await navigator.clipboard.writeText(token);
                            setCopied("token");
                          }}
                        >
                          {copied === "token" ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </label>
                    <p className="hint-box">
                      Generate Token here, save, then paste that exact string into the NXG Token
                      field. Keep this Client ID on IPBS only — the PBX must use another ID so both
                      can stay connected to the broker.
                    </p>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={tls}
                        onChange={(e) => setTls(e.target.checked)}
                      />
                      Enable TLS
                    </label>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={debug}
                        onChange={(e) => setDebug(e.target.checked)}
                      />
                      Debug MQTT packets
                    </label>
                  </div>
                </section>
                <section className="form-card">
                  <div className="form-card-head">
                    <div>
                      <h3>Fallback adapter</h3>
                      <p className="muted">Used when MQTT is off. IPBS can still use mock or OnyxCXM HTTP.</p>
                    </div>
                  </div>
                  <div className="form-grid">
                    <label className="field form-span">
                      <span>Adapter</span>
                      <select
                        name="fallbackMode"
                        defaultValue={org.pbxMode === "mqtt" ? "mock" : org.pbxMode}
                      >
                        <option value="mock">Mock (lab / no hardware)</option>
                        <option value="onyx">OnyxCXM HTTP</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>OnyxCXM base URL</span>
                      <input name="onyxBaseUrl" defaultValue={org.onyxBaseUrl} />
                    </label>
                    <label className="field">
                      <span>Onyx gateway name</span>
                      <input name="onyxGateway" defaultValue={org.onyxGateway} />
                    </label>
                  </div>
                </section>
                <section className="form-card">
                  <div className="form-card-head">
                    <div>
                      <h3>WebRTC softphone</h3>
                      <p className="muted">
                        Browser phone registers as <code>sip:EXT@192.168.0.180</code> over{" "}
                        <code>ws://192.168.0.180:8088/ws</code>. SIP host is the Neron, never the agent PC. On Neron
                        Extension → SIP, leave client address / bind IP empty so this browser can REGISTER. Over
                        Tailscale keep the LAN address. Remote agents must run Tailscale; desk / CRM click-to-call
                        does not.
                      </p>
                    </div>
                  </div>
                  <div className="form-grid">
                    <label className="field">
                      <span>SIP host</span>
                      <input
                        name="sipHost"
                        defaultValue={org.sipHost || org.mqttHost || "192.168.0.180"}
                        placeholder="192.168.0.180"
                      />
                    </label>
                    <label className="field">
                      <span>SIP WebSocket URL</span>
                      <input
                        name="sipWsUrl"
                        defaultValue={
                          org.sipWsUrl ||
                          `ws://${org.sipHost || org.mqttHost || "192.168.0.180"}:8088/ws`
                        }
                        placeholder="ws://192.168.0.180:8088/ws"
                      />
                    </label>
                  </div>
                </section>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn ghost" onClick={() => setEditing(false)}>
                  Cancel
                </button>
                <button className="btn" disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
