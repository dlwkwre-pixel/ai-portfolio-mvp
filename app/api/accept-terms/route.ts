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

    const now = new Date().toISOString();

    const { error } = await supabase
      .from("user_profiles")
      .update({ terms_accepted_at: now, terms_version: TERMS_VERSION })
      .eq("id", user.id);

    if (error) {
      console.error("[accept-terms] update error:", error.message, error.code);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If UPDATE touched 0 rows (no profile exists, or a trigger made a stub with no username),
    // upsert to create/update the row so terms_accepted_at is always persisted.
    const { data: existing } = await supabase
      .from("user_profiles")
      .select("id, username")
      .eq("id", user.id)
      .maybeSingle();

    if (!existing) {
      const emailBase = user.email?.split("@")[0]?.replace(/[^a-z0-9]/gi, "").toLowerCase() ?? "user";
      const fallbackUsername = `${emailBase}_${user.id.slice(0, 6)}`;
      const { error: upsertError } = await supabase
        .from("user_profiles")
        .upsert({
          id: user.id,
          username: fallbackUsername,
          display_name: user.email?.split("@")[0] ?? "User",
          terms_accepted_at: now,
          terms_version: TERMS_VERSION,
        }, { onConflict: "id" });
      if (upsertError) {
        console.error("[accept-terms] upsert error:", upsertError.message, upsertError.code);
        return NextResponse.json({ error: upsertError.message }, { status: 500 });
      }
    }

    // email_digest_opt_in is optional — non-fatal if column not yet migrated
    await supabase
      .from("user_profiles")
      .update({ email_digest_opt_in: emailOptIn })
      .eq("id", user.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[accept-terms] unexpected error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
