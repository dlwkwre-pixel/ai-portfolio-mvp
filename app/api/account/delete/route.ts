import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSnaptrade, getBrokerageRow } from "@/lib/connections/snaptrade";
import { removePlaidItem } from "@/lib/connections/plaid";

export const maxDuration = 120;

// Permanent account deletion: revokes external connections (SnapTrade, Plaid), removes
// every row the user owns, then deletes the auth user itself. Irreversible by design —
// the client must send confirm: "DELETE" and the session must be live.
//
// Every table below has RLS keyed to the user, and most also cascade from auth.users —
// the explicit sweep exists so (a) tables without cascades are still cleaned, and
// (b) deletion doesn't silently depend on FK wiring being perfect.
const USER_TABLES = [
  // connections
  "bank_accounts", "bank_connections",
  "brokerage_synced_activities", "brokerage_account_links", "brokerage_connections",
  // access + feedback + comms
  "feature_access", "feedback_responses", "notifications", "app_notifications",
  "user_notification_reads", "portfolio_digest_preferences",
  // community & social
  "community_poll_votes", "community_post_comments", "community_post_likes",
  "community_post_reports", "community_posts", "portfolio_followers", "portfolio_copies",
  "profiles", "follows", "saved_strategies",
  // journal / research / watching
  "decision_journal", "position_thesis", "portfolio_weekly_recaps", "portfolio_audits",
  "watchlist", "stock_ai_analyses",
  // planning + scenarios
  "financial_profiles", "balance_sheet_items", "cash_flow_items", "net_worth_history",
  "planning_goals", "planning_assumptions", "planning_future_events",
  "estate_profiles", "finn_profiles",
  "equity_grants", "contribution_schedules", "expense_actuals", "cash_flow_budget_history",
  "car_scenarios", "career_scenarios", "education_scenarios", "family_scenarios",
  "wedding_scenarios", "relocation_scenarios", "debt_payoff_scenarios",
  "sabbatical_scenarios", "home_planning_scenarios",
  "apartment_listings", "ai_generated_scenarios",
  // gamification
  "xp_events", "user_badges", "user_xp",
  // strategies (versions/assignments cascade from strategies)
  "strategies",
];

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null) as { confirm?: string } | null;
  if (body?.confirm !== "DELETE") {
    return NextResponse.json({ error: "Type DELETE to confirm." }, { status: 400 });
  }

  const admin = createAdminClient();

  // 1. Revoke external access first, so no provider keeps a live link to a deleted user.
  try {
    const st = getSnaptrade();
    const row = await getBrokerageRow(user.id);
    if (st && row?.snaptrade_user_id) {
      await st.authentication.deleteSnapTradeUser({ userId: row.snaptrade_user_id });
    }
  } catch { /* best-effort — the row sweep below still removes our copy */ }

  try {
    const { data: banks } = await admin.from("bank_connections").select("access_token").eq("user_id", user.id);
    for (const b of banks ?? []) {
      try { await removePlaidItem(b.access_token as string); } catch { /* best-effort */ }
    }
  } catch { /* table may not exist */ }

  // 2. Sweep user-owned rows (best-effort per table — unknown tables just skip).
  for (const table of USER_TABLES) {
    try { await admin.from(table).delete().eq("user_id", user.id); } catch { /* skip */ }
  }

  // 3. Portfolios last among data (children — holdings, snapshots, transactions, recs,
  //    ledgers, public mirrors — cascade from portfolios).
  try { await admin.from("portfolios").delete().eq("user_id", user.id); } catch { /* skip */ }

  // 4. The auth user itself. Remaining FK'd rows with cascades go with it.
  const { error: authErr } = await admin.auth.admin.deleteUser(user.id);
  if (authErr) {
    return NextResponse.json({ error: "Your data was removed but the login could not be deleted. Contact support@buytune.io and we'll finish it." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
