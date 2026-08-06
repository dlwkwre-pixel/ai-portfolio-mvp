"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) return null;
  return user;
}

// Approve or revoke one account's site access. Upsert (not update) so it
// works even for accounts that never finished /setup-username and so have
// no existing user_profiles row yet.
export async function setApproval(
  userId: string, approved: boolean,
): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Not authorized." };
  if (!userId) return { error: "Bad request." };
  if (userId === admin.id) return { error: "You can't change your own admin account." };

  try {
    const svc = createAdminClient();
    // username is NOT NULL with no default — accounts that never finished
    // /setup-username have no existing row, so the upsert's insert branch
    // needs a placeholder. Existing rows are untouched (upsert only sets
    // the columns listed here); the user can still pick their own username
    // via /setup-username afterward, which upserts over this placeholder.
    const { data: existing } = await svc.from("user_profiles").select("id").eq("id", userId).maybeSingle();
    const patch: Record<string, unknown> = {
      id: userId, approved, approved_at: approved ? new Date().toISOString() : null, approved_by: approved ? admin.id : null,
    };
    if (!existing) patch.username = `user_${userId.replace(/-/g, "").slice(0, 12)}`;

    const { error } = await svc.from("user_profiles").upsert(patch, { onConflict: "id" });
    if (error) return { error: error.message };
    revalidatePath("/admin/approvals");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update approval." };
  }
}
