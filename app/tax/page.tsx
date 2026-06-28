import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";
import { contributionLimits } from "@/lib/tax/contribution-limits";
import { compute401k } from "@/lib/tax/retirement-401k";
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
  preTaxDeductionsAnnual: number;
  k401TraditionalAnnual: number; // Traditional 401(k) employee deferral folded into preTaxDeductionsAnnual
  isHomeowner: boolean;
  ownerHomeValue: number | null;
  ownerMortgageBalance: number | null;
  ownerMonthlyPayment: number | null;
  ownerInterestRate: number | null;
  ownerRemainingTerm: number | null;
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
  lotAcqYears: Record<string, number>;
  lotCostBasis: Record<string, number>;
  lotProceeds: Record<string, number>;
  retirementContributions: RetirementContribution[];
  accountBuckets: { taxable: AssetBucket; deferred: AssetBucket; free: AssetBucket };
  traditionalEstimate: number;  // best estimate of convertible Traditional/pre-tax balance
};

export type AssetBucket = { value: number; byAsset: Record<string, number> };

export type RetirementContribution = {
  portfolioId: string;
  portfolioName: string;
  accountType: string;       // 'roth_ira' | 'traditional_ira' | '401k' | ...
  accountLabel: string;      // human label
  contributed: number;       // total IN deposits in the selected year
  annualLimit: number | null; // IRS contribution limit for the type, if known
  deductible: boolean;       // traditional IRA / 401k reduce taxable income
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

  // Only TAXABLE accounts generate a capital-gains / dividend tax bill. Gains
  // inside tax-advantaged accounts (Roth IRA, Traditional IRA, 401k, HSA, etc.)
  // and paper-trade accounts must NOT be counted, or the bill is overstated.
  const isTaxableAccount = (t: string | null) => {
    const v = (t ?? "").toLowerCase();
    if (/roth|ira|401|403|hsa|retirement|paper/.test(v)) return false;
    return true; // taxable, brokerage, margin, speculative, or unset → taxable
  };
  // Classify each account into a tax bucket for the Asset Location view.
  const taxBucketOf = (t: string | null): "taxable" | "deferred" | "free" | null => {
    const v = (t ?? "").toLowerCase();
    if (/paper/.test(v)) return null;            // paper-trade — exclude
    if (/roth/.test(v)) return "free";           // Roth IRA / Roth 401k → tax-free
    if (/ira|401|403|hsa|retirement/.test(v)) return "deferred"; // Traditional/pre-tax
    return "taxable";                            // brokerage / taxable / unset
  };
  const taxablePortfolios = activePortfolios.filter(p => isTaxableAccount(p.account_type));
  // Used for every realized-gain / dividend / wash-sale query below.
  const portfolioIds = taxablePortfolios.map(p => p.id);

  // Transactions for selected year (sell + dividend)
  const yearStart = `${selectedYear}-01-01T00:00:00.000Z`;
  const yearEnd = `${selectedYear}-12-31T23:59:59.999Z`;

  const { data: financialProfileData, error: profileError } = await supabase
    .from("financial_profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError) console.error("[tax/page] financial_profiles query error:", profileError.message);

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

  // Reconstruct weighted average cost basis from buy history for any sell where cost_basis_amount = 0.
  // Walk all buy/sell transactions in chronological order, maintaining a running WACB per portfolio+ticker.
  const wacbMap = new Map<string, { shares: number; totalCost: number }>();
  const backfilledCostBasis = new Map<string, number>(); // txId → computed cost basis

  for (const tx of allRecentTx ?? []) {
    const key = `${tx.portfolio_id}:${(tx.ticker ?? "").toUpperCase()}`;
    if (!wacbMap.has(key)) wacbMap.set(key, { shares: 0, totalCost: 0 });
    const tracker = wacbMap.get(key)!;

    if (tx.transaction_type === "buy") {
      const qty = Number(tx.quantity ?? 0);
      const price = Number(tx.price_per_share ?? 0);
      tracker.shares += qty;
      tracker.totalCost += qty * price;
    } else if (tx.transaction_type === "sell") {
      const qty = Number(tx.quantity ?? 0);
      const avgCost = tracker.shares > 0 ? tracker.totalCost / tracker.shares : 0;
      const computed = qty * avgCost;
      if (Number(tx.cost_basis_amount ?? 0) === 0 && computed > 0) {
        backfilledCostBasis.set(tx.id, computed);
      }
      tracker.shares = Math.max(0, tracker.shares - qty);
      tracker.totalCost = Math.max(0, tracker.totalCost - computed);
    }
  }

  // Build realized lots
  const realizedLots: RealizedLot[] = (sellTx ?? []).map(tx => {
    const qty = Number(tx.quantity ?? 0);
    const salePrice = Number(tx.price_per_share ?? 0);
    const storedCostBasis = Number(tx.cost_basis_amount ?? 0);
    const costBasis = storedCostBasis > 0 ? storedCostBasis : (backfilledCostBasis.get(tx.id) ?? 0);
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

  // Value every active portfolio in parallel — serial market-data calls made the Tax Center
  // wait on the sum of all portfolio latencies.
  const tlhResults = await Promise.all(activePortfolios.map(async (p) => {
    const { data: holdings } = await supabase
      .from("holdings")
      .select("id, ticker, company_name, asset_type, shares, average_cost_basis, manual_price, manual_price_updated_at")
      .eq("portfolio_id", p.id);
    try {
      const val = await getPortfolioValuation({
        holdings: (holdings ?? []).map(h => ({
          id: h.id, ticker: h.ticker, company_name: h.company_name,
          asset_type: h.asset_type, shares: h.shares, average_cost_basis: h.average_cost_basis,
          manual_price: h.manual_price, manual_price_updated_at: h.manual_price_updated_at,
        })),
        cashBalance: Number(p.cash_balance ?? 0),
      });
      const opps: TLHOpportunity[] = [];
      const byAsset: Record<string, number> = {};
      for (const vh of val.valued_holdings) {
        const costBasis = Number(vh.average_cost_basis ?? 0) * vh.shares_number;
        const currentValue = vh.market_value ?? null;
        if (currentValue !== null && currentValue > 0) {
          const at = (vh.asset_type ?? "stock").toLowerCase();
          byAsset[at] = (byAsset[at] ?? 0) + currentValue;
        }
        if (currentValue !== null && currentValue < costBasis) {
          const unrealizedLoss = currentValue - costBasis;
          const unrealizedLossPct = costBasis > 0 ? (unrealizedLoss / costBasis) * 100 : null;
          opps.push({
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
      return { value: val.total_portfolio_value, opps, bucket: taxBucketOf(p.account_type), cash: Number(p.cash_balance ?? 0), byAsset };
    } catch {
      return { value: Number(p.cash_balance ?? 0), opps: [] as TLHOpportunity[], bucket: taxBucketOf(p.account_type), cash: Number(p.cash_balance ?? 0), byAsset: {} as Record<string, number> };
    }
  }));
  // Asset Location: aggregate value + asset-type mix into the three tax buckets.
  const accountBuckets: { taxable: AssetBucket; deferred: AssetBucket; free: AssetBucket } = {
    taxable: { value: 0, byAsset: {} },
    deferred: { value: 0, byAsset: {} },
    free: { value: 0, byAsset: {} },
  };
  for (const r of tlhResults) {
    totalPortfolioValue += r.value;
    tlhOpportunities.push(...r.opps);
    if (!r.bucket) continue; // skip paper-trade
    const b = accountBuckets[r.bucket];
    b.value += r.value;
    for (const [at, v] of Object.entries(r.byAsset)) b.byAsset[at] = (b.byAsset[at] ?? 0) + v;
    if (r.cash > 0) b.byAsset["cash"] = (b.byAsset["cash"] ?? 0) + r.cash;
  }

  tlhOpportunities.sort((a, b) => (a.unrealizedLoss ?? 0) - (b.unrealizedLoss ?? 0));

  // Traditional 401(k) employee deferral is pre-tax — fold it into the deductions that
  // reduce taxable income so the tax page matches what BuyTune shows on planning.
  const k401TraditionalAnnual = (
    financialProfileData?.has_401k &&
    !financialProfileData?.k401_is_roth &&
    financialProfileData?.gross_monthly_income
  )
    ? compute401k({
        grossAnnualIncome: Number(financialProfileData.gross_monthly_income) * 12,
        contributionPct: Number(financialProfileData.k401_contribution_pct ?? 0),
        isRoth: false,
        employerMatchPct: Number(financialProfileData.k401_employer_match_pct ?? 0),
        employerMatchLimitPct: Number(financialProfileData.k401_employer_match_limit_pct ?? 0),
        age: null,
      }).traditionalAnnual
    : 0;

  const taxProfile: TaxProfile | null = financialProfileData ? {
    grossMonthly: financialProfileData.gross_monthly_income ? Number(financialProfileData.gross_monthly_income) : null,
    filingStatus: financialProfileData.filing_status ?? "single",
    incomeType: financialProfileData.income_type ?? "w2",
    stateCode: financialProfileData.state_code ?? null,
    preTaxDeductionsAnnual:
      (financialProfileData.pre_tax_deductions_annual ? Number(financialProfileData.pre_tax_deductions_annual) : 0) +
      k401TraditionalAnnual,
    k401TraditionalAnnual,
    isHomeowner: financialProfileData.is_homeowner ?? false,
    ownerHomeValue: financialProfileData.owner_home_value ? Number(financialProfileData.owner_home_value) : null,
    ownerMortgageBalance: financialProfileData.owner_mortgage_balance ? Number(financialProfileData.owner_mortgage_balance) : null,
    ownerMonthlyPayment: financialProfileData.owner_monthly_payment ? Number(financialProfileData.owner_monthly_payment) : null,
    ownerInterestRate: financialProfileData.owner_interest_rate ? Number(financialProfileData.owner_interest_rate) : null,
    ownerRemainingTerm: financialProfileData.owner_remaining_term ? Number(financialProfileData.owner_remaining_term) : null,
  } : null;

  const savedLotAcqYears: Record<string, number> =
    financialProfileData?.lot_acq_years &&
    typeof financialProfileData.lot_acq_years === "object" &&
    !Array.isArray(financialProfileData.lot_acq_years)
      ? (financialProfileData.lot_acq_years as Record<string, number>)
      : {};

  const savedLotCostBasis: Record<string, number> =
    financialProfileData?.lot_cost_basis &&
    typeof financialProfileData.lot_cost_basis === "object" &&
    !Array.isArray(financialProfileData.lot_cost_basis)
      ? (financialProfileData.lot_cost_basis as Record<string, number>)
      : {};

  const savedLotProceeds: Record<string, number> =
    financialProfileData?.lot_proceeds &&
    typeof financialProfileData.lot_proceeds === "object" &&
    !Array.isArray(financialProfileData.lot_proceeds)
      ? (financialProfileData.lot_proceeds as Record<string, number>)
      : {};

  // ── Retirement contributions ────────────────────────────────────────────────
  // Cash deposits into tax-advantaged accounts are contributions. Surface them so
  // the user can track IRA/Roth/401k contribution room (and deductibility).
  const cl = contributionLimits();
  const RETIREMENT_LIMITS: { match: RegExp; label: string; limit: number | null; deductible: boolean }[] = [
    { match: /roth/, label: "Roth IRA", limit: cl.ira, deductible: false },
    { match: /traditional_ira|trad_ira|^ira$/, label: "Traditional IRA", limit: cl.ira, deductible: true },
    { match: /401|403/, label: "401(k) / 403(b)", limit: cl.k401, deductible: true },
    { match: /ira/, label: "IRA", limit: cl.ira, deductible: true },
    { match: /retirement/, label: "Retirement", limit: null, deductible: true },
  ];
  const classifyRetirement = (t: string | null) => {
    const v = (t ?? "").toLowerCase();
    return RETIREMENT_LIMITS.find((r) => r.match.test(v)) ?? null;
  };
  const retirementPortfolios = activePortfolios
    .map((p) => ({ p, cls: classifyRetirement(p.account_type) }))
    .filter((x): x is { p: typeof activePortfolios[number]; cls: NonNullable<ReturnType<typeof classifyRetirement>> } => x.cls !== null);

  let retirementContributions: RetirementContribution[] = [];
  if (retirementPortfolios.length > 0) {
    const { data: deposits } = await supabase
      .from("cash_ledger")
      .select("portfolio_id, amount, direction, reason, effective_at")
      .in("portfolio_id", retirementPortfolios.map((x) => x.p.id))
      .eq("direction", "IN")
      .eq("reason", "deposit")
      .gte("effective_at", yearStart)
      .lte("effective_at", yearEnd);

    retirementContributions = retirementPortfolios.map(({ p, cls }) => {
      const contributed = (deposits ?? [])
        .filter((d) => d.portfolio_id === p.id)
        .reduce((s, d) => s + Number(d.amount ?? 0), 0);
      return {
        portfolioId: p.id,
        portfolioName: p.name,
        accountType: p.account_type ?? "",
        accountLabel: cls.label,
        contributed,
        annualLimit: cls.limit,
        deductible: cls.deductible,
      };
    }).filter((r) => r.contributed > 0);
  }

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
    lotAcqYears: savedLotAcqYears,
    lotCostBasis: savedLotCostBasis,
    lotProceeds: savedLotProceeds,
    retirementContributions,
    accountBuckets,
    traditionalEstimate: accountBuckets.deferred.value > 0
      ? accountBuckets.deferred.value
      : Number(financialProfileData?.k401_current_balance ?? 0),
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
            <div className="hidden sm:block" style={{ fontSize: "10px", color: "var(--text-muted)", maxWidth: "260px", textAlign: "right", lineHeight: 1.4 }}>
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
