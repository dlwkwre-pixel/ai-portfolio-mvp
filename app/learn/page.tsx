import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import Link from "next/link";
import LaunchSetupButton from "./launch-setup-button";
import InstallAppButton from "./install-app-button";
import LearnModules from "./learn-modules";
import { TUTORIAL_LIST } from "@/lib/tutorials";

export default async function LearnPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: portfolios } = await supabase
    .from("portfolios")
    .select("id, name, cash_balance, account_type")
    .eq("user_id", user.id)
    .eq("is_active", true);

  return (
    <main style={{
      minHeight: "100vh",
      background: "var(--bg-base)",
      color: "var(--text-primary)",
      fontFamily: "var(--font-body)",
    }}>
      <div className="bt-glow" style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />

      <div style={{ position: "relative", zIndex: 1, display: "flex", minHeight: "100vh" }}>
        <div className="hidden lg:flex">
          <Sidebar
            userEmail={user.email}
            portfolios={(portfolios ?? []).map((p) => ({
              id: p.id,
              name: p.name,
              cash_balance: Number(p.cash_balance ?? 0),
              account_type: p.account_type,
            }))}
          />
        </div>

        <div className="bt-main-col" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <MobileNav />

          <div style={{
            padding: "12px 24px",
            borderBottom: "1px solid var(--border-subtle)",
            background: "var(--bg-base)",
            position: "sticky", top: 0, zIndex: 10,
          }}>
            <h1 style={{
              fontFamily: "var(--font-display)",
              fontSize: "16px", fontWeight: 600,
              color: "var(--text-primary)", letterSpacing: "-0.2px",
            }}>
              Learn
            </h1>
            <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "1px" }}>
              Investing education & guides
            </p>
          </div>

          <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
            {/* Setup Guide — always available */}
            <div style={{
              marginBottom: "24px",
              padding: "18px 20px",
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "var(--radius-lg)",
              display: "flex", alignItems: "flex-start", gap: "14px",
            }}>
              <div style={{
                flexShrink: 0, width: "40px", height: "40px",
                background: "linear-gradient(135deg, rgba(14,165,160,0.15), rgba(63,174,74,0.1))",
                border: "1px solid rgba(14,165,160,0.2)",
                borderRadius: "10px",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "18px",
              }}>
                🚀
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "3px" }}>
                  BuyTune Setup Guide
                </div>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: "0" }}>
                  New to BuyTune? The setup guide walks you through creating your portfolio, adding holdings, choosing a strategy, and running your first AI scan.
                </p>
                <LaunchSetupButton />
              </div>
            </div>

            {/* Install on iPhone */}
            <div style={{
              marginBottom: "24px",
              padding: "18px 20px",
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "var(--radius-lg)",
              display: "flex", alignItems: "flex-start", gap: "14px",
            }}>
              <div style={{
                flexShrink: 0, width: "40px", height: "40px",
                background: "linear-gradient(135deg, rgba(14,165,160,0.15), rgba(63,174,74,0.1))",
                border: "1px solid rgba(14,165,160,0.2)",
                borderRadius: "10px",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: "18px",
              }}>
                📲
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "3px" }}>
                  Add BuyTune to your iPhone
                </div>
                <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: "0" }}>
                  Install BuyTune to your Home Screen so it opens full-screen like a native app, no App Store needed. A quick three-step walkthrough using Safari&apos;s Share menu.
                </p>
                <InstallAppButton />
              </div>
            </div>

            {/* Page walkthroughs — replayable tutorials */}
            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "10px" }}>Page Walkthroughs</div>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5, margin: "0 0 14px" }}>
                A quick guided tour of each section. These run automatically the first time you open a page — replay any of them here.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "10px" }}>
                {TUTORIAL_LIST.map((t) => (
                  <Link key={t.id} href={`${t.href}?tutorial=${t.id}`}
                    style={{ display: "flex", alignItems: "center", gap: "11px", padding: "13px 15px", borderRadius: "var(--radius-lg)", border: "1px solid var(--card-border)", background: "var(--card-bg)", textDecoration: "none" }}>
                    <div style={{ width: "34px", height: "34px", borderRadius: "9px", background: "linear-gradient(135deg, rgba(14,165,160,0.14), rgba(63,174,74,0.1))", border: "1px solid rgba(63,174,74,0.22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px", flexShrink: 0 }}>{t.emoji}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>{t.label}</div>
                      <div style={{ fontSize: "11px", color: "var(--accent)", fontFamily: "var(--font-body)" }}>Replay walkthrough →</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Daily trivia + investing lessons (moved here from Community) */}
            <LearnModules />
          </div>
        </div>
      </div>
    </main>
  );
}
