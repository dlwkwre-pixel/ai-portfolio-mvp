import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import ComingSoon from "@/app/components/coming-soon";

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

          <div style={{ flex: 1, display: "flex", overflowY: "auto" }}>
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
    </main>
  );
}
