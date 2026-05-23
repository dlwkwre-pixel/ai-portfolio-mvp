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

    // If the user somehow has no profile row (bypassed setup-username), create one so
    // the update above actually persists. UPDATE on 0 rows returns no error in Supabase.
    const { data: existing } = await supabase
      .from("user_profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!existing) {
      const emailBase = user.email?.split("@")[0]?.replace(/[^a-z0-9]/gi, "").toLowerCase() ?? "user";
      const fallbackUsername = `${emailBase}_${user.id.slice(0, 6)}`;
      const { error: insertError } = await supabase
        .from("user_profiles")
        .insert({
          id: user.id,
          username: fallbackUsername,
          display_name: user.email?.split("@")[0] ?? "User",
          terms_accepted_at: now,
          terms_version: TERMS_VERSION,
        });
      if (insertError) {
        console.error("[accept-terms] insert error:", insertError.message, insertError.code);
        return NextResponse.json({ error: insertError.message }, { status: 500 });
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
