import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeatureAccess } from "@/lib/access/feature-access";
import { plaidConfigured, exchangePublicToken, syncBankConnection } from "@/lib/connections/plaid";

export const maxDuration = 60;

// Complete a Plaid Link session: exchange the public_token for a permanent access
// token (stored service-role-only), then pull the first balance snapshot.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await hasFeatureAccess(user.id, "bank_connect"))) {
    return NextResponse.json({ error: "Bank connections are in private beta." }, { status: 403 });
  }
  if (!plaidConfigured()) return NextResponse.json({ error: "Plaid is not configured." }, { status: 503 });

  const body = await req.json().catch(() => null) as { publicToken?: string; institution?: string } | null;
  if (!body?.publicToken) return NextResponse.json({ error: "Missing public token." }, { status: 400 });

  try {
    const { accessToken, itemId } = await exchangePublicToken(body.publicToken);
    const admin = createAdminClient();
    const { error: insErr } = await admin.from("bank_connections").upsert({
      user_id: user.id,
      provider: "plaid",
      item_id: itemId,
      access_token: accessToken,
      institution_name: body.institution?.slice(0, 120) ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "item_id" });
    if (insErr) {
      return NextResponse.json({ error: "Could not save the connection. Run supabase/bank-connections.sql first." }, { status: 500 });
    }
    const accounts = await syncBankConnection(user.id, itemId, accessToken);
    return NextResponse.json({ ok: true, accounts });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Bank link failed." }, { status: 502 });
  }
}
