"use client";

import { useEffect, useState } from "react";
import { API_URL, api } from "@/lib/api";

type CrmLink = { token?: string };

export default function WidgetDemo() {
  const [agentToken, setAgentToken] = useState("");
  const [orgKey, setOrgKey] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const jwt = localStorage.getItem("ipbs_token");
    if (!jwt) return;
    void (async () => {
      try {
        const links = await api<CrmLink[]>("/auth/crm-links");
        const token = links.find((l) => l.token)?.token || "";
        if (token) {
          setAgentToken(token);
          return;
        }
      } catch {
        /* fall through to org key */
      }
      try {
        const org = await api<{ crmApiKey: string }>("/org");
        setOrgKey(org.crmApiKey);
      } catch {
        /* demo stays inert until signed in */
      }
    })();
  }, []);

  useEffect(() => {
    if (!agentToken && !orgKey) return;
    const s = document.createElement("script");
    s.src = `${API_URL}/widget.js`;
    s.setAttribute("data-api", API_URL);
    if (agentToken) s.setAttribute("data-agent-token", agentToken);
    else {
      s.setAttribute("data-key", orgKey);
      s.setAttribute("data-user-email", "admin");
    }
    document.body.appendChild(s);
    setReady(true);
    return () => {
      s.remove();
    };
  }, [agentToken, orgKey]);

  return (
    <main style={{ maxWidth: 640, margin: "80px auto", padding: 24 }}>
      <p className="brand">
        IP<span>BS</span>
      </p>
      <h1 style={{ fontFamily: "Fraunces, serif" }}>CRM widget demo</h1>
      <p className="muted">
        This page mimics a third-party CRM record. The Call button is decorated by{" "}
        <code>widget.js</code>
        {agentToken
          ? " using your CRM link token (X-Agent-Token). It only dials — it does not embed a softphone."
          : " using the org API key as a fallback. Prefer a CRM link token from Users."}
      </p>
      <section className="panel">
        <h3>Neha Kapoor · Lotus Retail</h3>
        <p>9876543210</p>
        <button
          className="btn"
          data-ipbs-call
          data-phone="9876543210"
          data-crm-id="CRM-1001"
          disabled={!ready}
        >
          Call from CRM
        </button>
      </section>
    </main>
  );
}
