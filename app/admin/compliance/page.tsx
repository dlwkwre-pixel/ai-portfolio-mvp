import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export const metadata = { title: "Compliance Dashboard — BuyTune Admin" };

const LEGAL_PAGES = [
  { href: "/legal/terms", label: "Terms of Service", sections: 16 },
  { href: "/legal/privacy", label: "Privacy Policy", sections: 11 },
  { href: "/legal/ai-disclaimer", label: "AI Disclaimer", sections: 8 },
  { href: "/legal/investment-disclaimer", label: "Investment Disclaimer", sections: 9 },
  { href: "/legal/financial-planning-disclaimer", label: "Financial Planning Disclaimer", sections: 9 },
];

const SECURITY_CHECKS = [
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
  { label: "Portfolio full report redirect uses ?next= param", status: "pass" },
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

export default async function ComplianceDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/admin/compliance");

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || user.email !== adminEmail) {
    redirect("/dashboard");
  }

  const effectiveDate = "May 26, 2026";
  const passCount = SECURITY_CHECKS.filter((c) => c.status === "pass").length;
  const reviewCount = SECURITY_CHECKS.filter((c) => c.status === "review").length;

  return (
    <div style={{ minHeight: "100vh", background: "#07090f", color: "#e2e8f0", fontFamily: "'DM Sans', sans-serif", padding: "40px 32px 80px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .comp-card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 20px 24px; margin-bottom: 24px; }
        .comp-h2 { font-size: 11px; font-weight: 700; color: #334155; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 16px; }
        .comp-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 13px; color: #94a3b8; }
        .comp-row:last-child { border-bottom: none; }
        .badge-pass { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: rgba(16,185,129,0.1); color: #6ee7b7; border: 1px solid rgba(16,185,129,0.2); }
        .badge-review { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: rgba(251,191,36,0.1); color: #fde68a; border: 1px solid rgba(251,191,36,0.2); }
        .badge-fail { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: rgba(239,68,68,0.1); color: #fca5a5; border: 1px solid rgba(239,68,68,0.2); }
        a.comp-link { color: #60a5fa; text-decoration: none; font-size: 12px; }
        a.comp-link:hover { text-decoration: underline; }
      `}</style>

      <div style={{ maxWidth: "960px", margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: "36px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "6px" }}>Admin</div>
              <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: "26px", fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.5px" }}>Compliance Dashboard</h1>
            </div>
            <Link href="/dashboard" style={{ fontSize: "12px", color: "#475569", textDecoration: "none", padding: "6px 12px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px" }}>
              Back to App
            </Link>
          </div>
          <p style={{ fontSize: "13px", color: "#475569" }}>Platform: BuyTune.io &nbsp;·&nbsp; Legal effective: {effectiveDate} &nbsp;·&nbsp; Governing law: Texas, United States</p>
        </div>

        {/* Status Summary */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "32px" }}>
          <div style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.18)", borderRadius: "10px", padding: "16px 20px" }}>
            <div style={{ fontSize: "24px", fontWeight: 700, color: "#6ee7b7", fontFamily: "var(--font-mono, monospace)" }}>{LEGAL_PAGES.length}</div>
            <div style={{ fontSize: "12px", color: "#475569", marginTop: "4px" }}>Legal pages live</div>
          </div>
          <div style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.18)", borderRadius: "10px", padding: "16px 20px" }}>
            <div style={{ fontSize: "24px", fontWeight: 700, color: "#6ee7b7", fontFamily: "var(--font-mono, monospace)" }}>{passCount}/{SECURITY_CHECKS.length}</div>
            <div style={{ fontSize: "12px", color: "#475569", marginTop: "4px" }}>Security checks passing</div>
          </div>
          <div style={{ background: reviewCount > 0 ? "rgba(251,191,36,0.07)" : "rgba(16,185,129,0.07)", border: reviewCount > 0 ? "1px solid rgba(251,191,36,0.2)" : "1px solid rgba(16,185,129,0.18)", borderRadius: "10px", padding: "16px 20px" }}>
            <div style={{ fontSize: "24px", fontWeight: 700, color: reviewCount > 0 ? "#fde68a" : "#6ee7b7", fontFamily: "var(--font-mono, monospace)" }}>{reviewCount}</div>
            <div style={{ fontSize: "12px", color: "#475569", marginTop: "4px" }}>Items needing review</div>
          </div>
        </div>

        {/* Legal Pages */}
        <div className="comp-card">
          <div className="comp-h2">Legal Pages</div>
          {LEGAL_PAGES.map((page) => (
            <div key={page.href} className="comp-row">
              <div>
                <span style={{ color: "#e2e8f0" }}>{page.label}</span>
                <span style={{ color: "#334155", marginLeft: "8px", fontSize: "12px" }}>{page.sections} sections</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span className="badge-pass">Live</span>
                <Link href={page.href} className="comp-link" target="_blank">View</Link>
              </div>
            </div>
          ))}
        </div>

        {/* Security Checklist */}
        <div className="comp-card">
          <div className="comp-h2">Security Checklist</div>
          {SECURITY_CHECKS.map((check) => (
            <div key={check.label} className="comp-row">
              <span>{check.label}</span>
              {check.status === "pass" && <span className="badge-pass">Pass</span>}
              {check.status === "review" && <span className="badge-review">Review</span>}
              {check.status === "fail" && <span className="badge-fail">Fail</span>}
            </div>
          ))}
          {reviewCount > 0 && (
            <div style={{ marginTop: "16px", padding: "10px 14px", background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)", borderRadius: "8px", fontSize: "12px", color: "#fde68a" }}>
              <strong>Review needed:</strong> CRON routes should validate a <code style={{ fontSize: "11px", background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: "3px" }}>CRON_SECRET</code> header to prevent unauthorized triggering of digest emails and snapshot jobs.
            </div>
          )}
        </div>

        {/* Third-Party Services */}
        <div className="comp-card">
          <div className="comp-h2">Third-Party Data Processors</div>
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 2fr 2.5fr auto", gap: "0", marginBottom: "8px" }}>
            <span style={{ fontSize: "11px", color: "#334155", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Service</span>
            <span style={{ fontSize: "11px", color: "#334155", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Purpose</span>
            <span style={{ fontSize: "11px", color: "#334155", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Data shared</span>
            <span style={{ fontSize: "11px", color: "#334155", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Policy</span>
          </div>
          {THIRD_PARTY_SERVICES.map((svc) => (
            <div key={svc.name} style={{ display: "grid", gridTemplateColumns: "1.5fr 2fr 2.5fr auto", gap: "0", padding: "8px 0", borderTop: "1px solid rgba(255,255,255,0.04)", fontSize: "12px", color: "#94a3b8", alignItems: "start" }}>
              <span style={{ color: "#e2e8f0", fontWeight: 500 }}>{svc.name}</span>
              <span>{svc.purpose}</span>
              <span>{svc.dataShared}</span>
              <a href={svc.privacyUrl} className="comp-link" target="_blank" rel="noopener noreferrer">Link</a>
            </div>
          ))}
        </div>

        {/* Regulatory Status */}
        <div className="comp-card">
          <div className="comp-h2">Regulatory Status</div>
          {[
            { label: "Registered Investment Adviser (SEC / state)", status: "N/A — educational platform" },
            { label: "FINRA / SIPC member", status: "N/A — not a broker-dealer" },
            { label: "GDPR applicability", status: "Monitor — no EU-specific data processing yet" },
            { label: "CCPA applicability", status: "Monitor — check if >$25M revenue or >50k CA users" },
            { label: "COPPA compliance", status: "Pass — 18+ age gate in Terms of Service" },
            { label: "BIMI sender icon (inbox branding)", status: "Deferred — requires DNS + VMC certificate" },
          ].map((item) => (
            <div key={item.label} className="comp-row">
              <span>{item.label}</span>
              <span style={{ fontSize: "12px", color: "#475569" }}>{item.status}</span>
            </div>
          ))}
        </div>

        {/* Key Contacts */}
        <div className="comp-card">
          <div className="comp-h2">Key Contacts</div>
          {[
            { role: "Privacy inquiries", contact: "privacy@buytune.io" },
            { role: "Legal / Terms", contact: "legal@buytune.io" },
            { role: "Support / AI feedback", contact: "support@buytune.io" },
          ].map((item) => (
            <div key={item.role} className="comp-row">
              <span>{item.role}</span>
              <a href={`mailto:${item.contact}`} className="comp-link">{item.contact}</a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
