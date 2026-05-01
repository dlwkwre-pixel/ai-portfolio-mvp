import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import ResearchClient from "./research-client";
import NewsSidebar from "./news-sidebar";

export default async function ResearchPage() {
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
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}>
            <h1 style={{
              fontFamily: "var(--font-display)",
              fontSize: "16px",
              fontWeight: 600,
              color: "var(--text-primary)",
              letterSpacing: "-0.2px",
            }}>
              Research
            </h1>
            <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "1px" }}>
              Stock discovery, screeners & market news
            </p>
          </div>

          {/* Two-column body: main content scrolls left, news sidebar fills full height right */}
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "20px 24px 80px" }}>
              <ResearchClient
                portfolios={(portfolios ?? []).map((p) => ({ id: p.id, name: p.name }))}
              />
            </div>

            <div
              className="hidden lg:flex"
              style={{
                width: "280px",
                flexShrink: 0,
                borderLeft: "2px solid var(--brand-blue)",
                overflow: "hidden",
                background: "var(--card-bg)",
              }}
            >
              <NewsSidebar />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
