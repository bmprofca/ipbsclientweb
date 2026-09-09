"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useCalls } from "@/lib/calls";
import { useSession } from "@/lib/session";

const PAGE_TITLES: Array<{ href: string; label: string }> = [
  { href: "/app/dial", label: "Click to call" },
  { href: "/app/clients", label: "Client list" },
  { href: "/app/voice", label: "Voice" },
  { href: "/app/live", label: "Live calls" },
  { href: "/app/inbound", label: "Inbound" },
  { href: "/app/cdr", label: "CDR" },
  { href: "/app/users", label: "Users & extensions" },
  { href: "/app/extensions", label: "Extensions" },
  { href: "/app/settings/pbx", label: "PBX" },
  { href: "/app/settings/crm", label: "CRM hub" },
  { href: "/app/billing", label: "Subscription" },
  { href: "/app/tenants", label: "Businesses" },
  { href: "/app/docs", label: "API docs" },
  { href: "/app/profile", label: "Profile" },
  { href: "/app", label: "Dashboard" },
];

type DashLite = {
  org: { pbxMode: string };
  pbx: { ok: boolean };
  stats: { live: number };
};

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function pageTitle(path: string) {
  const hit = PAGE_TITLES.find((p) => (p.href === "/app" ? path === "/app" : path === p.href || path.startsWith(`${p.href}/`)));
  return hit?.label || "Console";
}

export function TopBar() {
  const path = usePathname();
  const { user, org, orgName } = useSession();
  const calls = useCalls();
  const [clock, setClock] = useState("");
  const [dash, setDash] = useState<DashLite | null>(null);

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleString(undefined, {
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    tick();
    const id = setInterval(tick, 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const row = await api<DashLite>("/dashboard");
        if (!stop) setDash(row);
      } catch {
        /* keep last */
      }
    }
    void load();
    const id = setInterval(() => void load(), 40000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  const liveCount = calls.live.length || dash?.stats.live || 0;
  const pbxOk = dash?.pbx.ok;
  const trialDays = useMemo(() => {
    if (!org?.trialEndsAt || org.status !== "trial") return null;
    return Math.ceil((Date.parse(org.trialEndsAt) - Date.now()) / (24 * 60 * 60 * 1000));
  }, [org]);

  const notice = (() => {
    if (org?.locked) return { tone: "alert", text: "Subscription inactive — open Subscription to restore access." };
    if (calls.popup) {
      return {
        tone: "call",
        text: `Incoming ${calls.popup.callerName || calls.popup.callerPhone || calls.popup.from}`,
      };
    }
    if (calls.myCall) {
      return {
        tone: "call",
        text: `On a call · ${calls.myCall.from} → ${calls.myCall.to}`,
      };
    }
    if (trialDays !== null && trialDays <= 7) {
      if (trialDays <= 0) return { tone: "warn", text: "Trial has ended. Open Subscription to stay active." };
      return { tone: "warn", text: `Trial ends in ${trialDays} day${trialDays === 1 ? "" : "s"}.` };
    }
    if (pbxOk === false) return { tone: "warn", text: "PBX check failed — open PBX settings." };
    return { tone: "ok", text: "Ready for click-to-call and CRM tokens." };
  })();

  if (!user) return null;

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <p className="topbar-kicker">{orgName || "Workspace"}</p>
        <h1 className="topbar-title">{pageTitle(path)}</h1>
      </div>
      <div className={`topbar-notice ${notice.tone}`} role="status">
        <i />
        <span>{notice.text}</span>
      </div>
      <div className="topbar-meta">
        <span className={`topbar-chip ${liveCount ? "live" : ""}`}>
          <b>{liveCount}</b> live
        </span>
        <span className={`topbar-chip ${pbxOk ? "on" : pbxOk === false ? "off" : ""}`}>
          PBX {dash?.org.pbxMode || "…"} {pbxOk ? "online" : pbxOk === false ? "offline" : "…"}
        </span>
        <span className={`topbar-chip ${user.extension ? "on" : "off"}`}>
          Ext {user.extension || "—"}
        </span>
        <span className="topbar-chip">{user.phoneMode === "sip" ? "Softphone" : "Hard phone"}</span>
        <span className="topbar-clock">{clock}</span>
        <Link href="/app/profile" className="topbar-user" title="Profile">
          <span className="topbar-avatar">{initials(user.name)}</span>
          <span className="topbar-user-name">{user.name.split(" ")[0]}</span>
        </Link>
      </div>
    </header>
  );
}
