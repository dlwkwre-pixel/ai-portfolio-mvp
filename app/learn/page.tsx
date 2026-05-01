import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import ComingSoon from "@/app/components/coming-soon";
import LaunchSetupButton from "./launch-setup-button";

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

        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
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

          <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
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
                background: "linear-gradient(135deg, rgba(37,99,235,0.15), rgba(124,58,237,0.1))",
                border: "1px solid rgba(37,99,235,0.2)",
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

            {/* Coming soon content */}
            <div style={{ display: "flex" }}>
            <ComingSoon
              icon="📚"
              title="Learn is on the way"
              subtitle="Investing education, guides & explainers"
              description="We're building a library of beginner-friendly and advanced investing content — from portfolio basics to AI-powered strategy breakdowns."
              features={[
                "Investing fundamentals: stocks, ETFs, bonds, and diversification",
                "Reading analyst ratings and price targets",
                "How to interpret your portfolio's performance metrics",
                "AI strategy builder walkthroughs and examples",
                "Glossary of financial terms used across BuyTune",
              ]}
              eta="Coming in a future update"
            />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
