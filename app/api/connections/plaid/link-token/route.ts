import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hasFeatureAccess } from "@/lib/access/feature-access";
import { plaidConfigured, createLinkToken } from "@/lib/connections/plaid";

export const maxDuration = 30;

// Start a Plaid Link session: returns a short-lived link_token the client opens the
// Plaid widget with. Gated by the bank_connect feature flag.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await hasFeatureAccess(user.id, "bank_connect"))) {
    return NextResponse.json({ error: "Bank connections are in private beta." }, { status: 403 });
  }
  if (!plaidConfigured()) return NextResponse.json({ error: "Plaid is not configured." }, { status: 503 });

  try {
    const linkToken = await createLinkToken(user.id);
    return NextResponse.json({ linkToken });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not start Plaid Link." }, { status: 502 });
  }
}
