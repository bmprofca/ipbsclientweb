"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "./api";
import { useSession } from "./session";
import { normalizeLocalNumber } from "@ipbs/shared";
import type { UA } from "jssip";
import type { RTCSession } from "jssip/lib/RTCSession";

type SipOrg = {
  sipHost: string;
  sipWsUrl: string;
};

export type WsState = "off" | "connecting" | "connected" | "failed";
export type SipState = "off" | "registering" | "registered" | "failed";
export type CallState = "idle" | "inviting" | "ringing" | "active" | "ended" | "failed";
export type LogLevel = "info" | "ok" | "warn" | "error";

export type PhoneLog = {
  at: string;
  msg: string;
  level: LogLevel;
};

type Incoming = { from: string; name?: string };

export type Softphone = {
  wsState: WsState;
  sipState: SipState;
  callState: CallState;
  error: string;
  micNotice: string;
  remoteNumber: string;
  muted: boolean;
  incoming: Incoming | null;
  sipHost: string;
  sipWsUrl: string;
  sipUri: string;
  extension: string;
  hasPassword: boolean;
  log: PhoneLog[];
  micOk: boolean;
  enableMic: () => Promise<boolean>;
  connect: (password: string) => Promise<boolean>;
  disconnect: () => void;
  call: (number: string) => Promise<void>;
  answer: () => Promise<void>;
  hangup: () => void;
  mute: (muted: boolean) => void;
  sendDtmf: (digit: string) => void;
  playPrompt: (url: string) => Promise<void>;
  armPbxInvite: () => void;
  holdRemoteInvites: (hold: boolean) => void;
  ensureRegistered: (password?: string) => Promise<void>;
};

const Ctx = createContext<Softphone | null>(null);

type Ua = UA;
type Session = RTCSession;

function passKey(userId: string) {
  return `ipbs_sip_pass_${userId}`;
}

function nowTime() {
  return new Date().toLocaleTimeString();
}

function friendlyMediaError(err: unknown) {
  const name =
    err && typeof err === "object" && "name" in err ? String((err as { name: string }).name) : "";
  const msg = err instanceof Error ? err.message : String(err || "");
  if (name === "NotAllowedError" || /denied|notallowed|user denied media/i.test(msg)) {
    return "Microphone blocked. Click Allow microphone and choose Allow. If Chrome already blocked it: lock icon in the address bar → Site settings → Microphone → Allow.";
  }
  if (name === "NotFoundError") {
    return "No microphone found. Plug in a headset or enable the mic in Windows sound settings.";
  }
  if (name === "NotReadableError") {
    return "Microphone is in use by another app. Close Zoom/Teams/another phone and try again.";
  }
  if (name === "SecurityError" || /secure/i.test(msg)) {
    return "Open the app at http://localhost:3000. Chrome only allows the microphone on localhost or HTTPS.";
  }
  return msg || "Microphone failed";
}

function causeText(ev: unknown): string {
  if (typeof ev === "string") {
    if (/user denied media access/i.test(ev)) {
      return friendlyMediaError({ name: "NotAllowedError", message: ev });
    }
    if (/incompatible sdp/i.test(ev)) {
      return "PBX rejected the call audio (Incompatible SDP). Plug in a headset, click Allow microphone, then call again.";
    }
    return ev;
  }
  if (!ev || typeof ev !== "object") return "unknown";
  const rec = ev as { cause?: unknown; message?: unknown };
  if (typeof rec.cause === "string" && rec.cause) return causeText(rec.cause);
  if (typeof rec.message === "string" && rec.message) return rec.message;
  try {
    return JSON.stringify(ev);
  } catch {
    return String(ev);
  }
}

