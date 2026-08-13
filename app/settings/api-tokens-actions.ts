"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { generateApiToken } from "@/lib/auth/api-tokens";

export type ApiTokenRow = {
  id: string;
  name: string;
  token_prefix: string;
  last_used_at: string | null;
  created_at: string;
};

export async function createApiTokenAction(formData: FormData): Promise<{ error?: string; raw?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const name = String(formData.get("name") || "").trim().slice(0, 60) || "Unnamed agent";
  const { raw, hash, displayPrefix } = generateApiToken();

  const { error } = await supabase.from("api_tokens").insert({
    user_id: user.id,
    name,
    token_hash: hash,
    token_prefix: displayPrefix,
  });
  if (error) return { error: error.message };

  revalidatePath("/settings/profile");
  return { raw };
}

export async function revokeApiTokenAction(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("api_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id).eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/settings/profile");
  return {};
}
