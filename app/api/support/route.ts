import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, getIp } from "@/lib/rate-limit";

const resend = new Resend(process.env.RESEND_API_KEY);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const AREA_LABELS: Record<string, string> = {
  dashboard:   "Dashboard",
  portfolios:  "Portfolios",
  strategies:  "Strategies",
  planning:    "Planning",
  research:    "Research",
  tax:         "Tax",
  community:   "Community",
  account:     "Account / Settings",
  billing:     "Billing",
  other:       "Other",
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Sends an email on every call — hard-limit to prevent inbox/Resend abuse.
  const rlKey = user?.id ? `support:${user.id}` : `support-ip:${getIp(req)}`;
  const { limited, retryAfter } = checkRateLimit(rlKey, 3, 10 * 60_000);
  if (limited) {
    return NextResponse.json({ error: "Too many requests. Please wait before sending another message." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }

  const body = await req.json().catch(() => ({}));
  const { area, description, email: submittedEmail } = body as {
    area?: string;
    description?: string;
    email?: string;
  };

  if (!area || !description?.trim()) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  // Cap length to avoid oversized payloads / email abuse
  const cleanDescription = description.trim().slice(0, 5000);

  // Only trust a submitted email if it's well-formed; prefer the authenticated user's email
  const replyEmail = user?.email
    ?? (submittedEmail && EMAIL_RE.test(submittedEmail.trim()) ? submittedEmail.trim() : null);
  const userEmail = replyEmail ?? "Anonymous";
  // Never inject an unmapped area string into HTML — fall back to "Other"
  const areaLabel = AREA_LABELS[area] ?? "Other";
  const now = new Date().toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:12px;">
      <h2 style="margin:0 0 4px;font-size:18px;color:#111;">BuyTune Support Ticket</h2>
      <p style="margin:0 0 20px;font-size:13px;color:#6b7280;">${now}</p>

      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr>
          <td style="padding:8px 12px;background:#fff;border:1px solid #e5e7eb;font-weight:600;width:120px;color:#374151;">From</td>
          <td style="padding:8px 12px;background:#fff;border:1px solid #e5e7eb;color:#111;">${esc(userEmail)}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;background:#f3f4f6;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Area</td>
          <td style="padding:8px 12px;background:#f3f4f6;border:1px solid #e5e7eb;color:#111;">${areaLabel}</td>
        </tr>
      </table>

      <div style="margin-top:16px;padding:14px 16px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#9ca3af;margin-bottom:8px;">Description</div>
        <p style="margin:0;font-size:14px;color:#111;white-space:pre-wrap;line-height:1.6;">${esc(cleanDescription)}</p>
      </div>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: "support@buytune.io",
    to: "dlwk.wre@gmail.com",
    ...(replyEmail ? { replyTo: replyEmail } : {}),
    subject: `[Support] ${areaLabel} — ${cleanDescription.slice(0, 60)}${cleanDescription.length > 60 ? "…" : ""}`,
    html,
  });

  if (error) {
    console.error("Support email error:", error);
    return NextResponse.json({ error: "Failed to send. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
