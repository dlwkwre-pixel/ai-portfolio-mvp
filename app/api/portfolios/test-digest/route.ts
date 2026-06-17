import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";
import crypto from "crypto";
import { buildDigestHtml, buildDigestSubject, type DigestTemplateData } from "@/lib/email/digest-template";
import { generateDigestPDF } from "@/lib/email/generate-pdf";
import { getFinnhubQuote } from "@/lib/market-data/finnhub";
import { buildExtraDigestSections } from "@/lib/email/build-digest-sections";
import { calculateTwr } from "@/lib/portfolio/twr";

export const maxDuration = 60;

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
    .select("id, name, cash_balance, benchmark_symbol")
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

  // Period framing follows the saved frequency (default weekly)
  const period: "day" | "week" | "month" =
    prefs?.frequency === "daily_close" ? "day" : prefs?.frequency === "monthly_first" ? "month" : "week";
  const periodDays = period === "day" ? 1 : period === "month" ? 30 : 7;
  const periodStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
  const dayLabel = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const periodLabel = period === "day" ? "Today" : period === "month" ? "This Month" : "This Week";
  const periodWord = period === "day" ? "today" : period === "month" ? "this month" : "this week";
  const periodHeading = period === "day"
    ? dayLabel
    : period === "month"
    ? now.toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : `Week ending ${dayLabel}`;

  // Performance — net (TWR) return, deposit-neutral like the charts
  let performance: DigestTemplateData["performance"] = null;
  if (include_performance) {
    const [{ data: snapsRaw }, { data: flowsRaw }] = await Promise.all([
      adminSupabase
        .from("portfolio_snapshots")
        .select("total_value, snapshot_date")
        .eq("portfolio_id", portfolioId)
        .order("snapshot_date", { ascending: true })
        .limit(1000),
      adminSupabase
        .from("cash_ledger")
        .select("amount, direction, effective_at")
        .eq("portfolio_id", portfolioId),
    ]);
    const snaps = (snapsRaw ?? [])
      .map((s) => ({ snapshot_date: s.snapshot_date as string, total_value: Number(s.total_value) }))
      .filter((s) => Number.isFinite(s.total_value) && s.total_value > 0);
    const cashFlows = (flowsRaw ?? []).map((f) => ({
      effective_at: f.effective_at as string,
      direction: (f.direction as string | null) ?? "IN",
      amount: Number(f.amount ?? 0),
    }));
    if (snaps.length > 0) {
      const latestVal = snaps[snaps.length - 1].total_value;
      const allTimeReturnPct = calculateTwr(snaps, cashFlows);
      let baselineIdx = -1;
      for (let i = 0; i < snaps.length; i++) {
        if (new Date(snaps[i].snapshot_date) <= periodStart) baselineIdx = i; else break;
      }
      if (baselineIdx < 0) baselineIdx = 0;
      const periodSnaps = snaps.slice(baselineIdx);
      const baselineVal = periodSnaps[0]?.total_value ?? null;
      const periodTwr = calculateTwr(periodSnaps, cashFlows);
      const periodReturnAbs = baselineVal != null && periodTwr != null ? baselineVal * (periodTwr / 100) : null;
      performance = {
        totalValue: latestVal,
        weekReturnPct: periodTwr != null ? Math.round(periodTwr * 10) / 10 : null,
        weekReturnAbs: periodReturnAbs != null ? Math.round(periodReturnAbs) : null,
        allTimeReturnPct: allTimeReturnPct != null ? Math.round(allTimeReturnPct * 10) / 10 : null,
        inceptionDate: snaps[0].snapshot_date,
      };
    }
  }

  // Holdings — fetch live prices from Finnhub, works for public and private portfolios
  let holdings: DigestTemplateData["holdings"] = null;
  if (include_holdings) {
    const { data: rawHoldings } = await adminSupabase
      .from("holdings")
      .select("ticker, company_name, shares, average_cost_basis")
      .eq("portfolio_id", portfolioId)
      .order("ticker");
    if (rawHoldings && rawHoldings.length > 0) {
      // Batch-fetch quotes in groups of 3 (Finnhub rate limit)
      const quotes: Record<string, number> = {};
      const BATCH = 3;
      for (let i = 0; i < rawHoldings.length; i += BATCH) {
        const batch = rawHoldings.slice(i, i + BATCH);
        await Promise.all(batch.map(async (h) => {
          const q = await getFinnhubQuote(h.ticker);
          quotes[h.ticker] = q?.c ?? (Number(h.average_cost_basis) || 0);
        }));
        if (i + BATCH < rawHoldings.length) await new Promise(r => setTimeout(r, 300));
      }
      // Compute market values
      const withValues = rawHoldings.map((h) => ({
        ticker: h.ticker,
        company_name: h.company_name ?? null,
        marketValue: Number(h.shares) * (quotes[h.ticker] ?? 0),
      }));
      const cashBalance = Number(portfolio.cash_balance ?? 0);
      const totalValue = withValues.reduce((s, h) => s + h.marketValue, 0) + cashBalance;
      if (totalValue > 0) {
        holdings = withValues
          .filter((h) => h.marketValue > 0)
          .sort((a, b) => b.marketValue - a.marketValue)
          .slice(0, 10)
          .map((h) => ({
            ticker: h.ticker,
            company_name: h.company_name,
            allocation_pct: Math.round((h.marketValue / totalValue) * 1000) / 10,
          }));
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

  // Optional "design your email" sections — same engine the scheduled digest uses
  const extra = await buildExtraDigestSections(
    adminSupabase,
    {
      include_top_movers:   prefs?.include_top_movers   ?? true,
      include_benchmark:    prefs?.include_benchmark    ?? false,
      include_ai_recs:      prefs?.include_ai_recs      ?? false,
      include_week_ahead:   prefs?.include_week_ahead   ?? false,
      include_news:         prefs?.include_news         ?? false,
      include_transactions: prefs?.include_transactions ?? false,
      include_cash:         prefs?.include_cash         ?? false,
    },
    portfolio,
    now,
  );

  const token = makeUnsubToken(user.id, portfolioId);
  const unsubscribeUrl = `${SITE_URL}/api/unsubscribe?userId=${user.id}&portfolioId=${portfolioId}&token=${token}`;
  const templateData: DigestTemplateData = {
    portfolioName: portfolio.name,
    portfolioUrl: `${SITE_URL}/portfolios/${portfolioId}`,
    reportUrl: `${SITE_URL}/portfolios/${portfolioId}/report`,
    manageUrl: `${SITE_URL}/portfolios/${portfolioId}?tab=emails`,
    unsubscribeUrl,
    periodLabel,
    periodWord,
    periodHeading,
    performance,
    holdings,
    earnings,
    aiScore,
    ...extra,
    sentAt: now.toISOString(),
  };

  const html = buildDigestHtml(templateData);
  const subject = `[TEST] ${buildDigestSubject(portfolio.name, performance, periodWord)}`;
  const resend = new Resend(resendKey);
  const fromAddress = process.env.RESEND_FROM_EMAIL ?? "digest@buytune.io";

  const dateSlug = now.toISOString().slice(0, 10);
  const safePortfolioName = portfolio.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  let pdfBuffer: Buffer | null = null;
  if ((prefs?.attach_pdf ?? true) !== false) {
    try {
      pdfBuffer = await generateDigestPDF(templateData);
    } catch (pdfErr) {
      console.error("PDF generation failed (non-fatal):", pdfErr);
    }
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
