import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeatureAccess } from "@/lib/access/feature-access";
import { plaidConfigured, syncBankConnection } from "@/lib/connections/plaid";

export const maxDuration = 60;

// Refresh balances for every bank connection the user has.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await hasFeatureAccess(user.id, "bank_connect"))) {
    return NextResponse.json({ error: "Bank connections are in private beta." }, { status: 403 });
  }
  if (!plaidConfigured()) return NextResponse.json({ error: "Plaid is not configured." }, { status: 503 });

  const admin = createAdminClient();
  const { data: conns } = await admin
    .from("bank_connections").select("item_id, access_token").eq("user_id", user.id)
    .then((r) => r, () => ({ data: null }));
  if (!conns || conns.length === 0) return NextResponse.json({ error: "Connect a bank first." }, { status: 400 });

  let synced = 0, accounts = 0;
  for (const c of conns) {
    try {
      accounts += await syncBankConnection(user.id, c.item_id, c.access_token);
      synced++;
    } catch (e) {
      await admin.from("bank_connections")
        .update({ last_error: e instanceof Error ? e.message.slice(0, 300) : "sync failed", updated_at: new Date().toISOString() })
        .eq("user_id", user.id).eq("item_id", c.item_id).then((r) => r, () => ({}));
    }
  }
  return NextResponse.json({ synced, accounts });
}
