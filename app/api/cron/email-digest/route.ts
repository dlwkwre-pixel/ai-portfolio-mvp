import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";
import crypto from "crypto";
import { buildDigestHtml, buildDigestSubject, type DigestTemplateData } from "@/lib/email/digest-template";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://buytune.io";

function shouldSendToday(frequency: string, now: Date): boolean {
  const day = now.getUTCDay(); // 0=Sun … 6=Sat
  const date = now.getUTCDate();
  switch (frequency) {
    case "daily_close":    return day >= 1 && day <= 5;
    case "weekly_monday":  return day === 1;
    case "weekly_friday":  return day === 5;
    case "monthly_first":  return date === 1;
    default: return false;
  }
}

function makeUnsubToken(userId: string, portfolioId: string): string {
  const secret = process.env.UNSUBSCRIBE_SECRET ?? "buytune-unsub-secret";
  return crypto.createHmac("sha256", secret).update(`${userId}:${portfolioId}`).digest("hex");
}

async function fetchEarnings(tickers: string[], from: string, to: string): Promise<
  { ticker: string; company_name: string | null; report_date: string; estimate_eps: number | null }[]
> {
  const key = process.env.NEXT_PUBLIC_FINNHUB_API_KEY ?? process.env.FINNHUB_API_KEY;
  if (!key || tickers.length === 0) return [];

  const results: { ticker: string; company_name: string | null; report_date: string; estimate_eps: number | null }[] = [];
  // Batch all tickers in one calendar request (Finnhub supports date-range calendar without a symbol filter)
  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to}&token=${key}`,
      { cache: "no-store" }
    );
    if (res.ok) {
      const data = await res.json();
      const tickerSet = new Set(tickers.map((t) => t.toUpperCase()));
      for (const item of (data.earningsCalendar ?? [])) {
        if (tickerSet.has(item.symbol?.toUpperCase())) {
          results.push({
            ticker: item.symbol,
            company_name: item.company ?? null,
            report_date: item.date,
            estimate_eps: typeof item.epsEstimate === "number" ? item.epsEstimate : null,
          });
        }
      }
    }
  } catch {
    // non-fatal — earnings section will be omitted
  }
  return results;
}

export async function GET(request: Request) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });
  }

  let adminSupabase: ReturnType<typeof createAdminClient>;
  try {
    adminSupabase = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Service role key not configured" }, { status: 500 });
  }

  const resend = new Resend(resendKey);
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  // Load all enabled preferences whose frequency matches today
  const { data: allPrefs, error: prefsError } = await adminSupabase
    .from("portfolio_digest_preferences")
    .select("id, portfolio_id, user_id, frequency, include_performance, include_holdings, include_earnings, include_ai_score, email_override")
    .eq("enabled", true);

  if (prefsError) {
    console.error("Failed to load digest prefs:", prefsError.message);
    return NextResponse.json({ error: prefsError.message }, { status: 500 });
  }

  const todayPrefs = (allPrefs ?? []).filter((p) => shouldSendToday(p.frequency, now));
  if (todayPrefs.length === 0) {
    return NextResponse.json({ message: "No digests to send today.", sent: 0 });
  }

  let sent = 0;
  let errors = 0;

  for (const pref of todayPrefs) {
    try {
      // Get user's email via admin auth API
      const { data: { user: authUser } } = await adminSupabase.auth.admin.getUserById(pref.user_id);
      const recipientEmail = pref.email_override || authUser?.email;
      if (!recipientEmail) continue;

      // Get portfolio name
      const { data: portfolio } = await adminSupabase
        .from("portfolios")
        .select("id, name, cash_balance")
        .eq("id", pref.portfolio_id)
        .maybeSingle();
      if (!portfolio) continue;

      // ── Performance ──────────────────────────────────────────────────────────
      let performance: DigestTemplateData["performance"] = null;
      if (pref.include_performance) {
        const { data: snapshots } = await adminSupabase
          .from("portfolio_snapshots")
          .select("total_value, snapshot_date")
          .eq("portfolio_id", pref.portfolio_id)
          .order("snapshot_date", { ascending: false })
          .limit(30);

        if (snapshots && snapshots.length >= 2) {
          const latest = snapshots[0];
          const weekOld = snapshots.find((s) => s.snapshot_date.slice(0, 10) <= sevenDaysAgo) ?? snapshots[snapshots.length - 1];
          const oldest = snapshots[snapshots.length - 1];

          const latestVal = Number(latest.total_value);
          const weekOldVal = Number(weekOld.total_value);
          const oldestVal = Number(oldest.total_value);

          const weekReturnAbs = latestVal - weekOldVal;
          const weekReturnPct = weekOldVal > 0 ? ((latestVal - weekOldVal) / weekOldVal) * 100 : null;
          const allTimeReturnPct = oldestVal > 0 ? ((latestVal - oldestVal) / oldestVal) * 100 : null;

          performance = {
            totalValue: latestVal,
            allTimeReturnPct: allTimeReturnPct != null ? Math.round(allTimeReturnPct * 10) / 10 : null,
            weekReturnPct: weekReturnPct != null ? Math.round(weekReturnPct * 10) / 10 : null,
            weekReturnAbs: Math.round(weekReturnAbs),
          };
        }
      }

      // ── Holdings ─────────────────────────────────────────────────────────────
      let holdings: DigestTemplateData["holdings"] = null;
      if (pref.include_holdings) {
        // Prefer public portfolio holdings (have allocation %)
        const { data: pubPortfolio } = await adminSupabase
          .from("public_portfolios")
          .select("id")
          .eq("source_portfolio_id", pref.portfolio_id)
          .eq("is_public", true)
          .maybeSingle();

        if (pubPortfolio) {
          const { data: pubHoldings } = await adminSupabase
            .from("public_portfolio_holdings")
            .select("ticker, company_name, allocation_pct")
            .eq("public_portfolio_id", pubPortfolio.id)
            .eq("is_cash", false)
            .order("display_order")
            .limit(5);
          if (pubHoldings && pubHoldings.length > 0) {
            holdings = pubHoldings.map((h) => ({
              ticker: h.ticker,
              company_name: h.company_name ?? null,
              allocation_pct: Number(h.allocation_pct),
            }));
          }
        }

        // Fallback: raw holdings (no allocation %, just names)
        if (!holdings) {
          const { data: rawHoldings } = await adminSupabase
            .from("holdings")
            .select("ticker, company_name")
            .eq("portfolio_id", pref.portfolio_id)
            .order("ticker")
            .limit(5);
          if (rawHoldings && rawHoldings.length > 0) {
            holdings = rawHoldings.map((h) => ({
              ticker: h.ticker,
              company_name: h.company_name ?? null,
              allocation_pct: null,
            }));
          }
        }
      }

      // ── Earnings ─────────────────────────────────────────────────────────────
      let earnings: DigestTemplateData["earnings"] = null;
      if (pref.include_earnings) {
        const { data: rawHoldings } = await adminSupabase
          .from("holdings")
          .select("ticker, company_name")
          .eq("portfolio_id", pref.portfolio_id);
        const tickers = (rawHoldings ?? []).map((h) => h.ticker);
        if (tickers.length > 0) {
          const earningsData = await fetchEarnings(tickers, today, sevenDaysLater);
          earnings = earningsData.length > 0 ? earningsData : null;
        }
      }

      // ── AI Score ─────────────────────────────────────────────────────────────
      let aiScore: DigestTemplateData["aiScore"] = null;
      if (pref.include_ai_score) {
        const { data: lastRun } = await adminSupabase
          .from("recommendation_runs")
          .select("summary")
          .eq("portfolio_id", pref.portfolio_id)
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

      // ── Build + send ──────────────────────────────────────────────────────────
      const token = makeUnsubToken(pref.user_id, pref.portfolio_id);
      const portfolioUrl = `${SITE_URL}/portfolios/${pref.portfolio_id}`;
      const manageUrl = `${SITE_URL}/portfolios/${pref.portfolio_id}?tab=emails`;
      const unsubscribeUrl = `${SITE_URL}/api/unsubscribe?userId=${pref.user_id}&portfolioId=${pref.portfolio_id}&token=${token}`;

      const templateData: DigestTemplateData = {
        portfolioName: portfolio.name,
        portfolioUrl,
        manageUrl,
        unsubscribeUrl,
        performance,
        holdings,
        earnings,
        aiScore,
        sentAt: now.toISOString(),
      };

      const html = buildDigestHtml(templateData);
      const subject = buildDigestSubject(portfolio.name, performance);

      const fromAddress = process.env.RESEND_FROM_EMAIL ?? "digest@buytune.io";

      const { error: sendError } = await resend.emails.send({
        from: fromAddress,
        to: recipientEmail,
        subject,
        html,
      });

      if (sendError) {
        console.error(`Failed to send digest for portfolio ${pref.portfolio_id}:`, sendError);
        errors++;
        continue;
      }

      // Update last_sent_at
      await adminSupabase
        .from("portfolio_digest_preferences")
        .update({ last_sent_at: now.toISOString() })
        .eq("id", pref.id);

      sent++;
    } catch (err) {
      console.error(`Error processing digest for portfolio ${pref.portfolio_id}:`, err);
      errors++;
    }
  }

  return NextResponse.json({ message: "Digest run complete.", sent, errors, eligible: todayPrefs.length });
}
