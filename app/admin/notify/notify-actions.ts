"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Send an in-app notification (the bell) to all users. Admin-only. Uses the service-role
// client server-side so it works from the live site — no CLI, .env, or TLS workarounds.
export async function sendAppNotification(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) return { error: "Not authorized." };

  const title = String(formData.get("title") || "").trim().slice(0, 120);
  const body = String(formData.get("body") || "").trim().slice(0, 600);
  if (!title || !body) return { error: "Title and message are both required." };

  try {
    const admin = createAdminClient();
    const { error } = await admin.from("app_notifications").insert({ title, body });
    if (error) return { error: error.message };
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to send notification." };
  }
}
