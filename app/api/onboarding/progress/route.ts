import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    const body = await req.json() as { step: number; status?: string };
    const updates: Record<string, unknown> = {
      onboarding_status: body.status ?? "in_progress",
      onboarding_step: body.step,
    };
    if (body.status === "completed") updates.onboarding_completed_at = new Date().toISOString();
    if (body.status === "skipped") updates.onboarding_skipped_at = new Date().toISOString();

    await supabase.from("user_profiles").update(updates).eq("id", user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Unexpected error" }, { status: 500 });
  }
}
