"use server";

import { createClient } from "@/lib/supabase/server";

const TERMS_VERSION = "2026-07-14";

export async function acceptTerms(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("user_profiles")
    .update({
      terms_accepted_at: new Date().toISOString(),
      terms_version: TERMS_VERSION,
    })
    .eq("id", user.id);

  if (error) throw new Error(error.message);
}
