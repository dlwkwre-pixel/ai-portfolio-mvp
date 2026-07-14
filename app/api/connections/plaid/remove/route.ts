import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeatureAccess } from "@/lib/access/feature-access";
import { removePlaidItem } from "@/lib/connections/plaid";

export const maxDuration = 30;

// Unlink one bank: revoke the Item at Plaid (frees the Trial slot, kills our access),
// then remove its accounts and connection row. Users must be able to sever a single
// bank without deleting their whole account.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await hasFeatureAccess(user.id, "bank_connect"))) {
    return NextResponse.json({ error: "Bank connections are in private beta." }, { status: 403 });
  }

  const body = await req.json().catch(() => null) as { itemId?: string } | null;
  if (!body?.itemId) return NextResponse.json({ error: "Missing bank." }, { status: 400 });

  const admin = createAdminClient();
  const { data: conn } = await admin.from("bank_connections")
    .select("access_token").eq("user_id", user.id).eq("item_id", body.itemId).maybeSingle();
  if (!conn) return NextResponse.json({ error: "Bank not found." }, { status: 404 });

  try { await removePlaidItem(conn.access_token as string); } catch { /* revoke is best-effort; our rows still go */ }
  await admin.from("bank_accounts").delete().eq("user_id", user.id).eq("item_id", body.itemId).then((r) => r, () => ({}));
  await admin.from("bank_connections").delete().eq("user_id", user.id).eq("item_id", body.itemId).then((r) => r, () => ({}));

  return NextResponse.json({ ok: true });
}
