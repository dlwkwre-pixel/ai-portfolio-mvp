import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import DebtClient from "./debt-client";
import type { DebtScenario, Debt } from "./debt-actions";

// Liability balance-sheet categories that represent payable debt.
const DEBT_CATEGORIES = new Set([
  "credit_card", "credit card", "student_loan", "student loan", "auto_loan",
  "auto loan", "car_loan", "personal_loan", "personal loan", "loan",
  "mortgage", "heloc", "medical_debt", "other_debt", "debt",
]);

// Reasonable default minimum payment + APR guesses by category when unknown.
function guessApr(category: string): number {
  const c = category.toLowerCase();
  if (c.includes("credit")) return 22.9;
  if (c.includes("student")) return 6.5;
  if (c.includes("auto") || c.includes("car")) return 7.5;
  if (c.includes("personal")) return 12.0;
  if (c.includes("mortgage")) return 6.5;
  return 15.0;
}

export default async function DebtPlanningPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [{ data: scenariosData }, { data: balanceItems }, { data: portfolios }] = await Promise.all([
    supabase
      .from("debt_payoff_scenarios")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("balance_sheet_items")
      .select("label, category, value, is_liability")
      .eq("user_id", user.id),
    supabase
      .from("portfolios")
      .select("id, name, cash_balance, account_type")
      .eq("user_id", user.id),
  ]);

  const scenarios: DebtScenario[] = (scenariosData ?? []).map((s) => ({
    ...s,
    debts: Array.isArray(s.debts) ? s.debts : [],
  })) as DebtScenario[];

  // Prefill debts from balance-sheet liabilities (APR/min are guesses to refine)
  const prefillDebts: Debt[] = (balanceItems ?? [])
    .filter((i) => i.is_liability && Number(i.value) > 0 && DEBT_CATEGORIES.has((i.category ?? "").toLowerCase()))
    .map((i) => {
      const balance = Number(i.value);
      const apr = guessApr(i.category ?? "");
      // ~2% of balance is a common credit-card minimum; floor at $25
      const min_payment = Math.max(25, Math.round(balance * 0.02));
      return { name: i.label || "Debt", balance, apr, min_payment };
    });

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
        <DebtClient scenarios={scenarios} prefillDebts={prefillDebts} />
      </div>
    </div>
  );
}
