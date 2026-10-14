import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPortfolioValuation } from "@/lib/portfolio/valuation";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import PlanningClient from "./planning-client";
import type { FinancialProfile, BalanceSheetItem, CashFlowItem, NetWorthSnapshot, PlanningAssumptions, FutureEvent, ExpenseActual, EstateProfile, EstateBeneficiary, EstateAccount, BudgetHistoryEntry } from "./planning-actions";
import { ageFromDob } from "./planning-utils";
import { getLinkedBalanceItems } from "@/lib/planning/linked-balance-items";
import { rollupTransactionActuals, type CashFlowTransaction } from "@/lib/planning/transactions";
import type { MonthCloseRow } from "./month-close-card";
import type { BankLinkInfo } from "./bank-sync-note";
import { hasFeatureAccess } from "@/lib/access/feature-access";
import { getBankStatus } from "@/lib/connections/plaid";
import type { HomeScenario } from "./home/home-actions";
import type { CareerScenario } from "./career/career-actions";
import type { EducationScenario } from "./education/education-actions";
import type { FamilyScenario } from "./family/family-actions";
import type { SabbaticalScenario } from "./sabbatical/sabbatical-actions";
import type { CarScenario } from "./car/car-actions";
import type { ApartmentListing } from "./apartment/apartment-actions";

// Cash Flow transactions, ~18 months. Asks for reviewed_at, and retries without it if the
// column hasn't been added yet (supabase/cash-flow-transactions-reviewed.sql) so a pending
// migration never blanks the page.
async function loadTransactions(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const cols = "id, txn_date, period_year, period_month, description, merchant, amount, direction, cash_flow_item_id, source, import_batch_id, note";
  const query = (select: string) => supabase.from("cash_flow_transactions")
    .select(select).eq("user_id", userId).gte("txn_date", transactionWindowStart())
    .order("txn_date", { ascending: false }).limit(8000);
  const first = await query(`${cols}, reviewed_at`);
  if (!first.error) return first;
  return query(cols);
}

// ~18 months back — enough history for the Cash Flow Average view and month-by-month review.
function transactionWindowStart(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 18);
  return d.toISOString().slice(0, 10);
}

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;
type PortfolioRow = { id: string; name: string; cash_balance: number | string | null; account_type: string | null };
type PortfolioAccount = { id: string; name: string; account_type: string | null; value: number };

// Value each portfolio on its own so the balance sheet can classify it by account type
// (a Roth IRA portfolio is tax-free money, a brokerage is taxable, etc.). Portfolios are
// valued in parallel — each call hits market-data APIs, so a serial loop would make the
// page wait on the sum of all latencies instead of the slowest one.
async function valuePortfolios(supabase: ServerSupabase, portfolios: PortfolioRow[]): Promise<{ accounts: PortfolioAccount[]; total: number }> {
  if (portfolios.length === 0) return { accounts: [], total: 0 };
  const { data: allHoldings } = await supabase
    .from("holdings")
    .select("id, portfolio_id, ticker, company_name, asset_type, shares, average_cost_basis, manual_price, manual_price_updated_at")
    .in("portfolio_id", portfolios.map((p) => p.id));
  const byPortfolio = new Map<string, NonNullable<typeof allHoldings>>();
  for (const h of allHoldings ?? []) {
    const arr = byPortfolio.get(h.portfolio_id) ?? [];
    arr.push(h);
    byPortfolio.set(h.portfolio_id, arr);
  }
  const accounts = await Promise.all(portfolios.map(async (p) => {
    const cash = Number(p.cash_balance ?? 0);
    const hs = byPortfolio.get(p.id) ?? [];
    let value = cash;
    try {
      if (hs.length > 0) {
        const valuation = await getPortfolioValuation({
          holdings: hs.map((h) => ({
            id: h.id, ticker: h.ticker, company_name: h.company_name,
            asset_type: h.asset_type, shares: h.shares, average_cost_basis: h.average_cost_basis,
            manual_price: h.manual_price, manual_price_updated_at: h.manual_price_updated_at,
          })),
          cashBalance: cash,
        });
        value = valuation.total_portfolio_value ?? cash;
      }
    } catch {
      value = cash;
    }
    return { id: p.id, name: p.name, account_type: p.account_type ?? null, value };
  }));
  return { accounts, total: accounts.reduce((sum, a) => sum + a.value, 0) };
}

