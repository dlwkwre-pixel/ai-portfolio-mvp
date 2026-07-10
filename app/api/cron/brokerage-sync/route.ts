import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSnaptrade } from "@/lib/connections/snaptrade";
import { resyncBrokerageAccount } from "@/lib/connections/sync";

export const maxDuration = 300;

// Daily auto-sync for every linked brokerage account: refreshes holdings, cash, and
// new transactions from the broker so connected portfolios stay current without the
// user clicking anything. Cron-only (Bearer CRON_SECRET). No-op if SnapTrade isn't
// configured or nobody has linked an account.
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const snaptrade = getSnaptrade();
  if (!snaptrade) return NextResponse.json({ ok: true, skipped: "snaptrade not configured" });

  const admin = createAdminClient();

  const [{ data: links }, { data: conns }] = await Promise.all([
    admin.from("brokerage_account_links").select("user_id, snaptrade_account_id, default_portfolio_id").eq("provider", "snaptrade").not("default_portfolio_id", "is", null),
    admin.from("brokerage_connections").select("user_id, snaptrade_user_id, snaptrade_user_secret").eq("provider", "snaptrade"),
  ]);

  const credsByUser = new Map<string, { userId: string; userSecret: string }>();
  for (const c of conns ?? []) {
    if (c.snaptrade_user_id && c.snaptrade_user_secret) {
      credsByUser.set(c.user_id, { userId: c.snaptrade_user_id, userSecret: c.snaptrade_user_secret });
    }
  }

  let synced = 0, failed = 0;
  for (const l of links ?? []) {
    const creds = credsByUser.get(l.user_id);
    if (!creds || !l.default_portfolio_id) continue;
    try {
      await resyncBrokerageAccount(snaptrade, l.user_id, creds, l.snaptrade_account_id, l.default_portfolio_id);
      await admin.from("brokerage_connections").update({ connected: true, last_synced_at: new Date().toISOString(), last_error: null }).eq("user_id", l.user_id).eq("provider", "snaptrade").then((r) => r, () => ({}));
      synced++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ ok: true, synced, failed });
}
