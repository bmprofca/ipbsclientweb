"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { io, Socket } from "socket.io-client";
import { API_URL, api, getToken } from "./api";
import { useSession } from "./session";
import { useSoftphone } from "./softphone";
import { extractCallerPhone, callerFromPbxPayload } from "@ipbs/shared";

export type LiveCall = {
  uuid: string;
  from: string;
  to: string;
  state: string;
  direction: string;
  duration: number | string;
  muted?: boolean;
  agentName?: string;
  agentExtension?: string;
};

export type CallFrom = "desk" | "sip";

type CallCtx = {
  live: LiveCall[];
  popup: {
    from: string;
    to: string;
    callId: string;
    reason?: string;
    hunt?: string;
    callerName?: string;
    callerPhone?: string;
    callerCompany?: string;
    lastCall?: {
      at: string;
      direction: string;
      state: string;
      duration: number;
      hangupCause: string;
      agentName: string;
      agentExtension: string;
    } | null;
  } | null;
  dismissPopup: () => void;
  clickToCall: (phone: string, crmContactId?: string) => Promise<void>;
  hangup: (uuid: string) => Promise<void>;
  mute: (uuid: string, muted: boolean) => Promise<void>;
  myCall?: LiveCall;
  callFrom: CallFrom;
  setCallFrom: (next: CallFrom) => Promise<void>;
  extension: string;
};

const Ctx = createContext<CallCtx | null>(null);

