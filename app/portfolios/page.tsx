import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLinkedPortfolioIds } from "@/lib/connections/snaptrade";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import NewPortfolioForm from "./new-portfolio-form";
import PortfolioStatusButton from "./portfolio-status-button";

function formatAccountType(value: string | null) {
  if (!value) return "—";
  const map: Record<string, string> = {
    taxable: "Brokerage", brokerage: "Brokerage", retirement: "Retirement",
    speculative: "Margin", margin: "Margin", paper_trade: "Paper Trade",
    roth_ira: "Roth IRA", traditional_ira: "Traditional IRA",
  };
  return map[value] ?? value.replaceAll("_", " ");
}

function accountDotColor(value: string | null) {
  const t = (value || "").toLowerCase();
  if (["brokerage", "taxable"].includes(t)) return "#0ea5a0"; // teal
  if (["roth_ira", "traditional_ira", "retirement"].includes(t)) return "#16a34a"; // sage green
  if (["margin", "speculative"].includes(t)) return "#c8791e"; // sage amber
  if (["paper_trade", "paper trade"].includes(t)) return "#3fae4a";
  return "var(--text-muted)";
}

function accountPillClass(value: string | null) {
  const t = (value || "").toLowerCase();
  if (["brokerage", "taxable"].includes(t)) return "bt-pill bt-pill-brokerage";
  if (["roth_ira", "traditional_ira", "retirement"].includes(t)) return "bt-pill bt-pill-ira";
  if (["margin", "speculative"].includes(t)) return "bt-pill bt-pill-margin";
  if (["paper_trade", "paper trade"].includes(t)) return "bt-pill bt-pill-paper";
  return "bt-pill";
}

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function PortfoliosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: portfoliosData } = await supabase
    .from("portfolios").select("*").eq("user_id", user.id)
    .order("display_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  const portfolios = portfoliosData ?? [];
  const activePortfolios = portfolios.filter((p) => p.is_active);
  const archivedPortfolios = portfolios.filter((p) => !p.is_active);

  // Which portfolios mirror a connected brokerage (for the "Synced" badge).
  const linkedIds = await getLinkedPortfolioIds(user.id);

  // Get live valuations and position counts for each active portfolio — in parallel, so the
  // list page waits on the slowest single portfolio rather than the sum of all of them.
  const valuations: Record<string, number> = {};
  let totalPositions = 0;
  const valResults = await Promise.all(activePortfolios.map(async (p) => {
    const pCash = Number(p.cash_balance ?? 0);
    const { data: holdings } = await supabase
      .from("holdings").select("id, ticker, company_name, asset_type, shares, average_cost_basis, manual_price, manual_price_updated_at")
      .eq("portfolio_id", p.id);
    const positions = (holdings ?? []).filter((h) => Number(h.shares) > 0).length;
    try {
      const val = await getPortfolioValuation({
        holdings: (holdings ?? []).map((h) => ({
          id: h.id, ticker: h.ticker, company_name: h.company_name,
          asset_type: h.asset_type, shares: h.shares, average_cost_basis: h.average_cost_basis,
          manual_price: h.manual_price, manual_price_updated_at: h.manual_price_updated_at,
        })),
        cashBalance: pCash,
      });
      return { id: p.id, value: val.total_portfolio_value, positions };
    } catch {
      return { id: p.id, value: pCash, positions };
    }
  }));
  for (const r of valResults) {
    valuations[r.id] = r.value;
    totalPositions += r.positions;
  }

  const totalValue = Object.values(valuations).reduce((a, b) => a + b, 0);

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
      <div className="bt-glow" style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1, display: "flex", minHeight: "100vh" }}>
        <div className="hidden lg:flex">
          <Sidebar
            userEmail={user.email}
            totalValue={totalValue}
            portfolios={activePortfolios.map((p) => ({
              id: p.id, name: p.name,
              cash_balance: Number(p.cash_balance ?? 0),
              account_type: p.account_type,
            }))}
          />
        </div>
        <div className="bt-main-col" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <MobileNav />

          {/* Topbar */}
          <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-base)", position: "sticky", top: 0, zIndex: 10 }}>
            <div>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.2px" }}>
                Portfolios
              </h1>
              <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "1px" }}>
                {activePortfolios.length} active · {archivedPortfolios.length} archived
              </p>
            </div>
            <NewPortfolioForm />
          </div>

          <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

            {/* Summary stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "10px", marginBottom: "20px" }}>
              {[
                { label: "Total Value", value: formatMoney(totalValue) },
                { label: "Active Portfolios", value: String(activePortfolios.length) },
                { label: "Total Positions", value: String(totalPositions) },
              ].map((stat) => (
                <div key={stat.label} className="bt-card" style={{ padding: "14px 16px" }}>
                  <div className="label" style={{ marginBottom: "6px" }}>{stat.label}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "20px", fontWeight: 500, color: "var(--text-primary)", letterSpacing: "-0.4px" }}>
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Active portfolios — 2-column card grid (Sage) */}
            {activePortfolios.length > 0 && (
              <div style={{ marginBottom: "26px" }}>
                <div className="label" style={{ marginBottom: "10px" }}>Active</div>
                <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: "14px" }}>
                  {activePortfolios.map((portfolio) => (
                    <div key={portfolio.id} className="bt-card" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "10px" }}>
                      {/* header: dot + name + pills */}
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: accountDotColor(portfolio.account_type), flexShrink: 0, boxShadow: `0 0 6px ${accountDotColor(portfolio.account_type)}` }} />
                        <h2 style={{ fontSize: "14.5px", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>{portfolio.name}</h2>
                        <span className={accountPillClass(portfolio.account_type)}>{formatAccountType(portfolio.account_type)}</span>
                        <span style={{ fontSize: "10px", color: "var(--text-muted)", background: "var(--surface-005)", border: "1px solid var(--border-subtle)", padding: "2px 7px", borderRadius: "var(--radius-full)" }}>
                          {portfolio.benchmark_symbol || "SPY"}
                        </span>
                        <span style={{ fontSize: "10px", color: "var(--text-muted)", background: "var(--surface-005)", border: "1px solid var(--border-subtle)", padding: "2px 7px", borderRadius: "var(--radius-full)", textTransform: "capitalize" }}>
                          {portfolio.status}
                        </span>
                        {linkedIds.has(portfolio.id) && (
                          <span title="Synced from your connected brokerage" style={{ fontSize: "10px", fontWeight: 700, color: "var(--green)", background: "var(--green-bg)", border: "1px solid var(--green-border)", padding: "2px 7px", borderRadius: "var(--radius-full)" }}>
                            ✓ Synced
                          </span>
                        )}
                      </div>

                      {portfolio.description && (
                        <p style={{ fontSize: "12.5px", color: "var(--text-tertiary)", lineHeight: 1.5, margin: 0 }}>{portfolio.description}</p>
                      )}

                      <div style={{ display: "flex", gap: "16px", fontSize: "12px", color: "var(--text-tertiary)", flexWrap: "wrap" }}>
                        <span>Cash: <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{formatMoney(Number(portfolio.cash_balance ?? 0))}</span></span>
                        <span>Value: <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{formatMoney(valuations[portfolio.id])}</span></span>
                        <span>Created {new Date(portfolio.created_at).toLocaleDateString()}</span>
                      </div>

                      <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                        <PortfolioStatusButton portfolioId={portfolio.id} portfolioName={portfolio.name} mode="archive" />
                        <Link href={`/portfolios/${portfolio.id}`} className="bt-btn bt-btn-primary bt-btn-sm">Open →</Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Archived portfolios */}
            {archivedPortfolios.length > 0 && (
              <div>
                <div className="label" style={{ marginBottom: "10px" }}>Archived</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {archivedPortfolios.map((portfolio) => (
                    <div key={portfolio.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-md)", opacity: 0.6 }}>
                      <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--text-muted)", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)" }}>{portfolio.name}</p>
                        <p style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "1px" }}>
                          {formatAccountType(portfolio.account_type)} · Archived {new Date(portfolio.updated_at ?? portfolio.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <PortfolioStatusButton
                          portfolioId={portfolio.id}
                          portfolioName={portfolio.name}
                          mode="restore"
                        />
                        <Link href={`/portfolios/${portfolio.id}`} className="bt-btn bt-btn-ghost bt-btn-sm">View →</Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {activePortfolios.length === 0 && archivedPortfolios.length === 0 && (
              <div className="bt-card" style={{ padding: "48px", textAlign: "center" }}>
                <div style={{ width: "48px", height: "48px", background: "rgba(14,165,160,0.1)", border: "1px solid rgba(14,165,160,0.2)", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                  <svg width="22" height="22" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--brand-blue)" }}>
                    <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
                  </svg>
                </div>
                <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>No portfolios yet</h2>
                <p style={{ fontSize: "13px", color: "var(--text-tertiary)", marginBottom: "16px" }}>
                  Create your first portfolio to start tracking and analyzing your investments.
                </p>
                <NewPortfolioForm />
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
