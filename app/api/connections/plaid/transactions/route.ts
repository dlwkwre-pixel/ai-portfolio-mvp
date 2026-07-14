import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasFeatureAccess } from "@/lib/access/feature-access";
import { getBankTransactions } from "@/lib/connections/plaid";

export const maxDuration = 30;

// Current-month spending summary + recent transactions from the user's linked banks.
// Read-only view over the rolling transaction store the sync maintains.

const CATEGORY_LABELS: Record<string, string> = {
  FOOD_AND_DRINK: "Food & drink",
  GENERAL_MERCHANDISE: "Shopping",
  TRANSPORTATION: "Transportation",
  RENT_AND_UTILITIES: "Rent & utilities",
  TRAVEL: "Travel",
  ENTERTAINMENT: "Entertainment",
  MEDICAL: "Medical",
  PERSONAL_CARE: "Personal care",
  GENERAL_SERVICES: "Services",
  HOME_IMPROVEMENT: "Home",
  LOAN_PAYMENTS: "Loan payments",
  BANK_FEES: "Bank fees",
  GOVERNMENT_AND_NON_PROFIT: "Government & giving",
  INCOME: "Income",
  TRANSFER_IN: "Transfer in",
  TRANSFER_OUT: "Transfer out",
};

function label(cat: string | null): string {
  if (!cat) return "Other";
  return CATEGORY_LABELS[cat] ?? cat.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await hasFeatureAccess(user.id, "bank_connect"))) {
    return NextResponse.json({ error: "no access" }, { status: 403 });
  }

  const txns = await getBankTransactions(user.id);
  if (txns.length === 0) return NextResponse.json({ hasData: false });

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const isTransfer = (c: string | null) => c === "TRANSFER_IN" || c === "TRANSFER_OUT";

  let spend = 0, income = 0;
  const byCategory = new Map<string, number>();
  for (const t of txns) {
    if (!t.date.startsWith(monthKey) || t.pending) continue;
    if (isTransfer(t.category)) continue;
    if (t.amount > 0) {
      spend += t.amount;
      const l = label(t.category);
      byCategory.set(l, (byCategory.get(l) ?? 0) + t.amount);
    } else if (t.amount < 0) {
      income += -t.amount;
    }
  }

  const topCategories = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 }));

  return NextResponse.json({
    hasData: true,
    month: {
      key: monthKey,
      spend: Math.round(spend * 100) / 100,
      income: Math.round(income * 100) / 100,
      topCategories,
    },
    recent: txns.slice(0, 12).map((t) => ({
      id: t.id,
      date: t.date,
      name: t.name,
      amount: t.amount,
      category: label(t.category),
      pending: t.pending,
    })),
  });
}