/** Offer only G.711 + DTMF 8 kHz so Neron/Asterisk accepts the SDP. */
function sipFriendlySdp(sdp: string) {
  const crlf = sdp.includes("\r\n");
  const text = sdp.replace(/\r\n/g, "\n");
  const bits = text.split(/(?=^m=)/m);
  const session = bits.filter((b) => !b.startsWith("m=")).join("");
  let audio = bits.find((b) => b.startsWith("m=audio"));
  if (!audio) return sdp;
  audio = audio.replace(/^a=(inactive|sendonly|recvonly)$/gm, "a=sendrecv");

  const mline = audio.match(/^m=audio (\S+) (\S+) .+$/m);
  if (!mline) return sdp;
  const [, port, proto] = mline;

  const teMatch = audio.match(/^a=rtpmap:(\d+) telephone-event\/8000/m);
  const tePt = teMatch?.[1] || "101";

  const lines = audio.split("\n").filter((line) => {
    if (line.startsWith("m=audio")) return false;
    const rtp = line.match(/^a=rtpmap:(\d+) (.+)$/);
    if (rtp) {
      const name = rtp[2].toLowerCase();
      return (
        rtp[1] === "0" ||
        rtp[1] === "8" ||
        name.startsWith("pcmu/") ||
        name.startsWith("pcma/") ||
        name.startsWith("telephone-event/8000")
      );
    }
    const id = line.match(/^a=(fmtp|rtcp-fb|ptime):(\d+)/);
    if (id) return id[2] === "0" || id[2] === "8" || id[2] === tePt;
    return true;
  });

  const body = lines.join("\n");
  const extras: string[] = [];
  if (!/^a=rtpmap:0 /m.test(body)) extras.push("a=rtpmap:0 PCMU/8000");
  if (!/^a=rtpmap:8 /m.test(body)) extras.push("a=rtpmap:8 PCMA/8000");
  if (!/^a=rtpmap:\d+ telephone-event\/8000/m.test(body)) {
    extras.push(`a=rtpmap:${tePt} telephone-event/8000`);
    extras.push(`a=fmtp:${tePt} 0-16`);
  }

  const rebuilt = [`m=audio ${port} ${proto} 0 8 ${tePt}`, ...lines, ...extras]
    .filter((l) => l.length > 0)
    .join("\n");
  const out = `${session}${rebuilt}`.replace(/\n+$/, "\n");
  return out.replace(/\n/g, crlf ? "\r\n" : "\n");
}

function preferG711(pc: RTCPeerConnection | undefined) {
  if (!pc?.getTransceivers || typeof RTCRtpSender.getCapabilities !== "function") return;
  const caps = RTCRtpSender.getCapabilities("audio");
  if (!caps?.codecs?.length) return;
  const rank = (mime: string, clock?: number) => {
    const m = mime.toLowerCase();
    if (m === "audio/pcmu" && clock === 8000) return 0;
    if (m === "audio/pcma" && clock === 8000) return 1;
    if (m === "audio/telephone-event" && clock === 8000) return 2;
    return 99;
  };
  const preferred = caps.codecs
    .filter((c) => rank(c.mimeType, c.clockRate) < 99)
    .sort((a, b) => rank(a.mimeType, a.clockRate) - rank(b.mimeType, b.clockRate));
  if (!preferred.length) return;
  for (const t of pc.getTransceivers()) {
    const kind = t.receiver?.track?.kind || t.sender?.track?.kind;
    if (kind && kind !== "audio") continue;
    try {
      t.setCodecPreferences(preferred);
    } catch {
      /* browser may ignore codec order */
    }
  }
}

function loadJsSip(mod: Record<string, unknown>) {
  const inner = (mod.default ?? mod) as Record<string, unknown>;
  return (inner.default ?? inner) as typeof import("jssip");
}

