import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import TaxClient from "./tax-client";
import PageIntro from "@/app/components/page-intro";

export const metadata = { title: "Tax Center — BuyTune" };

export type RealizedLot = {
  id: string;
  portfolioId: string;
  portfolioName: string;
  ticker: string;
  quantity: number;
  salePrice: number;
  costBasis: number;
  proceeds: number;
  gainLoss: number;
  soldAt: string;
  acquiredAt: string | null;
  holdingDays: number | null;
  termType: "short" | "long" | "unknown";
  isDividend: boolean;
};

export type TLHOpportunity = {
  portfolioId: string;
  portfolioName: string;
  ticker: string;
  companyName: string | null;
  shares: number;
  costBasis: number;
  currentPrice: number | null;
  currentValue: number | null;
  unrealizedLoss: number | null;
  unrealizedLossPct: number | null;
};

export type WashSaleWarning = {
  ticker: string;
  portfolioName: string;
  sellDate: string;
  sellPrice: number;
  rebuyDate: string;
  rebuyPrice: number;
  daysBetween: number;
  disallowedLoss: number | null;
};

export type TaxProfile = {
  grossMonthly: number | null;
  filingStatus: string;
  incomeType: string;
  stateCode: string | null;
};

export type TaxPageData = {
  years: number[];
  selectedYear: number;
  realizedLots: RealizedLot[];
  dividendIncome: number;
  tlhOpportunities: TLHOpportunity[];
  washSaleWarnings: WashSaleWarning[];
  totalPortfolioValue: number;
  portfolioCount: number;
  taxProfile: TaxProfile | null;
};

function holdingDays(acquiredAt: string | null, soldAt: string): number | null {
  if (!acquiredAt) return null;
  const ms = new Date(soldAt).getTime() - new Date(acquiredAt).getTime();
  return Math.floor(ms / 86_400_000);
}

function termType(days: number | null): "short" | "long" | "unknown" {
  if (days === null) return "unknown";
  return days >= 366 ? "long" : "short";
}

