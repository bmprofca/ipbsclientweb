"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { API_URL, api, getToken } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useSoftphone } from "@/lib/softphone";

type VoiceKey = { digit: string; label: string; disposition: string };

export type VoicePromptPayload = {
  recordId: string;
  campaignId: string;
  contactId: string;
  phone: string;
  name: string;
  company?: string;
  spokenText: string;
  hasAudio?: boolean;
  scriptId?: string;
  keys: VoiceKey[];
  audioUrl?: string;
  repeat?: boolean;
};

async function playUrl(path: string) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Audio not available");
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export function VoicePrompt() {
  const { user } = useSession();
  const phone = useSoftphone();
  const [prompt, setPrompt] = useState<VoicePromptPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const playedFor = useRef("");

  useEffect(() => {
    if (!user) return;
    const socket: Socket = io(API_URL, { auth: { token: getToken() } });
    socket.on("voice.prompt", (msg: { payload?: VoicePromptPayload }) => {
      const p = msg.payload;
      if (!p?.recordId && !p?.spokenText && !p?.phone) return;
      setPrompt(p);
    });
    return () => {
      socket.disconnect();
    };
  }, [user]);

  const play = useCallback(
    async (p: VoicePromptPayload) => {
      setBusy(true);
      try {
        if (p.audioUrl) {
          const url = await playUrl(p.audioUrl);
          await phone.playPrompt(url);
          URL.revokeObjectURL(url);
          return;
        }
        if (typeof window !== "undefined" && window.speechSynthesis && p.spokenText) {
          window.speechSynthesis.cancel();
          await new Promise<void>((resolve) => {
            const u = new SpeechSynthesisUtterance(p.spokenText);
            u.rate = 0.95;
            u.onend = () => resolve();
            u.onerror = () => resolve();
            window.speechSynthesis.speak(u);
          });
        }
      } finally {
        setBusy(false);
      }
    },
    [phone],
  );

  useEffect(() => {
    if (!prompt?.recordId) return;
    if (playedFor.current === prompt.recordId && !prompt.repeat) return;
    playedFor.current = prompt.recordId;
    const waitForCall = phone.callState === "active" || phone.callState === "ringing" ? 400 : 1800;
    const t = window.setTimeout(() => void play(prompt), waitForCall);
    return () => window.clearTimeout(t);
  }, [play, phone.callState, prompt]);

  async function choose(key: VoiceKey) {
    if (!prompt) return;
    setBusy(true);
    try {
      if (key.digit) phone.sendDtmf(key.digit);
      await api("/voice/respond", {
        method: "POST",
        body: JSON.stringify({
          recordId: prompt.recordId,
          campaignId: prompt.campaignId,
          digit: key.digit,
          disposition: key.disposition,
        }),
      });
      if (key.disposition !== "repeat") setPrompt(null);
    } finally {
      setBusy(false);
    }
  }

  if (!prompt) return null;

  return (
    <div className="popup voice-prompt">
      <p className="muted">Voice campaign · playing into the call</p>
      <h3>
        {prompt.name} · {prompt.phone}
      </h3>
      <p className="voice-script">{prompt.spokenText}</p>
      <div className="btn-row">
        <button className="btn mint" type="button" disabled={busy} onClick={() => void play(prompt)}>
          {busy ? "Playing…" : "Play again"}
        </button>
      </div>
      <div className="voice-keys">
        {(prompt.keys || []).map((k) => (
          <button
            key={k.digit}
            className="btn ghost"
            type="button"
            disabled={busy}
            onClick={() => void choose(k)}
          >
            {k.digit} · {k.label}
          </button>
        ))}
      </div>
      <button className="btn ghost" type="button" onClick={() => setPrompt(null)}>
        Dismiss
      </button>
    </div>
  );
}
