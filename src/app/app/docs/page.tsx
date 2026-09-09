"use client";

import { useEffect, useMemo, useState } from "react";
import { API_URL, api } from "@/lib/api";

type Org = { crmApiKey: string };

const HOST_KEY = "ipbs_public_host";
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "auth", label: "Authentication" },
  { id: "telephony", label: "Telephony" },
  { id: "users", label: "Users & extensions" },
  { id: "contacts", label: "Contacts" },
  { id: "bulk", label: "Bulk calling" },
  { id: "softphone", label: "Softphone" },
  { id: "inbound", label: "Inbound & webhooks" },
  { id: "console", label: "Console JWT" },
  { id: "cloud", label: "Cloud deploy" },
  { id: "tailscale", label: "Tailscale" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function ApiDocsPage() {
  const [org, setOrg] = useState<Org | null>(null);
  const [tab, setTab] = useState<TabId>("overview");
  const [copied, setCopied] = useState("");
  const [cloudHost, setCloudHost] = useState("api.yourdomain.com");
  const [useCloud, setUseCloud] = useState(false);

  useEffect(() => {
    void api<Org>("/org")
      .then(setOrg)
      .catch(() => setOrg({ crmApiKey: "" }));
    const saved = localStorage.getItem(HOST_KEY);
    if (saved) setCloudHost(saved.replace(/^https?:\/\//i, "").replace(/\/+$/, ""));
  }, []);

  const key = org?.crmApiKey || "ipbs_your_api_key";
  const localBase = API_URL.replace(/\/$/, "");
  const cloudBase = `https://${cloudHost.replace(/^https?:\/\//i, "").replace(/\/+$/, "")}`;
  const base = useCloud ? cloudBase : localBase;

  const samples = useMemo(() => {
    const h = `-H "Content-Type: application/json" \\\n  -H "X-API-Key: ${key}"`;
    return {
      login: `curl -X POST ${base}/auth/otp/request \\\n  -H "Content-Type: application/json" \\\n  -d "{\\"mobile\\":\\"admin\\",\\"purpose\\":\\"login\\"}"\n\ncurl -X POST ${base}/auth/login \\\n  -H "Content-Type: application/json" \\\n  -d "{\\"mobile\\":\\"admin\\",\\"otp\\":\\"123456\\"}"`,
      refresh: `curl -X POST ${base}/auth/refresh \\\n  -H "Content-Type: application/json" \\\n  -d "{\\"refreshToken\\":\\"REFRESH_TOKEN\\"}"`,
      me: `curl ${base}/auth/me \\\n  -H "Authorization: Bearer ACCESS_TOKEN"`,
      dial: `curl -X POST ${base}/v1/call \\\n  ${h} \\\n  -d "{\\"action\\":\\"dial\\",\\"phone\\":\\"6026840554\\",\\"extension\\":\\"1001\\",\\"autoanswer\\":true}"`,
      hangup: `curl -X POST ${base}/v1/call \\\n  ${h} \\\n  -d "{\\"action\\":\\"hangup\\",\\"uuid\\":\\"CALL_ID_FROM_DIAL\\"}"`,
      receive: `curl -X POST ${base}/v1/call \\\n  ${h} \\\n  -d "{\\"action\\":\\"receive\\",\\"from\\":\\"6026840554\\",\\"to\\":\\"1001\\"}"`,
      live: `curl ${base}/v1/calls/live \\\n  -H "X-API-Key: ${key}"`,
      softphone: `curl "${base}/v1/softphone?extension=1001" \\\n  -H "X-API-Key: ${key}"`,
      inbound: `curl -X POST ${base}/v1/inbound/resolve \\\n  ${h} \\\n  -d "{\\"from\\":\\"6026840554\\",\\"to\\":\\"1001\\"}"`,
      users: `curl ${base}/v1/users \\\n  -H "X-API-Key: ${key}"`,
      userCreate: `curl -X POST ${base}/v1/users \\\n  ${h} \\\n  -d "{\\"mobile\\":\\"9876543210\\",\\"name\\":\\"Agent One\\",\\"role\\":\\"agent\\",\\"extension\\":\\"1001\\",\\"phoneMode\\":\\"desk\\"}"`,
      userMap: `curl -X PATCH ${base}/v1/users/USER_ID \\\n  ${h} \\\n  -d "{\\"extension\\":\\"1001\\",\\"sipPassword\\":\\"neron-sip-secret\\",\\"phoneMode\\":\\"sip\\"}"`,
      extensions: `curl ${base}/v1/extensions \\\n  -H "X-API-Key: ${key}"`,
      importContacts: `curl -X POST ${base}/v1/contacts/import \\\n  ${h} \\\n  -d "{\\"groupName\\":\\"CRM leads\\",\\"rows\\":[{\\"name\\":\\"Mubarak\\",\\"phone\\":\\"7002695990\\",\\"company\\":\\"Onesaas\\",\\"crmContactId\\":\\"crm-101\\"}]}"`,
      contactCreate: `curl -X POST ${base}/v1/contacts \\\n  ${h} \\\n  -d "{\\"name\\":\\"Mubarak\\",\\"phone\\":\\"7002695990\\",\\"groupName\\":\\"CRM leads\\",\\"crmContactId\\":\\"crm-101\\"}"`,
      groups: `curl ${base}/v1/contacts/groups \\\n  -H "X-API-Key: ${key}"`,
      bulkStart: `curl -X POST ${base}/v1/campaigns \\\n  ${h} \\\n  -d "{\\"groupName\\":\\"CRM leads\\",\\"extension\\":\\"1001\\",\\"reset\\":true}"`,
      bulkStatus: `curl "${base}/v1/campaigns?extension=1001" \\\n  -H "X-API-Key: ${key}"`,
      bulkStop: `curl -X POST ${base}/v1/campaigns/stop \\\n  ${h} \\\n  -d "{\\"extension\\":\\"1001\\"}"`,
    };
  }, [base, key]);

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
  }

  function saveCloudHost(value: string) {
    const host = value.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
    setCloudHost(host);
    localStorage.setItem(HOST_KEY, host);
  }

  return (
    <>
      <div className="user-toolbar">
        <div>
          <p className="eyebrow">Integrations</p>
          <h1 className="page-title">API documentation</h1>
          <p className="muted">
            Partner CRM API (API key, no login) plus console JWT. Same contract locally and in the cloud — only the
            base URL changes.
          </p>
        </div>
      </div>

      <section className="people-table" style={{ marginBottom: 16 }}>
        <div className="maps-toolbar">
          <div>
            <h3>Connection</h3>
            <p className="muted">Send <code>X-API-Key</code> on every partner request. Do not put the key in a public app.</p>
          </div>
          <div className="seg-tabs">
            <button type="button" className={useCloud ? "" : "on"} onClick={() => setUseCloud(false)}>
              Local
            </button>
            <button type="button" className={useCloud ? "on" : ""} onClick={() => setUseCloud(true)}>
              Cloud
            </button>
          </div>
        </div>
        {useCloud ? (
          <div style={{ padding: "14px 22px 0" }}>
            <label className="field">
              <span>Public API host</span>
              <input
                value={cloudHost}
                onChange={(e) => saveCloudHost(e.target.value)}
                placeholder="api.yourdomain.com"
              />
            </label>
          </div>
        ) : null}
        <div className="kv-row">
          <span className="kv-label">Base URL</span>
          <span className="kv-value kv-with-action docs-cred">
            <code>{base}</code>
            <button className="btn ghost btn-tiny" type="button" onClick={() => void copy("base", base)}>
              {copied === "base" ? "Copied" : "Copy"}
            </button>
          </span>
        </div>
        <div className="kv-row">
          <span className="kv-label">Org API key</span>
          <span className="kv-value kv-with-action docs-cred">
            <code>{key}</code>
            {org?.crmApiKey ? (
              <button className="btn ghost btn-tiny" type="button" onClick={() => void copy("key", key)}>
                {copied === "key" ? "Copied" : "Copy"}
              </button>
            ) : (
              <span className="muted">Generate a key on CRM hub</span>
            )}
          </span>
        </div>
      </section>

      <div className="docs-tabs">
        {TABS.map((item) => (
          <button key={item.id} type="button" className={tab === item.id ? "on" : ""} onClick={() => setTab(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <section className="people-table">
          <div className="maps-toolbar">
            <div>
              <h3>What a third-party CRM should use</h3>
              <p className="muted">
                Call these from your CRM server. Click-to-call does not need this console. Softphone audio still needs
                the agent browser (microphone + SIP REGISTER).
              </p>
            </div>
          </div>
          <div className="docs-api-head">
            <span>Use case</span>
            <span>Call</span>
            <span>Auth</span>
            <span className="align-right">Copy</span>
          </div>
          {(
            [
              ["Click to call", "POST /v1/call", "action=dial", "dial"],
              ["Hang up", "POST /v1/call", "action=hangup", "hangup"],
              ["Live legs", "GET /v1/calls/live", "", "live"],
              ["Users", "GET /v1/users", "", "users"],
              ["Create / map user", "POST /v1/users", "PATCH /v1/users/:id", "userCreate"],
              ["PBX extensions", "GET /v1/extensions", "", "extensions"],
              ["Import CRM contacts", "POST /v1/contacts/import", "", "importContacts"],
              ["Bulk campaign", "POST /v1/campaigns", "", "bulkStart"],
              ["Softphone session", "GET /v1/softphone", "?extension=1001", "softphone"],
              ["Inbound / screen-pop", "POST /v1/call", "action=receive", "receive"],
              ["Health", "GET /health", "", ""],
            ] as const
          ).map(([use, path, extra, copyId]) => (
            <div key={use} className="docs-api-row">
              <b>{use}</b>
              <div className="docs-api-call">
                <code>{path}</code>
                {extra ? <code>{extra}</code> : null}
              </div>
              <span className="muted">{copyId === "" ? "none" : "X-API-Key"}</span>
              <div className="align-right">
                {copyId ? (
                  <button
                    className="btn ghost btn-tiny"
                    type="button"
                    onClick={() => void copy(copyId, samples[copyId])}
                  >
                    {copied === copyId ? "Copied" : "Copy"}
                  </button>
                ) : (
                  <span className="muted">—</span>
                )}
              </div>
            </div>
          ))}
          <div className="docs-callout" style={{ margin: 16 }}>
            <b>Phone numbers.</b> Send 10 digits (example <code>6026840554</code>). The API stores and dials with a
            leading <code>0</code>. Identify the agent with <code>extension</code> (preferred) or{" "}
            <code>userEmail</code>.
          </div>
        </section>
      )}

      {tab === "auth" && (
        <section className="panel docs-panel">
          <h3>Two authentication methods</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Who</th>
                <th>How</th>
                <th>When to use</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>CRM / IVR / middleware</td>
                <td>
                  Header <code>X-API-Key</code>
                </td>
                <td>Server-to-server. No user login. No delay. This is the partner API.</td>
              </tr>
              <tr>
                <td>This web console or a custom agent UI</td>
                <td>
                  Header <code>Authorization: Bearer &lt;accessToken&gt;</code>
                </td>
                <td>Per-user session after login. Access token expires in 15 minutes; refresh for 14 days.</td>
              </tr>
            </tbody>
          </table>

          <h3 style={{ marginTop: 24 }}>1. Org API key (partner)</h3>
          <p className="muted">
            Create or rotate the key on <b>CRM hub</b>. Send it on every <code>/v1/*</code> request. Invalid or missing
            key returns <code>401</code>.
          </p>
          <pre className="inbound-pre">{`X-API-Key: ${key}`}</pre>

          <h3 style={{ marginTop: 24 }}>2. JWT access token (console / custom UI)</h3>
          <ol className="docs-flow">
            <li>
              <b>Login</b> — <code>POST /auth/otp/request</code> then <code>POST /auth/login</code> with the
              agent&apos;s mobile and OTP (until SMS is connected: <code>123456</code>). Existing owner unique id:{" "}
              <code>admin</code>.
            </li>
            <li>
              Store <code>accessToken</code> and <code>refreshToken</code>. Put the access token on{" "}
              <code>Authorization: Bearer …</code>.
            </li>
            <li>
              On <code>401</code>, call <code>POST /auth/refresh</code> with the refresh token, then retry. Do not send
              the refresh token as a Bearer access token.
            </li>
            <li>
              <code>POST /auth/logout</code> revokes refresh tokens for that user.
            </li>
          </ol>
          <div className="btn-row" style={{ margin: "12px 0 8px" }}>
            <button className="btn ghost" type="button" onClick={() => void copy("login", samples.login)}>
              {copied === "login" ? "Copied" : "Copy login"}
            </button>
            <button className="btn ghost" type="button" onClick={() => void copy("refresh", samples.refresh)}>
              {copied === "refresh" ? "Copied" : "Copy refresh"}
            </button>
            <button className="btn ghost" type="button" onClick={() => void copy("me", samples.me)}>
              {copied === "me" ? "Copied" : "Copy me"}
            </button>
          </div>
          <pre className="inbound-pre">{samples.login}</pre>
          <p className="muted" style={{ marginTop: 12 }}>
            Login response includes <code>user.extension</code>, <code>user.phoneMode</code> (<code>desk</code> or{" "}
            <code>sip</code>), and <code>sipPasswordSet</code>. Full SIP password is only on <code>GET /auth/me</code>{" "}
            (JWT) or <code>GET /v1/softphone</code> (API key).
          </p>
          <div className="docs-callout">
            <b>Realtime.</b> Connect Socket.IO to the same API host with{" "}
            <code>{`{ auth: { token: accessToken } }`}</code>. Events: <code>call.updated</code>, <code>call.popup</code>
            , <code>inbound.routed</code>, <code>live.sync</code>, <code>voice.prompt</code>.
          </div>
        </section>
      )}

      {tab === "telephony" && (
        <section className="panel docs-panel">
          <h3>
            POST {base}/v1/call
          </h3>
          <p className="muted">
            One endpoint for outbound dial, hang up, and inbound receive. Alias still works:{" "}
            <code>POST /v1/click-to-call</code> (dial only).
          </p>
          <div className="btn-row" style={{ margin: "12px 0 8px" }}>
            <button className="btn ghost" type="button" onClick={() => void copy("dial", samples.dial)}>
              {copied === "dial" ? "Copied dial" : "Copy dial"}
            </button>
            <button className="btn ghost" type="button" onClick={() => void copy("hangup", samples.hangup)}>
              {copied === "hangup" ? "Copied hangup" : "Copy hangup"}
            </button>
            <button className="btn ghost" type="button" onClick={() => void copy("receive", samples.receive)}>
              {copied === "receive" ? "Copied receive" : "Copy receive"}
            </button>
            <button className="btn ghost" type="button" onClick={() => void copy("live", samples.live)}>
              {copied === "live" ? "Copied live" : "Copy live"}
            </button>
          </div>
          <pre className="inbound-pre">{samples.dial}</pre>

          <h4 style={{ margin: "20px 0 8px" }}>action=dial</h4>
          <p className="muted">
            PBX originates from the agent extension. If that extension is registered (desk set <b>or</b> browser
            softphone), it rings immediately — no extra click in this app.
          </p>
          <pre className="inbound-pre">{`{
  "action": "dial",
  "phone": "6026840554",
  "extension": "1001",
  "autoanswer": true,
  "crmContactId": "optional-crm-id"
}`}</pre>

          <h4 style={{ margin: "20px 0 8px" }}>action=hangup</h4>
          <pre className="inbound-pre">{`{ "action": "hangup", "uuid": "<call uuid from dial or live>" }`}</pre>
          <p className="muted">If <code>uuid</code> is omitted, the API hangs up that agent&apos;s current live leg.</p>

          <h4 style={{ margin: "20px 0 8px" }}>action=receive</h4>
          <p className="muted">
            Use when your IVR / PBX middleware sees an inbound call. Resolves hunt (caller map / sticky last agent) and
            screen-pops the first extension.
          </p>
          <pre className="inbound-pre">{`{ "action": "receive", "from": "6026840554", "to": "1001" }`}</pre>

          <h4 style={{ margin: "20px 0 8px" }}>GET /v1/calls/live</h4>
          <pre className="inbound-pre">{samples.live}</pre>

          <h4 style={{ margin: "20px 0 8px" }}>Fields</h4>
          <table className="table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Actions</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>action</code>
                </td>
                <td>all</td>
                <td>
                  <code>dial</code> · <code>hangup</code> · <code>receive</code>
                </td>
              </tr>
              <tr>
                <td>
                  <code>phone</code>
                </td>
                <td>dial, receive</td>
                <td>Customer number (10 digits). Receive: same as <code>from</code>.</td>
              </tr>
              <tr>
                <td>
                  <code>uuid</code>
                </td>
                <td>hangup</td>
                <td>Call id from dial or live.</td>
              </tr>
              <tr>
                <td>
                  <code>from</code> / <code>to</code>
                </td>
                <td>receive</td>
                <td>Caller CLI and DID / destination extension.</td>
              </tr>
              <tr>
                <td>
                  <code>extension</code>
                </td>
                <td>all</td>
                <td>Agent SIP extension (example 1001).</td>
              </tr>
              <tr>
                <td>
                  <code>userEmail</code>
                </td>
                <td>all</td>
                <td>Alternate way to pick the agent.</td>
              </tr>
              <tr>
                <td>
                  <code>autoanswer</code>
                </td>
                <td>dial</td>
                <td>Default true. Extension answers; customer rings.</td>
              </tr>
              <tr>
                <td>
                  <code>crmContactId</code>
                </td>
                <td>dial</td>
                <td>Passed through to the CRM webhook.</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {tab === "users" && (
        <section className="panel docs-panel">
          <h3>Users and IP-PBX extensions</h3>
          <p className="muted">
            Map CRM agents to Neron SIP numbers. Extensions must already exist on the PBX — this API does not create
            SIP phones. Identify later calls with <code>extension</code> or <code>userEmail</code> (login id).
          </p>
          <div className="btn-row" style={{ margin: "12px 0 8px" }}>
            <button className="btn ghost" type="button" onClick={() => void copy("users", samples.users)}>
              {copied === "users" ? "Copied" : "Copy list users"}
            </button>
            <button className="btn ghost" type="button" onClick={() => void copy("userCreate", samples.userCreate)}>
              {copied === "userCreate" ? "Copied" : "Copy create user"}
            </button>
            <button className="btn ghost" type="button" onClick={() => void copy("userMap", samples.userMap)}>
              {copied === "userMap" ? "Copied" : "Copy map extension"}
            </button>
            <button className="btn ghost" type="button" onClick={() => void copy("extensions", samples.extensions)}>
              {copied === "extensions" ? "Copied" : "Copy PBX extensions"}
            </button>
          </div>
          <h4 style={{ margin: "16px 0 8px" }}>GET /v1/users</h4>
          <pre className="inbound-pre">{samples.users}</pre>
          <h4 style={{ margin: "20px 0 8px" }}>POST /v1/users</h4>
          <pre className="inbound-pre">{samples.userCreate}</pre>
          <pre className="inbound-pre">{`{
  "mobile": "9876543210",
  "name": "Agent One",
  "role": "agent",
  "extension": "1001",
  "sipPassword": "optional-neron-sip-secret",
  "phoneMode": "desk"
}`}</pre>
          <p className="muted">
            <code>mobile</code> is the unique login id (10-digit number). Sign-in is OTP, not a password.{" "}
            <code>role</code>:{" "}
            <code>agent</code> · <code>supervisor</code> · <code>admin</code> · <code>owner</code>.{" "}
            <code>phoneMode</code>: <code>desk</code> (hard phone auto-answer) or <code>sip</code> (browser softphone).
          </p>
          <h4 style={{ margin: "20px 0 8px" }}>PATCH /v1/users/:id</h4>
          <p className="muted">Change name, mobile, role, active flag, SIP password, or mapped extension.</p>
          <pre className="inbound-pre">{samples.userMap}</pre>
          <h4 style={{ margin: "20px 0 8px" }}>GET /v1/extensions</h4>
          <p className="muted">Live list from the Neron (number, type, status, mapped portal users).</p>
          <pre className="inbound-pre">{samples.extensions}</pre>
        </section>
      )}

      {tab === "contacts" && (
        <section className="panel docs-panel">
          <h3>Import contacts from your CRM</h3>
          <p className="muted">
            Push leads into a dial list. Phone is 10 digits (leading <code>0</code> is stored automatically). Duplicate
            numbers in the same group are skipped.
          </p>
          <div className="btn-row" style={{ margin: "12px 0 8px" }}>
            <button className="btn ghost" type="button" onClick={() => void copy("importContacts", samples.importContacts)}>
              {copied === "importContacts" ? "Copied" : "Copy import"}
            </button>
            <button className="btn ghost" type="button" onClick={() => void copy("contactCreate", samples.contactCreate)}>
              {copied === "contactCreate" ? "Copied" : "Copy one contact"}
            </button>
            <button className="btn ghost" type="button" onClick={() => void copy("groups", samples.groups)}>
              {copied === "groups" ? "Copied" : "Copy groups"}
            </button>
          </div>
          <h4 style={{ margin: "16px 0 8px" }}>POST /v1/contacts/import</h4>
          <pre className="inbound-pre">{samples.importContacts}</pre>
          <pre className="inbound-pre">{`{
  "groupName": "CRM leads",
  "rows": [
    {
      "name": "Mubarak",
      "phone": "7002695990",
      "company": "Onesaas",
      "email": "mubarak@onesaas.in",
      "crmContactId": "crm-101"
    }
  ]
}`}</pre>
          <p className="muted">
            If <code>groupName</code> does not exist it is created. Or send <code>groupId</code> from{" "}
            <code>GET /v1/contacts/groups</code>. Max 2000 rows. Column aliases accepted:{" "}
            <code>mobile</code>, <code>number</code>, <code>fullname</code>, <code>crmid</code>.
          </p>
          <h4 style={{ margin: "20px 0 8px" }}>Other contact routes</h4>
          <table className="table">
            <thead>
              <tr>
                <th>Method</th>
                <th>Path</th>
                <th>Use</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>GET</td>
                <td>
                  <code>/v1/contacts</code>
                </td>
                <td>
                  Optional <code>?groupId=</code>
                </td>
              </tr>
              <tr>
                <td>GET</td>
                <td>
                  <code>/v1/contacts/groups</code>
                </td>
                <td>Dial lists</td>
              </tr>
              <tr>
                <td>POST</td>
                <td>
                  <code>/v1/contacts/groups</code>
                </td>
                <td>
                  Body <code>{`{ "name" }`}</code>
                </td>
              </tr>
              <tr>
                <td>POST</td>
                <td>
                  <code>/v1/contacts</code>
                </td>
                <td>One lead. Same fields as an import row.</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {tab === "bulk" && (
        <section className="panel docs-panel">
          <h3>Bulk / campaign calling</h3>
          <p className="muted">
            After contacts are in a group, start a campaign on one agent extension. The PBX dials the next pending
            number when the previous call ends. Agent must have that extension mapped.
          </p>
          <div className="btn-row" style={{ margin: "12px 0 8px" }}>
            <button className="btn ghost" type="button" onClick={() => void copy("bulkStart", samples.bulkStart)}>
              {copied === "bulkStart" ? "Copied" : "Copy start"}
            </button>
            <button className="btn ghost" type="button" onClick={() => void copy("bulkStatus", samples.bulkStatus)}>
              {copied === "bulkStatus" ? "Copied" : "Copy status"}
            </button>
            <button className="btn ghost" type="button" onClick={() => void copy("bulkStop", samples.bulkStop)}>
              {copied === "bulkStop" ? "Copied" : "Copy stop"}
            </button>
          </div>
          <h4 style={{ margin: "16px 0 8px" }}>POST /v1/campaigns</h4>
          <pre className="inbound-pre">{samples.bulkStart}</pre>
          <pre className="inbound-pre">{`{
  "groupName": "CRM leads",
  "extension": "1001",
  "reset": true,
  "contactIds": [],
  "voiceScriptId": ""
}`}</pre>
          <p className="muted">
            Use <code>groupId</code> instead of <code>groupName</code> if you already have the id.{" "}
            <code>reset: true</code> marks the list pending again. <code>contactIds</code> limits the run to those
            rows. <code>voiceScriptId</code> plays a preloaded script (voice campaign); omit for agent click-to-call
            pacing.
          </p>
          <h4 style={{ margin: "20px 0 8px" }}>Control</h4>
          <table className="table">
            <thead>
              <tr>
                <th>Method</th>
                <th>Path</th>
                <th>Body</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>GET</td>
                <td>
                  <code>/v1/campaigns?extension=1001</code>
                </td>
                <td>—</td>
              </tr>
              <tr>
                <td>POST</td>
                <td>
                  <code>/v1/campaigns/pause</code>
                </td>
                <td>
                  <code>{`{ "extension": "1001" }`}</code>
                </td>
              </tr>
              <tr>
                <td>POST</td>
                <td>
                  <code>/v1/campaigns/resume</code>
                </td>
                <td>
                  <code>{`{ "extension": "1001" }`}</code>
                </td>
              </tr>
              <tr>
                <td>POST</td>
                <td>
                  <code>/v1/campaigns/skip</code>
                </td>
                <td>Skip current number, dial next</td>
              </tr>
              <tr>
                <td>POST</td>
                <td>
                  <code>/v1/campaigns/stop</code>
                </td>
                <td>
                  <code>{`{ "extension": "1001" }`}</code>
                </td>
              </tr>
            </tbody>
          </table>
          <pre className="inbound-pre">{samples.bulkStop}</pre>
        </section>
      )}

      {tab === "softphone" && (
        <section className="panel docs-panel">
          <h3>Softphone for a third-party CRM</h3>
          <p className="muted">
            This platform cannot SIP-register on your CRM server. The agent&apos;s <b>browser</b> must REGISTER (JsSIP)
            with a microphone. After that, your CRM dials with the same <code>POST /v1/call</code> — no extra step in
            this console.
          </p>
          <ol className="docs-flow">
            <li>
              Map a SIP extension and store the Neron SIP password (Extensions → Add softphone, or Profile).
            </li>
            <li>
              Your CRM backend calls <code>GET /v1/softphone?extension=1001</code> with the org API key. Never expose
              the org key in the browser; pass only the returned <code>sip</code> object to the agent page.
            </li>
            <li>
              On the agent page, create a JsSIP UA (WebSocket + REGISTER). Keep that tab open.
            </li>
            <li>
              On “Call” in the CRM, your backend <code>POST /v1/call</code> <code>action=dial</code>. The already
              registered UA rings at once.
            </li>
          </ol>
          <div className="btn-row" style={{ margin: "12px 0 8px" }}>
            <button className="btn ghost" type="button" onClick={() => void copy("softphone", samples.softphone)}>
              {copied === "softphone" ? "Copied" : "Copy GET /v1/softphone"}
            </button>
          </div>
          <pre className="inbound-pre">{samples.softphone}</pre>
          <h4 style={{ margin: "20px 0 8px" }}>Example response</h4>
          <pre className="inbound-pre">{`{
  "agent": { "email": "admin", "extension": "1001", "phoneMode": "sip" },
  "sip": {
    "uri": "sip:1001@PBX_HOST",
    "username": "1001",
    "authorizationUser": "1001",
    "password": "<neron sip password>",
    "displayName": "Priya Shah",
    "host": "PBX_HOST",
    "wsUri": "ws://PBX_HOST:8088/ws",
    "register": true,
    "registerExpires": 300
  }
}`}</pre>
          <h4 style={{ margin: "20px 0 8px" }}>JsSIP (agent browser)</h4>
          <pre className="inbound-pre">{`const socket = new JsSIP.WebSocketInterface(sip.wsUri);
const ua = new JsSIP.UA({
  sockets: [socket],
  uri: sip.uri,
  password: sip.password,
  authorization_user: sip.authorizationUser,
  display_name: sip.displayName,
  register: true,
  session_timers: false,
  register_expires: sip.registerExpires
});
ua.start();`}</pre>
          <div className="docs-callout">
            <b>Cloud.</b> Set PBX settings <code>sipWsUrl</code> to <code>wss://…</code> (TLS). Browsers block{" "}
            <code>ws://</code> on an HTTPS CRM page. Same SIP extension cannot be registered on a desk phone and a
            softphone at the same time.
          </div>
          <h4 style={{ margin: "20px 0 8px" }}>One-line click-to-call widget</h4>
          <p className="muted">
            Loads from this API. Binds any <code>[data-ipbs-call]</code> button. Still uses the org API key — prefer
            your CRM backend for production.
          </p>
          <pre className="inbound-pre">{`<script src="${base}/widget.js"
  data-api="${base}"
  data-key="${key}"
  data-user-email="admin"></script>
<button data-ipbs-call data-phone="6026840554">Call</button>`}</pre>
        </section>
      )}

      {tab === "inbound" && (
        <section className="panel docs-panel">
          <h3>Inbound hunt</h3>
          <p className="muted">
            Prefer <code>POST /v1/call</code> <code>action=receive</code> (hunt + screen-pop). Hunt-only alias:{" "}
            <code>POST /v1/inbound/resolve</code>.
          </p>
          <pre className="inbound-pre">{samples.inbound}</pre>
          <h4 style={{ margin: "20px 0 8px" }}>Caller maps (API key)</h4>
          <table className="table">
            <thead>
              <tr>
                <th>Method</th>
                <th>Path</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>GET</td>
                <td>
                  <code>/v1/inbound/mappings</code>
                </td>
              </tr>
              <tr>
                <td>POST</td>
                <td>
                  <code>/v1/inbound/mappings</code> body{" "}
                  <code>{`{ "phone", "extension", "name?" }`}</code>
                </td>
              </tr>
            </tbody>
          </table>
          <h3 style={{ marginTop: 24 }}>CRM webhooks (this app → your CRM)</h3>
          <p className="muted">
            Set the URL and signing secret on CRM hub. We POST JSON on click-to-call, invite, answered, and hangup.
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Header</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>X-IPBS-Event</code>
                </td>
                <td>
                  <code>click_to_call</code> · <code>invite</code> · <code>answered</code> · <code>hangup</code>
                </td>
              </tr>
              <tr>
                <td>
                  <code>X-IPBS-Signature</code>
                </td>
                <td>HMAC-SHA256 of the raw body, using the webhook secret</td>
              </tr>
            </tbody>
          </table>
          <pre className="inbound-pre">{`{
  "event": "click_to_call",
  "from": "1001",
  "to": "06026840554",
  "callId": "<uuid>",
  "agentExtension": "1001",
  "agentEmail": "admin",
  "crmContactId": "optional",
  "direction": "outbound",
  "at": "2026-09-08T09:30:00.000Z"
}`}</pre>
        </section>
      )}

      {tab === "console" && (
        <section className="panel docs-panel">
          <h3>Console routes (JWT Bearer)</h3>
          <p className="muted">
            Used by this web app. A custom agent UI can use the same paths. Not required for a CRM that only needs
            click-to-call.
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Method</th>
                <th>Path</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>POST</td>
                <td>
                  <code>/auth/login</code> <code>/auth/refresh</code> <code>/auth/logout</code>
                </td>
                <td>Public login/refresh; logout needs Bearer</td>
              </tr>
              <tr>
                <td>GET</td>
                <td>
                  <code>/auth/me</code>
                </td>
                <td>User + SIP host / WebSocket URL + sip password</td>
              </tr>
              <tr>
                <td>PATCH</td>
                <td>
                  <code>/auth/profile</code>
                </td>
                <td>
                  <code>phoneMode</code>: <code>desk</code> or <code>sip</code>
                </td>
              </tr>
              <tr>
                <td>POST</td>
                <td>
                  <code>/calls/click-to-call</code>
                </td>
                <td>Same originate as partner dial, for the logged-in user</td>
              </tr>
              <tr>
                <td>POST</td>
                <td>
                  <code>/calls/hangup</code> <code>/calls/mute</code>
                </td>
                <td>
                  Body <code>uuid</code>
                </td>
              </tr>
              <tr>
                <td>GET</td>
                <td>
                  <code>/calls/live</code> <code>/calls/cdr</code>
                </td>
                <td>Live PBX legs / history</td>
              </tr>
              <tr>
                <td>GET</td>
                <td>
                  <code>/org/extension</code>
                </td>
                <td>This agent&apos;s PBX presence</td>
              </tr>
              <tr>
                <td>GET</td>
                <td>
                  <code>/contacts/lookup?phone=</code>
                </td>
                <td>Name / last call for screen-pop</td>
              </tr>
            </tbody>
          </table>
          <p className="muted">
            Admin JWT also covers inbound routes, CRM hub, and voice scripts in this console. Partner CRMs should use
            the <code>/v1/*</code> routes for users, extensions, contact import, and bulk campaigns.
          </p>
        </section>
      )}

      {tab === "cloud" && (
        <section className="panel docs-panel">
          <h3>Local now, cloud later</h3>
          <p className="muted">
            Keep using <code>{localBase}</code> until go-live. Then point the CRM at{" "}
            <code>{cloudBase}</code> — paths and headers do not change.
          </p>
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Local</th>
                <th>Cloud</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>API</td>
                <td>
                  <code>{localBase}</code>
                </td>
                <td>
                  <code>https://api.yourdomain.com</code>
                </td>
              </tr>
              <tr>
                <td>Web console</td>
                <td>
                  <code>http://localhost:3000</code>
                </td>
                <td>
                  <code>https://app.yourdomain.com</code> — set <code>WEB_ORIGIN</code> and{" "}
                  <code>NEXT_PUBLIC_API_URL</code>
                </td>
              </tr>
              <tr>
                <td>CORS</td>
                <td>Open by default so CRM pages can preflight <code>X-API-Key</code></td>
                <td>
                  Optional lock: <code>CORS_ORIGINS=https://crm.partner.com</code>
                </td>
              </tr>
              <tr>
                <td>SIP WebSocket</td>
                <td>
                  <code>ws://PBX:8088/ws</code>
                </td>
                <td>
                  <code>wss://…</code> required on HTTPS pages
                </td>
              </tr>
              <tr>
                <td>Neron MQTT</td>
                <td>LAN to the PBX</td>
                <td>
                  Reach <code>192.168.0.180</code> over Tailscale (subnet router). Do not publish MQTT/SIP on the WAN.
                  See the <b>Tailscale</b> tab.
                </td>
              </tr>
            </tbody>
          </table>
          <div className="docs-callout">
            <b>Recommended CRM pattern.</b> Store the API key only on your CRM server. The browser talks to your CRM;
            your CRM talks to this API. That way a cloud cutover is one environment variable:{" "}
            <code>IPBS_API_URL</code>.
          </div>
          <h4 style={{ margin: "20px 0 8px" }}>HTTP errors</h4>
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Meaning</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>400</td>
                <td>Validation (missing phone, no SIP password, MQTT/PBX message)</td>
              </tr>
              <tr>
                <td>401</td>
                <td>Missing/invalid API key or JWT</td>
              </tr>
              <tr>
                <td>403</td>
                <td>JWT role cannot call that console route</td>
              </tr>
            </tbody>
          </table>
        </section>
      )}

      {tab === "tailscale" && (
        <section className="panel docs-panel">
          <h3>Cloud API, office Neron</h3>
          <p className="muted">
            Tailscale carries MQTT and SIP to <code>192.168.0.180</code>. Do not change IPBS PBX settings to a public
            IP. You cannot install Tailscale on the Neron — use an always-on office PC as a subnet router.
          </p>
          <ol className="docs-flow">
            <li>
              <b>Office PC</b> (same LAN as the Neron). Tailscale is already on this Windows server; it must be
              configured as <code>Administrator</code> (the daemon is owned by that account):
              <pre className="inbound-pre">{`powershell -ExecutionPolicy Bypass -File scripts\\tailscale-office.ps1`}</pre>
              That advertises <code>192.168.0.180/32</code>. Then in{" "}
              <a href="https://login.tailscale.com/admin/machines" target="_blank" rel="noreferrer">
                Tailscale admin
              </a>
              : this machine → Edit route settings → approve the subnet. Do not enable an exit node.
            </li>
            <li>
              <b>Cloud API VM</b> (same tailnet):
              <pre className="inbound-pre">{`# Linux
chmod +x scripts/tailscale-cloud.sh
sudo scripts/tailscale-cloud.sh

# Windows API host
powershell -ExecutionPolicy Bypass -File scripts\\tailscale-cloud.ps1`}</pre>
              The script pings the Neron and checks TCP <code>1883</code> (MQTT) and <code>8088</code> (SIP WebSocket).
            </li>
            <li>
              <b>IPBS → API Manager</b> — keep:
              <ul>
                <li>
                  MQTT host <code>192.168.0.180</code> port <code>1883</code>
                </li>
                <li>
                  SIP host <code>192.168.0.180</code>
                </li>
                <li>
                  SIP WebSocket <code>ws://192.168.0.180:8088/ws</code>
                </li>
              </ul>
              Then <b>Test connection</b>. Click-to-call from the cloud console should ring the office desk set / FXO /
              SIM as on the LAN.
            </li>
          </ol>
          <h4 style={{ margin: "20px 0 8px" }}>Who needs Tailscale</h4>
          <table className="table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Tailscale?</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Office subnet-router PC</td>
                <td>Yes — advertise <code>192.168.0.180/32</code></td>
              </tr>
              <tr>
                <td>Cloud IPBS API</td>
                <td>Yes — <code>--accept-routes</code></td>
              </tr>
              <tr>
                <td>CRM / web console users</td>
                <td>No — they only call the cloud API</td>
              </tr>
              <tr>
                <td>Desk phone at the office</td>
                <td>No</td>
              </tr>
              <tr>
                <td>Remote browser softphone</td>
                <td>
                  Yes on that PC, same tailnet, accept subnet routes. Then Register. Without it the browser cannot
                  reach <code>ws://192.168.0.180:8088/ws</code>. Do not port-forward 8088/5060 on the WAN.
                </td>
              </tr>
            </tbody>
          </table>
          <div className="docs-callout">
            <b>Checked on this office LAN.</b> <code>192.168.0.180</code> replies to ping; TCP 1883 and 8088 are open.
            Run <code>scripts/tailscale-office.ps1</code> as Administrator, then approve the route. HTTPS cloud console
            plus <code>ws://</code> is mixed content — use HTTP on the tailnet or terminate <code>wss://</code> later.
          </div>
        </section>
      )}
    </>
  );
}
