import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";
import crypto from "crypto";
import { buildDigestHtml, buildDigestSubject, type DigestTemplateData } from "@/lib/email/digest-template";
import { generateDigestPDF } from "@/lib/email/generate-pdf";
import { getFinnhubQuote } from "@/lib/market-data/finnhub";
import { getCongressTrades } from "@/lib/market-data/quiver";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://buytuneio.vercel.app";

// Get the current hour (0-23) in the user's local timezone
function getLocalHour(date: Date, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: timezone,
    }).formatToParts(date);
    const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0");
    return h === 24 ? 0 : h; // Intl can return 24 for midnight
  } catch {
    return date.getUTCHours();
  }
}

// Use local timezone date for weekday/month-day checks
function shouldSendNow(frequency: string, sendHour: number, timezone: string, now: Date): boolean {
  const localHour = getLocalHour(now, timezone);
  if (localHour !== sendHour) return false;

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      day: "numeric",
      timeZone: timezone,
    }).formatToParts(now);

    const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
    const dayOfMonth = parseInt(parts.find((p) => p.type === "day")?.value ?? "0");

    switch (frequency) {
      case "daily_close":   return !["Saturday", "Sunday"].includes(weekday);
      case "weekly_monday": return weekday === "Monday";
      case "weekly_friday": return weekday === "Friday";
      case "monthly_first": return dayOfMonth === 1;
      default: return false;
    }
  } catch {
    return false;
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
    .select("id, portfolio_id, user_id, frequency, include_performance, include_holdings, include_earnings, include_ai_score, email_override, send_hour, timezone")
    .eq("enabled", true);

  if (prefsError) {
    console.error("Failed to load digest prefs:", prefsError.message);
    return NextResponse.json({ error: prefsError.message }, { status: 500 });
  }

  const todayPrefs = (allPrefs ?? []).filter((p) =>
    shouldSendNow(p.frequency, p.send_hour ?? 16, p.timezone ?? "America/Chicago", now)
  );
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
        const [{ data: recentSnaps }, { data: oldestSnap }] = await Promise.all([
          adminSupabase
            .from("portfolio_snapshots")
            .select("total_value, snapshot_date")
            .eq("portfolio_id", pref.portfolio_id)
            .order("snapshot_date", { ascending: false })
            .limit(30),
          adminSupabase
            .from("portfolio_snapshots")
            .select("total_value, snapshot_date")
            .eq("portfolio_id", pref.portfolio_id)
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

      // ── Holdings — live Finnhub prices, works for public and private portfolios ─
      let holdings: DigestTemplateData["holdings"] = null;
      if (pref.include_holdings) {
        const { data: rawHoldings } = await adminSupabase
          .from("holdings")
          .select("ticker, company_name, shares, avg_cost")
          .eq("portfolio_id", pref.portfolio_id)
          .order("ticker");
        if (rawHoldings && rawHoldings.length > 0) {
          const quotes: Record<string, number> = {};
          const BATCH = 3;
          for (let i = 0; i < rawHoldings.length; i += BATCH) {
            const batch = rawHoldings.slice(i, i + BATCH);
            await Promise.all(batch.map(async (h) => {
              const q = await getFinnhubQuote(h.ticker);
              quotes[h.ticker] = q?.c ?? (Number(h.avg_cost) || 0);
            }));
            if (i + BATCH < rawHoldings.length) await new Promise(r => setTimeout(r, 300));
          }
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

      // ── Congressional trades ──────────────────────────────────────────────────
      let congressTrades: DigestTemplateData["congressTrades"] = null;
      if (process.env.QUIVER_API_KEY) {
        const { data: holdingRows } = await adminSupabase
          .from("holdings")
          .select("ticker")
          .eq("portfolio_id", pref.portfolio_id);
        const tickers = [...new Set((holdingRows ?? []).map((h) => h.ticker))];
        if (tickers.length > 0) {
          const cutoff = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
          const results = await Promise.all(
            tickers.slice(0, 10).map((t) => getCongressTrades(t))
          );
          const recent = results.flat()
            .filter((t) => t.transactionDate >= cutoff)
            .sort((a, b) => new Date(b.transactionDate).getTime() - new Date(a.transactionDate).getTime())
            .slice(0, 10);
          if (recent.length > 0) congressTrades = recent;
        }
      }

      // ── Build + send ──────────────────────────────────────────────────────────
      const token = makeUnsubToken(pref.user_id, pref.portfolio_id);
      const portfolioUrl = `${SITE_URL}/portfolios/${pref.portfolio_id}`;
      const reportUrl = `${SITE_URL}/portfolios/${pref.portfolio_id}/report`;
      const manageUrl = `${SITE_URL}/portfolios/${pref.portfolio_id}?tab=emails`;
      const unsubscribeUrl = `${SITE_URL}/api/unsubscribe?userId=${pref.user_id}&portfolioId=${pref.portfolio_id}&token=${token}`;

      const templateData: DigestTemplateData = {
        portfolioName: portfolio.name,
        portfolioUrl,
        reportUrl,
        manageUrl,
        unsubscribeUrl,
        performance,
        holdings,
        earnings,
        aiScore,
        congressTrades,
        sentAt: now.toISOString(),
      };

      const html = buildDigestHtml(templateData);
      const subject = buildDigestSubject(portfolio.name, performance);
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
