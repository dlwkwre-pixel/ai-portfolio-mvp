import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    // Triggers an expensive Grok portfolio run — hard cap per user
    const { limited, retryAfter } = checkRateLimit(`onboarding-scan:${user.id}`, 5, 10 * 60_000);
    if (limited) return NextResponse.json({ error: "Too many analysis runs. Please wait a few minutes." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });

    const body = await req.json() as { portfolio_id: string };
    if (!body.portfolio_id) return NextResponse.json({ error: "portfolio_id required" }, { status: 400 });

    // Verify ownership
    const { data: portfolio } = await supabase
      .from("portfolios")
      .select("id")
      .eq("id", body.portfolio_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!portfolio) return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });

    const { runPortfolioAiRecommendation } = await import(
      "@/app/portfolios/[id]/recommendation-actions"
    );
    const fd = new FormData();
    fd.set("portfolio_id", body.portfolio_id);
    await runPortfolioAiRecommendation(fd);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Scan failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
