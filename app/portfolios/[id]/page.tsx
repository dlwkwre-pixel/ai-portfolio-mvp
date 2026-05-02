import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import AddHoldingForm from "./add-holding-form";
import HoldingsTable from "./holdings-table";
import AddNoteForm from "./add-note-form";
import AddCashActivityForm from "./add-cash-activity-form";
import AssignStrategyForm from "./assign-strategy-form";
import UpgradeStrategyVersionButton from "./upgrade-strategy-version-button";
import AIRecommendationsSection from "./ai-recommendations-section";
import TransactionHistorySection from "./transaction-history-section";
import PortfolioPerformanceSection from "./portfolio-performance-section";
import PortfolioTabs from "./portfolio-tabs";
import EarningsAlertBanner from "./earnings-alert-banner";
import PortfolioChartSection from "./portfolio-chart-section";
import EditPortfolioForm from "./edit-portfolio-form";
import PortfolioHeader from "./portfolio-header";
import { PortfolioPrivacyProvider } from "./portfolio-privacy-context";

type PortfolioPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

function formatMoney(v: number | null | undefined) {
  if (v == null) return "—";
  return `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatAccountType(v: string | null) {
  if (!v) return "—";
  const map: Record<string, string> = {
    taxable: "Brokerage", brokerage: "Brokerage", retirement: "Retirement",
    speculative: "Margin", margin: "Margin", paper_trade: "Paper Trade",
    roth_ira: "Roth IRA", traditional_ira: "Traditional IRA",
  };
  return map[v] ?? v.replaceAll("_", " ");
}

function formatRiskLevel(v: string | null) {
  if (!v) return "No Risk Set";
  const map: Record<string, string> = {
    low: "Conservative", Low: "Conservative", moderate: "Moderate", Moderate: "Moderate",
    high: "Aggressive", High: "Aggressive", conservative: "Conservative", Conservative: "Conservative",
    aggressive: "Aggressive", Aggressive: "Aggressive",
  };
  return map[v] ?? v;
}

function accountDotColor(v: string | null) {
  const t = (v || "").toLowerCase();
  if (["brokerage","taxable"].includes(t)) return "#3b82f6";
  if (["roth_ira","traditional_ira","retirement"].includes(t)) return "#00d395";
  if (["margin","speculative"].includes(t)) return "#f59e0b";
  if (["paper_trade","paper trade"].includes(t)) return "#a78bfa";
  return "#64748b";
}

function accountPillStyle(v: string | null) {
  const t = (v || "").toLowerCase();
  if (["brokerage","taxable"].includes(t)) return "bt-pill bt-pill-brokerage";
  if (["roth_ira","traditional_ira","retirement"].includes(t)) return "bt-pill bt-pill-ira";
  if (["margin","speculative"].includes(t)) return "bt-pill bt-pill-margin";
  if (["paper_trade","paper trade"].includes(t)) return "bt-pill bt-pill-paper";
  return "bt-pill";
}

export default async function SinglePortfolioPage({ params, searchParams }: PortfolioPageProps) {
  const { id } = await params;
  const { tab } = await searchParams;
  const activeTab = tab || "overview";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios").select("*").eq("id", id).eq("user_id", user.id).single();
  if (portfolioError || !portfolio) notFound();

  const { data: holdings } = await supabase
    .from("holdings").select("*").eq("portfolio_id", portfolio.id).order("ticker", { ascending: true });

  const valuation = await getPortfolioValuation({
    holdings: (holdings ?? []).map((h) => ({
      id: h.id, ticker: h.ticker, company_name: h.company_name,
      asset_type: h.asset_type, shares: h.shares, average_cost_basis: h.average_cost_basis,
    })),
    cashBalance: Number(portfolio.cash_balance ?? 0),
  });

  const { data: notes } = await supabase
    .from("portfolio_notes").select("*").eq("portfolio_id", portfolio.id).order("created_at", { ascending: false });

  const { data: cashLedger } = await supabase
    .from("cash_ledger").select("*").eq("portfolio_id", portfolio.id).order("effective_at", { ascending: false }).limit(8);

  const { data: strategies } = await supabase
    .from("strategies").select("*").eq("user_id", user.id).eq("is_active", true).order("created_at", { ascending: false });

  const { data: activeAssignment } = await supabase
    .from("portfolio_strategy_assignments")
    .select(`*, strategies (id, name, description, style, risk_level), strategy_versions (id, version_number, prompt_text, max_position_pct, min_position_pct, turnover_preference, holding_period_bias, cash_min_pct, cash_max_pct)`)
    .eq("portfolio_id", portfolio.id).eq("is_active", true).is("ended_at", null)
    .order("assigned_at", { ascending: false }).limit(1).maybeSingle();

  const { data: allPortfolios } = await supabase
    .from("portfolios").select("id, name, cash_balance, account_type").eq("user_id", user.id).eq("is_active", true);

  let latestAvailableVersionNumber: number | null = null;
  if (activeAssignment?.strategy_id) {
    const { data: latestVersion } = await supabase
      .from("strategy_versions").select("id, version_number")
      .eq("strategy_id", activeAssignment.strategy_id)
      .order("version_number", { ascending: false }).limit(1).maybeSingle();
    latestAvailableVersionNumber = latestVersion?.version_number ?? null;
  }

  const currentVersionNumber = activeAssignment?.strategy_versions?.version_number ?? null;
  const shouldShowUpgradeButton =
    currentVersionNumber !== null &&
    latestAvailableVersionNumber !== null &&
    latestAvailableVersionNumber > currentVersionNumber;

  const tickers = (holdings ?? []).map((h) => h.ticker).filter(Boolean) as string[];

  const statCards = [
    { label: "Holdings Value", value: formatMoney(valuation.holdings_value), isMoney: true },
    { label: "Cash", value: formatMoney(Number(portfolio.cash_balance)), isMoney: true },
    { label: "Total Value", value: formatMoney(valuation.total_portfolio_value), isMoney: true, highlight: true },
    { label: "Positions", value: String(holdings?.length ?? 0), isMoney: false },
  ];

  const dot = accountDotColor(portfolio.account_type);

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
      <div className="bt-glow" style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />

      <div style={{ position: "relative", zIndex: 1, display: "flex", minHeight: "100vh" }}>
        {/* Sidebar */}
        <div className="hidden lg:flex">
          <Sidebar
            userEmail={user.email}
            totalValue={valuation.total_portfolio_value}
            portfolios={(allPortfolios ?? []).map((p) => ({
              id: p.id, name: p.name,
              cash_balance: Number(p.cash_balance ?? 0),
              account_type: p.account_type,
            }))}
            activePortfolioId={portfolio.id}
          />
        </div>

        {/* Main content wrapped in privacy provider */}
        <PortfolioPrivacyProvider>
          <div className="bt-main-col" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <MobileNav />

            {/* Topbar */}
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", background: "var(--bg-base)", position: "sticky", top: 0, zIndex: 10, backdropFilter: "blur(12px)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, flex: 1 }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: dot, boxShadow: `0 0 6px ${dot}`, flexShrink: 0 }} />
                <h1 style={{ fontFamily: "var(--font-display)", fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {portfolio.name}
                </h1>
                <span className={`${accountPillStyle(portfolio.account_type)} hidden sm:inline`}>{formatAccountType(portfolio.account_type)}</span>
                <span className="hidden sm:inline" style={{ fontSize: "10px", color: "var(--text-tertiary)", background: "var(--card-bg)", border: "1px solid var(--card-border)", padding: "2px 8px", borderRadius: "var(--radius-full)" }}>
                  {portfolio.benchmark_symbol || "SPY"}
                </span>
              </div>
              <div style={{ display: "flex", gap: "6px", alignItems: "center", flexShrink: 0 }}>
                <EditPortfolioForm portfolio={{ id: portfolio.id, name: portfolio.name, description: portfolio.description, benchmark_symbol: portfolio.benchmark_symbol, status: portfolio.status }} />
                <PortfolioHeader
                  portfolioId={portfolio.id}
                  portfolioName={portfolio.name}
                  portfolioDescription={portfolio.description}
                  accountTypeLabel={formatAccountType(portfolio.account_type)}
                  benchmarkSymbol={portfolio.benchmark_symbol || "SPY"}
                  status={portfolio.status}
                  createdAt={new Date(portfolio.created_at).toLocaleDateString()}
                  styleDot={dot}
                  styleBadge={accountPillStyle(portfolio.account_type)}
                  statCards={statCards}
                />
              </div>
            </div>

            {/* Stat cards — rendered below topbar, animated */}

            {/* Chart hero */}
            <div className="bt-page-header" style={{ padding: "16px 24px 0" }}>
              <PortfolioChartSection
                portfolioId={portfolio.id}
                benchmarkSymbol={portfolio.benchmark_symbol || "SPY"}
                cashBalance={Number(portfolio.cash_balance ?? 0)}
              />
            </div>

            {/* Earnings alerts */}
            {tickers.length > 0 && (
              <div className="bt-banner-enter bt-page-header" style={{ padding: "0 24px" }}>
                <EarningsAlertBanner tickers={tickers} />
              </div>
            )}

            {/* Tabs nav */}
            <div className="bt-page-header" style={{ borderBottom: "1px solid var(--border-subtle)", padding: "0 24px" }}>
              <PortfolioTabs activeTab={activeTab} portfolioId={portfolio.id} />
            </div>

            {/* Tab content */}
            <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

              {/* OVERVIEW */}
              {activeTab === "overview" && (
                <div className="bt-tab-enter portfolio-overview-grid" style={{ gap: "16px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div className="bt-card">
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                        <div>
                          <h2 style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)" }}>Holdings</h2>
                          <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>Current positions with live market valuation</p>
                        </div>
                        <AddHoldingForm portfolioId={portfolio.id} />
                      </div>
                      <HoldingsTable
                        portfolioId={portfolio.id}
                        holdings={valuation.valued_holdings.map((h) => ({
                          ...h,
                          notes: (holdings ?? []).find((raw) => raw.id === h.id)?.notes ?? null,
                        }))}
                      />
                    </div>
                    <PortfolioPerformanceSection portfolioId={portfolio.id} cashBalance={Number(portfolio.cash_balance ?? 0)} />
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {/* Strategy */}
                    <div className="bt-card">
                      <h2 style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "12px" }}>Assigned Strategy</h2>
                      <AssignStrategyForm portfolioId={portfolio.id} strategies={(strategies ?? []).map((s) => ({ id: s.id, name: s.name }))} />
                      {activeAssignment?.strategies ? (
                        <div style={{ marginTop: "12px", background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "12px 14px" }}>
                          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
                            <div>
                              <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>{activeAssignment.strategies.name}</p>
                              <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>{activeAssignment.strategies.style || "Custom"}</p>
                            </div>
                            <span style={{ fontSize: "10px", background: "var(--card-bg)", border: "1px solid var(--card-border)", color: "var(--text-secondary)", padding: "2px 8px", borderRadius: "var(--radius-full)" }}>
                              {formatRiskLevel(activeAssignment.strategies.risk_level)}
                            </span>
                          </div>
                          {activeAssignment.strategies.description && (
                            <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "8px", lineHeight: 1.6 }}>{activeAssignment.strategies.description}</p>
                          )}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", marginTop: "10px" }}>
                            {[
                              ["Version", `v${activeAssignment.strategy_versions?.version_number ?? "—"}`],
                              ["Max Pos", `${activeAssignment.strategy_versions?.max_position_pct ?? "—"}%`],
                              ["Turnover", activeAssignment.strategy_versions?.turnover_preference ?? "—"],
                              ["Holding", activeAssignment.strategy_versions?.holding_period_bias ?? "—"],
                            ].map(([label, value]) => (
                              <div key={label} style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                                <span style={{ color: "var(--text-muted)" }}>{label}: </span><span>{value}</span>
                              </div>
                            ))}
                          </div>
                          {shouldShowUpgradeButton && currentVersionNumber !== null && latestAvailableVersionNumber !== null && (
                            <div style={{ marginTop: "10px" }}>
                              <UpgradeStrategyVersionButton portfolioId={portfolio.id} currentVersionNumber={currentVersionNumber} latestVersionNumber={latestAvailableVersionNumber} />
                            </div>
                          )}
                        </div>
                      ) : (
                        <p style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "10px" }}>No strategy assigned yet.</p>
                      )}
                    </div>

                    {/* Cash Activity */}
                    <div className="bt-card">
                      <h2 style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "12px" }}>Cash Activity</h2>
                      <AddCashActivityForm portfolioId={portfolio.id} currentCashBalance={Number(portfolio.cash_balance ?? 0)} />
                      {cashLedger && cashLedger.length > 0 && (
                        <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "4px" }}>
                          {cashLedger.map((entry) => (
                            <div key={entry.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
                              <div>
                                <p style={{ fontSize: "12px", color: "var(--text-primary)", textTransform: "capitalize" }}>{entry.reason.replaceAll("_", " ")}</p>
                                <p style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "1px" }}>{new Date(entry.effective_at).toLocaleString()}</p>
                              </div>
                              <p style={{ fontSize: "12px", fontFamily: "var(--font-mono)", fontWeight: 500, color: entry.direction === "IN" ? "var(--green)" : "var(--red)" }}>
                                {entry.direction === "IN" ? "+" : "-"}{formatMoney(Number(entry.amount))}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Portfolio Info */}
                    <div className="bt-card">
                      <h2 style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "12px" }}>Portfolio Info</h2>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        {[
                          ["Status", portfolio.status],
                          ["Currency", portfolio.base_currency],
                          ["Benchmark", portfolio.benchmark_symbol || "SPY"],
                          ["Created", new Date(portfolio.created_at).toLocaleDateString()],
                        ].map(([label, value]) => (
                          <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
                            <span className="label">{label}</span>
                            <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-primary)", textTransform: "capitalize" }}>{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* AI ANALYSIS */}
              {activeTab === "ai" && (
                <div className="bt-tab-enter" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div style={{ background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.12)", borderRadius: "var(--radius-lg)", padding: "20px 24px" }}>
                    <h2 style={{ fontFamily: "var(--font-display)", fontSize: "18px", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.2px", marginBottom: "6px" }}>
                      AI Portfolio Analysis
                    </h2>
                    <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                      Grok searches live prices, recent news, and X sentiment for each holding before recommending. Gemini Flash cross-checks with a portfolio health score.
                    </p>
                    {activeAssignment?.strategies && (
                      <p style={{ fontSize: "11px", color: "var(--brand-blue)", marginTop: "6px" }}>
                        Strategy: <strong>{activeAssignment.strategies.name}</strong>{" · "}{formatRiskLevel(activeAssignment.strategies.risk_level)}
                      </p>
                    )}
                  </div>
                  <AIRecommendationsSection portfolioId={portfolio.id} />
                </div>
              )}

              {/* TRANSACTIONS */}
              {activeTab === "transactions" && (
                <div className="bt-tab-enter" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div className="bt-card">
                    <h2 style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "4px" }}>Transaction Ledger</h2>
                    <p style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>All trades and cash events. Executing an AI recommendation auto-creates a draft transaction here.</p>
                  </div>
                  <TransactionHistorySection portfolioId={portfolio.id} />
                </div>
              )}

              {/* NOTES */}
              {activeTab === "notes" && (
                <div className="bt-tab-enter portfolio-notes-grid" style={{ gap: "16px" }}>
                  <div className="bt-card">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                      <h2 style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)" }}>Portfolio Notes</h2>
                      <AddNoteForm portfolioId={portfolio.id} />
                    </div>
                    {notes && notes.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        {notes.map((note) => (
                          <div key={note.id} style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "12px 14px" }}>
                            <p style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>{note.title}</p>
                            <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "6px", lineHeight: 1.6 }}>{note.content || "—"}</p>
                            <p style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "8px" }}>{new Date(note.created_at).toLocaleDateString()}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>No notes yet.</p>
                    )}
                  </div>
                  <div className="bt-card">
                    <h2 style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "12px" }}>Portfolio Info</h2>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      {[
                        ["Status", portfolio.status],
                        ["Account Type", formatAccountType(portfolio.account_type)],
                        ["Currency", portfolio.base_currency],
                        ["Benchmark", portfolio.benchmark_symbol || "SPY"],
                        ["Created", new Date(portfolio.created_at).toLocaleDateString()],
                      ].map(([label, value]) => (
                        <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)" }}>
                          <span className="label">{label}</span>
                          <span style={{ fontSize: "12px", fontWeight: 500, color: "var(--text-primary)", textTransform: "capitalize" }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        </PortfolioPrivacyProvider>

      </div>
    </main>
  );
}
