import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { BrandGlyph } from "@/app/components/brand-mark";

const LEGAL_PAGES = [
  { href: "/legal/terms", label: "Terms of Service" },
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/ai-disclaimer", label: "AI Disclaimer" },
  { href: "/legal/investment-disclaimer", label: "Investment Disclaimer" },
  { href: "/legal/financial-planning-disclaimer", label: "Financial Planning" },
];

export default async function LegalLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const backHref = user ? "/dashboard" : "/";
  const backLabel = user ? "Back to app" : "Back to BuyTune";

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-base)", color: "#e2e8f0", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .legal-nav-link { font-size: 12px; color: #475569; text-decoration: none; padding: 4px 10px; border-radius: 6px; transition: color 0.15s, background 0.15s; white-space: nowrap; }
        .legal-nav-link:hover { color: #e2e8f0; background: rgba(255,255,255,0.05); }
        .legal-nav-link.active { color: #7fd9d4; background: rgba(14,165,160,0.1); }
        .legal-section { margin-bottom: 36px; }
        .legal-h2 { font-size: 14px; font-weight: 700; color: #7fd9d4; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .legal-h3 { font-size: 13px; font-weight: 600; color: #cbd5e1; margin: 16px 0 6px; }
        .legal-p { font-size: 13px; color: #94a3b8; line-height: 1.75; margin-bottom: 10px; }
        .legal-ul { font-size: 13px; color: #94a3b8; line-height: 1.75; margin: 6px 0 10px 20px; }
        .legal-ul li { margin-bottom: 4px; }
        .legal-link { color: #3fc9c3; text-decoration: none; }
        .legal-link:hover { text-decoration: underline; }
        .legal-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
        @media (max-width: 768px) {
          .legal-sidebar { display: none !important; }
          .legal-body-wrap { padding: 24px 20px !important; }
        }
      `}</style>

      {/* Top nav */}
      <div style={{ borderBottom: "1px solid var(--line-006)", padding: "12px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(7,9,15,0.9)", backdropFilter: "blur(12px)", position: "sticky", top: 0, zIndex: 100 }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none" }}>
          <div style={{ width: "26px", height: "26px", background: "var(--brand-gradient)", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <BrandGlyph size={11} strokeWidth={3.4} />
          </div>
          <span style={{ fontFamily: "var(--font-logo)", fontWeight: 700, fontSize: "14px", color: "#f0f4ff", letterSpacing: "-0.2px" }}>
            Buy<span style={{ color: "#3fae4a" }}>Tune</span>
          </span>
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: "2px", flexWrap: "wrap" }}>
          {LEGAL_PAGES.map((p) => (
            <Link key={p.href} href={p.href} className="legal-nav-link">{p.label}</Link>
          ))}
          <Link href={backHref} className="legal-nav-link" style={{ marginLeft: "8px", color: "#3fc9c3", borderLeft: "1px solid var(--line-008)", paddingLeft: "10px" }}>
            {backLabel} →
          </Link>
        </div>
      </div>

      <div style={{ display: "flex", maxWidth: "1100px", margin: "0 auto" }}>
        {/* Sidebar */}
        <div className="legal-sidebar" style={{ width: "200px", flexShrink: 0, padding: "40px 0 40px 32px" }}>
          <div style={{ position: "sticky", top: "64px", display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, color: "#334155", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Legal</div>
            {LEGAL_PAGES.map((p) => (
              <Link key={p.href} href={p.href} className="legal-nav-link" style={{ display: "block", padding: "5px 8px" }}>{p.label}</Link>
            ))}
          </div>
        </div>

        {/* Main content */}
        <div className="legal-body-wrap" style={{ flex: 1, padding: "40px 40px 80px 32px", minWidth: 0 }}>
          {children}
        </div>
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid var(--line-006)", padding: "24px 32px", textAlign: "center", fontSize: "12px", color: "#334155" }}>
        © 2026 BuyTune. All rights reserved. &nbsp;·&nbsp;
        <Link href="/legal/terms" className="legal-link" style={{ color: "var(--text-tertiary)" }}>Terms</Link> &nbsp;·&nbsp;
        <Link href="/legal/privacy" className="legal-link" style={{ color: "var(--text-tertiary)" }}>Privacy</Link> &nbsp;·&nbsp;
        <Link href={backHref} style={{ color: "var(--text-tertiary)", textDecoration: "none" }}>{backLabel}</Link>
      </div>
    </div>
  );
}
