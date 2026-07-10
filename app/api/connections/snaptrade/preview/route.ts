import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeatureAccess } from "@/lib/access/feature-access";
import { getSnaptrade, fetchAccountPositions } from "@/lib/connections/snaptrade";

export const maxDuration = 60;

// Positions for one linked account, each annotated with the portfolio that already
// holds the ticker (if any). The client uses that to default the target dropdown and
// show "will update" vs "will add".
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await hasFeatureAccess(user.id, "brokerage_connect"))) {
    return NextResponse.json({ error: "Brokerage connections are in private beta." }, { status: 403 });
  }
  const snaptrade = getSnaptrade();
  if (!snaptrade) return NextResponse.json({ error: "SnapTrade is not configured." }, { status: 503 });

  const { accountId } = await req.json().catch(() => ({ accountId: "" }));
  if (!accountId) return NextResponse.json({ error: "Missing account." }, { status: 400 });

  const admin = createAdminClient();
  const { data: conn } = await admin
    .from("brokerage_connections").select("snaptrade_user_id, snaptrade_user_secret").eq("user_id", user.id).eq("provider", "snaptrade").maybeSingle();
  if (!conn?.snaptrade_user_id || !conn?.snaptrade_user_secret) {
    return NextResponse.json({ error: "Connect a brokerage first." }, { status: 400 });
  }

  try {
    const positions = await fetchAccountPositions(snaptrade, { userId: conn.snaptrade_user_id, userSecret: conn.snaptrade_user_secret }, accountId);

    // Where does each ticker already live? (first active portfolio that holds it)
    const { data: portfolios } = await admin.from("portfolios").select("id").eq("user_id", user.id).eq("status", "active");
    const pids = (portfolios ?? []).map((p) => p.id);
    const tickerToPortfolio: Record<string, string> = {};
    if (pids.length > 0) {
      const { data: holdings } = await admin.from("holdings").select("ticker, portfolio_id").in("portfolio_id", pids);
      for (const h of holdings ?? []) {
        const t = String(h.ticker).toUpperCase();
        if (!tickerToPortfolio[t]) tickerToPortfolio[t] = h.portfolio_id;
      }
    }

    const rows = positions.map((p) => ({
      ...p,
      currentPortfolioId: tickerToPortfolio[p.ticker] ?? null,
    }));
    return NextResponse.json({ positions: rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not read positions.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
