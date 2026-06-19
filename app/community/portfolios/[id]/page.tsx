import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import Link from "next/link";
import PublicPortfolioPerfChart from "./public-portfolio-perf-chart";
import PublicPortfolioActions from "./public-portfolio-actions";

const ALLOC_COLORS = ["#3b82f6", "#7c3aed", "#0891b2", "#065f46", "#92400e", "#4338ca"];
const ALLOC_CASH_COLOR = "rgba(255,255,255,0.2)";

function riskColor(r: string | null) {
  if (!r) return { bg: "var(--card-bg)", border: "var(--card-border)", color: "var(--text-tertiary)" };
  const l = r.toLowerCase();
  if (["low", "conservative"].includes(l)) return { bg: "var(--green-bg)", border: "var(--green-border)", color: "var(--green)" };
  if (["high", "aggressive"].includes(l)) return { bg: "var(--red-bg)", border: "var(--red-border)", color: "var(--red)" };
  return { bg: "var(--amber-bg)", border: "var(--amber-border)", color: "var(--amber)" };
}

export default async function PublicPortfolioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: portfolio } = await supabase
    .from("public_portfolios")
    .select("id, public_name, public_description, risk_level, style, follower_count, copy_count, last_synced_at, owner_user_id, is_public")
    .eq("id", id)
    .eq("is_public", true)
    .maybeSingle();

  if (!portfolio) notFound();

  const [
    { data: holdings },
    { data: performance },
    { data: ownerProfile },
    { data: followRow },
    { data: allPortfolios },
  ] = await Promise.all([
    supabase
      .from("public_portfolio_holdings")
      .select("ticker, company_name, allocation_pct, is_cash, display_order")
      .eq("public_portfolio_id", id)
      .order("display_order", { ascending: true }),
    supabase
      .from("public_portfolio_performance")
      .select("snapshot_date, return_pct")
      .eq("public_portfolio_id", id)
      .order("snapshot_date", { ascending: true }),
    supabase
      .from("user_profiles")
      .select("id, username, display_name, avatar_color, bio")
      .eq("id", portfolio.owner_user_id)
      .maybeSingle(),
    supabase
      .from("portfolio_followers")
      .select("id")
      .eq("public_portfolio_id", id)
      .eq("follower_user_id", user.id)
      .maybeSingle(),
    supabase
      .from("portfolios")
      .select("id, name, cash_balance, account_type")
      .eq("user_id", user.id)
      .eq("is_active", true),
  ]);

  const isOwn = portfolio.owner_user_id === user.id;
  const isFollowing = !!followRow;

  const holdingRows = (holdings ?? []).map((h) => ({
    ticker: h.ticker,
    company_name: h.company_name as string | null,
    allocation_pct: Number(h.allocation_pct),
    is_cash: h.is_cash,
  }));

  const perfData = (performance ?? []).map((p) => ({
    snapshot_date: p.snapshot_date,
    return_pct: Number(p.return_pct),
  }));

  const nonCashHoldings = holdingRows.filter((h) => !h.is_cash);
  const cashHolding = holdingRows.find((h) => h.is_cash);
  const owner = ownerProfile;
  const rs = riskColor(portfolio.risk_level);

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

          {/* Breadcrumb header */}
          <div style={{
            padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)",
            display: "flex", alignItems: "center", gap: "8px",
            background: "var(--bg-base)", position: "sticky", top: 0, zIndex: 10,
          }}>
            <Link
              href="/community?section=portfolios"
              style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "var(--text-muted)", textDecoration: "none" }}
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Community
            </Link>
            <span style={{ fontSize: "12px", color: "var(--border-subtle)" }}>/</span>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {portfolio.public_name}
            </span>
          </div>

          <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
            <div style={{ maxWidth: "760px" }}>

              {/* ── Header card ─────────────────────────────────────────────── */}
              <div style={{
                background: "var(--card-bg)", border: "1px solid var(--card-border)",
                borderRadius: "var(--radius-lg)", padding: "20px 20px 16px",
                marginBottom: "12px",
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", marginBottom: "12px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h1 style={{
                      fontFamily: "var(--font-display)", fontSize: "20px", fontWeight: 700,
                      color: "var(--text-primary)", letterSpacing: "-0.3px", marginBottom: "8px",
                    }}>
                      {portfolio.public_name}
                    </h1>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                      <span style={{
                        fontSize: "9px", fontWeight: 600, letterSpacing: "0.06em",
                        textTransform: "uppercase", padding: "2px 7px",
                        borderRadius: "var(--radius-full)",
                        background: "var(--surface-004)",
                        border: "1px solid var(--line-008)",
                        color: "var(--text-muted)",
                      }}>
                        % only
                      </span>
                      {portfolio.risk_level && (
                        <span style={{
                          fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em",
                          textTransform: "uppercase", padding: "2px 7px",
                          borderRadius: "var(--radius-full)",
                          background: rs.bg, border: `1px solid ${rs.border}`, color: rs.color,
                        }}>
                          {portfolio.risk_level}
                        </span>
                      )}
                      {portfolio.style && (
                        <span style={{
                          fontSize: "9px", color: "var(--text-tertiary)",
                          background: "transparent", border: "1px solid var(--card-border)",
                          padding: "2px 7px", borderRadius: "var(--radius-full)",
                        }}>
                          {portfolio.style}
                        </span>
                      )}
                    </div>
                  </div>

                  <PublicPortfolioActions
                    portfolioId={portfolio.id}
                    isOwn={isOwn}
                    isFollowing={isFollowing}
                    followerCount={portfolio.follower_count ?? 0}
                  />
                </div>

                {portfolio.public_description && (
                  <p style={{
                    fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6,
                    marginBottom: "14px",
                  }}>
                    {portfolio.public_description}
                  </p>
                )}

                {/* Owner + stats row */}
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: "12px", flexWrap: "wrap",
                  paddingTop: "12px", borderTop: "1px solid var(--border-subtle)",
                }}>
                  {owner ? (
                    <Link href={`/${owner.username}`} style={{ display: "flex", alignItems: "center", gap: "9px", textDecoration: "none" }}>
                      <div style={{
                        width: "32px", height: "32px", minWidth: "32px",
                        borderRadius: "50%", background: owner.avatar_color ?? "#2563eb",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "13px", fontWeight: 700, color: "#fff",
                      }}>
                        {((owner.display_name || owner.username)[0] ?? "?").toUpperCase()}
                      </div>
                      <div>
                        <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                          {owner.display_name || owner.username}
                        </p>
                        <p style={{ fontSize: "11px", color: "var(--text-muted)" }}>@{owner.username}</p>
                      </div>
                    </Link>
                  ) : (
                    <div />
                  )}
                  <div style={{ display: "flex", gap: "24px" }}>
                    <div style={{ textAlign: "center" }}>
                      <p style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                        {portfolio.follower_count ?? 0}
                      </p>
                      <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "1px" }}>followers</p>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <p style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                        {portfolio.copy_count ?? 0}
                      </p>
                      <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "1px" }}>copies</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Privacy notice ───────────────────────────────────────────── */}
              <div style={{
                background: "var(--surface-002)",
                border: "1px solid var(--line-006)",
                borderRadius: "var(--radius-md)",
                padding: "9px 14px",
                marginBottom: "12px",
                display: "flex", alignItems: "flex-start", gap: "9px",
              }}>
                <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--text-muted)", flexShrink: 0, marginTop: "1px" }}>
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                <p style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.55 }}>
                  Shows percentage allocation only. No share counts, prices, or account values are visible.
                  {portfolio.last_synced_at && (
                    <> Last updated {new Date(portfolio.last_synced_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}.</>
                  )}
                </p>
              </div>

              {/* ── Performance chart ────────────────────────────────────────── */}
              <div style={{ marginBottom: "12px" }}>
                {perfData.length >= 2 ? (
                  <PublicPortfolioPerfChart data={perfData} />
                ) : (
                  <div style={{
                    background: "var(--card-bg)", border: "1px solid var(--card-border)",
                    borderRadius: "var(--radius-lg)", padding: "28px",
                    textAlign: "center",
                  }}>
                    <p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>
                      Performance chart will appear once daily auto-updates begin.
                    </p>
                    <p style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                      Snapshots are recorded automatically each day.
                    </p>
                  </div>
                )}
              </div>

              {/* ── Allocation table ─────────────────────────────────────────── */}
              <div style={{
                background: "var(--card-bg)", border: "1px solid var(--card-border)",
                borderRadius: "var(--radius-lg)", padding: "18px",
              }}>
                <h2 style={{
                  fontFamily: "var(--font-display)", fontSize: "13px", fontWeight: 600,
                  color: "var(--text-primary)", marginBottom: "14px", letterSpacing: "-0.1px",
                }}>
                  Allocation
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
                  {nonCashHoldings.map((h, i) => (
                    <div key={h.ticker} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <div style={{
                        width: "10px", height: "10px", minWidth: "10px",
                        borderRadius: "3px",
                        background: ALLOC_COLORS[i % ALLOC_COLORS.length],
                      }} />
                      <Link
                        href={`/research?ticker=${encodeURIComponent(h.ticker)}`}
                        style={{
                          fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 600,
                          color: "var(--text-secondary)", minWidth: "46px", flexShrink: 0,
                          textDecoration: "none",
                        }}
                        title={`Research ${h.ticker}`}
                      >
                        {h.ticker}
                      </Link>
                      <div style={{
                        flex: "1 1 60px", height: "4px", borderRadius: "2px",
                        background: "var(--surface-005)", overflow: "hidden",
                      }}>
                        <div style={{
                          height: "100%",
                          width: `${Math.min(h.allocation_pct, 100)}%`,
                          background: ALLOC_COLORS[i % ALLOC_COLORS.length],
                          borderRadius: "2px",
                        }} />
                      </div>
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600,
                        color: "var(--text-primary)", minWidth: "46px", textAlign: "right", flexShrink: 0,
                      }}>
                        {h.allocation_pct.toFixed(1)}%
                      </span>
                    </div>
                  ))}

                  {cashHolding && (
                    <>
                      {nonCashHoldings.length > 0 && (
                        <div style={{ height: "1px", background: "var(--border-subtle)", margin: "2px 0" }} />
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{
                          width: "10px", height: "10px", minWidth: "10px",
                          borderRadius: "3px",
                          background: ALLOC_CASH_COLOR,
                          border: "1px solid var(--line-015)",
                        }} />
                        <span style={{
                          fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 600,
                          color: "var(--text-muted)", minWidth: "46px", flexShrink: 0,
                        }}>
                          Cash
                        </span>
                        <div style={{
                          flex: "1 1 60px", height: "4px", borderRadius: "2px",
                          background: "var(--surface-005)", overflow: "hidden",
                        }}>
                          <div style={{
                            height: "100%",
                            width: `${Math.min(cashHolding.allocation_pct, 100)}%`,
                            background: "rgba(255,255,255,0.25)",
                            borderRadius: "2px",
                          }} />
                        </div>
                        <span style={{
                          fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 600,
                          color: "var(--text-muted)", minWidth: "46px", textAlign: "right", flexShrink: 0,
                        }}>
                          {cashHolding.allocation_pct.toFixed(1)}%
                        </span>
                      </div>
                    </>
                  )}

                  {holdingRows.length === 0 && (
                    <p style={{ fontSize: "12px", color: "var(--text-muted)", textAlign: "center", padding: "16px 0" }}>
                      No allocation data available.
                    </p>
                  )}
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
