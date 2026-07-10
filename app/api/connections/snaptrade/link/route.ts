import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasFeatureAccess } from "@/lib/access/feature-access";
import { getSnaptrade, snaptradeConfigured } from "@/lib/connections/snaptrade";

// Registers the user with SnapTrade (once) and returns a connection-portal URL the
// user opens to link Robinhood. Gated: only users granted brokerage_connect.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await hasFeatureAccess(user.id, "brokerage_connect"))) {
    return NextResponse.json({ error: "Brokerage connections are in private beta." }, { status: 403 });
  }
  if (!snaptradeConfigured()) return NextResponse.json({ error: "SnapTrade is not configured." }, { status: 503 });

  const snaptrade = getSnaptrade()!;
  const admin = createAdminClient();

  try {
    // Load or create the connection row.
    const { data: existing } = await admin
      .from("brokerage_connections").select("*").eq("user_id", user.id).eq("provider", "snaptrade").maybeSingle();

    let snapUserId = existing?.snaptrade_user_id as string | undefined;
    let snapUserSecret = existing?.snaptrade_user_secret as string | undefined;

    if (!snapUserId || !snapUserSecret) {
      snapUserId = user.id;
      const reg = await snaptrade.authentication.registerSnapTradeUser({ userId: snapUserId });
      snapUserSecret = reg.data.userSecret ?? undefined;
      if (!snapUserSecret) return NextResponse.json({ error: "Could not register with SnapTrade." }, { status: 502 });
      await admin.from("brokerage_connections").upsert(
        { user_id: user.id, provider: "snaptrade", snaptrade_user_id: snapUserId, snaptrade_user_secret: snapUserSecret, updated_at: new Date().toISOString() },
        { onConflict: "user_id,provider" },
      );
    }

    // Generate the connection portal URL.
    const login = await snaptrade.authentication.loginSnapTradeUser({ userId: snapUserId, userSecret: snapUserSecret });
    const redirectURI = (login.data as { redirectURI?: string })?.redirectURI;
    if (!redirectURI) return NextResponse.json({ error: "Could not open the connection portal." }, { status: 502 });

    return NextResponse.json({ redirectURI });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to start connection.";
    return NextResponse.json({ error: msg.includes("brokerage_connections") ? "Run supabase/brokerage-connections.sql first." : msg }, { status: 500 });
  }
}
