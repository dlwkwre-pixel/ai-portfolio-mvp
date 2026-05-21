import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import EmailSettingsClient from "./email-settings-client";

export default async function EmailSettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: allPortfolios } = await supabase
    .from("portfolios")
    .select("id, name, cash_balance, account_type")
    .eq("user_id", user.id)
    .eq("is_active", true);

  const portfolioIds = (allPortfolios ?? []).map((p) => p.id);

  const { data: allPrefs } = portfolioIds.length > 0
    ? await supabase
        .from("portfolio_digest_preferences")
        .select("portfolio_id, enabled, frequency, send_hour, timezone")
        .in("portfolio_id", portfolioIds)
        .eq("user_id", user.id)
    : { data: [] };

  const prefMap = new Map((allPrefs ?? []).map((p) => [p.portfolio_id, p]));

  const portfolioRows = (allPortfolios ?? []).map((p) => {
    const pref = prefMap.get(p.id);
    return {
      id: p.id,
      name: p.name,
      digestEnabled: pref?.enabled ?? false,
      frequency: pref?.frequency ?? null,
      sendHour: pref?.send_hour ?? null,
      timezone: pref?.timezone ?? null,
    };
  });

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
      <div className="bt-glow" style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1, display: "flex", minHeight: "100vh" }}>
        <div className="hidden lg:flex">
          <Sidebar
            userEmail={user.email}
            portfolios={(allPortfolios ?? []).map((p) => ({
              id: p.id, name: p.name,
              cash_balance: Number(p.cash_balance ?? 0),
              account_type: p.account_type,
            }))}
          />
        </div>
        <div className="bt-main-col" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <MobileNav />
          {/* Header */}
          <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-base)", position: "sticky", top: 0, zIndex: 10 }}>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.2px", marginBottom: "12px" }}>
              Settings
            </h1>
            {/* Nav tabs */}
            <div style={{ display: "flex", gap: "4px" }}>
              <Link href="/settings/profile" style={{
                padding: "5px 12px", borderRadius: "6px", fontSize: "13px", fontWeight: 500,
                color: "var(--text-secondary)", textDecoration: "none",
                background: "transparent",
                transition: "all 0.15s",
              }}>
                Profile
              </Link>
              <Link href="/settings/emails" style={{
                padding: "5px 12px", borderRadius: "6px", fontSize: "13px", fontWeight: 500,
                color: "var(--text-primary)", textDecoration: "none",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-subtle)",
              }}>
                Emails
              </Link>
            </div>
          </div>
          <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
            <EmailSettingsClient portfolios={portfolioRows} />
          </div>
        </div>
      </div>
    </main>
  );
}
