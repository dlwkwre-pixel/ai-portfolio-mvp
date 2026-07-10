import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeatureAccess } from "@/lib/access/feature-access";
import { getSnaptrade } from "@/lib/connections/snaptrade";
import { resyncBrokerageAccount } from "@/lib/connections/sync";

export const maxDuration = 120;

// One-tap "sync all now": re-pull holdings, cash, and new activity for every linked
// account of the current user, using their saved account→portfolio mappings.
export async function POST() {
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
    return NextResponse.json({ error: "Connect a brokerage first." }, { status: 400 });
  }
  const creds = { userId: conn.snaptrade_user_id, userSecret: conn.snaptrade_user_secret };

  const { data: links } = await admin
    .from("brokerage_account_links").select("snaptrade_account_id, default_portfolio_id")
    .eq("user_id", user.id).eq("provider", "snaptrade").not("default_portfolio_id", "is", null)
    .then((r) => r, () => ({ data: null }));
  if (!links || links.length === 0) {
    return NextResponse.json({ error: "Import an account first (Review & import), then Sync all will refresh it." }, { status: 400 });
  }

  let accounts = 0, updated = 0, added = 0, activities = 0;
  for (const l of links) {
    if (!l.default_portfolio_id) continue;
    try {
      const r = await resyncBrokerageAccount(snaptrade, user.id, creds, l.snaptrade_account_id, l.default_portfolio_id);
      updated += r.updated; added += r.added; activities += r.activities; accounts++;
    } catch { /* skip this account */ }
  }
  await admin.from("brokerage_connections").update({ connected: true, last_synced_at: new Date().toISOString(), last_error: null }).eq("user_id", user.id).eq("provider", "snaptrade").then((r) => r, () => ({}));

  return NextResponse.json({ accounts, updated, added, activities });
}
