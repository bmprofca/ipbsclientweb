"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";

type Org = {
  crmWebhookUrl: string;
  crmApiKey: string;
  crmWebhookSecret: string;
};

type Delivery = {
  id: string;
  event: string;
  url: string;
  status: number;
  createdAt: string;
};

function randomHex(bytes: number) {
  const bytesArr = new Uint8Array(bytes);
  crypto.getRandomValues(bytesArr);
  return Array.from(bytesArr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function newApiKey() {
  return `ipbs_${randomHex(18)}`;
}

function newWebhookSecret() {
  return `whsec_${randomHex(18)}`;
}

function normalizeHost(value: string) {
  return value.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

function publicBase(host: string) {
  const h = normalizeHost(host);
  return h ? `https://${h}` : "https://onesaas.in";
}

const HOST_KEY = "ipbs_public_host";
const DEFAULT_HOST = "onesaas.in";

export default function CrmPage() {
  const [org, setOrg] = useState<Org | null>(null);
  const [rows, setRows] = useState<Delivery[]>([]);
  const [editing, setEditing] = useState(false);
  const [publicHost, setPublicHost] = useState("onesaas.in");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [copied, setCopied] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const data = await api<Org>("/org");
    setOrg(data);
    setPublicHost(localStorage.getItem(HOST_KEY) || DEFAULT_HOST);
    setRows(await api<Delivery[]>("/crm/deliveries"));
  }

  useEffect(() => {
    void load();
  }, []);

  function openEdit() {
    if (!org) return;
    setPublicHost(localStorage.getItem(HOST_KEY) || DEFAULT_HOST);
    setWebhookUrl(org.crmWebhookUrl);
    setApiKey(org.crmApiKey || newApiKey());
    setWebhookSecret(org.crmWebhookSecret);
    setCopied("");
    setEditing(true);
  }

  async function copy(label: string, value: string) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    setCopied(label);
  }

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    try {
      const host = normalizeHost(publicHost) || DEFAULT_HOST;
      localStorage.setItem(HOST_KEY, host);
      await api("/org/crm", {
        method: "PUT",
        body: JSON.stringify({
          crmWebhookUrl: webhookUrl,
          crmApiKey: apiKey,
          crmWebhookSecret: webhookSecret,
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

  if (!org) return <p className="muted">Loading CRM hub…</p>;

  const host = publicHost || DEFAULT_HOST;
  const base = publicBase(host);
  const clickUrl = `${base}/v1/click-to-call`;
  const callUrl = `${base}/v1/call`;
  const softphoneUrl = `${base}/v1/softphone?extension=1001`;
  const inboxUrl = `${base}/v1/crm/inbox`;
  const widgetUrl = `${base}/widget.js`;
  const liveHost = normalizeHost(publicHost) || "onesaas.in";
  const liveBase = publicBase(liveHost);
  const snippet = `<script src="${liveBase}/widget.js" data-api="${liveBase}" data-key="${apiKey || org.crmApiKey}" data-user-email="agent@onesaas.in"></script>
<button data-ipbs-call data-phone="9876543210" data-crm-id="CRM-1001">Call</button>`;

  const tableRows: Array<[string, string, string?]> = [
    ["Public hostname", host, host],
    ["Softphone (GET session)", `GET ${softphoneUrl}`, softphoneUrl],
    ["Click-to-call (desk or registered UA)", `POST ${callUrl}  action=dial`, callUrl],
    ["Click-to-call (alias)", `POST ${clickUrl}`, clickUrl],
    ["Hang up / inbound", `POST ${callUrl}  action=hangup | receive`, callUrl],
    ["Inbound hunt only", `POST ${base}/v1/inbound/resolve`, `${base}/v1/inbound/resolve`],
    ["Widget (click-to-call buttons)", widgetUrl, widgetUrl],
    ["IPBS inbox (test)", inboxUrl, inboxUrl],
    ["CRM webhook URL (IPBS → your CRM)", org.crmWebhookUrl || "Not set", org.crmWebhookUrl || undefined],
    ["API key (CRM → IPBS)", org.crmApiKey || "Not generated", org.crmApiKey],
    ["Webhook secret (signs IPBS → CRM only)", org.crmWebhookSecret || "Not generated — optional", org.crmWebhookSecret],
  ];

  return (
    <>
      <div className="user-toolbar">
        <div>
          <p className="eyebrow">Integrations</p>
          <h1 className="page-title">CRM hub</h1>
          <p className="muted">
            Keys and webhooks belong to this business. Use your public hostname so CRMs call IPBS on HTTPS. Example
            domain: <b>onesaas.in</b>
          </p>
        </div>
        <div className="toolbar-actions">
          <button className="btn" type="button" onClick={openEdit}>
            Edit
          </button>
        </div>
      </div>
      {message ? <p className="muted">{message}</p> : null}

      <section className="hint-panel">
        <p>
          <b>Softphone URL (CRM embed):</b> <code>GET {softphoneUrl}</code> with header <code>X-API-Key</code>. Change{" "}
          <code>1001</code> to the agent extension (or use <code>?userEmail=admin</code>). Response{" "}
          <code>sip.uri</code> / <code>sip.wsUri</code> / <code>sip.password</code> is what JsSIP registers. That is
          not click-to-call, not the widget, and not the webhook secret.
        </p>
      </section>
      <section className="hint-panel">
        <p>
          <b>Place the call</b> after the browser is registered: <code>POST {callUrl}</code> body{" "}
          <code>{`{ "action": "dial", "phone": "6026840554", "extension": "1001" }`}</code>. Desk phones can skip
          GET /v1/softphone and only POST dial. Inbound hunt is <code>{base}/v1/inbound/resolve</code>. Screen-pop is
          the other way: IPBS POSTs to your CRM webhook URL (optional secret).
        </p>
      </section>

      <section className="people-table">
        <div className="kv-head">
          <span>Field</span>
          <span>Value</span>
        </div>
        {tableRows.map(([label, value, copyValue]) => (
          <div key={label} className="kv-row">
            <span className="kv-label">{label}</span>
            <span className="kv-value kv-with-action">
              <span>{value}</span>
              {copyValue ? (
                <button
                  type="button"
                  className="btn ghost btn-tiny"
                  onClick={() => void copy(label, copyValue)}
                >
                  {copied === label ? "Copied" : "Copy"}
                </button>
              ) : null}
            </span>
          </div>
        ))}
      </section>

      <section className="people-table" style={{ marginTop: 16 }}>
        <div className="kv-head">
          <span>Recent webhook deliveries</span>
          <span>HTTP</span>
        </div>
        {rows.length === 0 ? (
          <div className="people-empty">No deliveries yet.</div>
        ) : (
          rows.slice(0, 8).map((r) => (
            <div key={r.id} className="kv-row">
              <span className="kv-label">
                {r.event}
                <span className="muted"> · {new Date(r.createdAt).toLocaleString()}</span>
              </span>
              <span className="kv-value">{r.status || "err"}</span>
            </div>
          ))
        )}
      </section>

      {editing && (
        <div className="modal-back" onClick={() => setEditing(false)}>
          <div
            className="modal modal-wide"
            role="dialog"
            aria-labelledby="edit-crm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <h2 id="edit-crm-title">Edit CRM hub</h2>
                <p className="muted">
                  Hostname is the public domain CRMs use, e.g. onesaas.in →{" "}
                  https://onesaas.in/v1/click-to-call
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
                    <div>
                      <h3>Public hostname</h3>
                      <p className="muted">Domain only. https:// is added automatically.</p>
                    </div>
                  </div>
                  <div className="form-grid">
                    <label className="field form-span">
                      <span>Hostname</span>
                      <input
                        value={publicHost}
                        onChange={(e) => setPublicHost(e.target.value)}
                        placeholder="onesaas.in"
                      />
                    </label>
                    <p className="hint-box">
                      Softphone session: <code>{liveBase}/v1/softphone?extension=1001</code>. Dial:{" "}
                      <code>{liveBase}/v1/call</code>. Widget (buttons only):{" "}
                      <code>{liveBase}/widget.js</code>
                    </p>
                  </div>
                </section>
                <section className="form-card">
                  <div className="form-card-head">
                    <div>
                      <h3>Keys</h3>
                      <p className="muted">API key is for click-to-call. Webhook secret signs screen-pop POSTs.</p>
                    </div>
                  </div>
                  <div className="form-grid">
                    <label className="field form-span">
                      <span>CRM webhook URL (IPBS → CRM)</span>
                      <input
                        value={webhookUrl}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                        placeholder={`https://crm.${liveHost}/webhooks/ipbs`}
                      />
                    </label>
                    <label className="field form-span">
                      <span>API key (CRM → IPBS)</span>
                      <div className="field-action">
                        <input
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => {
                            setApiKey(newApiKey());
                            setCopied("");
                          }}
                        >
                          Generate
                        </button>
                        <button
                          type="button"
                          className="btn ghost"
                          disabled={!apiKey}
                          onClick={() => void copy("edit-api", apiKey)}
                        >
                          {copied === "edit-api" ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </label>
                    <label className="field form-span">
                      <span>Webhook secret (IPBS → CRM)</span>
                      <div className="field-action">
                        <input
                          value={webhookSecret}
                          onChange={(e) => setWebhookSecret(e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn ghost"
                          onClick={() => {
                            setWebhookSecret(newWebhookSecret());
                            setCopied("");
                          }}
                        >
                          Generate
                        </button>
                        <button
                          type="button"
                          className="btn ghost"
                          disabled={!webhookSecret}
                          onClick={() => void copy("edit-secret", webhookSecret)}
                        >
                          {copied === "edit-secret" ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </label>
                  </div>
                </section>
                <section className="form-card">
                  <div className="form-card-head">
                    <div>
                      <h3>Embed snippet</h3>
                      <p className="muted">Uses https://{liveHost} so the CRM can load the widget.</p>
                    </div>
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => void copy("snippet", snippet)}
                    >
                      {copied === "snippet" ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <pre className="copy-block">{snippet}</pre>
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
