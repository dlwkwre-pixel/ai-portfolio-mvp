"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { CONNECT_FEATURES } from "@/lib/access/feature-access";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) return null;
  return user;
}

// Grant or revoke a connection feature for one user. Admin-only, service-role write.
export async function setFeatureAccess(
  userId: string, feature: string, enabled: boolean,
): Promise<{ error?: string }> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Not authorized." };
  if (!userId || !CONNECT_FEATURES.includes(feature as never)) return { error: "Bad request." };

  try {
    const svc = createAdminClient();
    if (enabled) {
      const { error } = await svc.from("feature_access").upsert(
        { user_id: userId, feature, granted_by: admin.id, granted_at: new Date().toISOString() },
        { onConflict: "user_id,feature" },
      );
      if (error) return { error: error.message };
    } else {
      const { error } = await svc.from("feature_access").delete().eq("user_id", userId).eq("feature", feature);
      if (error) return { error: error.message };
    }
    revalidatePath("/admin/connections");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update access." };
  }
}
