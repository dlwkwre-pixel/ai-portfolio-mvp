import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeatureAccess } from "@/lib/access/feature-access";
import { getSnaptrade, fetchAccounts } from "@/lib/connections/snaptrade";

// Linked brokerage accounts + the user's portfolios + each account's saved default
// portfolio, so the client can render the account→portfolio mapping UI.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await hasFeatureAccess(user.id, "brokerage_connect"))) {
    return NextResponse.json({ error: "Brokerage connections are in private beta." }, { status: 403 });
  }
  const snaptrade = getSnaptrade();
  if (!snaptrade) return NextResponse.json({ error: "SnapTrade is not configured." }, { status: 503 });
  const admin = createAdminClient();

  const { data: conn } = await admin
    .from("brokerage_connections").select("snaptrade_user_id, snaptrade_user_secret").eq("user_id", user.id).eq("provider", "snaptrade").maybeSingle();
  if (!conn?.snaptrade_user_id || !conn?.snaptrade_user_secret) {
    return NextResponse.json({ accounts: [], portfolios: [], links: {} });
  }

  try {
    const [accounts, { data: portfolios }, { data: links }] = await Promise.all([
      fetchAccounts(snaptrade, { userId: conn.snaptrade_user_id, userSecret: conn.snaptrade_user_secret }),
      admin.from("portfolios").select("id, name").eq("user_id", user.id).eq("status", "active").order("created_at"),
      admin.from("brokerage_account_links").select("snaptrade_account_id, default_portfolio_id").eq("user_id", user.id).eq("provider", "snaptrade").then((r) => r, () => ({ data: null })),
    ]);
    const linkMap: Record<string, string | null> = {};
    for (const l of links ?? []) linkMap[l.snaptrade_account_id] = l.default_portfolio_id ?? null;
    return NextResponse.json({ accounts, portfolios: portfolios ?? [], links: linkMap });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not load accounts.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
