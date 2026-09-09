"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { CallProvider, useCalls } from "@/lib/calls";
import { SoftphoneProvider } from "@/lib/softphone";
import { Softphone } from "@/components/Softphone";
import { VoicePrompt } from "@/components/VoicePrompt";

const LINKS = [
  { href: "/app", label: "Dashboard", icon: "grid", roles: ["owner", "admin", "supervisor", "agent"] },
  { href: "/app/dial", label: "Click to call", icon: "phone", roles: ["owner", "admin", "supervisor", "agent"] },
  { href: "/app/clients", label: "Client list", icon: "book", roles: ["owner", "admin", "supervisor", "agent"] },
  { href: "/app/voice", label: "Voice", icon: "voice", roles: ["owner", "admin", "supervisor", "agent"] },
  { href: "/app/live", label: "Live calls", icon: "live", roles: ["owner", "admin", "supervisor", "agent"] },
  { href: "/app/inbound", label: "Inbound", icon: "inbound", roles: ["owner", "admin", "supervisor"] },
  { href: "/app/cdr", label: "CDR", icon: "list", roles: ["owner", "admin", "supervisor", "agent"] },
  { href: "/app/users", label: "Users", icon: "users", roles: ["owner", "admin"] },
  { href: "/app/extensions", label: "Extensions", icon: "ext", roles: ["owner", "admin"] },
  { href: "/app/settings/pbx", label: "PBX", icon: "pbx", roles: ["owner", "admin"] },
  { href: "/app/settings/crm", label: "CRM hub", icon: "crm", roles: ["owner", "admin"] },
  { href: "/app/billing", label: "Subscription", icon: "bill", roles: ["owner", "admin"] },
  { href: "/app/tenants", label: "Businesses", icon: "orgs", roles: ["owner", "admin", "super_admin"], platformOnly: true },
  { href: "/app/docs", label: "API docs", icon: "docs", roles: ["owner", "admin", "supervisor", "agent"] },
  { href: "/app/profile", label: "Profile", icon: "profile", roles: ["owner", "admin", "supervisor", "agent"] },
];

