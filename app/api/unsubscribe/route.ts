import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import crypto from "crypto";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://buytune.io";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const portfolioId = searchParams.get("portfolioId");
  const token = searchParams.get("token");

  if (!userId || !portfolioId || !token) {
    return new NextResponse("Invalid unsubscribe link.", { status: 400 });
  }

  const secret = process.env.UNSUBSCRIBE_SECRET ?? "buytune-unsub-secret";
  const expected = crypto.createHmac("sha256", secret).update(`${userId}:${portfolioId}`).digest("hex");

  if (expected !== token) {
    return new NextResponse("Invalid or expired unsubscribe link.", { status: 400 });
  }

  try {
    const adminSupabase = createAdminClient();
    await adminSupabase
      .from("portfolio_digest_preferences")
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("portfolio_id", portfolioId);
  } catch {
    return new NextResponse("Something went wrong. Please try again.", { status: 500 });
  }

  // Redirect to a friendly confirmation page
  return NextResponse.redirect(`${SITE_URL}/portfolios/${portfolioId}?tab=emails&unsubscribed=1`);
}
