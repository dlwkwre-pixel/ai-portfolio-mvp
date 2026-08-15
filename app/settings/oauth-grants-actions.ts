"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { revokeGrantFamily } from "@/lib/oauth/tokens";

export async function revokeOAuthGrantAction(familyId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const ok = await revokeGrantFamily(user.id, familyId);
  if (!ok) return { error: "Grant not found." };

  revalidatePath("/settings/profile");
  return {};
}
