import Link from "next/link";

export const metadata = { title: "Compliance — BuyTune Admin" };

const LEGAL_PAGES = [
  { href: "/legal/terms", label: "Terms of Service", sections: 16 },
  { href: "/legal/privacy", label: "Privacy Policy", sections: 11 },
  { href: "/legal/ai-disclaimer", label: "AI Disclaimer", sections: 8 },
  { href: "/legal/investment-disclaimer", label: "Investment Disclaimer", sections: 9 },
  { href: "/legal/financial-planning-disclaimer", label: "Financial Planning Disclaimer", sections: 9 },
];

type CheckStatus = "pass" | "review" | "fail";
const SECURITY_CHECKS: { label: string; status: CheckStatus }[] = [
  { label: "Row-level security on user_profiles", status: "pass" },
  { label: "Row-level security on portfolios", status: "pass" },
  { label: "Row-level security on holdings", status: "pass" },
  { label: "Row-level security on strategies", status: "pass" },
  { label: "Row-level security on follows / likes / saves", status: "pass" },
  { label: "Supabase service role key server-only (not in client)", status: "pass" },
  { label: "AI API keys (Gemini, Grok) server-only", status: "pass" },
  { label: "Finnhub API key server-only", status: "pass" },
  { label: "No AI API calls from client components", status: "pass" },
  { label: "Auth-gated pages redirect unauthenticated users to /login", status: "pass" },
  { label: "Admin pages gated by ADMIN_EMAIL (server-side)", status: "pass" },
  { label: "CRON routes validate CRON_SECRET header", status: "pass" },
];

const THIRD_PARTY_SERVICES = [
  { name: "Supabase", purpose: "Database + Auth", dataShared: "All user data (stored here)", privacyUrl: "https://supabase.com/privacy" },
  { name: "Vercel", purpose: "Hosting + Serverless", dataShared: "Web request logs, headers", privacyUrl: "https://vercel.com/legal/privacy-policy" },
  { name: "Resend", purpose: "Email delivery", dataShared: "Email address, digest HTML", privacyUrl: "https://resend.com/privacy" },
  { name: "Finnhub", purpose: "Market data", dataShared: "Ticker symbols queried", privacyUrl: "https://finnhub.io/privacy" },
  { name: "Google Gemini", purpose: "AI analysis", dataShared: "Portfolio context (anonymized)", privacyUrl: "https://policies.google.com/privacy" },
  { name: "xAI Grok", purpose: "AI analysis (live search)", dataShared: "Portfolio context (anonymized)", privacyUrl: "https://x.ai/legal/privacy" },
  { name: "Vercel Analytics", purpose: "Usage analytics", dataShared: "Anonymized page views", privacyUrl: "https://vercel.com/legal/privacy-policy" },
];

const REGULATORY = [
  { label: "Registered Investment Adviser (SEC / state)", status: "N/A — educational platform" },
  { label: "FINRA / SIPC member", status: "N/A — not a broker-dealer" },
  { label: "GDPR applicability", status: "Monitor — no EU-specific data processing yet" },
  { label: "CCPA applicability", status: "Monitor — check if >$25M revenue or >50k CA users" },
  { label: "COPPA compliance", status: "Pass — 18+ age gate in Terms of Service" },
  { label: "BIMI sender icon (inbox branding)", status: "Deferred — requires DNS + VMC certificate" },
];

const CONTACTS = [
  { role: "Privacy inquiries", contact: "privacy@buytune.io" },
  { role: "Legal / Terms", contact: "legal@buytune.io" },
  { role: "Support / AI feedback", contact: "support@buytune.io" },
];

const STATUS_STYLE: Record<CheckStatus, { bg: string; color: string; border: string; label: string }> = {
  pass:   { bg: "rgba(16,185,129,0.1)",  color: "#6ee7b7", border: "rgba(16,185,129,0.22)", label: "Pass" },
  review: { bg: "rgba(251,191,36,0.1)",  color: "#fde68a", border: "rgba(251,191,36,0.22)", label: "Review" },
  fail:   { bg: "rgba(239,68,68,0.1)",   color: "#fca5a5", border: "rgba(239,68,68,0.22)",  label: "Fail" },
};

