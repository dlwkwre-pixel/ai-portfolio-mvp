import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import ResearchClient from "./research-client";
import NewsSidebar from "./news-sidebar";
import PageIntro from "@/app/components/page-intro";

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

        <div className="bt-main-col" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <MobileNav />

          <div style={{
            padding: "12px 24px",
            borderBottom: "1px solid var(--border-subtle)",
            background: "var(--bg-base)",
            position: "sticky",
            top: 0,
            zIndex: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}>
            <div>
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
            <a href="/research/watchlist" style={{
              display: "inline-flex", alignItems: "center", gap: "6px", flexShrink: 0,
              padding: "7px 13px", borderRadius: "10px", textDecoration: "none",
              fontSize: "12px", fontWeight: 600, color: "var(--text-primary)",
              background: "var(--card-bg)", border: "1px solid var(--card-border)",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
              Watchlist
            </a>
          </div>

          {/* Two-column body: main content scrolls left, news sidebar fills full height right */}
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "20px 24px 80px" }}>
              <PageIntro
                pageKey="research"
                title="Stock Research"
                description="Search any ticker for AI-powered analysis, live earnings data, analyst ratings, and market context."
              />
              <Suspense>
                <ResearchClient
                  portfolios={(portfolios ?? []).map((p) => ({ id: p.id, name: p.name }))}
                />
              </Suspense>
            </div>

            <div
              className="hidden lg:flex"
              style={{
                width: "280px",
                flexShrink: 0,
                borderLeft: "1px solid var(--card-border)",
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
