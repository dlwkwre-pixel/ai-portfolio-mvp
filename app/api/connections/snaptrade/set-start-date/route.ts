import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeatureAccess } from "@/lib/access/feature-access";
import { getSnaptrade } from "@/lib/connections/snaptrade";
import { rebuildLinkedPortfolioHistory } from "@/lib/connections/sync";

export const maxDuration = 60;

// Set (or clear) a linked portfolio's chart start date, then rebuild its history from
// the broker starting there. Lets the user trim old periods out of their return.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await hasFeatureAccess(user.id, "brokerage_connect"))) {
    return NextResponse.json({ error: "Brokerage connections are in private beta." }, { status: 403 });
  }
  const snaptrade = getSnaptrade();
  if (!snaptrade) return NextResponse.json({ error: "SnapTrade is not configured." }, { status: 503 });

  const body = await req.json().catch(() => null) as { portfolioId?: string; startDate?: string | null } | null;
  const portfolioId = body?.portfolioId;
  if (!portfolioId) return NextResponse.json({ error: "Missing portfolio." }, { status: 400 });
  // Basic YYYY-MM-DD validation (null = reset to default).
  const startDate = body?.startDate && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate) ? body.startDate : null;

  const admin = createAdminClient();
  // The portfolio must be the linked (default) target of one of the user's accounts.
  const { data: portfolio } = await admin.from("portfolios").select("id").eq("id", portfolioId).eq("user_id", user.id).maybeSingle();
  if (!portfolio) return NextResponse.json({ error: "Portfolio not found." }, { status: 404 });
  const { data: link } = await admin
    .from("brokerage_account_links").select("snaptrade_account_id").eq("user_id", user.id).eq("default_portfolio_id", portfolioId).limit(1).maybeSingle();
  if (!link?.snaptrade_account_id) return NextResponse.json({ error: "This portfolio isn't linked to a brokerage." }, { status: 400 });

  const { error: updErr } = await admin.from("portfolios").update({ chart_start_date: startDate }).eq("id", portfolioId).eq("user_id", user.id);
  if (updErr) return NextResponse.json({ error: "Could not save. Run supabase/portfolio-chart-start-date.sql first." }, { status: 500 });

  const { data: conn } = await admin
    .from("brokerage_connections").select("snaptrade_user_id, snaptrade_user_secret").eq("user_id", user.id).eq("provider", "snaptrade").maybeSingle();
  let snapshots = 0;
  if (conn?.snaptrade_user_id && conn?.snaptrade_user_secret) {
    snapshots = await rebuildLinkedPortfolioHistory(snaptrade, portfolioId, { userId: conn.snaptrade_user_id, userSecret: conn.snaptrade_user_secret }, link.snaptrade_account_id);
  }
  return NextResponse.json({ ok: true, startDate, snapshots });
}