function Pill({ status }: { status: CheckStatus }) {
  const s = STATUS_STYLE[status];
  return (
    <span style={{ flexShrink: 0, padding: "2px 9px", borderRadius: "999px", fontSize: "11px", fontWeight: 600, background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {s.label}
    </span>
  );
}

const card: React.CSSProperties = {
  background: "var(--card-bg)", border: "1px solid var(--card-border)",
  borderRadius: "14px", padding: "20px 22px", marginBottom: "16px",
};
const sectionLabel: React.CSSProperties = {
  fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em",
  color: "var(--text-tertiary)", marginBottom: "14px",
};
const row: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
  padding: "9px 0", borderTop: "1px solid var(--border-subtle)", fontSize: "13px", color: "var(--text-secondary)",
};

export default async function ComplianceDashboard() {
  const passCount = SECURITY_CHECKS.filter((c) => c.status === "pass").length;
  const reviewCount = SECURITY_CHECKS.filter((c) => c.status === "review").length;
  const effectiveDate = "May 26, 2026";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <div style={{ marginBottom: "20px" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "22px", fontWeight: 700, letterSpacing: "-0.4px", color: "var(--text-primary)" }}>Compliance</h1>
        <p style={{ fontSize: "13px", color: "var(--text-tertiary)", marginTop: "2px" }}>
          BuyTune.io · Legal effective {effectiveDate} · Governing law: Texas, United States
        </p>
      </div>

      {/* Status summary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px", marginBottom: "20px" }}>
        {[
          { v: `${LEGAL_PAGES.length}`, l: "Legal pages live", ok: true },
          { v: `${passCount}/${SECURITY_CHECKS.length}`, l: "Security checks passing", ok: true },
          { v: `${reviewCount}`, l: "Items needing review", ok: reviewCount === 0 },
        ].map((s) => (
          <div key={s.l} style={{
            background: s.ok ? "rgba(16,185,129,0.07)" : "rgba(251,191,36,0.07)",
            border: `1px solid ${s.ok ? "rgba(16,185,129,0.18)" : "rgba(251,191,36,0.2)"}`,
            borderRadius: "12px", padding: "16px 18px",
          }}>
            <div style={{ fontSize: "24px", fontWeight: 700, fontFamily: "var(--font-mono)", color: s.ok ? "#6ee7b7" : "#fde68a" }}>{s.v}</div>
            <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "4px" }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Legal pages */}
      <div style={card}>
        <div style={sectionLabel}>Legal Pages</div>
        {LEGAL_PAGES.map((p, i) => (
          <div key={p.href} style={{ ...row, borderTop: i === 0 ? "none" : row.borderTop }}>
            <div>
              <span style={{ color: "var(--text-primary)" }}>{p.label}</span>
              <span style={{ color: "var(--text-muted, #475569)", marginLeft: "8px", fontSize: "12px" }}>{p.sections} sections</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <Pill status="pass" />
              <Link href={p.href} target="_blank" style={{ color: "var(--accent, #3fc9c3)", fontSize: "12px", textDecoration: "none" }}>View</Link>
            </div>
          </div>
        ))}
      </div>

      {/* Security checklist */}
      <div style={card}>
        <div style={sectionLabel}>Security Checklist</div>
        {SECURITY_CHECKS.map((c, i) => (
          <div key={c.label} style={{ ...row, borderTop: i === 0 ? "none" : row.borderTop }}>
            <span>{c.label}</span>
            <Pill status={c.status} />
          </div>
        ))}
      </div>

      {/* Third-party processors */}
      <div style={card}>
        <div style={sectionLabel}>Third-Party Data Processors</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.8fr 2.2fr auto", gap: "0 12px" }}>
          {["Service", "Purpose", "Data shared", "Policy"].map((h) => (
            <span key={h} style={{ fontSize: "11px", color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", paddingBottom: "8px" }}>{h}</span>
          ))}
          {THIRD_PARTY_SERVICES.map((svc) => (
            <div key={svc.name} style={{ display: "contents" }}>
              <span style={{ color: "var(--text-primary)", fontWeight: 500, fontSize: "12.5px", padding: "9px 0", borderTop: "1px solid var(--border-subtle)" }}>{svc.name}</span>
              <span style={{ color: "var(--text-secondary)", fontSize: "12.5px", padding: "9px 0", borderTop: "1px solid var(--border-subtle)" }}>{svc.purpose}</span>
              <span style={{ color: "var(--text-secondary)", fontSize: "12.5px", padding: "9px 0", borderTop: "1px solid var(--border-subtle)" }}>{svc.dataShared}</span>
              <a href={svc.privacyUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent, #3fc9c3)", fontSize: "12.5px", textDecoration: "none", padding: "9px 0", borderTop: "1px solid var(--border-subtle)" }}>Link</a>
            </div>
          ))}
        </div>
      </div>

      {/* Regulatory status */}
      <div style={card}>
        <div style={sectionLabel}>Regulatory Status</div>
        {REGULATORY.map((item, i) => (
          <div key={item.label} style={{ ...row, borderTop: i === 0 ? "none" : row.borderTop }}>
            <span>{item.label}</span>
            <span style={{ fontSize: "12px", color: "var(--text-tertiary)", textAlign: "right" }}>{item.status}</span>
          </div>
        ))}
      </div>

      {/* Contacts */}
      <div style={card}>
        <div style={sectionLabel}>Key Contacts</div>
        {CONTACTS.map((item, i) => (
          <div key={item.role} style={{ ...row, borderTop: i === 0 ? "none" : row.borderTop }}>
            <span>{item.role}</span>
            <a href={`mailto:${item.contact}`} style={{ color: "var(--accent, #3fc9c3)", fontSize: "13px", textDecoration: "none" }}>{item.contact}</a>
          </div>
        ))}
      </div>
    </div>
  );
}
