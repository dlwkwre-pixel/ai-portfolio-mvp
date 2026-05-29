import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import ProfileSettingsClient from "./profile-settings-client";
import BadgesSection from "@/app/[username]/badges-section";
import EmailSettingsClient from "@/app/settings/emails/email-settings-client";
import Link from "next/link";
import { checkAndAwardBadges } from "@/lib/badges/check";

const LEGAL_LINKS = [
  { href: "/legal/terms", label: "Terms of Service" },
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/ai-disclaimer", label: "AI Disclaimer" },
  { href: "/legal/investment-disclaimer", label: "Investment Disclaimer" },
  { href: "/legal/financial-planning-disclaimer", label: "Financial Planning Disclaimer" },
];

export default async function ProfileSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [
    { data: profile },
    { data: allPortfolios },
    { count: followersCount },
    { count: followingCount },
  ] = await Promise.all([
    supabase.from("user_profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("portfolios").select("id, name, cash_balance, account_type").eq("user_id", user.id).eq("is_active", true),
    supabase.from("user_follows").select("*", { count: "exact", head: true }).eq("following_id", user.id),
    supabase.from("user_follows").select("*", { count: "exact", head: true }).eq("follower_id", user.id),
  ]);

  // Retroactively award any badges earned before tracking was implemented
  // Must await so BadgesSection reads up-to-date rows on this same page load
  await checkAndAwardBadges(user.id).catch(() => {});

  // Email digest prefs
  const portfolioIds = (allPortfolios ?? []).map((p) => p.id);
  const { data: allPrefs } = portfolioIds.length > 0
    ? await supabase.from("portfolio_digest_preferences").select("portfolio_id, enabled, frequency, send_hour, timezone").in("portfolio_id", portfolioIds).eq("user_id", user.id)
    : { data: [] };
  const prefMap = new Map((allPrefs ?? []).map((p) => [p.portfolio_id, p]));
  const portfolioRows = (allPortfolios ?? []).map((p) => {
    const pref = prefMap.get(p.id);
    return { id: p.id, name: p.name, digestEnabled: pref?.enabled ?? false, frequency: pref?.frequency ?? null, sendHour: pref?.send_hour ?? null, timezone: pref?.timezone ?? null };
  });

  const isAdmin = !!(process.env.ADMIN_EMAIL && user.email === process.env.ADMIN_EMAIL);

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
      <div className="bt-glow" style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1, display: "flex", minHeight: "100vh" }}>
        <div className="hidden lg:flex">
          <Sidebar
            userEmail={user.email}
            portfolios={(allPortfolios ?? []).map(p => ({ id: p.id, name: p.name, cash_balance: Number(p.cash_balance ?? 0), account_type: p.account_type }))}
          />
        </div>
        <div className="bt-main-col" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <MobileNav />
          <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-base)", position: "sticky", top: 0, zIndex: 10 }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.2px" }}>
              Profile &amp; Settings
            </h1>
          </div>
          <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "40px", maxWidth: "640px" }}>

              {/* 1. Profile */}
              <ProfileSettingsClient
                userId={user.id}
                email={user.email ?? ""}
                existingProfile={profile ? {
                  username: profile.username,
                  display_name: profile.display_name,
                  bio: profile.bio,
                  avatar_color: profile.avatar_color,
                  is_public: (profile as Record<string, unknown>).is_public as boolean ?? true,
                } : null}
                followersCount={followersCount ?? 0}
                followingCount={followingCount ?? 0}
              />

              {/* 2. Achievements */}
              <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "32px" }}>
                <BadgesSection userId={user.id} isOwnProfile={true} />
              </div>

              {/* 3. Email digests */}
              <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "32px" }}>
                <div style={{ marginBottom: "16px" }}>
                  <h2 style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.2px", marginBottom: "2px" }}>
                    Email Digests
                  </h2>
                  <p style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                    Weekly or daily portfolio updates delivered to your inbox.
                  </p>
                </div>
                <EmailSettingsClient portfolios={portfolioRows} />
              </div>

              {/* 4. Platform / Legal */}
              <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "24px", paddingBottom: "16px", display: "flex", flexDirection: "column", gap: "6px" }}>
                <style>{`.bt-legal-link:hover { background: var(--bg-elevated) !important; border-color: var(--border-subtle) !important; }`}</style>
                <p style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "4px" }}>Platform</p>
                {LEGAL_LINKS.map((link) => (
                  <Link key={link.href} href={link.href} target="_blank" className="bt-legal-link" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: "8px", textDecoration: "none", color: "var(--text-secondary)", fontSize: "13px", border: "1px solid transparent", transition: "all 0.15s", background: "transparent" }}>
                    <span>{link.label}</span>
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" style={{ opacity: 0.4 }}><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"/><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"/></svg>
                  </Link>
                ))}
                {isAdmin && (
                  <Link href="/admin/compliance" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderRadius: "8px", background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.15)", textDecoration: "none", color: "#60a5fa", fontSize: "13px", fontWeight: 500, marginTop: "4px", transition: "all 0.15s" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                      Compliance Dashboard
                    </span>
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" style={{ opacity: 0.5 }}><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"/></svg>
                  </Link>
                )}
              </div>

            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
