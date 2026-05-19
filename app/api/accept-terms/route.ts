import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const TERMS_VERSION = "2026-05-18";

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const { error } = await supabase
      .from("user_profiles")
      .update({
        terms_accepted_at: new Date().toISOString(),
        terms_version: TERMS_VERSION,
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