function Icon({ name }: { name: string }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (name === "grid") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    );
  }
  if (name === "phone") {
    return (
      <svg {...common}>
        <path d="M8 3h3l1 4-2 1a12 12 0 0 0 6 6l1-2 4 1v3a2 2 0 0 1-2 2A16 16 0 0 1 5 7a2 2 0 0 1 3-4z" />
      </svg>
    );
  }
  if (name === "live") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="3" />
        <path d="M5 12a7 7 0 0 1 14 0M2 12a10 10 0 0 1 20 0" />
      </svg>
    );
  }
  if (name === "list") {
    return (
      <svg {...common}>
        <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
      </svg>
    );
  }
  if (name === "users") {
    return (
      <svg {...common}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="3" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }
  if (name === "ext") {
    return (
      <svg {...common}>
        <path d="M5 9h14M5 15h14M10 4 8 20M16 4l-2 16" />
      </svg>
    );
  }
  if (name === "pbx") {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="14" rx="2" />
        <path d="M7 8h.01M11 8h.01M15 8h.01M7 12h10" />
      </svg>
    );
  }
  if (name === "book") {
    return (
      <svg {...common}>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    );
  }
  if (name === "inbound") {
    return (
      <svg {...common}>
        <path d="M22 2 11 13" />
        <path d="M22 2h-7M22 2v7" />
        <path d="M12 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
      </svg>
    );
  }
  if (name === "voice") {
    return (
      <svg {...common}>
        <path d="M12 3v18" />
        <path d="M8 8v8" />
        <path d="M16 8v8" />
        <path d="M4 10v4" />
        <path d="M20 10v4" />
      </svg>
    );
  }
  if (name === "docs") {
    return (
      <svg {...common}>
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
        <path d="M9 13h6M9 17h6" />
      </svg>
    );
  }
  if (name === "profile") {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5 19c1.5-3.2 3.8-5 7-5s5.5 1.8 7 5" />
      </svg>
    );
  }
  if (name === "bill") {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 10h18M8 15h3" />
      </svg>
    );
  }
  if (name === "orgs") {
    return (
      <svg {...common}>
        <path d="M3 21V8l6-4 6 4v13" />
        <path d="M9 21v-6h6v6" />
        <path d="M15 10h6v11" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 3v18M8 7h8M6 12h12M8 17h8" />
    </svg>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function timeAgo(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} min ago`;
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  const d = Math.floor(s / 86400);
  if (d < 7) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleString();
}

function fmtTalk(sec: number) {
  if (!sec) return "No talk time";
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return m ? `${m}m ${r}s` : `${r}s`;
}

function lastLabel(state: string, cause: string) {
  if (/NO_ANSWER|NO_CHANNEL|CANCEL|ORIGINATOR_CANCEL/i.test(cause)) return "Missed";
  if (state === "ended" || state === "answered") return "Completed";
  return state || "Ended";
}

function TrialBanner({ iso }: { iso: string }) {
  const days = Math.ceil((Date.parse(iso) - Date.now()) / (24 * 60 * 60 * 1000));
  if (Number.isNaN(days) || days > 7) return null;
  if (days <= 0) {
    return (
      <div className="sub-banner lock">
        Trial has ended. Open Subscription to keep this business active.
      </div>
    );
  }
  return (
    <div className="sub-banner">
      Trial ends in {days} day{days === 1 ? "" : "s"}. Add users and PBX settings stay inside this company.
    </div>
  );
}

function navActive(path: string, href: string) {
  if (href === "/app") return path === "/app";
  return path === href || path.startsWith(`${href}/`);
}

function Shell({ children }: { children: React.ReactNode }) {
  const { user, org, orgName, loading, logout } = useSession();
  const path = usePathname();
  const router = useRouter();
  const calls = useCalls();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const n = params.get("dial");
    if (n) sessionStorage.setItem("ipbs_pending_dial", n.replace(/[^\d+*#]/g, ""));
    if (!loading && !user) router.replace("/");
  }, [loading, user, router]);

  useEffect(() => {
    setCollapsed(localStorage.getItem("ipbs_sidebar") === "1");
  }, []);

  function toggleSide() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("ipbs_sidebar", next ? "1" : "0");
      return next;
    });
  }

  if (loading || !user) {
    return (
      <div className="boot">
        <p className="brand">
          IP<span>BS</span>
        </p>
        <p className="muted">Opening console…</p>
      </div>
    );
  }

  return (
    <div className={`app${collapsed ? " collapsed" : ""}`}>
      <aside className="side">
        <div className="side-brand">
          <div className="side-top">
            <p className="brand">
              IP<span>BS</span>
            </p>
            <button
              className="collapse-btn"
              type="button"
              onClick={toggleSide}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? "»" : "«"}
            </button>
          </div>
          <div className="side-copy">
            <span className="side-tag">{org?.planLabel || "Workspace"}</span>
            <p className="org-name">{orgName}</p>
          </div>
        </div>
        <nav className="nav">
          {LINKS.filter((l) => {
            if (!l.roles.includes(user.role)) return false;
            if ("platformOnly" in l && l.platformOnly) {
              if (user.role !== "super_admin" && !org?.isPlatform) return false;
            }
            return true;
          }).map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={navActive(path, l.href) ? "active" : ""}
              title={l.label}
            >
              <Icon name={l.icon} />
              <span className="nav-label">{l.label}</span>
            </Link>
          ))}
        </nav>
        <div className="who-card">
          <div className="who-row">
            <div className="avatar" title={user.name}>
              {initials(user.name)}
            </div>
            <div className="who-copy">
              <b>
                <Link href="/app/profile">{user.name}</Link>
              </b>
              <div className="who-pills">
                <span className="pill">{user.role}</span>
                <span className={`pill ${user.extension ? "live" : "dead"}`}>
                  ext {user.extension || "unmapped"}
                </span>
                <span className={`pill ${user.phoneMode === "sip" ? "idle" : "live"}`}>
                  {user.phoneMode === "sip" ? "Softphone" : "Hard phone"}
                </span>
              </div>
            </div>
          </div>
          <button className="btn ghost btn-block sign-out" onClick={logout} title="Sign out">
            Sign out
          </button>
        </div>
      </aside>
      <div className="stage">
        {org?.locked ? (
          <div className="sub-banner lock">
            This business subscription is inactive. Agents cannot sign in. Open Subscription to review the plan.
          </div>
        ) : org?.status === "trial" && org.trialEndsAt ? (
          <TrialBanner iso={org.trialEndsAt} />
        ) : null}
        <div className="main">{children}</div>
        {calls.popup && (
          <div className="call-toast" role="status">
            <div className="call-toast-top">
              <span className="call-toast-live">
                <i /> Incoming
              </span>
              <button
                type="button"
                className="icon-btn"
                aria-label="Dismiss"
                onClick={() => calls.dismissPopup()}
              >
                ×
              </button>
            </div>
            <div className="call-toast-who">
              <div className="call-toast-avatar">
                {initials(calls.popup.callerName || calls.popup.callerPhone || "C") || "C"}
              </div>
              <div>
                <h3>{calls.popup.callerName || "Unknown caller"}</h3>
                <p className="popup-phone">Mobile {calls.popup.callerPhone || calls.popup.from}</p>
                {calls.popup.callerCompany ? <p className="muted">{calls.popup.callerCompany}</p> : null}
                <p className="muted">Ringing {calls.popup.to}</p>
              </div>
            </div>
            {calls.popup.lastCall ? (
              <div className="call-toast-last">
                <div className="call-toast-last-head">
                  <span>Last call</span>
                  <b>{timeAgo(calls.popup.lastCall.at)}</b>
                </div>
                <p>
                  {calls.popup.lastCall.direction === "inbound" ? "They called in" : "You called out"}
                  {calls.popup.lastCall.agentName ? ` · ${calls.popup.lastCall.agentName}` : ""}
                </p>
                <p className="muted">
                  {new Date(calls.popup.lastCall.at).toLocaleString()} · {fmtTalk(calls.popup.lastCall.duration)} ·{" "}
                  {lastLabel(calls.popup.lastCall.state, calls.popup.lastCall.hangupCause)}
                </p>
              </div>
            ) : null}
            {calls.popup.reason ? <p className="muted call-toast-reason">{calls.popup.reason}</p> : null}
          </div>
        )}
        {calls.myCall && (
          <div className="callbar">
            <div>
              <span className={`pill ${calls.myCall.state === "answered" ? "live" : "ring"}`}>
                {calls.myCall.state}
              </span>{" "}
              {calls.popup?.callerName &&
              (calls.myCall.from.includes(calls.popup.callerPhone || "") ||
                calls.myCall.to.includes(calls.popup.callerPhone || "") ||
                calls.myCall.from === calls.popup.from)
                ? `${calls.popup.callerName} · ${calls.popup.callerPhone || calls.myCall.from} → ${calls.myCall.to}`
                : `${calls.myCall.from} → ${calls.myCall.to}`}
              <span className="muted"> · {String(calls.myCall.duration)}s</span>
            </div>
            <div className="btn-row">
              <button
                className="btn ghost"
                onClick={() => calls.mute(calls.myCall!.uuid, !calls.myCall!.muted)}
              >
                {calls.myCall.muted ? "Unmute" : "Mute"}
              </button>
              <button className="btn danger" onClick={() => calls.hangup(calls.myCall!.uuid)}>
                Hang up
              </button>
            </div>
          </div>
        )}
        <Softphone />
        <VoicePrompt />
      </div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SoftphoneProvider>
      <CallProvider>
        <Shell>{children}</Shell>
      </CallProvider>
    </SoftphoneProvider>
  );
}
