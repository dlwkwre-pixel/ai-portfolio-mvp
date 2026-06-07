import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";

const resend = new Resend(process.env.RESEND_API_KEY);

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

  const body = await req.json();
  const { area, description, email: submittedEmail } = body as {
    area: string;
    description: string;
    email?: string;
  };

  if (!area || !description?.trim()) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  const userEmail = user?.email ?? submittedEmail ?? "Anonymous";
  const areaLabel = AREA_LABELS[area] ?? area;
  const now = new Date().toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:12px;">
      <h2 style="margin:0 0 4px;font-size:18px;color:#111;">BuyTune Support Ticket</h2>
      <p style="margin:0 0 20px;font-size:13px;color:#6b7280;">${now}</p>

      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr>
          <td style="padding:8px 12px;background:#fff;border:1px solid #e5e7eb;font-weight:600;width:120px;color:#374151;">From</td>
          <td style="padding:8px 12px;background:#fff;border:1px solid #e5e7eb;color:#111;">${userEmail}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;background:#f3f4f6;border:1px solid #e5e7eb;font-weight:600;color:#374151;">Area</td>
          <td style="padding:8px 12px;background:#f3f4f6;border:1px solid #e5e7eb;color:#111;">${areaLabel}</td>
        </tr>
      </table>

      <div style="margin-top:16px;padding:14px 16px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;">
        <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:#9ca3af;margin-bottom:8px;">Description</div>
        <p style="margin:0;font-size:14px;color:#111;white-space:pre-wrap;line-height:1.6;">${description.trim().replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
      </div>
    </div>
  `;

  const { error } = await resend.emails.send({
    from: "support@buytune.io",
    to: "dlwk.wre@gmail.com",
    replyTo: userEmail,
    subject: `[Support] ${areaLabel} — ${description.trim().slice(0, 60)}${description.trim().length > 60 ? "…" : ""}`,
    html,
  });

  if (error) {
    console.error("Support email error:", error);
    return NextResponse.json({ error: "Failed to send. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
