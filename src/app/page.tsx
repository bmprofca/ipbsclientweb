"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "@/lib/session";
import { AuthShell } from "@/components/AuthShell";
import { api } from "@/lib/api";

export default function LoginPage() {
  const { login, user, loading } = useSession();
  const router = useRouter();
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace("/app");
  }, [loading, user, router]);

  async function sendOtp() {
    setSending(true);
    setError("");
    setInfo("");
    try {
      const data = await api<{ message?: string }>("/auth/otp/request", {
        method: "POST",
        body: JSON.stringify({ mobile, purpose: "login" }),
      });
      setInfo(data.message || "OTP sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send OTP");
    } finally {
      setSending(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(mobile, otp);
      router.push("/app");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign in failed";
      setError(
        message === "Failed to fetch"
          ? "Cannot reach the API. Start the server and try again."
          : message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <form className="card auth-form" onSubmit={onSubmit}>
        <p className="eyebrow">Welcome back</p>
        <h2>Sign in with mobile OTP</h2>
        <p className="muted">
          Use the mobile number registered for your business user. Until SMS is
          connected, the OTP is <b>123456</b>.
        </p>
        <label className="field">
          <span>Mobile number</span>
          <input
            inputMode="tel"
            autoComplete="tel"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            placeholder="10-digit mobile"
            required
          />
        </label>
        <div className="auth-row">
          <span />
          <button type="button" className="linkish" onClick={() => void sendOtp()} disabled={sending || !mobile}>
            {sending ? "Sending…" : "Send OTP"}
          </button>
        </div>
        <label className="field">
          <span>OTP</span>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            required
          />
        </label>
        {info ? <p className="auth-ok">{info}</p> : null}
        <p className="error">{error}</p>
        <button className="btn btn-block" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <p className="auth-alt">
          New business? <Link href="/register">Create an account</Link>
        </p>
      </form>
    </AuthShell>
  );
}
