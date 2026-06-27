import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NotifyForm from "./notify-form";

export const metadata = { title: "Send Notification — BuyTune Admin" };

export default async function NotifyPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/notify");

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || user.email !== adminEmail) redirect("/dashboard");

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg-base, #040d1a)", color: "var(--text-primary, #fff)", padding: "32px 20px" }}>
      <div style={{ maxWidth: "640px", margin: "0 auto" }}>
        <h1 style={{ fontSize: "22px", fontWeight: 700, fontFamily: "var(--font-display)", marginBottom: "4px" }}>Send a notification</h1>
        <p style={{ fontSize: "13px", color: "var(--text-tertiary, #64748b)", marginBottom: "24px" }}>
          Posts to the in-app bell for all users. Admin only.
        </p>
        <NotifyForm />
      </div>
    </main>
  );
}
