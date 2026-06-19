import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Resend } from "resend";
import crypto from "crypto";
import { buildDigestHtml, buildDigestSubject, type DigestTemplateData } from "@/lib/email/digest-template";
import { generateDigestPDF } from "@/lib/email/generate-pdf";
import { getFinnhubQuote } from "@/lib/market-data/finnhub";
import { buildExtraDigestSections } from "@/lib/email/build-digest-sections";
import { calculateTwr } from "@/lib/portfolio/twr";
import { sanitizeSnapshots } from "@/lib/portfolio/benchmark";


const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://buytune.io";

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

function obfuscateEmail(email: string): string {
  const at = email.indexOf("@");
  if (at < 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = Math.min(3, Math.floor(local.length / 2));
  return `${local.slice(0, visible)}***@${domain}`;
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

export const maxDuration = 60;

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
    .select("id, portfolio_id, user_id, frequency, include_performance, include_holdings, include_earnings, include_ai_score, include_top_movers, include_benchmark, include_ai_recs, include_week_ahead, include_news, include_transactions, include_cash, attach_pdf, email_override, send_hour, timezone")
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
        .select("id, name, cash_balance, benchmark_symbol")
        .eq("id", pref.portfolio_id)
        .maybeSingle();
      if (!portfolio) continue;

      // ── Period framing — all verbiage follows the digest frequency ───────────
      const period: "day" | "week" | "month" =
        pref.frequency === "daily_close" ? "day" : pref.frequency === "monthly_first" ? "month" : "week";
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

      // ── Performance — net (time-weighted) return, deposit-neutral like the charts ─
      let performance: DigestTemplateData["performance"] = null;
      if (pref.include_performance) {
        const [{ data: snapsRaw }, { data: flowsRaw }, { data: holdingsForBasis }] = await Promise.all([
          adminSupabase
            .from("portfolio_snapshots")
            .select("total_value, snapshot_date")
            .eq("portfolio_id", pref.portfolio_id)
            .order("snapshot_date", { ascending: true })
            .limit(1000),
          adminSupabase
            .from("cash_ledger")
            .select("amount, direction, effective_at")
            .eq("portfolio_id", pref.portfolio_id),
          adminSupabase
            .from("holdings")
            .select("shares, average_cost_basis")
            .eq("portfolio_id", pref.portfolio_id),
        ]);

        // Cost basis lets us trim the near-zero "reconstruction ramp-up" snapshots
        // exactly like the chart does (sanitizeSnapshots), so the email's net
        // return matches what the user sees on the chart.
        const totalCostBasis = (holdingsForBasis ?? []).reduce(
          (s, h) => s + Number(h.shares ?? 0) * Number(h.average_cost_basis ?? 0), 0
        );
        const rawSnaps = (snapsRaw ?? [])
          .map((s) => ({ snapshot_date: s.snapshot_date as string, total_value: Number(s.total_value) }))
          .filter((s) => Number.isFinite(s.total_value) && s.total_value > 0);
        const snaps = sanitizeSnapshots(rawSnaps, totalCostBasis);
        const cashFlows = (flowsRaw ?? []).map((f) => ({
          effective_at: f.effective_at as string,
          direction: (f.direction as string | null) ?? "IN",
          amount: Number(f.amount ?? 0),
        }));

        if (snaps.length > 0) {
          const latestVal = snaps[snaps.length - 1].total_value;

          // Net return since inception (TWR — strips out deposits/withdrawals)
          const allTimeReturnPct = calculateTwr(snaps, cashFlows);

          // Period net return: baseline = last snapshot on/before the period start
          let baselineIdx = -1;
          for (let i = 0; i < snaps.length; i++) {
            if (new Date(snaps[i].snapshot_date) <= periodStart) baselineIdx = i; else break;
          }
          if (baselineIdx < 0) baselineIdx = 0;
          const periodSnaps = snaps.slice(baselineIdx);
          const baselineVal = periodSnaps[0]?.total_value ?? null;
          const periodTwr = calculateTwr(periodSnaps, cashFlows);
          // Deposit-neutral dollar gain implied by the net return over the period
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

      // ── Holdings — live Finnhub prices, works for public and private portfolios ─
      let holdings: DigestTemplateData["holdings"] = null;
      if (pref.include_holdings) {
        const { data: rawHoldings } = await adminSupabase
          .from("holdings")
          .select("ticker, company_name, shares, average_cost_basis")
          .eq("portfolio_id", pref.portfolio_id)
          .order("ticker");
        if (rawHoldings && rawHoldings.length > 0) {
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
            // Pass the full assessment, not just the first segment — strip the
            // redundant "Health Score: X/100" token and join remaining parts.
            const cleaned = lastRun.summary
              .replace(/Health Score:\s*\d+\/100/i, "")
              .split("|").map((s: string) => s.trim()).filter(Boolean).join(" — ");
            aiScore = { score, label: cleaned || lastRun.summary.trim() };
          }
        }
      }

      // ── Optional "design your email" sections (shared with test-digest) ───────
      const extra = await buildExtraDigestSections(adminSupabase, pref, portfolio, now);


      // ── Build + send ──────────────────────────────────────────────────────────
      const token = makeUnsubToken(pref.user_id, pref.portfolio_id);
      const accountHint = authUser?.email ? encodeURIComponent(obfuscateEmail(authUser.email)) : null;
      const portfolioUrl = `${SITE_URL}/portfolios/${pref.portfolio_id}${accountHint ? `?account=${accountHint}` : ""}`;
      const reportUrl = `${SITE_URL}/portfolios/${pref.portfolio_id}/report`;
      const manageUrl = `${SITE_URL}/portfolios/${pref.portfolio_id}?tab=emails`;
      const unsubscribeUrl = `${SITE_URL}/api/unsubscribe?userId=${pref.user_id}&portfolioId=${pref.portfolio_id}&token=${token}`;

      const templateData: DigestTemplateData = {
        portfolioName: portfolio.name,
        portfolioUrl,
        reportUrl,
        manageUrl,
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
      const subject = buildDigestSubject(portfolio.name, performance, periodWord);
      const fromAddress = process.env.RESEND_FROM_EMAIL ?? "digest@buytune.io";

      const dateSlug = now.toISOString().slice(0, 10);
      const safePortfolioName = portfolio.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
      let pdfBuffer: Buffer | null = null;
      if (pref.attach_pdf !== false) {
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