function sipInCall(state: string) {
  return state === "inviting" || state === "ringing" || state === "active";
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user, refresh } = useSession();
  const phone = useSoftphone();
  const [live, setLive] = useState<LiveCall[]>([]);
  const [popup, setPopup] = useState<CallCtx["popup"]>(null);
  const [callFrom, setCallFromState] = useState<CallFrom>("desk");

  useEffect(() => {
    if (user?.phoneMode === "sip" || user?.phoneMode === "desk") {
      setCallFromState(user.phoneMode);
      localStorage.setItem("ipbs_call_from", user.phoneMode);
      phone.holdRemoteInvites(user.phoneMode === "desk");
      if (user.phoneMode === "desk") phone.disconnect();
      return;
    }
    const stored = localStorage.getItem("ipbs_call_from");
    if (stored === "sip" || stored === "desk") setCallFromState(stored);
    // phone identity is stable enough; we only re-apply when the saved mode changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.phoneMode]);

  async function setCallFrom(next: CallFrom) {
    setCallFromState(next);
    localStorage.setItem("ipbs_call_from", next);
    phone.holdRemoteInvites(next === "desk");
    if (next === "desk") phone.disconnect();
    await api("/auth/profile", {
      method: "PATCH",
      body: JSON.stringify({ phoneMode: next }),
    }).catch(() => undefined);
    await refresh().catch(() => undefined);
  }

  useEffect(() => {
    phone.holdRemoteInvites(callFrom === "desk");
  }, [callFrom, phone]);

  useEffect(() => {
    if (!user) return;
    const token = getToken();
    const socket: Socket = io(API_URL, { auth: { token } });
    socket.on("live.sync", (rows: LiveCall[]) => setLive(rows || []));
    socket.on("call.updated", () => {
      void api<LiveCall[]>("/calls/live").then(setLive).catch(() => undefined);
    });
    socket.on("call.popup", (payload: Record<string, unknown>) => {
      const inner = payload.payload;
      const p =
        inner && typeof inner === "object" && !Array.isArray(inner)
          ? (inner as Record<string, unknown>)
          : payload;
      const picked = callerFromPbxPayload(p);
      const hunt = Array.isArray(p.hunt)
        ? (p.hunt as Array<{ extension?: string }>)
            .map((h) => h.extension)
            .filter(Boolean)
            .join(" → ")
        : "";
      const callerPhone = String(p.callerPhone || picked.phone || p.from || "");
      const callerName = String(p.callerName || picked.name || "");
      const lastCall =
        p.lastCall && typeof p.lastCall === "object"
          ? (p.lastCall as NonNullable<CallCtx["popup"]>["lastCall"])
          : null;
      setPopup({
        from: String(p.from || callerPhone),
        to: String(p.to || ""),
        callId: String(p.callid || p.callId || ""),
        reason: String(p.reason || ""),
        hunt,
        callerName,
        callerPhone,
        callerCompany: String(p.callerCompany || ""),
        lastCall,
      });
      const lookupPhone = extractCallerPhone(callerPhone) || callerPhone;
      if (lookupPhone) {
        void api<{
          name: string;
          phone: string;
          company: string;
          lastCall?: NonNullable<CallCtx["popup"]>["lastCall"];
        }>(`/contacts/lookup?phone=${encodeURIComponent(lookupPhone)}`)
          .then((row) => {
            if (!row?.name && !row?.phone && !row?.lastCall) return;
            setPopup((prev) =>
              prev
                ? {
                    ...prev,
                    callerName: row.name || prev.callerName,
                    callerPhone: row.phone || prev.callerPhone,
                    callerCompany: row.company || prev.callerCompany,
                    lastCall: row.lastCall || prev.lastCall,
                  }
                : prev,
            );
          })
          .catch(() => undefined);
      }
      void phone.answer();
    });
    void api<LiveCall[]>("/calls/live").then(setLive).catch(() => undefined);
    return () => {
      socket.disconnect();
    };
  }, [user, phone]);

  useEffect(() => {
    if (!popup) return;
    const t = window.setTimeout(() => setPopup(null), 12000);
    return () => window.clearTimeout(t);
  }, [popup]);

  const myCall = live.find(
    (c) =>
      user &&
      (c.agentExtension === user.extension ||
        c.from === user.extension ||
        c.to === user.extension) &&
      c.state !== "ended",
  );

  const value = useMemo<CallCtx>(
    () => ({
      live,
      popup,
      dismissPopup: () => setPopup(null),
      myCall,
      callFrom,
      setCallFrom,
      extension: user?.extension || "",
      async clickToCall(number, crmContactId) {
        if (callFrom === "desk") {
          phone.holdRemoteInvites(true);
          if (phone.sipState !== "off" || phone.wsState !== "off") phone.disconnect();
          await api("/org/extension/register", { method: "POST" }).catch(() => undefined);
          await api("/calls/click-to-call", {
            method: "POST",
            body: JSON.stringify({
              phone: number,
              crmContactId,
              originate: true,
              autoanswer: true,
            }),
          });
          setLive(await api<LiveCall[]>("/calls/live").catch(() => []));
          return;
        }
        const mic = await phone.enableMic();
        if (!mic) {
          throw new Error("Softphone needs a headset. Plug it in, click Allow, then click to call — or switch to Desk phone.");
        }
        await api("/org/extension/register", { method: "POST" }).catch(() => undefined);
        await phone.ensureRegistered();
        phone.armPbxInvite();
        await phone.call(number);
        await api("/calls/click-to-call", {
          method: "POST",
          body: JSON.stringify({ phone: number, crmContactId, originate: false }),
        }).catch(() => undefined);
        setLive(await api<LiveCall[]>("/calls/live").catch(() => []));
      },
      async hangup(uuid) {
        if (callFrom === "sip" && sipInCall(phone.callState)) {
          phone.hangup();
          return;
        }
        if (sipInCall(phone.callState)) phone.hangup();
        await api("/calls/hangup", {
          method: "POST",
          body: JSON.stringify({ uuid }),
        });
        setLive(await api<LiveCall[]>("/calls/live"));
      },
      async mute(uuid, muted) {
        if (sipInCall(phone.callState)) {
          phone.mute(muted);
          return;
        }
        await api("/calls/mute", {
          method: "POST",
          body: JSON.stringify({ uuid, muted }),
        });
        setLive(await api<LiveCall[]>("/calls/live"));
      },
    }),
    [live, popup, myCall, phone, callFrom, user?.extension],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCalls() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCalls outside provider");
  return ctx;
}
