import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeatureAccess } from "@/lib/access/feature-access";
import { plaidConfigured, createLinkToken } from "@/lib/connections/plaid";

export const maxDuration = 30;

// Start a Plaid Link session: returns a short-lived link_token the client opens the
// Plaid widget with. Gated by the bank_connect feature flag. Body { itemId } reconnects
// one of the user's existing banks (update mode) instead of linking a new one.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await hasFeatureAccess(user.id, "bank_connect"))) {
    return NextResponse.json({ error: "Bank connections are in private beta." }, { status: 403 });
  }
  if (!plaidConfigured()) return NextResponse.json({ error: "Plaid is not configured." }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { itemId?: unknown } | null;
  const itemId = typeof body?.itemId === "string" ? body.itemId : null;
  let accessToken: string | undefined;
  if (itemId) {
    const { data: conn } = await createAdminClient()
      .from("bank_connections").select("access_token")
      .eq("user_id", user.id).eq("item_id", itemId).maybeSingle();
    if (!conn?.access_token) return NextResponse.json({ error: "That bank connection wasn't found." }, { status: 404 });
    accessToken = conn.access_token as string;
  }

  try {
    const linkToken = await createLinkToken(user.id, accessToken);
    return NextResponse.json({ linkToken });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not start Plaid Link." }, { status: 502 });
  }
}
