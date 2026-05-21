import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const TERMS_VERSION = "2026-05-18";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    let emailOptIn = false;
    try {
      const body = await req.json();
      emailOptIn = Boolean(body.emailOptIn);
    } catch { /* body is optional */ }

    const { error } = await supabase
      .from("user_profiles")
      .update({
        terms_accepted_at: new Date().toISOString(),
        terms_version: TERMS_VERSION,
        email_digest_opt_in: emailOptIn,
      })
      .eq("id", user.id);

    if (error) {
      console.error("[accept-terms] supabase error:", error.message, error.code);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[accept-terms] unexpected error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
