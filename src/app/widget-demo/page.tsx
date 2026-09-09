"use client";

import { useEffect, useState } from "react";
import { API_URL, api } from "@/lib/api";

export default function WidgetDemo() {
  const [key, setKey] = useState("");

  useEffect(() => {
    const token = localStorage.getItem("ipbs_token");
    if (!token) return;
    void api<{ crmApiKey: string }>("/org")
      .then((o) => setKey(o.crmApiKey))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!key) return;
    const s = document.createElement("script");
    s.src = `${API_URL}/widget.js`;
    s.setAttribute("data-api", API_URL);
    s.setAttribute("data-key", key);
    s.setAttribute("data-user-email", "agent@ipbs.local");
    document.body.appendChild(s);
    return () => {
      s.remove();
    };
  }, [key]);

  return (
    <main style={{ maxWidth: 640, margin: "80px auto", padding: 24 }}>
      <p className="brand">
        IP<span>BS</span>
      </p>
      <h1 style={{ fontFamily: "Fraunces, serif" }}>CRM widget demo</h1>
      <p className="muted">
        This page mimics a third-party CRM record. The Call button is decorated by{" "}
        <code>widget.js</code>.
      </p>
      <section className="panel">
        <h3>Neha Kapoor · Lotus Retail</h3>
        <p>9876543210</p>
        <button className="btn" data-ipbs-call data-phone="9876543210" data-crm-id="CRM-1001">
          Call from CRM
        </button>
      </section>
    </main>
  );
}
