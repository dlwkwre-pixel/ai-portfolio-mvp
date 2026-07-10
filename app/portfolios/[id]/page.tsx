import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import AddHoldingForm from "./add-holding-form";
import ImportHoldingsCSV from "./import-holdings-csv";
import PortfolioPulse from "./portfolio-pulse";
import ReconcileChip from "./reconcile-chip";
import { isPortfolioLinked, getBrokerageStatus } from "@/lib/connections/snaptrade";
import LinkedChartStart from "./linked-chart-start";
import AutoResync from "./auto-resync";
import HoldingsTable from "./holdings-table";
import AddNoteForm from "./add-note-form";
import AddCashActivityForm from "./add-cash-activity-form";
import EditCashBalanceButton from "./edit-cash-balance-button";
import AssignStrategyForm from "./assign-strategy-form";
import UpgradeStrategyVersionButton from "./upgrade-strategy-version-button";
import AIRecommendationsSection from "./ai-recommendations-section";
import AIScorecardCard from "./ai-scorecard-card";
import JournalTab from "./journal-tab";
import AnalyticsTab from "./analytics-tab";
import IncomeTab from "./income-tab";
import type { JournalEntry } from "./journal-actions";
import { getFinnhubQuote } from "@/lib/market-data/finnhub";
import TransactionHistorySection from "./transaction-history-section";
import PortfolioPerformanceSection from "./portfolio-performance-section";
import PortfolioTabs from "./portfolio-tabs";
import EarningsAlertBanner from "./earnings-alert-banner";
import PortfolioChartSection from "./portfolio-chart-section";
import EditPortfolioForm from "./edit-portfolio-form";
import PortfolioHeader, { PortfolioStatCards } from "./portfolio-header";
import { PortfolioPrivacyProvider } from "./portfolio-privacy-context";
import PortfolioShareSection from "./portfolio-share-section";
import AuditPortfolioModal from "./audit-portfolio-modal";
import ExportReportButton from "./export-report-button";
import EarningsCalendarSection from "./earnings-calendar-section";
import { CashActivityList } from "./cash-activity-list";
import RebalancingCalculator from "./rebalancing-calculator";
import StressTestSection from "./stress-test-section";
import RecommendationOutcomesSection from "./recommendation-outcomes-section";
import MarketRegimeCard from "@/app/components/market-regime-card";
import EmailDigestSettings from "./email-digest-settings";
import { getDigestPrefs } from "./email-digest-actions";
import FinnInsightCard from "@/app/components/finn-insight-card";
import { detectFinnInsights } from "@/lib/portfolio/insights";


type PortfolioPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; account?: string }>;
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

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
  const { tab, account } = await searchParams;
  const activeTab = tab || "overview";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: portfolio, error: portfolioError } = await supabase
    .from("portfolios").select("*").eq("id", id).eq("user_id", user.id).single();
  if (portfolioError || !portfolio) {
    if (account) {
      const hint = decodeURIComponent(account);
      return (
        <main style={{ minHeight: "100vh", background: "#07090f", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: "'DM Sans', sans-serif" }}>
          <div style={{ maxWidth: "400px", width: "100%", textAlign: "center" }}>
            <div style={{ width: "52px", height: "52px", borderRadius: "14px", background: "rgba(37,99,235,0.1)", border: "1px solid rgba(37,99,235,0.25)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: "22px", fontWeight: 700, color: "#fff", marginBottom: "10px" }}>Wrong account</h1>
            <p style={{ fontSize: "14px", color: "#64748b", lineHeight: 1.65, marginBottom: "6px" }}>
              This portfolio link is for <strong style={{ color: "#94a3b8" }}>{hint}</strong>.
            </p>
            <p style={{ fontSize: "13px", color: "#475569", lineHeight: 1.6, marginBottom: "28px" }}>
              You&apos;re signed in as a different account. Sign out and sign back in as <strong style={{ color: "#94a3b8" }}>{hint}</strong> to view this portfolio.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <a href="/login" style={{ display: "block", padding: "12px", background: "linear-gradient(135deg,#2563eb,#7c3aed)", borderRadius: "10px", color: "#fff", textDecoration: "none", fontSize: "14px", fontWeight: 600 }}>
                Switch accounts
              </a>
              <a href="/portfolios" style={{ display: "block", padding: "12px", background: "var(--surface-004)", border: "1px solid var(--line-008)", borderRadius: "10px", color: "#94a3b8", textDecoration: "none", fontSize: "14px", fontWeight: 500 }}>
                Go to my portfolios
              </a>
            </div>
          </div>
        </main>
      );
    }
    notFound();
  }

  // Run all independent queries in parallel — previously sequential, each 100-200ms
  const [
    { data: holdings },
    { data: notes },
    { data: cashLedger },
    { data: strategies },
    { data: activeAssignment },
    { data: allPortfolios },
    { data: publicPortfolioData, error: pubPortfolioErr },
    digestPrefs,
  ] = await Promise.all([
    supabase.from("holdings").select("*").eq("portfolio_id", portfolio.id).order("ticker", { ascending: true }),
    supabase.from("portfolio_notes").select("*").eq("portfolio_id", portfolio.id).order("created_at", { ascending: false }),
    supabase.from("cash_ledger").select("*").eq("portfolio_id", portfolio.id).not("reason", "ilike", "%(Reconstructed)").order("effective_at", { ascending: false }).limit(8),
    supabase.from("strategies").select("*").eq("user_id", user.id).eq("is_active", true).order("created_at", { ascending: false }),
    supabase.from("portfolio_strategy_assignments")
      .select(`*, strategies (id, name, description, style, risk_level), strategy_versions (id, version_number, prompt_text, max_position_pct, min_position_pct, turnover_preference, holding_period_bias, cash_min_pct, cash_max_pct)`)
      .eq("portfolio_id", portfolio.id).eq("is_active", true).is("ended_at", null)
      .order("assigned_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("portfolios").select("id, name, cash_balance, account_type").eq("user_id", user.id).eq("is_active", true),
    supabase.from("public_portfolios")
      .select("id, public_name, public_description, follower_count, copy_count, last_synced_at")
      .eq("source_portfolio_id", portfolio.id).eq("owner_user_id", user.id).eq("is_public", true)
      .maybeSingle(),
    activeTab === "emails" ? getDigestPrefs(portfolio.id) : Promise.resolve(null),
  ]);

  // Archive query is optional — fails gracefully if table hasn't been created yet
  const { data: cashLedgerArchive } = await supabase
    .from("cash_ledger_archive").select("*").eq("portfolio_id", portfolio.id)
    .order("deleted_at", { ascending: false }).limit(20)
    .then((r) => r, () => ({ data: null, error: null }));

  // Optional — fails gracefully if holding_lots table hasn't been created yet
  const { data: holdingLots } = await supabase
    .from("holding_lots").select("*").eq("portfolio_id", portfolio.id)
    .order("purchased_at", { ascending: true })
    .then((r) => r, () => ({ data: null, error: null }));

  // Decision Journal — lazily fetched only when the Journal tab is open. Current quotes power
  // the outcome scoring (price move since each decision). Graceful if the table doesn't exist yet.
  let journalEntries: JournalEntry[] = [];
  const journalQuotes: Record<string, number> = {};
  if (activeTab === "journal" || activeTab === "notes") {
    const { data: jrows } = await supabase
      .from("decision_journal")
      .select("*")
      .eq("user_id", user.id).eq("portfolio_id", portfolio.id)
      .order("created_at", { ascending: false }).limit(100)
      .then((r) => r, () => ({ data: null }));
    journalEntries = (jrows ?? []) as JournalEntry[];
    const tickers = [...new Set(journalEntries.map((e) => e.ticker))].slice(0, 40);
    const quoteResults = await Promise.all(tickers.map(async (t) => {
      try { const q = await getFinnhubQuote(t); return [t, q && q.c > 0 ? q.c : 0] as const; } catch { return [t, 0] as const; }
    }));
    for (const [t, c] of quoteResults) if (c > 0) journalQuotes[t] = c;
  }

  if (pubPortfolioErr) console.error("[portfolio page] public_portfolios query error:", pubPortfolioErr.message);

  // Valuation (Finnhub) + latest strategy version run after parallel queries complete
  const [valuation, latestVersionResult] = await Promise.all([
    getPortfolioValuation({
      holdings: (holdings ?? []).map((h) => ({
        id: h.id, ticker: h.ticker, company_name: h.company_name,
        asset_type: h.asset_type, shares: h.shares, average_cost_basis: h.average_cost_basis,
        manual_price: h.manual_price, manual_price_updated_at: h.manual_price_updated_at,
      })),
      cashBalance: Number(portfolio.cash_balance ?? 0),
    }),
    activeAssignment?.strategy_id
      ? supabase.from("strategy_versions").select("id, version_number")
          .eq("strategy_id", activeAssignment.strategy_id)
          .order("version_number", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const latestAvailableVersionNumber = latestVersionResult.data?.version_number ?? null;
  const currentVersionNumber = activeAssignment?.strategy_versions?.version_number ?? null;
  const shouldShowUpgradeButton =
    currentVersionNumber !== null &&
    latestAvailableVersionNumber !== null &&
    latestAvailableVersionNumber > currentVersionNumber;

  const tickers = (holdings ?? []).map((h) => h.ticker).filter(Boolean) as string[];

  // Linked (brokerage-mirrored) portfolios are read-only: sync is the source of truth.
  const isLinkedPortfolio = await isPortfolioLinked(portfolio.id);
  const brokerageLastSyncedAt = isLinkedPortfolio ? (await getBrokerageStatus(user.id)).lastSyncedAt : null;

  const totalValue = valuation.total_portfolio_value;
  const cashBalance = Number(portfolio.cash_balance ?? 0);
  const cashPct = totalValue > 0 ? (cashBalance / totalValue) * 100 : 0;
  const finnInsights = detectFinnInsights({
    holdings: valuation.valued_holdings.map((h) => ({
      ticker: h.ticker,
      weight_pct: totalValue > 0 ? ((h.market_value ?? 0) / totalValue) * 100 : 0,
      sector: null,
    })),
    cashPct,
    hasStrategy: !!activeAssignment?.strategies,
    totalValue,
  });

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
                <div className="hidden sm:block">
                  <ExportReportButton portfolioId={portfolio.id} />
                </div>
                <AuditPortfolioModal
                  portfolioId={portfolio.id}
                  currentHoldings={(holdings ?? []).map((h) => ({
                    ticker: h.ticker,
                    shares: Number(h.shares),
                    company_name: h.company_name ?? null,
                  }))}
                />
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

            {/* Stat cards — full-width section below topbar, never inside the topbar flex row */}
            <PortfolioStatCards
              statCards={statCards}
              editCash={{ portfolioId: portfolio.id, cashBalance: Number(portfolio.cash_balance ?? 0) }}
            />

            {/* Reconciliation metadata — shown only after first audit */}
            {portfolio.last_reconciled_at && (
              <div style={{ padding: "6px 24px 0" }}>
                <p style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-body)" }}>
                  Portfolio synced {relativeTime(portfolio.last_reconciled_at)}
                  {portfolio.last_audit_source ? ` · ${portfolio.last_audit_source}` : ""}
                </p>
              </div>
            )}

            {/* Chart hero */}
            <div className="bt-page-header" style={{ padding: "16px 24px 0" }}>
              <PortfolioChartSection
                portfolioId={portfolio.id}
                benchmarkSymbol={portfolio.benchmark_symbol || "SPY"}
                cashBalance={Number(portfolio.cash_balance ?? 0)}
                totalPortfolioValue={valuation.total_portfolio_value}
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
                <div className="bt-tab-enter" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <PortfolioPulse portfolioId={portfolio.id} />
                  {finnInsights.length > 0 && (
                    <FinnInsightCard insights={finnInsights} portfolioId={portfolio.id} />
                  )}
                <div className="portfolio-overview-grid" style={{ gap: "16px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div className="bt-card">
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                        <div>
                          <h2 style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)" }}>Holdings</h2>
                          <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>Current positions with live market valuation</p>
                        </div>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          {isLinkedPortfolio ? (
                            <>
                              <span title="Holdings and cash sync from your connected brokerage" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: 600, color: "#00d395", background: "rgba(0,211,149,0.1)", border: "1px solid rgba(0,211,149,0.3)", borderRadius: "999px", padding: "5px 11px" }}>
                                🔗 Synced from your brokerage
                              </span>
                              <AutoResync lastSyncedAt={brokerageLastSyncedAt} />
                            </>
                          ) : (
                            <>
                              <ImportHoldingsCSV portfolioId={portfolio.id} />
                              <AddHoldingForm portfolioId={portfolio.id} />
                            </>
                          )}
                        </div>
                      </div>
                      {!isLinkedPortfolio && (holdings?.length ?? 0) > 0 && (
                        <div style={{ marginBottom: "10px" }}>
                          <ReconcileChip
                            portfolioId={portfolio.id}
                            verifiedAt={(portfolio as { holdings_verified_at?: string | null }).holdings_verified_at ?? null}
                          />
                        </div>
                      )}
                      {isLinkedPortfolio && (
                        <div style={{ marginBottom: "10px", fontSize: "11px", color: "var(--text-tertiary)", padding: "8px 11px", borderRadius: "var(--radius-sm)", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", lineHeight: 1.5 }}>
                          This portfolio mirrors your brokerage. Holdings, cash, and chart history sync from the broker, manual edits are off. Manage positions at your broker, then re-import from <a href="/connections" style={{ color: "var(--accent, #818cf8)", textDecoration: "none" }}>Connections</a>.
                          <LinkedChartStart portfolioId={portfolio.id} startDate={(portfolio as { chart_start_date?: string | null }).chart_start_date ?? null} />
                        </div>
                      )}
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px", padding: "6px 10px", borderRadius: "var(--radius-sm)", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
                        <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor" style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                        </svg>
                        <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>Prices update during US trading hours (Mon–Fri 9:30am–4pm ET). Values may be delayed outside market hours.</span>
                      </div>
                      <HoldingsTable
                        portfolioId={portfolio.id}
                        holdings={valuation.valued_holdings.map((h) => ({
                          ...h,
                          notes: (holdings ?? []).find((raw) => raw.id === h.id)?.notes ?? null,
                          opened_at: (holdings ?? []).find((raw) => raw.id === h.id)?.opened_at ?? null,
                        }))}
                        lots={holdingLots ?? []}
                      />
                    </div>
                    <PortfolioPerformanceSection portfolioId={portfolio.id} cashBalance={Number(portfolio.cash_balance ?? 0)} />
                    <RebalancingCalculator
                      valuedHoldings={valuation.valued_holdings}
                      totalValue={valuation.total_portfolio_value}
                      cashBalance={Number(portfolio.cash_balance ?? 0)}
                      strategyConstraints={activeAssignment?.strategy_versions ? {
                        max_position_pct: activeAssignment.strategy_versions.max_position_pct ?? null,
                        min_position_pct: activeAssignment.strategy_versions.min_position_pct ?? null,
                        cash_min_pct: activeAssignment.strategy_versions.cash_min_pct ?? null,
                        cash_max_pct: activeAssignment.strategy_versions.cash_max_pct ?? null,
                      } : null}
                      strategyName={activeAssignment?.strategies?.name ?? null}
                      lots={(holdingLots ?? []) as { ticker: string; lot_type: "BUY" | "SELL" | "DRIP"; purchased_at: string; shares: number; price_per_share: number }[]}
                      accountType={portfolio.account_type ?? null}
                    />
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {/* AI Scorecard — how the AI's recommendations have played out */}
                    <AIScorecardCard portfolioId={portfolio.id} />

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
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
                        <AddCashActivityForm portfolioId={portfolio.id} currentCashBalance={Number(portfolio.cash_balance ?? 0)} />
                        <EditCashBalanceButton portfolioId={portfolio.id} currentCashBalance={Number(portfolio.cash_balance ?? 0)} />
                      </div>
                      <CashActivityList
                        entries={cashLedger ?? []}
                        archivedEntries={cashLedgerArchive ?? []}
                        portfolioId={portfolio.id}
                      />
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

                    {/* Upcoming Earnings */}
                    {tickers.length > 0 && (
                      <EarningsCalendarSection tickers={tickers} />
                    )}

                    {/* Community sharing */}
                    <PortfolioShareSection
                      portfolioId={portfolio.id}
                      publicPortfolio={publicPortfolioData ? {
                        id: publicPortfolioData.id,
                        public_name: publicPortfolioData.public_name,
                        public_description: publicPortfolioData.public_description ?? null,
                        follower_count: publicPortfolioData.follower_count ?? 0,
                        copy_count: publicPortfolioData.copy_count ?? 0,
                        last_synced_at: publicPortfolioData.last_synced_at ?? null,
                      } : null}
                    />
                  </div>
                </div>
                </div>
              )}

              {/* AI ANALYSIS */}
              {activeTab === "ai" && (
                <div className="bt-tab-enter" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <MarketRegimeCard compact />
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
                  <AIRecommendationsSection portfolioId={portfolio.id} isLinked={isLinkedPortfolio} />
                  <RecommendationOutcomesSection portfolioId={portfolio.id} />
                  <StressTestSection
                    holdings={valuation.valued_holdings
                      .filter((h) => h.market_value !== null)
                      .map((h) => ({
                        ticker: h.ticker,
                        company_name: h.company_name,
                        market_value: h.market_value!,
                        weight_pct: h.weight_pct ?? 0,
                      }))}
                    totalValue={valuation.total_portfolio_value}
                    cashBalance={Number(portfolio.cash_balance ?? 0)}
                  />
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

              {/* ANALYTICS */}
              {activeTab === "analytics" && (
                <div className="bt-tab-enter" style={{ gap: "16px" }}>
                  <AnalyticsTab portfolioId={portfolio.id} />
                </div>
              )}

              {/* INCOME */}
              {activeTab === "income" && (
                <div className="bt-tab-enter" style={{ gap: "16px" }}>
                  <IncomeTab portfolioId={portfolio.id} />
                </div>
              )}

              {/* JOURNAL (Notes merged in) */}
              {(activeTab === "journal" || activeTab === "notes") && (
                <div className="bt-tab-enter" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <JournalTab entries={journalEntries} quotes={journalQuotes} portfolioId={portfolio.id} />
                  <div className="portfolio-notes-grid" style={{ gap: "16px" }}>
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
                </div>
              )}

              {/* EMAILS */}
              {activeTab === "emails" && (
                <div className="bt-tab-enter" style={{ gap: "16px" }}>
                  <div className="bt-card">
                    <h2 style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "4px" }}>Email Digest</h2>
                    <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "20px" }}>
                      Get this portfolio delivered to your inbox. Choose your schedule and what to include.
                    </p>
                    <EmailDigestSettings
                      portfolioId={portfolio.id}
                      userEmail={user.email ?? ""}
                      initialPrefs={digestPrefs}
                    />
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
