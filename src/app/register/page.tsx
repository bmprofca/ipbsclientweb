"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { AuthShell } from "@/components/AuthShell";
import { api } from "@/lib/api";

export default function RegisterPage() {
  const { register } = useSession();
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);

  async function sendOtp() {
    setSending(true);
    setError("");
    setInfo("");
    try {
      const data = await api<{ message?: string }>("/auth/otp/request", {
        method: "POST",
        body: JSON.stringify({ mobile, purpose: "register" }),
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
      await register(orgName, name, mobile, otp);
      router.push("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <form className="card auth-form" onSubmit={onSubmit}>
        <p className="eyebrow">14-day trial</p>
        <h2>Create your business account</h2>
        <p className="muted">
          Your mobile number is the unique login ID for this business owner. Until SMS is
          connected, the OTP is <b>123456</b>.
        </p>
        <label className="field">
          <span>Company name</span>
          <input
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Acme Support"
            required
          />
        </label>
        <label className="field">
          <span>Your name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Priya Shah"
            required
          />
        </label>
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
          {busy ? "Creating workspace…" : "Start free trial"}
        </button>
        <p className="auth-alt">
          Already have an account? <Link href="/">Sign in</Link>
        </p>
      </form>
    </AuthShell>
  );
}
