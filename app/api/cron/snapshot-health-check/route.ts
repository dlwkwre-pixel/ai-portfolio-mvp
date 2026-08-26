import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";

// Runs after daily-snapshot (20:00 UTC) and email-digest (21:00 UTC) each day.
// The digest silently shows a flat $0 return when a portfolio's snapshot goes
// stale — there was no other signal that would surface a cron miss (see the
// 2026-08-19 to 2026-08-24 gap: no alert fired, the user only noticed because
// the digest number looked wrong). This exists purely to close that gap.

const resend = new Resend(process.env.RESEND_API_KEY);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const STALE_THRESHOLD_HOURS = 36;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured." }, { status: 500 });
  }

  const { data: portfolios, error: portfoliosError } = await supabase
    .from("portfolios")
    .select("id, name, user_id")
    .eq("is_active", true);

  if (portfoliosError) {
    console.error("snapshot-health-check: failed to fetch portfolios:", portfoliosError.message);
    return NextResponse.json({ error: portfoliosError.message }, { status: 500 });
  }
  if (!portfolios || portfolios.length === 0) {
    return NextResponse.json({ message: "No active portfolios." });
  }

  const staleCutoff = new Date(Date.now() - STALE_THRESHOLD_HOURS * 60 * 60 * 1000);
  const stalePortfolios: { id: string; name: string; lastSnapshotAt: string | null }[] = [];

  for (const portfolio of portfolios) {
    const { data: latest } = await supabase
      .from("portfolio_snapshots")
      .select("created_at")
      .eq("portfolio_id", portfolio.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastSnapshotAt = (latest?.created_at as string | undefined) ?? null;
    const isStale = !lastSnapshotAt || new Date(lastSnapshotAt) < staleCutoff;
    if (isStale) {
      stalePortfolios.push({ id: portfolio.id, name: portfolio.name as string, lastSnapshotAt });
    }
  }

  if (stalePortfolios.length === 0) {
    return NextResponse.json({ message: "All active portfolios have fresh snapshots.", checked: portfolios.length });
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    console.error(
      `snapshot-health-check: ${stalePortfolios.length} stale portfolio(s) but ADMIN_EMAIL not configured — no alert sent.`,
      stalePortfolios.map((p) => p.id)
    );
    return NextResponse.json({ stale: stalePortfolios.length, checked: portfolios.length, alertSent: false, portfolios: stalePortfolios });
  }

  const fromAddress = process.env.RESEND_FROM_EMAIL ?? "alerts@buytune.io";
  const rows = stalePortfolios
    .map((p) => `
      <tr>
        <td style="padding:8px 12px;background:#fff;border:1px solid #e5e7eb;color:#111;">${esc(p.name)}</td>
        <td style="padding:8px 12px;background:#fff;border:1px solid #e5e7eb;color:#374151;">${p.lastSnapshotAt ? new Date(p.lastSnapshotAt).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }) : "never"}</td>
      </tr>
    `)
    .join("");

  const { error } = await resend.emails.send({
    from: fromAddress,
    to: adminEmail,
    subject: `⚠ ${stalePortfolios.length} portfolio${stalePortfolios.length > 1 ? "s" : ""} missing fresh snapshots`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:12px;">
        <h2 style="margin:0 0 4px;font-size:18px;color:#111;">Snapshot cron health check</h2>
        <p style="margin:0 0 20px;font-size:13px;color:#6b7280;">
          ${stalePortfolios.length} of ${portfolios.length} active portfolios haven't gotten a fresh snapshot in over ${STALE_THRESHOLD_HOURS} hours. The daily-snapshot cron may have failed or been skipped &mdash; digest return figures for these portfolios will look flat/stale until this is fixed.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:8px 12px;background:#f3f4f6;border:1px solid #e5e7eb;font-weight:600;">Portfolio</td>
            <td style="padding:8px 12px;background:#f3f4f6;border:1px solid #e5e7eb;font-weight:600;">Last snapshot</td>
          </tr>
          ${rows}
        </table>
      </div>
    `,
  });

  if (error) console.error("snapshot-health-check: alert email failed:", error);

  return NextResponse.json({ stale: stalePortfolios.length, checked: portfolios.length, alertSent: !error, portfolios: stalePortfolios });
}
