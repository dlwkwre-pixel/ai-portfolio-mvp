import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Anonymized cohort distributions. Computed from DB only (no per-user market
// data) and cached in memory — only aggregate numbers ever leave this route.
type Cohort = {
  computedAt: number;
  userCount: number;
  positionsDist: number[]; // sorted positions-held per user
  cashPctDist: number[]; // sorted cash% per user (cost-basis proxy)
  topHeld: { ticker: string; pct: number }[]; // % of users holding
};

let cohortCache: Cohort | null = null;
const TTL = 60 * 60 * 1000; // 1 hour

async function getCohort(): Promise<Cohort | null> {
  if (cohortCache && Date.now() - cohortCache.computedAt < TTL) return cohortCache;
  let admin: ReturnType<typeof createAdminClient>;
  try { admin = createAdminClient(); } catch { return null; }

  const [{ data: ports }, { data: holds }] = await Promise.all([
    admin.from("portfolios").select("id, user_id, cash_balance").eq("is_active", true).limit(8000)
      .then((r) => r, () => ({ data: null })),
    admin.from("holdings").select("portfolio_id, ticker, shares, average_cost_basis").limit(40000)
      .then((r) => r, () => ({ data: null })),
  ]);
  if (!ports) return null;

  const portUser = new Map<string, string>();
  const portCash = new Map<string, number>();
  for (const p of ports as Record<string, unknown>[]) {
    portUser.set(p.id as string, p.user_id as string);
    portCash.set(p.id as string, Number(p.cash_balance ?? 0));
  }

  const userPositions = new Map<string, number>();
  const userCost = new Map<string, number>();
  const userTickers = new Map<string, Set<string>>();
  for (const h of (holds ?? []) as Record<string, unknown>[]) {
    const uid = portUser.get(h.portfolio_id as string);
    if (!uid) continue;
    userPositions.set(uid, (userPositions.get(uid) ?? 0) + 1);
    userCost.set(uid, (userCost.get(uid) ?? 0) + Number(h.shares ?? 0) * Number(h.average_cost_basis ?? 0));
    const t = ((h.ticker as string) ?? "").toUpperCase();
    if (t) { const s = userTickers.get(uid) ?? new Set<string>(); s.add(t); userTickers.set(uid, s); }
  }

  const userCash = new Map<string, number>();
  for (const [pid, uid] of portUser) userCash.set(uid, (userCash.get(uid) ?? 0) + (portCash.get(pid) ?? 0));

  const allUsers = new Set<string>([...userPositions.keys()]);
  const positionsDist: number[] = [];
  const cashPctDist: number[] = [];
  const tickerHolders = new Map<string, number>();
  for (const uid of allUsers) {
    const pos = userPositions.get(uid) ?? 0;
    if (pos <= 0) continue;
    positionsDist.push(pos);
    const cost = userCost.get(uid) ?? 0;
    const cash = userCash.get(uid) ?? 0;
    const denom = cost + cash;
    if (denom > 0) cashPctDist.push((cash / denom) * 100);
    for (const t of userTickers.get(uid) ?? []) tickerHolders.set(t, (tickerHolders.get(t) ?? 0) + 1);
  }

  const userCount = positionsDist.length;
  positionsDist.sort((a, b) => a - b);
  cashPctDist.sort((a, b) => a - b);
  const topHeld = [...tickerHolders.entries()]
    .map(([ticker, n]) => ({ ticker, pct: Math.round((n / userCount) * 100) }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 30);

  cohortCache = { computedAt: Date.now(), userCount, positionsDist, cashPctDist, topHeld };
  return cohortCache;
}

function percentileOf(sorted: number[], v: number): number {
  if (!sorted.length) return 50;
  let below = 0;
  for (const x of sorted) if (x < v) below++;
  return Math.round((below / sorted.length) * 100);
}
function median(sorted: number[]): number {
  if (!sorted.length) return 0;
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cohort = await getCohort();
  if (!cohort || cohort.userCount < 5) {
    return NextResponse.json({ available: false });
  }

  // The user's own metrics (their data, via session client / RLS).
  const { data: myPorts } = await supabase.from("portfolios")
    .select("id, cash_balance").eq("user_id", user.id).eq("is_active", true);
  const portIds = (myPorts ?? []).map((p) => p.id);
  const myCash = (myPorts ?? []).reduce((s, p) => s + Number(p.cash_balance ?? 0), 0);

  const { data: myHoldings } = await supabase.from("holdings")
    .select("ticker, shares, average_cost_basis")
    .in("portfolio_id", portIds.length ? portIds : ["__none__"]);

  const myPositions = (myHoldings ?? []).length;
  if (myPositions === 0) return NextResponse.json({ available: true, hasData: false, userCount: cohort.userCount });

  const myCost = (myHoldings ?? []).reduce((s, h) => s + Number(h.shares ?? 0) * Number(h.average_cost_basis ?? 0), 0);
  const myCashPct = myCost + myCash > 0 ? (myCash / (myCost + myCash)) * 100 : 0;
  const myTickers = new Set((myHoldings ?? []).map((h) => (h.ticker ?? "").toUpperCase()).filter(Boolean));

  // Most-held overlap + discovery (cohort favorites the user doesn't own yet).
  const overlap = cohort.topHeld.filter((t) => myTickers.has(t.ticker)).slice(0, 6);
  const notHeld = cohort.topHeld.filter((t) => !myTickers.has(t.ticker)).slice(0, 5);

  return NextResponse.json({
    available: true,
    hasData: true,
    userCount: cohort.userCount,
    positions: {
      you: myPositions,
      median: Math.round(median(cohort.positionsDist)),
      percentile: percentileOf(cohort.positionsDist, myPositions),
    },
    cash: {
      you: Math.round(myCashPct * 10) / 10,
      median: Math.round(median(cohort.cashPctDist) * 10) / 10,
      percentile: percentileOf(cohort.cashPctDist, myCashPct),
    },
    overlap,
    notHeld,
  });
}
