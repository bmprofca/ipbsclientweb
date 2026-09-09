import Link from "next/link";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-shell">
      <section className="auth-hero">
        <div>
          <Link href="/" className="brand">
            IP<span>BS</span>
          </Link>
          <p className="lede">
            Cloud CTI for every business on its own workspace. Sign in with your
            registered mobile number and OTP. Click-to-call, inbound routing, and CRM
            stay isolated per company.
          </p>
        </div>
        <div className="hero-stats">
          <div>
            <b>Multi-tenant</b>
            One login, one business
          </div>
          <div>
            <b>Neron + Onyx</b>
            MQTT and HTTP CTI
          </div>
          <div>
            <b>Seats</b>
            Users stay inside your plan
          </div>
        </div>
      </section>
      <section className="auth-card">{children}</section>
    </div>
  );
}
