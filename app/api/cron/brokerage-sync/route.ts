import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSnaptrade } from "@/lib/connections/snaptrade";
import { resyncBrokerageAccount } from "@/lib/connections/sync";
import { plaidConfigured, syncUserConnections } from "@/lib/connections/plaid";

export const maxDuration = 300;

// Daily auto-sync for every linked BROKERAGE account (holdings, cash, transactions) and
// every linked BANK (balances via Plaid) — connected data stays current without anyone
// clicking anything. Cron-only (Bearer CRON_SECRET). Each half no-ops when its provider
// isn't configured.
export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();

  // ── Banks: refresh balances for every Plaid connection ──
  let banksSynced = 0, banksFailed = 0;
  if (plaidConfigured()) {
    const { data: bankConns } = await admin.from("bank_connections").select("user_id, item_id, access_token")
      .then((r) => r, () => ({ data: null }));
    // Per user, so each user's Cash Flow is fed once after all their Items sync.
    const byUser = new Map<string, { item_id: string; access_token: string }[]>();
    for (const b of bankConns ?? []) byUser.set(b.user_id, [...(byUser.get(b.user_id) ?? []), b]);
    for (const [userId, conns] of byUser) {
      const r = await syncUserConnections(userId, conns, async (itemId, message) => {
        banksFailed++;
        await admin.from("bank_connections")
          .update({ last_error: message, updated_at: new Date().toISOString() })
          .eq("user_id", userId).eq("item_id", itemId).then((res) => res, () => ({}));
      });
      banksSynced += r.synced;
    }
  }

  const snaptrade = getSnaptrade();
  if (!snaptrade) return NextResponse.json({ ok: true, banksSynced, banksFailed, skipped: "snaptrade not configured" });

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
      await resyncBrokerageAccount(snaptrade, l.user_id, creds, l.snaptrade_account_id, l.default_portfolio_id, { forceRebuild: true });
      await admin.from("brokerage_connections").update({ connected: true, last_synced_at: new Date().toISOString(), last_error: null }).eq("user_id", l.user_id).eq("provider", "snaptrade").then((r) => r, () => ({}));
      synced++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ ok: true, synced, failed, banksSynced, banksFailed });
}