// "vs. 1 month ago" delta for the Balance Sheet page — one query per item/portfolio
// (not one global query ordered by date) so a portfolio with dense recent daily
// snapshots can't crowd out an older row belonging to a quieter portfolio before a
// shared row cap reaches it. "linked:" items are excluded — they have no real row
// in balance_sheet_items, so they'll never have history; showing no badge is correct.
async function loadMonthAgoValues(supabase: ServerSupabase, itemIds: string[], portfolioIds: string[]): Promise<Record<string, number>> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 1);
  const cutoffIso = cutoff.toISOString();
  const pairs = await Promise.all([
    ...itemIds.map(async (id) => {
      const { data } = await supabase.from("balance_sheet_item_history")
        .select("value").eq("item_id", id).lte("recorded_at", cutoffIso)
        .order("recorded_at", { ascending: false }).limit(1).maybeSingle();
      return data ? [id, Number(data.value)] as const : null;
    }),
    ...portfolioIds.map(async (id) => {
      const { data } = await supabase.from("portfolio_snapshots")
        .select("total_value").eq("portfolio_id", id).lte("snapshot_date", cutoffIso)
        .order("snapshot_date", { ascending: false }).limit(1).maybeSingle();
      return data ? [id, Number(data.total_value)] as const : null;
    }),
  ]);
  return Object.fromEntries(pairs.filter((x): x is readonly [string, number] => x !== null));
}

