import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AdminNav from "./admin-nav";

export const metadata = { title: "BuyTune Admin" };

// Single admin gate + shared chrome for every /admin/* page. Children render only their
// section content; the shell owns the background, header, tab nav, and content container.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || user.email !== adminEmail) redirect("/dashboard");

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-base)", color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
      <div className="bt-glow" style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }} />

      {/* Header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 20,
        background: "color-mix(in srgb, var(--bg-base) 88%, transparent)",
        backdropFilter: "blur(10px)",
        borderBottom: "1px solid var(--border-subtle)",
      }}>
        <div style={{ maxWidth: "1040px", margin: "0 auto", padding: "14px 24px", paddingTop: "calc(14px + env(safe-area-inset-top))", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginRight: "auto" }}>
            <div style={{ width: "30px", height: "30px", background: "var(--brand-gradient, var(--brand-gradient))", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "15px", letterSpacing: "-0.3px", color: "var(--text-primary)" }}>
                BuyTune <span style={{ color: "var(--brand-violet, #3fae4a)" }}>Admin</span>
              </div>
              <div style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>{user.email}</div>
            </div>
          </div>
          <AdminNav />
          <Link href="/dashboard" style={{ fontSize: "12px", color: "var(--text-tertiary)", textDecoration: "none", padding: "7px 12px", borderRadius: "999px", border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))" }}>
            ← App
          </Link>
        </div>
      </header>

      {/* Content */}
      <div style={{ position: "relative", zIndex: 1, maxWidth: "1040px", margin: "0 auto", padding: "28px 24px 80px" }}>
        {children}
      </div>
    </div>
  );
}