export function SoftphoneProvider({ children }: { children: React.ReactNode }) {
  const { user } = useSession();
  const [wsState, setWsState] = useState<WsState>("off");
  const [sipState, setSipState] = useState<SipState>("off");
  const [callState, setCallState] = useState<CallState>("idle");
  const [error, setError] = useState("");
  const [micNotice, setMicNotice] = useState("");
  const [remoteNumber, setRemoteNumber] = useState("");
  const [muted, setMuted] = useState(false);
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const [sipHost, setSipHost] = useState("");
  const [sipWsUrl, setSipWsUrl] = useState("");
  const [sipPassword, setSipPassword] = useState("");
  const [log, setLog] = useState<PhoneLog[]>([]);
  const [micOk, setMicOk] = useState(false);

  const uaRef = useRef<Ua | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const ringRef = useRef<AudioContext | null>(null);
  const ringOscRef = useRef<OscillatorNode | null>(null);
  const expectInviteUntil = useRef(0);
  const holdRemoteRef = useRef(false);
  const sipStateRef = useRef<SipState>("off");
  const registerWaiters = useRef<Array<(ok: boolean) => void>>([]);

  const finishRegister = useCallback((ok: boolean) => {
    const waiters = registerWaiters.current.splice(0);
    for (const fn of waiters) fn(ok);
  }, []);

  const extension = user?.extension || "";
  sipStateRef.current = sipState;

  const pushLog = useCallback((msg: string, level: LogLevel = "info") => {
    setLog((prev) => [...prev.slice(-24), { at: nowTime(), msg, level }]);
  }, []);

  const releaseMic = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setMicOk(false);
  }, []);

  const enableMic = useCallback(async () => {
    if (typeof window !== "undefined" && !window.isSecureContext) {
      const why = friendlyMediaError({ name: "SecurityError", message: "insecure" });
      setMicOk(false);
      setMicNotice(why);
      pushLog(why, "error");
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      const why = "This browser cannot access the microphone. Use Chrome on http://localhost:3000.";
      setMicOk(false);
      setMicNotice(why);
      pushLog(why, "error");
      return false;
    }
    const live = localStreamRef.current?.getAudioTracks().some((t) => t.readyState === "live");
    if (live && localStreamRef.current) {
      setMicOk(true);
      setMicNotice("");
      return true;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => [] as MediaDeviceInfo[]);
      if (devices.length && !devices.some((d) => d.kind === "audioinput")) {
        throw Object.assign(new Error("No microphone found"), { name: "NotFoundError" });
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      });
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      localStreamRef.current = stream;
      setMicOk(true);
      setMicNotice("");
      setError((prev) => (/microphone|media access|headset/i.test(prev) ? "" : prev));
      pushLog("Headset / microphone allowed", "ok");
      return true;
    } catch (e) {
      setMicOk(false);
      const why = friendlyMediaError(e);
      setMicNotice(`${why} A headset or microphone is required to connect and to place calls.`);
      setError(why);
      pushLog(`Microphone required: ${why}`, "error");
      return false;
    }
  }, [pushLog]);

  const mediaOpts = useCallback(() => {
    const stream = localStreamRef.current;
    return {
      mediaConstraints: { audio: true, video: false } as MediaStreamConstraints,
      mediaStream: stream || undefined,
      rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false },
      pcConfig: {
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      },
    };
  }, []);

  const stopRing = useCallback(() => {
    try {
      ringOscRef.current?.stop();
    } catch {
      /* already stopped */
    }
    ringOscRef.current = null;
    void ringRef.current?.close();
    ringRef.current = null;
  }, []);

  const startRing = useCallback(() => {
    stopRing();
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 440;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    ringRef.current = ctx;
    ringOscRef.current = osc;
  }, [stopRing]);

  const attachRemote = useCallback((session: Session) => {
    const pc = session.connection as RTCPeerConnection | undefined;
    if (!pc) return;
    const play = (stream: MediaStream) => {
      const el = remoteAudioRef.current;
      if (!el) return;
      el.srcObject = stream;
      void el.play().catch(() => undefined);
    };
    pc.addEventListener("track", (ev) => {
      if (ev.streams[0]) play(ev.streams[0]);
    });
    const receivers = pc.getReceivers?.() || [];
    const tracks = receivers.map((r) => r.track).filter(Boolean);
    if (tracks.length) {
      play(new MediaStream(tracks));
    }
  }, []);

  const bindSession = useCallback(
    (session: Session, direction: "in" | "out") => {
      sessionRef.current = session;
      const from =
        session.remote_identity?.uri?.user ||
        String(session.remote_identity?.uri || "");
      const display = String(session.remote_identity?.display_name || "").trim();
      setRemoteNumber(from);
      if (direction === "in") setIncoming({ from, name: display });
      setMuted(false);
      pushLog(
        direction === "in" ? `Incoming INVITE from ${from}` : `Outgoing INVITE to ${from}`,
        "info",
      );
      session.on("peerconnection", (ev?: { peerconnection?: RTCPeerConnection }) => {
        preferG711(ev?.peerconnection || (session.connection as RTCPeerConnection | undefined));
        attachRemote(session);
      });
      session.on("sdp", (e: { originator?: string; sdp?: string }) => {
        if (e.originator === "local" && e.sdp) {
          e.sdp = sipFriendlySdp(e.sdp);
        }
      });
      session.on("progress", () => {
        setCallState("ringing");
        pushLog("Remote ringing (SIP 180)", "ok");
      });
      session.on("accepted", () => {
        stopRing();
        setCallState("active");
        setIncoming(null);
        attachRemote(session);
        pushLog("Call answered (SIP 200)", "ok");
      });
      session.on("confirmed", () => {
        stopRing();
        setCallState("active");
        attachRemote(session);
        pushLog("Media confirmed", "ok");
      });
      session.on("ended", (ev: unknown) => {
        stopRing();
        sessionRef.current = null;
        setCallState("ended");
        setIncoming(null);
        setMuted(false);
        pushLog(`Call ended (${causeText(ev)})`, "warn");
      });
      session.on("failed", (ev: unknown) => {
        stopRing();
        sessionRef.current = null;
        setCallState("failed");
        setIncoming(null);
        setMuted(false);
        const why = causeText(ev);
        setError(why);
        pushLog(`Call failed: ${why}`, "error");
      });
    },
    [attachRemote, pushLog, stopRing],
  );

  const disconnect = useCallback(() => {
    expectInviteUntil.current = 0;
    stopRing();
    try {
      sessionRef.current?.terminate();
    } catch {
      /* no session */
    }
    sessionRef.current = null;
    try {
      uaRef.current?.stop();
    } catch {
      /* already stopped */
    }
    uaRef.current = null;
    setCallState("idle");
    setIncoming(null);
    setRemoteNumber("");
    setWsState("off");
    setSipState("off");
    pushLog("Disconnected", "warn");
  }, [pushLog, stopRing]);

  const connect = useCallback(
    async (password: string) => {
      if (!user?.extension) {
        setError("No SIP extension on this user.");
        setSipState("failed");
        pushLog("Cannot connect: user has no extension", "error");
        return false;
      }
      const host = sipHost;
      const wsUrl = sipWsUrl;
      if (!host || !wsUrl) {
        setError("SIP host / WebSocket URL missing. Save them on PBX settings.");
        setSipState("failed");
        pushLog("Cannot connect: SIP server not configured", "error");
        return false;
      }
      const pin = password.trim();
      if (!pin) {
        setError("Enter the SIP password from the PBX extension.");
        setSipState("failed");
        pushLog("Cannot connect: SIP password empty", "error");
        return false;
      }

      const mic = await enableMic();
      if (!mic) {
        setError("Plug in a headset or microphone, click Allow, then connect the softphone.");
        pushLog("Connect blocked: headset or microphone is required", "error");
        return false;
      }

      disconnect();
      setError("");
      setCallState("idle");
      setWsState("connecting");
      setSipState("off");
      pushLog(`Extension ${user.extension}`, "info");
      pushLog(`SIP host ${host}`, "info");
      pushLog(`Opening WebSocket ${wsUrl}`, "info");

      localStorage.setItem(passKey(user.id), pin);
      await api("/auth/sip", {
        method: "PATCH",
        body: JSON.stringify({ sipPassword: pin }),
      }).catch(() => undefined);

      let JsSIP: typeof import("jssip");
      try {
        const mod = (await import("jssip")) as unknown as Record<string, unknown>;
        JsSIP = loadJsSip(mod);
        if (!JsSIP?.UA || !JsSIP.WebSocketInterface) {
          throw new Error("JsSIP did not load in the browser");
        }
        pushLog(`JsSIP ${JsSIP.version || "loaded"}`, "ok");
      } catch (e) {
        const why = e instanceof Error ? e.message : "JsSIP load failed";
        setError(why);
        setWsState("failed");
        pushLog(why, "error");
        return false;
      }

      const socket = new JsSIP.WebSocketInterface(wsUrl);
      const ua = new JsSIP.UA({
        sockets: [socket],
        uri: `sip:${user.extension}@${host}`,
        password: pin,
        authorization_user: user.extension,
        display_name: user.name,
        register: true,
        session_timers: false,
        register_expires: 300,
        connection_recovery_min_interval: 2,
        connection_recovery_max_interval: 15,
      });
      uaRef.current = ua;
      ua.on("connecting", () => {
        setWsState("connecting");
        pushLog("WebSocket connecting…", "info");
      });
      ua.on("connected", () => {
        setWsState("connected");
        setSipState("registering");
        pushLog("WebSocket connected", "ok");
        pushLog(`Sending SIP REGISTER as ${user.extension}@${host}`, "info");
      });
      ua.on("disconnected", (ev: { error?: boolean; code?: number; reason?: string }) => {
        setWsState("failed");
        setSipState("off");
        const why = `${ev.code || ""} ${ev.reason || "WebSocket closed"}`.trim();
        setError(why);
        pushLog(`WebSocket disconnected: ${why}`, "error");
      });
      ua.on("registered", () => {
        setSipState("registered");
        setError("");
        pushLog("SIP registered — extension is online on the PBX", "ok");
        finishRegister(true);
      });
      ua.on("unregistered", () => {
        setSipState("off");
        pushLog("SIP unregistered", "warn");
      });
      ua.on("registrationFailed", (ev: { cause?: string }) => {
        setSipState("failed");
        const why = ev.cause || "REGISTER rejected";
        setError(why);
        pushLog(`SIP register failed: ${why}`, "error");
        finishRegister(false);
      });
      ua.on("newRTCSession", (ev: { session: Session; originator: string }) => {
        const session = ev.session;
        if (ev.originator === "remote") {
          if (sessionRef.current) {
            pushLog("Ignoring extra INVITE so a desk-phone call is not dropped", "warn");
            return;
          }
          bindSession(session, "in");
          const from = session.remote_identity?.uri?.user || "unknown";
          setRemoteNumber(from);
          setCallState("ringing");
          stopRing();
          pushLog(`Incoming from ${from} — answering automatically`, "ok");
          void (async () => {
            await enableMic();
            try {
              session.answer(mediaOpts());
            } catch (e) {
              pushLog(
                `Auto-answer failed: ${e instanceof Error ? e.message : e}. Pick up the desk phone if it is ringing.`,
                "warn",
              );
            }
          })();
          return;
        }
        bindSession(session, "out");
      });
      const ok = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          finishRegister(false);
          resolve(false);
        }, 15000);
        registerWaiters.current.push((result) => {
          clearTimeout(timer);
          resolve(result);
        });
        ua.start();
      });
      if (!ok && sipStateRef.current !== "registered") {
        setError("SIP REGISTER timed out. Check the extension password and ws:// PBX URL.");
        pushLog("SIP REGISTER timed out", "error");
      }
      return ok;
    },
    [
      bindSession,
      disconnect,
      enableMic,
      finishRegister,
      mediaOpts,
      pushLog,
      sipHost,
      sipWsUrl,
      startRing,
      stopRing,
      user,
    ],
  );

  const call = useCallback(
    async (number: string) => {
      const ua = uaRef.current;
      const cleaned = number.replace(/[^\d+*#]/g, "");
      const digits =
        /^\d{10}$/.test(cleaned) ? normalizeLocalNumber(cleaned) : cleaned;
      if (!digits) {
        pushLog("No number to dial", "warn");
        throw new Error("Enter a number to dial");
      }
      if (!ua || !(ua.isRegistered?.() || sipStateRef.current === "registered")) {
        const why = "Register 1001 on the PBX first, then click to call.";
        setError(why);
        setCallState("failed");
        pushLog("Call blocked: SIP not registered", "error");
        throw new Error(why);
      }
      const mic = await enableMic();
      if (!mic) {
        const why = "Plug in a headset or microphone, click Allow, then click to call.";
        setError(why);
        setCallState("failed");
        pushLog("Call blocked: microphone is required", "error");
        throw new Error(why);
      }
      setCallState("inviting");
      setRemoteNumber(digits);
      setError("");
      pushLog(`Dialing sip:${digits}@${sipHost} (outbound to target)`, "info");
      ua.call(`sip:${digits}@${sipHost}`, mediaOpts());
    },
    [enableMic, mediaOpts, pushLog, sipHost],
  );

  const answer = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    await enableMic();
    stopRing();
    pushLog("Answering automatically…", "ok");
    session.answer(mediaOpts());
  }, [enableMic, mediaOpts, pushLog, stopRing]);

  const hangup = useCallback(() => {
    stopRing();
    pushLog("Hang up", "warn");
    try {
      sessionRef.current?.terminate();
    } catch {
      /* no session */
    }
  }, [pushLog, stopRing]);

  const armPbxInvite = useCallback(() => {
    expectInviteUntil.current = Date.now() + 25_000;
    holdRemoteRef.current = false;
    pushLog("Desk click-to-call: this extension will auto-answer the PBX ring", "info");
  }, [pushLog]);

  const holdRemoteInvites = useCallback((hold: boolean) => {
    holdRemoteRef.current = hold;
    if (hold) expectInviteUntil.current = 0;
  }, []);

  const ensureRegistered = useCallback(
    async (password?: string) => {
      if (sipStateRef.current === "registered") return;
      const mic = await enableMic();
      if (!mic) {
        throw new Error("Softphone needs a headset or microphone. Plug it in, click Allow, then Register.");
      }
      const pin = (password || sipPassword).trim();
      if (!pin) {
        throw new Error("Enter the SIP password for this extension, then click Register.");
      }
      pushLog(`Registering ${extension || "extension"} on the PBX…`, "info");
      const ok = await connect(pin);
      if (!ok && sipStateRef.current !== "registered") {
        throw new Error(
          "Could not SIP REGISTER this extension. Check the password on Users and the WebSocket URL on PBX settings.",
        );
      }
    },
    [connect, enableMic, extension, pushLog, sipPassword],
  );

  const mute = useCallback(
    (next: boolean) => {
      const session = sessionRef.current;
      if (!session) return;
      if (next) session.mute({ audio: true });
      else session.unmute({ audio: true });
      setMuted(next);
      pushLog(next ? "Muted" : "Unmuted", "info");
    },
    [pushLog],
  );

  const sendDtmf = useCallback(
    (digit: string) => {
      sessionRef.current?.sendDTMF(digit);
      pushLog(`DTMF ${digit}`, "info");
    },
    [pushLog],
  );

  const playPrompt = useCallback(async (url: string) => {
    const audio = new Audio();
    audio.src = url;
    const ctx = new AudioContext();
    try {
      const elSrc = ctx.createMediaElementSource(audio);
      elSrc.connect(ctx.destination);
      const session = sessionRef.current;
      const pc = session?.connection as RTCPeerConnection | undefined;
      const sender = pc?.getSenders().find((s) => s.track?.kind === "audio");
      if (sender) {
        const mix = ctx.createMediaStreamDestination();
        if (localStreamRef.current) {
          ctx.createMediaStreamSource(localStreamRef.current).connect(mix);
        }
        elSrc.connect(mix);
        const mixTrack = mix.stream.getAudioTracks()[0];
        const original = sender.track;
        if (mixTrack) await sender.replaceTrack(mixTrack);
        pushLog("Playing voice prompt into the call", "ok");
        await audio.play();
        await new Promise<void>((resolve) => {
          audio.onended = () => resolve();
          audio.onerror = () => resolve();
        });
        if (original) await sender.replaceTrack(original);
      } else {
        pushLog("Playing voice prompt locally", "info");
        await audio.play();
        await new Promise<void>((resolve) => {
          audio.onended = () => resolve();
          audio.onerror = () => resolve();
        });
      }
    } catch (e) {
      pushLog(`Prompt play failed: ${e instanceof Error ? e.message : e}`, "warn");
    } finally {
      void ctx.close();
    }
  }, [pushLog]);

  useEffect(() => {
    if (!user || typeof navigator === "undefined" || !navigator.permissions?.query) return;
    let cancelled = false;
    void navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((status) => {
        if (cancelled) return;
        if (status.state === "denied") {
          setMicOk(false);
          setMicNotice(
            "Microphone is blocked in the browser. Allow it in the address-bar lock icon before you can register or call.",
          );
          pushLog("Microphone blocked — headset/microphone is required", "error");
        }
        status.onchange = () => {
          if (status.state === "granted") setMicOk(true);
          if (status.state === "denied") setMicOk(false);
        };
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pushLog, user]);

  useEffect(() => {
    if (!user) {
      disconnect();
      releaseMic();
      setSipHost("");
      setSipWsUrl("");
      setSipPassword("");
      setLog([]);
      return;
    }
    let cancelled = false;
    pushLog("Loading SIP settings…", "info");
    void api<{
      user: { sipPassword?: string; extension?: string };
      org: SipOrg;
    }>("/auth/me")
      .then((data) => {
        if (cancelled) return;
        const host = data.org.sipHost || "";
        const ws = data.org.sipWsUrl || "";
        setSipHost(host);
        setSipWsUrl(ws);
        const stored = localStorage.getItem(passKey(user.id)) || "";
        setSipPassword(data.user.sipPassword || stored);
        pushLog(
          host
            ? `Settings: ${data.user.extension || user.extension} @ ${host}`
            : "SIP host is empty — save it under PBX",
          host ? "ok" : "warn",
        );
        pushLog(ws ? `WebSocket URL ${ws}` : "WebSocket URL missing", ws ? "ok" : "warn");
      })
      .catch((e) => {
        pushLog(`Could not load settings: ${e instanceof Error ? e.message : e}`, "error");
      });
    return () => {
      cancelled = true;
    };
  }, [disconnect, pushLog, releaseMic, user]);

  useEffect(() => {
    return () => {
      disconnect();
      releaseMic();
    };
  }, [disconnect, releaseMic]);

  const value = useMemo<Softphone>(
    () => ({
      wsState,
      sipState,
      callState,
      error,
      micNotice,
      remoteNumber,
      muted,
      incoming,
      sipHost,
      sipWsUrl,
      sipUri: extension && sipHost ? `sip:${extension}@${sipHost}` : "",
      extension,
      hasPassword: Boolean(sipPassword),
      log,
      micOk,
      enableMic,
      connect: (password: string) => connect(password || sipPassword),
      disconnect,
      call,
      answer,
      hangup,
      mute,
      sendDtmf,
      playPrompt,
      armPbxInvite,
      holdRemoteInvites,
      ensureRegistered,
    }),
    [
      answer,
      call,
      callState,
      connect,
      disconnect,
      enableMic,
      error,
      extension,
      hangup,
      incoming,
      log,
      micNotice,
      micOk,
      mute,
      muted,
      playPrompt,
      armPbxInvite,
      holdRemoteInvites,
      ensureRegistered,
      remoteNumber,
      sendDtmf,
      sipHost,
      sipPassword,
      sipState,
      sipWsUrl,
      wsState,
    ],
  );

  return (
    <Ctx.Provider value={value}>
      <audio ref={remoteAudioRef} autoPlay playsInline />
      {children}
    </Ctx.Provider>
  );
}

export function useSoftphone() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSoftphone outside provider");
  return ctx;
}
