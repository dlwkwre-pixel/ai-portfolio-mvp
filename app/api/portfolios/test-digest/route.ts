import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";
import crypto from "crypto";
import { buildDigestHtml, buildDigestSubject, type DigestTemplateData } from "@/lib/email/digest-template";
import { generateDigestPDF } from "@/lib/email/generate-pdf";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://buytuneio.vercel.app";

function makeUnsubToken(userId: string, portfolioId: string): string {
  const secret = process.env.UNSUBSCRIBE_SECRET ?? "buytune-unsub-secret";
  return crypto.createHmac("sha256", secret).update(`${userId}:${portfolioId}`).digest("hex");
}

async function fetchEarnings(
  tickers: string[], from: string, to: string
): Promise<{ ticker: string; company_name: string | null; report_date: string; estimate_eps: number | null }[]> {
  const key = process.env.NEXT_PUBLIC_FINNHUB_API_KEY ?? process.env.FINNHUB_API_KEY;
  if (!key || tickers.length === 0) return [];
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${key}`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const tickerSet = new Set(tickers.map((t) => t.toUpperCase()));
    return (data.earningsCalendar ?? [])
      .filter((item: { symbol?: string }) => tickerSet.has(item.symbol?.toUpperCase() ?? ""))
      .map((item: { symbol: string; company?: string; date: string; epsEstimate?: number }) => ({
        ticker: item.symbol,
        company_name: item.company ?? null,
        report_date: item.date,
        estimate_eps: typeof item.epsEstimate === "number" ? item.epsEstimate : null,
      }));
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { portfolioId } = await request.json() as { portfolioId: string };
  if (!portfolioId) return NextResponse.json({ error: "portfolioId required" }, { status: 400 });

  // Verify ownership
  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("id, name, cash_balance")
    .eq("id", portfolioId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!portfolio) return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });

  // Get user prefs (use defaults if none saved)
  const { data: prefs } = await supabase
    .from("portfolio_digest_preferences")
    .select("*")
    .eq("portfolio_id", portfolioId)
    .eq("user_id", user.id)
    .maybeSingle();

  const include_performance = prefs?.include_performance ?? true;
  const include_holdings    = prefs?.include_holdings    ?? true;
  const include_earnings    = prefs?.include_earnings    ?? true;
  const include_ai_score    = prefs?.include_ai_score    ?? false;
  const recipientEmail      = prefs?.email_override || user.email;
  if (!recipientEmail) return NextResponse.json({ error: "No email address" }, { status: 400 });

  const adminSupabase = createAdminClient();
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  // Performance
  let performance: DigestTemplateData["performance"] = null;
  if (include_performance) {
    const [{ data: recentSnaps }, { data: oldestSnap }] = await Promise.all([
      adminSupabase
        .from("portfolio_snapshots")
        .select("total_value, snapshot_date")
        .eq("portfolio_id", portfolioId)
        .order("snapshot_date", { ascending: false })
        .limit(30),
      adminSupabase
        .from("portfolio_snapshots")
        .select("total_value, snapshot_date")
        .eq("portfolio_id", portfolioId)
        .order("snapshot_date", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);
    if (recentSnaps && recentSnaps.length >= 1) {
      const latest = recentSnaps[0];
      const weekOld = recentSnaps.find((s) => s.snapshot_date.slice(0, 10) <= sevenDaysAgo);
      const latestVal = Number(latest.total_value);
      const weekOldVal = weekOld ? Number(weekOld.total_value) : null;
      const inceptionVal = oldestSnap ? Number(oldestSnap.total_value) : null;
      const isFirstSnap = oldestSnap?.snapshot_date === latest.snapshot_date;
      performance = {
        totalValue: latestVal,
        weekReturnPct: weekOldVal && weekOldVal > 0 ? Math.round(((latestVal - weekOldVal) / weekOldVal) * 1000) / 10 : null,
        weekReturnAbs: weekOldVal != null ? Math.round(latestVal - weekOldVal) : null,
        allTimeReturnPct: inceptionVal && inceptionVal > 0 && !isFirstSnap ? Math.round(((latestVal - inceptionVal) / inceptionVal) * 1000) / 10 : null,
        inceptionDate: oldestSnap?.snapshot_date ?? null,
      };
    }
  }

  // Holdings
  let holdings: DigestTemplateData["holdings"] = null;
  if (include_holdings) {
    const { data: pubPortfolio } = await adminSupabase
      .from("public_portfolios")
      .select("id")
      .eq("source_portfolio_id", portfolioId)
      .eq("is_public", true)
      .maybeSingle();
    if (pubPortfolio) {
      const { data: pubHoldings } = await adminSupabase
        .from("public_portfolio_holdings")
        .select("ticker, company_name, allocation_pct")
        .eq("public_portfolio_id", pubPortfolio.id)
        .eq("is_cash", false)
        .order("display_order")
        .limit(10);
      if (pubHoldings && pubHoldings.length > 0) {
        holdings = pubHoldings.map((h) => ({ ticker: h.ticker, company_name: h.company_name ?? null, allocation_pct: Number(h.allocation_pct) }));
      }
    }
    if (!holdings) {
      const { data: rawHoldings } = await adminSupabase
        .from("holdings")
        .select("ticker, company_name")
        .eq("portfolio_id", portfolioId)
        .order("ticker")
        .limit(10);
      if (rawHoldings && rawHoldings.length > 0) {
        holdings = rawHoldings.map((h) => ({ ticker: h.ticker, company_name: h.company_name ?? null, allocation_pct: null }));
      }
    }
  }

  // Earnings
  let earnings: DigestTemplateData["earnings"] = null;
  if (include_earnings) {
    const { data: rawHoldings } = await adminSupabase
      .from("holdings")
      .select("ticker")
      .eq("portfolio_id", portfolioId);
    const tickers = (rawHoldings ?? []).map((h) => h.ticker);
    if (tickers.length > 0) {
      const earningsData = await fetchEarnings(tickers, today, sevenDaysLater);
      earnings = earningsData.length > 0 ? earningsData : null;
    }
  }

  // AI Score
  let aiScore: DigestTemplateData["aiScore"] = null;
  if (include_ai_score) {
    const { data: lastRun } = await adminSupabase
      .from("recommendation_runs")
      .select("summary")
      .eq("portfolio_id", portfolioId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastRun?.summary) {
      const match = lastRun.summary.match(/Health Score:\s*(\d+)\/100/i);
      if (match) {
        const score = parseInt(match[1], 10);
        aiScore = { score, label: lastRun.summary.split("|")[0].trim() };
      }
    }
  }

  const token = makeUnsubToken(user.id, portfolioId);
  const unsubscribeUrl = `${SITE_URL}/api/unsubscribe?userId=${user.id}&portfolioId=${portfolioId}&token=${token}`;
  const templateData: DigestTemplateData = {
    portfolioName: portfolio.name,
    portfolioUrl: `${SITE_URL}/portfolios/${portfolioId}`,
    reportUrl: `${SITE_URL}/portfolios/${portfolioId}/report`,
    manageUrl: `${SITE_URL}/portfolios/${portfolioId}?tab=emails`,
    unsubscribeUrl,
    performance,
    holdings,
    earnings,
    aiScore,
    sentAt: now.toISOString(),
  };

  const html = buildDigestHtml(templateData);
  const subject = `[TEST] ${buildDigestSubject(portfolio.name, performance)}`;
  const resend = new Resend(resendKey);
  const fromAddress = process.env.RESEND_FROM_EMAIL ?? "digest@buytune.io";

  const dateSlug = now.toISOString().slice(0, 10);
  const safePortfolioName = portfolio.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  let pdfBuffer: Buffer | null = null;
  try {
    pdfBuffer = await generateDigestPDF(templateData);
  } catch (pdfErr) {
    console.error("PDF generation failed (non-fatal):", pdfErr);
  }

  const { error: sendError } = await resend.emails.send({
    from: fromAddress,
    to: recipientEmail,
    subject,
    html,
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    ...(pdfBuffer ? {
      attachments: [{
        filename: `${safePortfolioName}-investor-update-${dateSlug}.pdf`,
        content: pdfBuffer.toString("base64"),
      }],
    } : {}),
  });
  if (sendError) {
    return NextResponse.json({ error: sendError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sentTo: recipientEmail });
}
