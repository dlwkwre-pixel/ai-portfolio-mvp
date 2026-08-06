import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BrandGlyph } from "@/app/components/brand-mark";
import SignOutButton from "./sign-out-button";

// Sage auth — split panel matching /login and /signup: dark brand showcase
// (left) + light sage waiting-room message (right). Mobile shows the light
// panel only. Reached whenever proxy.ts blocks an unapproved account.
const DARK = "oklch(0.22 0.03 150)";
const INK = "oklch(0.2 0.03 150)";
const INK2 = "oklch(0.4 0.03 150)";
const TEAL = "#0e9488";
const GRAD = "linear-gradient(135deg,#3fae4a,#0ea5a0)";

export const metadata = { title: "Awaiting approval — BuyTune.io" };

export default async function PendingApprovalPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const adminEmail = process.env.ADMIN_EMAIL;
  const isAdmin = !!adminEmail && user.email === adminEmail;

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("approved, username")
    .eq("id", user.id)
    .maybeSingle();

  if (isAdmin || profile?.approved) {
    redirect(profile?.username ? "/dashboard" : "/setup-username");
  }

  return (
    <main style={{ minHeight: "100vh", background: "oklch(0.91 0.04 150)", display: "flex", fontFamily: "var(--font-body)" }}>
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
        .fu0{animation:fadeUp 0.5s ease both}
        .fu1{animation:fadeUp 0.5s 0.08s ease both}
        .fu2{animation:fadeUp 0.5s 0.16s ease both}
        .lg-panel{display:none}
        @media(min-width:1024px){.lg-panel{display:flex!important}.mob-logo{display:none!important}}
      `}</style>

      <div className="lg-panel" style={{ flex: 1, flexDirection: "column", justifyContent: "space-between", padding: "48px", background: DARK, borderRight: "1px solid rgba(255,255,255,0.06)", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 50% at 30% 40%,rgba(63,174,74,0.14),transparent 60%),radial-gradient(ellipse 40% 40% at 80% 80%,rgba(14,165,160,0.12),transparent 50%)", pointerEvents: "none" }} />
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none", position: "relative", zIndex: 1 }}>
          <div style={{ width: "36px", height: "36px", background: GRAD, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BrandGlyph size={18} strokeWidth={2.4} />
          </div>
          <span style={{ fontFamily: "var(--font-logo)", fontWeight: 700, fontSize: "17px", color: "#fff" }}>BuyTune.io</span>
        </Link>
        <div style={{ position: "relative", zIndex: 1 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "30px", fontWeight: 800, color: "#fff", letterSpacing: "-0.8px", lineHeight: 1.15, marginBottom: "16px" }}>
            We review every<br />account by hand.
          </h2>
          <p style={{ fontSize: "13.5px", lineHeight: 1.7, color: "oklch(0.72 0.02 150)", maxWidth: "380px" }}>
            BuyTune.io is approval-only right now. It keeps the community small
            and lets us stand behind every account on the platform.
          </p>
        </div>
        <div style={{ position: "relative", zIndex: 1, fontSize: "12px", color: "oklch(0.55 0.02 150)" }}>© 2026 BuyTune. All rights reserved.</div>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px" }}>
        <div style={{ width: "100%", maxWidth: "400px", textAlign: "center" }}>
          <Link href="/" className="mob-logo" style={{ display: "flex", alignItems: "center", gap: "8px", textDecoration: "none", marginBottom: "40px", justifyContent: "center" }}>
            <div style={{ width: "28px", height: "28px", background: GRAD, borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BrandGlyph size={14} strokeWidth={2.6} />
            </div>
            <span style={{ fontFamily: "var(--font-logo)", fontWeight: 700, fontSize: "15px", color: INK }}>BuyTune.io</span>
          </Link>

          <div className="fu0" style={{ width: "56px", height: "56px", borderRadius: "50%", background: "rgba(14,148,136,0.1)", border: "1px solid rgba(14,148,136,0.25)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3.5 2" />
            </svg>
          </div>

          <div className="fu1" style={{ marginBottom: "28px" }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "24px", fontWeight: 700, color: INK, letterSpacing: "-0.4px", marginBottom: "10px" }}>
              Your account is awaiting approval
            </h1>
            <p style={{ fontSize: "14px", color: INK2, lineHeight: 1.6 }}>
              Thanks for signing up. We manually approve every new account —
              you&apos;ll get access as soon as it&apos;s reviewed. No need to sign up again.
            </p>
          </div>

          <div className="fu2" style={{ fontSize: "13px", color: INK2 }}>
            <SignOutButton />
          </div>
        </div>
      </div>
    </main>
  );
}
