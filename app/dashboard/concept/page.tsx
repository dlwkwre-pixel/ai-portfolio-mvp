import { redirect } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";
import { calculateTwr } from "@/lib/portfolio/twr";
import { sanitizeSnapshots } from "@/lib/portfolio/benchmark";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import DashboardClient from "../dashboard-client";
import DcaCard from "../dca-card";
import MarketRegimeCard from "@/app/components/market-regime-card";
import RegimeShiftAlert from "@/app/components/regime-shift-alert";
import CombinedChart from "../combined-chart";
import MacroStrip from "../macro-strip";
import AiOutcomeCard from "../ai-outcome-card";
import PricingSurveyCard from "@/app/components/pricing-survey-card";

// Design-concept preview: the Sage handoff's "one focal metric + one
// recommendation card above the fold" dashboard hierarchy, built with real
// data. Self-contained, admin-only, does not touch /dashboard — for
// side-by-side comparison only. Delete once a decision is made.

function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `$${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function formatAccountType(value: string | null) {
  const map: Record<string, string> = {
    taxable: "Brokerage", brokerage: "Brokerage", retirement: "Retirement",
    speculative: "Margin", margin: "Margin", paper_trade: "Paper Trade",
    roth_ira: "Roth IRA", traditional_ira: "Traditional IRA",
  };
  return map[value ?? ""] ?? (value?.replaceAll("_", " ") ?? "—");
}
function accountDotColor(value: string | null) {
  const t = (value || "").toLowerCase();
  if (["brokerage", "taxable"].includes(t)) return "#0ea5a0";
  if (["roth_ira", "traditional_ira", "retirement"].includes(t)) return "#00d395";
  if (["margin", "speculative"].includes(t)) return "#f59e0b";
  if (["paper_trade", "paper trade"].includes(t)) return "#6fd08a";
  return "#64748b";
}
function truncateText(value: string | null | undefined, max = 120) {
  if (!value) return "";
  return value.length <= max ? value : value.slice(0, max - 3) + "...";
}
function actionBadgeClass(action: string | null) {
  const a = (action || "").toLowerCase();
  if (a === "buy" || a === "add") return "bt-badge bt-badge-buy";
  if (a === "sell") return "bt-badge bt-badge-sell";
  if (a === "trim") return "bt-badge bt-badge-trim";
  return "bt-badge bt-badge-hold";
}
function actionAccent(action: string | null) {
  const a = (action || "").toLowerCase();
  if (a === "buy" || a === "add") return { bg: "rgba(63,174,74,0.08)", border: "rgba(63,174,74,0.25)", chipBg: "rgba(63,174,74,0.18)", chipText: "#1f7a2e" };
  if (a === "sell" || a === "trim") return { bg: "rgba(200,121,30,0.08)", border: "rgba(200,121,30,0.25)", chipBg: "rgba(200,121,30,0.18)", chipText: "#8a5414" };
  return { bg: "rgba(20,30,20,0.04)", border: "var(--card-border)", chipBg: "rgba(20,30,20,0.08)", chipText: "var(--text-secondary)" };
}

export default async function DashboardConceptPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/concept");

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || user.email !== adminEmail) redirect("/dashboard");

  const { data: portfolios } = await supabase
    .from("portfolios")
    .select("id, name, is_active, cash_balance, benchmark_symbol, created_at, status, account_type, display_order, broker_return_pct")
    .eq("user_id", user.id)
    .order("display_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  const [{ count: strategiesCount }, { data: userStrategies }] = await Promise.all([
    supabase.from("strategies").select("*", { count: "exact", head: true })
      .eq("user_id", user.id).eq("is_active", true),
    supabase.from("strategies")
      .select("id, name, description, style, risk_level")
      .eq("user_id", user.id).eq("is_active", true)
      .order("created_at", { ascending: false }),
  ]);

  const activePortfolios = (portfolios ?? []).filter((p) => p.is_active);
  const archivedPortfolios = (portfolios ?? []).filter((p) => !p.is_active);
  const portfolioIds = activePortfolios.map((p) => p.id);

  let totalValue = 0;
  let totalDayChange = 0;
  let totalCash = 0;
  const portfolioValues: Record<string, number> = {};
  const portfolioCash: Record<string, number> = {};
  const combinedHoldings = new Map<string, { ticker: string; company_name: string | null; market_value: number }>();

  const { data: allHoldingsRows } = await supabase
    .from("holdings").select("id, portfolio_id, ticker, company_name, asset_type, shares, average_cost_basis, manual_price, manual_price_updated_at")
    .in("portfolio_id", portfolioIds);
  type HoldingRow = NonNullable<typeof allHoldingsRows>[number];
  const holdingsByPortfolio = new Map<string, HoldingRow[]>();
  for (const h of allHoldingsRows ?? []) {
    const arr = holdingsByPortfolio.get(h.portfolio_id) ?? [];
    arr.push(h);
    holdingsByPortfolio.set(h.portfolio_id, arr);
  }

  const perPortfolio = await Promise.all(activePortfolios.map(async (p) => {
    const pCash = Number(p.cash_balance ?? 0);
    const holdings = holdingsByPortfolio.get(p.id) ?? [];
    try {
      const val = await getPortfolioValuation({
        holdings: holdings.map((h) => ({
          id: h.id, ticker: h.ticker, company_name: h.company_name,
          asset_type: h.asset_type, shares: h.shares, average_cost_basis: h.average_cost_basis,
          manual_price: h.manual_price, manual_price_updated_at: h.manual_price_updated_at,
        })),
        cashBalance: pCash,
      });
      return { id: p.id, cash: pCash, value: val.total_portfolio_value, valued: val.valued_holdings };
    } catch {
      return { id: p.id, cash: pCash, value: pCash, valued: null };
    }
  }));

  for (const r of perPortfolio) {
    portfolioCash[r.id] = r.cash;
    totalCash += r.cash;
    portfolioValues[r.id] = r.value;
    totalValue += r.value;
    for (const h of r.valued ?? []) {
      if (h.day_change !== null) totalDayChange += h.day_change * h.shares_number;
      if ((h.shares_number ?? 0) > 0 && (h.market_value ?? 0) > 0) {
        const prev = combinedHoldings.get(h.ticker);
        combinedHoldings.set(h.ticker, {
          ticker: h.ticker,
          company_name: h.company_name ?? prev?.company_name ?? null,
          market_value: (prev?.market_value ?? 0) + (h.market_value ?? 0),
        });
      }
    }
  }

  const stressHoldings = [...combinedHoldings.values()]
    .map((h) => ({ ...h, weight_pct: totalValue > 0 ? (h.market_value / totalValue) * 100 : 0 }))
    .sort((a, b) => b.market_value - a.market_value);

  // ── Focal metric: per-portfolio net (deposit-neutral) return, blended by current value.
  // Mirrors the digest-email logic: prefer broker_return_pct for linked accounts, else
  // Modified-Dietz-style TWR from snapshots + cash_ledger.
  const returnByPortfolio = await Promise.all(activePortfolios.map(async (p) => {
    if (p.broker_return_pct != null && Number.isFinite(Number(p.broker_return_pct))) {
      return { id: p.id, pct: Number(p.broker_return_pct) };
    }
    const holdings = holdingsByPortfolio.get(p.id) ?? [];
    const totalCostBasis = holdings.reduce((s, h) => s + Number(h.shares ?? 0) * Number(h.average_cost_basis ?? 0), 0);
    const [{ data: snapsRaw }, { data: flowsRaw }] = await Promise.all([
      supabase.from("portfolio_snapshots").select("total_value, snapshot_date").eq("portfolio_id", p.id).order("snapshot_date", { ascending: true }).limit(1000),
      supabase.from("cash_ledger").select("amount, direction, effective_at").eq("portfolio_id", p.id),
    ]);
    const rawSnaps = (snapsRaw ?? [])
      .map((s) => ({ snapshot_date: s.snapshot_date as string, total_value: Number(s.total_value) }))
      .filter((s) => Number.isFinite(s.total_value) && s.total_value > 0);
    const snaps = sanitizeSnapshots(rawSnaps, totalCostBasis);
    const cashFlows = (flowsRaw ?? []).map((f) => ({
      effective_at: f.effective_at as string,
      direction: (f.direction as string | null) ?? "IN",
      amount: Number(f.amount ?? 0),
    }));
    return { id: p.id, pct: calculateTwr(snaps, cashFlows) };
  }));
  const validReturns = returnByPortfolio.filter((r) => r.pct != null && (portfolioValues[r.id] ?? 0) > 0);
  const returnWeightSum = validReturns.reduce((s, r) => s + (portfolioValues[r.id] ?? 0), 0);
  const blendedReturnPct = returnWeightSum > 0
    ? validReturns.reduce((s, r) => s + (r.pct ?? 0) * (portfolioValues[r.id] ?? 0), 0) / returnWeightSum
    : null;

  let recentRuns: any[] = [];
  let recentTransactions: any[] = [];
  let latestRecommendations: any[] = [];

  if (portfolioIds.length > 0) {
    const [{ data: runs }, { data: transactions }, { data: recs }] = await Promise.all([
      supabase.from("recommendation_runs").select("id, portfolio_id, status, summary, created_at")
        .in("portfolio_id", portfolioIds).order("created_at", { ascending: false }).limit(5),
      supabase.from("portfolio_transactions").select("id, portfolio_id, transaction_type, ticker, net_cash_impact, traded_at")
        .in("portfolio_id", portfolioIds).order("traded_at", { ascending: false }).limit(8),
      supabase.from("recommendation_items").select("id, portfolio_id, action_type, ticker, thesis, recommendation_status")
        .in("portfolio_id", portfolioIds).eq("recommendation_status", "proposed")
        .order("created_at", { ascending: false }).limit(15),
    ]);
    recentRuns = runs ?? [];
    recentTransactions = transactions ?? [];
    latestRecommendations = recs ?? [];
  }

  const portfolioNameById = new Map(activePortfolios.map((p) => [p.id, p.name]));
  const recsByPortfolio = new Map<string, any[]>();
  for (const rec of latestRecommendations) {
    const existing = recsByPortfolio.get(rec.portfolio_id) ?? [];
    if (existing.length < 3) existing.push(rec);
    recsByPortfolio.set(rec.portfolio_id, existing);
  }

  const portfolioRows = activePortfolios.map((p) => ({
    id: p.id, name: p.name, account_type: p.account_type,
    accountTypeLabel: formatAccountType(p.account_type), dotColor: accountDotColor(p.account_type),
    totalValue: portfolioValues[p.id] ?? 0, totalValueLabel: formatMoney(portfolioValues[p.id] ?? 0),
    cashBalance: portfolioCash[p.id] ?? 0, cashLabel: formatMoney(portfolioCash[p.id] ?? 0),
    benchmarkSymbol: p.benchmark_symbol || "SPY", status: p.status, createdAt: p.created_at,
    aiRecs: (recsByPortfolio.get(p.id) ?? []).map((r) => ({
      id: r.id, action_type: r.action_type, ticker: r.ticker,
      thesis: truncateText(r.thesis, 70), badgeClass: actionBadgeClass(r.action_type),
    })),
  }));

  const feedItems = [
    ...recentTransactions.map((t) => ({
      id: `tx-${t.id}`, kind: "transaction" as const,
      portfolioName: portfolioNameById.get(t.portfolio_id) ?? "Unknown", portfolioId: t.portfolio_id,
      title: `${(t.transaction_type || "").replace("_", " ")} · ${t.ticker || ""}`.trim(),
      occurredAt: t.traded_at, amount: Number(t.net_cash_impact ?? 0),
      href: `/portfolios/${t.portfolio_id}?tab=transactions`, status: null,
    })),
    ...recentRuns.map((r) => ({
      id: `run-${r.id}`, kind: "ai" as const,
      portfolioName: portfolioNameById.get(r.portfolio_id) ?? "Unknown", portfolioId: r.portfolio_id,
      title: truncateText(r.summary, 80) || "AI Analysis", occurredAt: r.created_at, amount: null,
      href: `/portfolios/${r.portfolio_id}?tab=ai`, status: r.status,
    })),
  ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()).slice(0, 10);

  // ── "Today's one recommendation" — the single most recent proposed rec across portfolios.
  const topRec = latestRecommendations[0] ?? null;
  const topRecAccent = actionAccent(topRec?.action_type ?? null);

  const returnColor = blendedReturnPct == null ? "var(--text-primary)" : blendedReturnPct >= 0 ? "var(--green)" : "var(--red)";

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
      <div className="bt-glow" style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />

      <div style={{ position: "relative", zIndex: 1, display: "flex", minHeight: "100vh" }}>
        <div className="hidden lg:flex">
          <Sidebar
            userEmail={user.email}
            totalValue={totalValue}
            portfolios={activePortfolios.map((p) => ({
              id: p.id, name: p.name, cash_balance: Number(p.cash_balance ?? 0), account_type: p.account_type,
            }))}
          />
        </div>

        <div className="bt-main-col" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <MobileNav />

          <div style={{
            padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", background: "var(--bg-base)",
            position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px",
          }}>
            <div>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.2px" }}>
                Dashboard <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--accent, #159f6f)", verticalAlign: "middle", marginLeft: "6px", padding: "2px 8px", borderRadius: "999px", background: "rgba(14,165,160,0.12)", border: "1px solid rgba(14,165,160,0.3)" }}>Concept preview — only visible to you</span>
              </h1>
              <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "3px" }}>
                Sage handoff&apos;s focal-metric + one-recommendation hierarchy, everything else unchanged below
              </p>
            </div>
            <Link href="/dashboard" style={{ fontSize: "12px", color: "var(--text-tertiary)", textDecoration: "none", padding: "7px 12px", borderRadius: "999px", border: "1px solid var(--border-subtle)", flexShrink: 0 }}>
              ← Real dashboard
            </Link>
          </div>

          <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

            {/* ── NEW: focal metric card ── */}
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-xl, 16px)", padding: "26px 28px", marginBottom: "20px" }}>
              <div style={{ fontSize: "10.5px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "8px" }}>
                Investment Return
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "14px", flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "40px", fontWeight: 500, color: returnColor, letterSpacing: "-0.02em" }}>
                  {blendedReturnPct == null ? "—" : `${blendedReturnPct >= 0 ? "+" : ""}${blendedReturnPct.toFixed(1)}%`}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "14px", color: "var(--text-tertiary)" }}>
                  {formatMoney(totalValue)} total
                </span>
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "4px" }}>
                Time-weighted return · deposits excluded · blended across {activePortfolios.length} portfolio{activePortfolios.length === 1 ? "" : "s"}
                {" "}<span style={{ opacity: 0.7 }}>(vs.-benchmark comparison intentionally left out of this preview)</span>
              </div>
            </div>

            {/* ── NEW: single recommendation ── */}
            {topRec && (
              <div style={{ marginBottom: "24px" }}>
                <div style={{ fontSize: "10.5px", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-tertiary)", marginBottom: "10px" }}>
                  Today&apos;s one recommendation
                </div>
                <div style={{ display: "flex", gap: "14px", alignItems: "flex-start", background: topRecAccent.bg, border: `1px solid ${topRecAccent.border}`, borderRadius: "14px", padding: "18px 20px" }}>
                  <div style={{ flexShrink: 0, padding: "4px 10px", borderRadius: "6px", fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, background: topRecAccent.chipBg, color: topRecAccent.chipText, marginTop: "2px" }}>
                    {(topRec.action_type || "REVIEW").toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>{topRec.ticker}</span>
                      <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>{portfolioNameById.get(topRec.portfolio_id) ?? ""}</span>
                    </div>
                    <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", lineHeight: 1.6, margin: "0 0 10px" }}>
                      {truncateText(topRec.thesis, 220)}
                    </p>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <Link href={`/portfolios/${topRec.portfolio_id}?tab=ai`} style={{ padding: "6px 14px", borderRadius: "7px", fontSize: "12px", fontWeight: 600, color: "#fff", background: "var(--brand-gradient)", textDecoration: "none" }}>
                        Review trade
                      </Link>
                      <span style={{ padding: "6px 14px", borderRadius: "7px", fontSize: "12px", fontWeight: 600, color: "var(--text-tertiary)", background: "var(--bg-elevated)", border: "1px solid var(--card-border)" }}>
                        Dismiss <span style={{ opacity: 0.6 }}>(not wired in this preview)</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Everything below: identical to the real dashboard, unchanged ── */}
            <PricingSurveyCard hasResponded />
            {portfolioIds.length > 0 && (
              <div style={{ marginBottom: "16px", padding: "16px 20px", background: "var(--bg-card)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)" }}>
                <Suspense fallback={
                  <div style={{ height: "190px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--brand-blue)", opacity: 0.7, animation: "bt-pulse 1.4s ease-in-out infinite" }} />
                  </div>
                }>
                  <CombinedChart portfolioIds={portfolioIds} portfolioValues={portfolioValues} />
                </Suspense>
              </div>
            )}
            <Suspense fallback={null}>
              <AiOutcomeCard portfolios={activePortfolios.map((p) => ({ id: p.id, name: p.name }))} />
            </Suspense>
            <Suspense fallback={null}>
              <MacroStrip />
            </Suspense>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
              <RegimeShiftAlert />
              <MarketRegimeCard />
            </div>
            <DashboardClient
              portfolioRows={portfolioRows}
              archivedRows={archivedPortfolios.map((p) => ({ id: p.id, name: p.name }))}
              feedItems={feedItems}
              totalValue={totalValue}
              totalValueLabel={formatMoney(totalValue)}
              strategiesCount={strategiesCount ?? 0}
              lastRunAt={recentRuns[0]?.created_at ?? null}
              totalDayChange={totalDayChange}
              totalCash={totalCash}
              stressHoldings={stressHoldings}
              latestAiSummary={recentRuns[0]?.summary ?? null}
              latestAiRunPortfolioId={recentRuns[0]?.portfolio_id ?? null}
              termsAccepted
              showOnboarding={false}
              forceOnboarding={false}
              onboardingStatus="completed"
              initialOnboardingStep={1}
              existingPortfolios={activePortfolios.map((p) => ({ id: p.id, name: p.name, account_type: p.account_type, cash_balance: Number(p.cash_balance ?? 0) }))}
              existingStrategies={(userStrategies ?? []).map((s) => ({ id: s.id, name: s.name, description: s.description ?? null, risk_level: s.risk_level ?? null }))}
              accountCreatedAt={user.created_at ?? null}
            />
            <DcaCard />
          </div>
        </div>
      </div>
    </main>
  );
}
