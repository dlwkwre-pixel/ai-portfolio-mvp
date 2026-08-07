import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";

const resend = new Resend(process.env.RESEND_API_KEY);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Fired once, fire-and-forget, right after a new account finishes signUp() —
// see app/signup/page.tsx. Allowlisted in proxy.ts since the caller is by
// definition unapproved at this point. Auth comes from the request's own
// session (not a client-supplied email) so it can't be used to spam
// arbitrary addresses at the admin's inbox.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return NextResponse.json({ ok: true });

  const { limited } = checkRateLimit(`notify-signup:${user.id}`, 2, 10 * 60_000);
  if (limited) return NextResponse.json({ ok: true });

  const now = new Date().toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" });
  const fromAddress = process.env.RESEND_FROM_EMAIL ?? "signups@buytune.io";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://buytuneio.vercel.app";

  const { error } = await resend.emails.send({
    from: fromAddress,
    to: adminEmail,
    subject: `New account request — ${user.email ?? "unknown"}`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:12px;">
        <h2 style="margin:0 0 4px;font-size:18px;color:#111;">New BuyTune signup awaiting approval</h2>
        <p style="margin:0 0 20px;font-size:13px;color:#6b7280;">${now}</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:8px 12px;background:#fff;border:1px solid #e5e7eb;font-weight:600;width:120px;color:#374151;">Email</td>
            <td style="padding:8px 12px;background:#fff;border:1px solid #e5e7eb;color:#111;">${esc(user.email ?? "unknown")}</td>
          </tr>
        </table>
        <p style="margin-top:20px;">
          <a href="${appUrl}/admin/access" style="display:inline-block;padding:10px 18px;background:#159f6f;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">Review in Access &rarr;</a>
        </p>
      </div>
    `,
  });

  if (error) console.error("Signup-alert email error:", error);
  return NextResponse.json({ ok: true });
}