export default async function TaxPage({
  searchParams,
}: {
  searchParams?: Promise<{ year?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const currentYear = new Date().getFullYear();
  const selectedYear = Number(params?.year) || currentYear;

  // All portfolios for sidebar
  const { data: portfolios } = await supabase
    .from("portfolios")
    .select("id, name, is_active, cash_balance, account_type")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const activePortfolios = (portfolios ?? []).filter(p => p.is_active);
  const portfolioIds = activePortfolios.map(p => p.id);

  // Transactions for selected year (sell + dividend)
  const yearStart = `${selectedYear}-01-01T00:00:00.000Z`;
  const yearEnd = `${selectedYear}-12-31T23:59:59.999Z`;

  const { data: financialProfileData } = await supabase
    .from("financial_profiles")
    .select("gross_monthly_income, filing_status, income_type, state_code")
    .eq("user_id", user.id)
    .maybeSingle();

  const [
    { data: sellTx },
    { data: dividendTx },
    { data: allYearsTx },
    { data: allRecentTx },
  ] = await Promise.all([
    supabase.from("portfolio_transactions")
      .select("id, portfolio_id, ticker, quantity, price_per_share, cost_basis_amount, traded_at, acquired_at")
      .in("portfolio_id", portfolioIds.length ? portfolioIds : ["__none__"])
      .eq("transaction_type", "sell")
      .gte("traded_at", yearStart)
      .lte("traded_at", yearEnd)
      .order("traded_at", { ascending: false }),
    supabase.from("portfolio_transactions")
      .select("id, portfolio_id, ticker, net_cash_impact, traded_at")
      .in("portfolio_id", portfolioIds.length ? portfolioIds : ["__none__"])
      .eq("transaction_type", "dividend")
      .gte("traded_at", yearStart)
      .lte("traded_at", yearEnd),
    // All sell years (for year picker)
    supabase.from("portfolio_transactions")
      .select("traded_at")
      .in("portfolio_id", portfolioIds.length ? portfolioIds : ["__none__"])
      .in("transaction_type", ["sell", "dividend"]),
    // All transactions for wash sale detection (90-day window)
    supabase.from("portfolio_transactions")
      .select("id, portfolio_id, ticker, transaction_type, quantity, price_per_share, cost_basis_amount, traded_at")
      .in("portfolio_id", portfolioIds.length ? portfolioIds : ["__none__"])
      .in("transaction_type", ["buy", "sell"])
      .order("traded_at", { ascending: true }),
  ]);

  const portfolioNameById = new Map(activePortfolios.map(p => [p.id, p.name]));

  // Build realized lots
  const realizedLots: RealizedLot[] = (sellTx ?? []).map(tx => {
    const qty = Number(tx.quantity ?? 0);
    const salePrice = Number(tx.price_per_share ?? 0);
    const costBasis = Number(tx.cost_basis_amount ?? 0);
    const proceeds = salePrice * qty;
    const gainLoss = proceeds - costBasis;
    const days = holdingDays(tx.acquired_at ?? null, tx.traded_at);
    return {
      id: tx.id,
      portfolioId: tx.portfolio_id,
      portfolioName: portfolioNameById.get(tx.portfolio_id) ?? "Unknown",
      ticker: tx.ticker ?? "—",
      quantity: qty,
      salePrice,
      costBasis,
      proceeds,
      gainLoss,
      soldAt: tx.traded_at,
      acquiredAt: tx.acquired_at ?? null,
      holdingDays: days,
      termType: termType(days),
      isDividend: false,
    };
  });

  const dividendIncome = (dividendTx ?? []).reduce((s, tx) => s + Number(tx.net_cash_impact ?? 0), 0);

  // Available years (from transaction history + current year)
  const txYears = new Set<number>([currentYear]);
  for (const tx of allYearsTx ?? []) {
    const y = new Date(tx.traded_at).getFullYear();
    if (y >= 2020 && y <= currentYear) txYears.add(y);
  }
  const years = Array.from(txYears).sort((a, b) => b - a);

  // Wash sale detection: sell then rebuy (or rebuy then sell) same ticker within 30 days
  const washSaleWarnings: WashSaleWarning[] = [];
  const txByTicker = new Map<string, typeof allRecentTx>();
  for (const tx of allRecentTx ?? []) {
    const key = `${tx.portfolio_id}:${(tx.ticker ?? "").toUpperCase()}`;
    if (!txByTicker.has(key)) txByTicker.set(key, []);
    txByTicker.get(key)!.push(tx);
  }
  for (const [key, txs] of txByTicker) {
    if (!key) continue;
    const sells = (txs ?? []).filter(t => t.transaction_type === "sell");
    const buys = (txs ?? []).filter(t => t.transaction_type === "buy");
    for (const sell of sells) {
      const sellDate = new Date(sell.traded_at).getTime();
      for (const buy of buys) {
        const buyDate = new Date(buy.traded_at).getTime();
        const diffDays = Math.abs(buyDate - sellDate) / 86_400_000;
        if (diffDays <= 30 && diffDays > 0) {
          const proceeds = Number(sell.price_per_share ?? 0) * Number(sell.quantity ?? 0);
          const costBasis = Number(sell.cost_basis_amount ?? 0);
          const loss = proceeds - costBasis;
          const portfolioId = sell.portfolio_id;
          washSaleWarnings.push({
            ticker: (sell.ticker ?? "—").toUpperCase(),
            portfolioName: portfolioNameById.get(portfolioId) ?? "Unknown",
            sellDate: sell.traded_at,
            sellPrice: Number(sell.price_per_share ?? 0),
            rebuyDate: buy.traded_at,
            rebuyPrice: Number(buy.price_per_share ?? 0),
            daysBetween: Math.round(diffDays),
            disallowedLoss: loss < 0 ? Math.abs(loss) : null,
          });
        }
      }
    }
  }

  // TLH opportunities — unrealized losses from current holdings
  const tlhOpportunities: TLHOpportunity[] = [];
  let totalPortfolioValue = 0;

  for (const p of activePortfolios) {
    const { data: holdings } = await supabase
      .from("holdings")
      .select("id, ticker, company_name, asset_type, shares, average_cost_basis")
      .eq("portfolio_id", p.id);

    try {
      const val = await getPortfolioValuation({
        holdings: (holdings ?? []).map(h => ({
          id: h.id, ticker: h.ticker, company_name: h.company_name,
          asset_type: h.asset_type, shares: h.shares, average_cost_basis: h.average_cost_basis,
        })),
        cashBalance: Number(p.cash_balance ?? 0),
      });
      totalPortfolioValue += val.total_portfolio_value;

      for (const vh of val.valued_holdings) {
        const costBasis = Number(vh.average_cost_basis ?? 0) * vh.shares_number;
        const currentValue = vh.market_value ?? null;
        if (currentValue !== null && currentValue < costBasis) {
          const unrealizedLoss = currentValue - costBasis;
          const unrealizedLossPct = costBasis > 0 ? (unrealizedLoss / costBasis) * 100 : null;
          tlhOpportunities.push({
            portfolioId: p.id,
            portfolioName: p.name,
            ticker: vh.ticker,
            companyName: vh.company_name,
            shares: vh.shares_number,
            costBasis,
            currentPrice: vh.current_price ?? null,
            currentValue,
            unrealizedLoss,
            unrealizedLossPct,
          });
        }
      }
    } catch {
      totalPortfolioValue += Number(p.cash_balance ?? 0);
    }
  }

  tlhOpportunities.sort((a, b) => (a.unrealizedLoss ?? 0) - (b.unrealizedLoss ?? 0));

  const taxProfile: TaxProfile | null = financialProfileData ? {
    grossMonthly: financialProfileData.gross_monthly_income ? Number(financialProfileData.gross_monthly_income) : null,
    filingStatus: financialProfileData.filing_status ?? "single",
    incomeType: financialProfileData.income_type ?? "w2",
    stateCode: financialProfileData.state_code ?? null,
  } : null;

  const taxData: TaxPageData = {
    years,
    selectedYear,
    realizedLots,
    dividendIncome,
    tlhOpportunities,
    washSaleWarnings,
    totalPortfolioValue,
    portfolioCount: activePortfolios.length,
    taxProfile,
  };

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
      <div className="bt-glow" style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1, display: "flex", minHeight: "100vh" }}>
        <div className="hidden lg:flex">
          <Sidebar
            userEmail={user.email}
            totalValue={totalPortfolioValue}
            portfolios={activePortfolios.map(p => ({
              id: p.id, name: p.name,
              cash_balance: Number(p.cash_balance ?? 0),
              account_type: p.account_type,
            }))}
          />
        </div>
        <div className="bt-main-col" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <MobileNav />
          <div style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-base)", position: "sticky", top: 0, zIndex: 10 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h1 style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.2px" }}>
                  Tax Center
                </h1>
                <span style={{ fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", padding: "2px 7px", borderRadius: "var(--radius-full)", background: "rgba(245,158,11,0.12)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.2)" }}>
                  Beta
                </span>
              </div>
              <p style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "1px" }}>
                Realized gains, tax-loss harvesting, and strategy
              </p>
            </div>
            <div style={{ fontSize: "10px", color: "var(--text-muted)", maxWidth: "280px", textAlign: "right", lineHeight: 1.4 }}>
              Estimates only. Not tax advice. Consult a CPA for filing decisions.
            </div>
          </div>
          <div className="bt-page-content" style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
            <PageIntro
              pageKey="tax"
              title="Tax Center"
              description="Estimate your capital gains liability, track cost basis across portfolios, and plan around your tax situation."
            />
            <TaxClient data={taxData} />
          </div>
        </div>
      </div>
    </main>
  );
}