// Linked banks feed Cash Flow automatically; only shown to people with bank access.
async function loadBankLink(userId: string): Promise<BankLinkInfo | null> {
  if (!(await hasFeatureAccess(userId, "bank_connect").catch(() => false))) return null;
  const status = await getBankStatus(userId);
  const synced = status.connections.map((c) => c.lastSyncedAt).filter((d): d is string => !!d).sort();
  return {
    linked: status.connections.length > 0,
    lastSyncedAt: synced.length > 0 ? synced[synced.length - 1] : null,
    institutions: status.connections.map((c) => c.institution ?? "").filter(Boolean),
    needsReconnect: status.connections.filter((c) => c.needsReconnect).map((c) => c.institution ?? "A linked bank"),
  };
}

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const params = await searchParams;
  const initialTab = (params.tab as string) ?? "overview";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [
    { data: profileData },
    { data: balanceItems },
    { data: cashFlowItems },
    { data: portfolios },
    { data: assumptionsData },
    { data: futureEventsData },
    { data: homeScenariosData },
    { data: careerScenariosData },
    { data: educationScenariosData },
    { data: familyScenariosData },
    { data: sabbaticalScenariosData },
    { data: carScenariosData },
    { data: apartmentListingsData },
    { data: expenseActualsData },
    { data: estateProfileData },
    { data: budgetHistoryData },
    { data: transactionsData },
    { data: monthClosesData },
  ] = await Promise.all([
    supabase.from("financial_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("balance_sheet_items").select("*").eq("user_id", user.id).order("sort_order"),
    supabase.from("cash_flow_items").select("*").eq("user_id", user.id).order("sort_order"),
    supabase.from("portfolios").select("id, name, cash_balance, account_type").eq("user_id", user.id).eq("status", "active"),
    supabase.from("planning_assumptions").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("planning_future_events").select("*").eq("user_id", user.id).order("sort_order"),
    supabase.from("home_planning_scenarios").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("career_scenarios").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("education_scenarios").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("family_scenarios").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("sabbatical_scenarios").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("car_scenarios").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("apartment_listings").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabase.from("expense_actuals").select("*").eq("user_id", user.id).order("period_year", { ascending: false }).order("period_month", { ascending: false }).limit(120),
    supabase.from("estate_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("cash_flow_budget_history").select("*").eq("user_id", user.id).order("effective_year").order("effective_month"),
    loadTransactions(supabase, user.id),
    // Missing table (migration not run yet) just yields null → no closed months.
    supabase.from("cash_flow_month_closes")
      .select("period_year, period_month, income, spending, saved, closed_at")
      .eq("user_id", user.id)
      .order("period_year", { ascending: false })
      .limit(36),
  ]);

  const typedBalanceItems: BalanceSheetItem[] = (balanceItems ?? []).map((item) => ({
    id: item.id,
    user_id: item.user_id,
    label: item.label,
    category: item.category,
    value: Number(item.value),
    is_liability: item.is_liability,
    sort_order: item.sort_order,
  }));

  // Everything below depends only on the batch above, so it runs side by side rather than
  // as a chain of round trips (each one ~100–300ms from the server to the database).
  const [
    { accounts: portfolioAccounts, total: portfolioTotalValue },
    linkedBalanceItems,
    { data: netWorthHistoryRows },
    historicalValues,
    bankLink,
  ] = await Promise.all([
    valuePortfolios(supabase, (portfolios ?? []) as PortfolioRow[]),
    // Connected + manual bank balances join the sheet as read-only "linked:" items —
    // net worth, buckets, health score, and forecasts all pick them up automatically.
    getLinkedBalanceItems(user.id),
    supabase
      .from("net_worth_history")
      .select("*")
      .eq("user_id", user.id)
      .order("snapshot_date", { ascending: false })
      .limit(180),
    loadMonthAgoValues(supabase, typedBalanceItems.map((i) => i.id), (portfolios ?? []).map((p) => p.id)),
    loadBankLink(user.id),
  ]);


  const profile: FinancialProfile | null = profileData
    ? {
        id: profileData.id,
        user_id: profileData.user_id,
        date_of_birth: profileData.date_of_birth ?? null,
        current_age: ageFromDob(profileData.date_of_birth ?? null),
        target_retirement_age: profileData.target_retirement_age ?? null,
        risk_tolerance: profileData.risk_tolerance ?? "moderate",
        gross_monthly_income: profileData.gross_monthly_income ? Number(profileData.gross_monthly_income) : null,
        pre_tax_deductions_annual: profileData.pre_tax_deductions_annual ? Number(profileData.pre_tax_deductions_annual) : null,
        net_monthly_override: profileData.net_monthly_override ? Number(profileData.net_monthly_override) : null,
        monthly_expenses: profileData.monthly_expenses ? Number(profileData.monthly_expenses) : null,
        filing_status: profileData.filing_status ?? "single",
        state_code: profileData.state_code ?? null,
        income_type: profileData.income_type ?? "w2",
        partner_name: profileData.partner_name ?? null,
        partner_age: profileData.partner_age ?? null,
        partner_target_retirement_age: profileData.partner_target_retirement_age ?? null,
        kids_json: Array.isArray(profileData.kids_json) ? profileData.kids_json : [],
        has_401k: profileData.has_401k ?? false,
        k401_contribution_pct: profileData.k401_contribution_pct != null ? Number(profileData.k401_contribution_pct) : null,
        k401_is_roth: profileData.k401_is_roth ?? false,
        k401_employer_match_pct: profileData.k401_employer_match_pct != null ? Number(profileData.k401_employer_match_pct) : null,
        k401_employer_match_limit_pct: profileData.k401_employer_match_limit_pct != null ? Number(profileData.k401_employer_match_limit_pct) : null,
        k401_current_balance: profileData.k401_current_balance != null ? Number(profileData.k401_current_balance) : null,
        pay_frequency: profileData.pay_frequency ?? null,
        emergency_fund_months: profileData.emergency_fund_months != null ? Number(profileData.emergency_fund_months) : null,
        surplus_to_invest_pct: profileData.surplus_to_invest_pct != null ? Number(profileData.surplus_to_invest_pct) : null,
        updated_at: profileData.updated_at,
        is_homeowner: profileData.is_homeowner ?? false,
        owner_home_value: profileData.owner_home_value ? Number(profileData.owner_home_value) : null,
        owner_mortgage_balance: profileData.owner_mortgage_balance ? Number(profileData.owner_mortgage_balance) : null,
        owner_monthly_payment: profileData.owner_monthly_payment ? Number(profileData.owner_monthly_payment) : null,
        owner_interest_rate: profileData.owner_interest_rate ? Number(profileData.owner_interest_rate) : null,
        owner_remaining_term: profileData.owner_remaining_term ? Number(profileData.owner_remaining_term) : null,
        owner_agent_commission_pct: profileData.owner_agent_commission_pct ? Number(profileData.owner_agent_commission_pct) : 6,
        owner_move_in_costs: profileData.owner_move_in_costs ? Number(profileData.owner_move_in_costs) : 0,
        owner_expected_sale_price: profileData.owner_expected_sale_price ? Number(profileData.owner_expected_sale_price) : null,
        owner_hoa_monthly: profileData.owner_hoa_monthly ? Number(profileData.owner_hoa_monthly) : null,
      }
    : null;


  const mergedBalanceItems: BalanceSheetItem[] = [...typedBalanceItems, ...linkedBalanceItems];

  // Auto-snapshot net worth once per page load, server-side (a client effect missed most
  // visits). Today's row is merged into the history in memory so the chart shows it on
  // this load, and the write itself happens after the response so it never delays the page.
  const snapshotManualAssets = mergedBalanceItems.filter((i) => !i.is_liability).reduce((s, i) => s + i.value, 0);
  const snapshotTotalLiabilities = mergedBalanceItems.filter((i) => i.is_liability).reduce((s, i) => s + i.value, 0);
  const snapshotTotalAssets = snapshotManualAssets + portfolioTotalValue;
  let netWorthHistory = netWorthHistoryRows ?? [];
  if (snapshotTotalAssets > 0 || snapshotTotalLiabilities > 0) {
    const today = new Date().toISOString().split("T")[0];
    const snapshot = {
      user_id: user.id,
      snapshot_date: today,
      total_assets: snapshotTotalAssets,
      total_liabilities: snapshotTotalLiabilities,
      net_worth: snapshotTotalAssets - snapshotTotalLiabilities,
      portfolio_value: portfolioTotalValue,
    };
    const existing = netWorthHistory.find((r) => r.snapshot_date === today);
    netWorthHistory = [
      { ...existing, ...snapshot, id: existing?.id ?? `today-${today}` },
      ...netWorthHistory.filter((r) => r.snapshot_date !== today),
    ].slice(0, 180);
    // Admin client: request cookies can't be read once the response has finished. The row
    // is scoped to the user verified above.
    after(async () => {
      await createAdminClient().from("net_worth_history").upsert(snapshot, { onConflict: "user_id,snapshot_date" });
    });
  }


  const typedCashFlowItems: CashFlowItem[] = (cashFlowItems ?? []).map((item) => ({
    id: item.id,
    user_id: item.user_id,
    label: item.label,
    type: item.type as "income" | "expense",
    frequency: item.frequency as "monthly" | "annual",
    amount: Number(item.amount),
    due_day: item.due_day ?? null,
    due_day_2: item.due_day_2 ?? null,
    sort_order: item.sort_order,
    category: item.category ?? null,
    last_paid_for_date: item.last_paid_for_date ?? null,
  }));

  const typedNetWorthHistory: NetWorthSnapshot[] = (netWorthHistory ?? []).slice().reverse().map((s) => ({
    id: s.id,
    snapshot_date: s.snapshot_date,
    total_assets: Number(s.total_assets),
    total_liabilities: Number(s.total_liabilities),
    net_worth: Number(s.net_worth),
    portfolio_value: s.portfolio_value ? Number(s.portfolio_value) : null,
  }));

  const assumptions: PlanningAssumptions | null = assumptionsData
    ? {
        id: assumptionsData.id,
        user_id: assumptionsData.user_id,
        return_rate: Number(assumptionsData.return_rate),
        inflation_rate: Number(assumptionsData.inflation_rate),
        salary_growth_rate: Number(assumptionsData.salary_growth_rate),
        updated_at: assumptionsData.updated_at,
      }
    : null;

  const typedFutureEvents: FutureEvent[] = (futureEventsData ?? []).map((e) => ({
    id: e.id,
    user_id: e.user_id,
    label: e.label,
    event_year: e.event_year,
    amount_impact: Number(e.amount_impact),
    category: e.category,
    sort_order: e.sort_order,
    included: e.included ?? true, // pre-migration rows read as Committed
  }));
  // Committed-only feeds the forecast (drafts don't move the retirement number);
  // the full list drives the new Life Plan timeline + "My Plan" management UI.
  const committedFutureEvents = typedFutureEvents.filter((e) => e.included !== false);

  const typedHomeScenarios: HomeScenario[] = (homeScenariosData ?? []) as HomeScenario[];
  const typedCareerScenarios: CareerScenario[] = (careerScenariosData ?? []) as CareerScenario[];
  const typedEducationScenarios: EducationScenario[] = (educationScenariosData ?? []) as EducationScenario[];
  const typedFamilyScenarios: FamilyScenario[] = (familyScenariosData ?? []) as FamilyScenario[];
  const typedSabbaticalScenarios: SabbaticalScenario[] = (sabbaticalScenariosData ?? []) as SabbaticalScenario[];
  const typedCarScenarios: CarScenario[] = (carScenariosData ?? []) as CarScenario[];
  const typedApartmentListings: ApartmentListing[] = (apartmentListingsData ?? []) as ApartmentListing[];

  const typedEstateProfile: EstateProfile | null = estateProfileData
    ? {
        id: estateProfileData.id,
        user_id: estateProfileData.user_id,
        doc_will:                 estateProfileData.doc_will ?? "none",
        doc_living_trust:         estateProfileData.doc_living_trust ?? "none",
        doc_durable_poa:          estateProfileData.doc_durable_poa ?? "none",
        doc_healthcare_directive: estateProfileData.doc_healthcare_directive ?? "none",
        doc_beneficiary_desig:    estateProfileData.doc_beneficiary_desig ?? "none",
        doc_digital_assets:       estateProfileData.doc_digital_assets ?? "none",
        executor_name:            estateProfileData.executor_name ?? null,
        executor_phone:           estateProfileData.executor_phone ?? null,
        executor_email:           estateProfileData.executor_email ?? null,
        attorney_name:            estateProfileData.attorney_name ?? null,
        attorney_phone:           estateProfileData.attorney_phone ?? null,
        attorney_email:           estateProfileData.attorney_email ?? null,
        healthcare_proxy_name:    estateProfileData.healthcare_proxy_name ?? null,
        healthcare_proxy_phone:   estateProfileData.healthcare_proxy_phone ?? null,
        beneficiaries:            (estateProfileData.beneficiaries ?? []) as EstateBeneficiary[],
        estate_accounts:          (estateProfileData.estate_accounts ?? []) as EstateAccount[],
        family_instructions:      estateProfileData.family_instructions ?? null,
        notes:                    estateProfileData.notes ?? null,
        last_reviewed_at:         estateProfileData.last_reviewed_at ?? null,
        updated_at:               estateProfileData.updated_at,
      }
    : null;


  const typedMonthCloses: MonthCloseRow[] = (monthClosesData ?? []).map((r) => ({
    period_year: r.period_year,
    period_month: r.period_month,
    income: Number(r.income),
    spending: Number(r.spending),
    saved: Number(r.saved),
    closed_at: r.closed_at,
  }));

  const typedTransactions: CashFlowTransaction[] = ((transactionsData ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    ...r,
    amount: Number(r.amount),
    // undefined (column missing) → treat as reviewed, so nothing floods "To review"
    reviewed_at: r.reviewed_at === undefined ? "legacy" : (r.reviewed_at as string | null),
  }) as CashFlowTransaction);

  const loggedExpenseActuals: ExpenseActual[] = (expenseActualsData ?? []).map((r) => ({
    id: r.id,
    user_id: r.user_id,
    cash_flow_item_id: r.cash_flow_item_id ?? null,
    label: r.label,
    period_year: r.period_year,
    period_month: r.period_month,
    actual_amount: Number(r.actual_amount),
    notes: r.notes ?? null,
    breakdown: Array.isArray(r.breakdown) ? r.breakdown : null,
    created_at: r.created_at,
  }));

  // A budget item's actual for a month = the sum of its transactions when it has any;
  // otherwise the legacy/manual expense_actuals total (logged before transactions existed,
  // or typed in by hand). Per item-month, so a manually tracked bill (rent) keeps working
  // alongside statement-imported categories. Every consumer downstream reads this one list.
  const txnRollups = rollupTransactionActuals(typedTransactions);
  const txnKeys = new Set(txnRollups.map((r) => `${r.cash_flow_item_id}|${r.period_year}|${r.period_month}`));
  const typedExpenseActuals: ExpenseActual[] = [
    ...loggedExpenseActuals
      .filter((a) => !txnKeys.has(`${a.cash_flow_item_id}|${a.period_year}|${a.period_month}`))
      .map((a) => ({ ...a, source: "logged" as const })),
    ...txnRollups.map((r): ExpenseActual => ({
      id: `txn:${r.cash_flow_item_id}:${r.period_year}:${r.period_month}`,
      user_id: user.id,
      cash_flow_item_id: r.cash_flow_item_id,
      label: (cashFlowItems ?? []).find((i) => i.id === r.cash_flow_item_id)?.label ?? "Transactions",
      period_year: r.period_year,
      period_month: r.period_month,
      actual_amount: r.total,
      notes: null,
      breakdown: r.breakdown,
      created_at: new Date().toISOString(),
      source: "transactions",
      txn_count: r.count,
    })),
  ];

  const typedBudgetHistory: BudgetHistoryEntry[] = (budgetHistoryData ?? []).map((r) => ({
    id: r.id,
    user_id: r.user_id,
    item_id: r.item_id,
    amount: Number(r.amount),
    frequency: r.frequency as "monthly" | "annual",
    effective_year: r.effective_year,
    effective_month: r.effective_month,
    created_at: r.created_at,
  }));

  const sidebarPortfolios = (portfolios ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    cash_balance: Number(p.cash_balance ?? 0),
    account_type: p.account_type,
  }));

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-base)" }}>
      <div className="hidden lg:flex">
        <Sidebar userEmail={user.email} portfolios={sidebarPortfolios} />
      </div>

      <div className="bt-main-col" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <MobileNav />
        <PlanningClient
          profile={profile}
          balanceItems={mergedBalanceItems}
          cashFlowItems={typedCashFlowItems}
          netWorthHistory={typedNetWorthHistory}
          historicalValues={historicalValues}
          portfolioTotalValue={portfolioTotalValue}
          portfolioAccounts={portfolioAccounts}
          assumptions={assumptions}
          futureEvents={committedFutureEvents}
          allFutureEvents={typedFutureEvents}
          homeScenarios={typedHomeScenarios}
          careerScenarios={typedCareerScenarios}
          educationScenarios={typedEducationScenarios}
          familyScenarios={typedFamilyScenarios}
          sabbaticalScenarios={typedSabbaticalScenarios}
          carScenarios={typedCarScenarios}
          apartmentListings={typedApartmentListings}
          expenseActuals={typedExpenseActuals}
          transactions={typedTransactions}
          monthCloses={typedMonthCloses}
          bankLink={bankLink}
          budgetHistory={typedBudgetHistory}
          estateProfile={typedEstateProfile}
          initialTab={initialTab}
        />
      </div>
    </div>
  );
}
