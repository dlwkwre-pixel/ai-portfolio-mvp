import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/app/components/sidebar";
import MobileNav from "@/app/components/mobile-nav";
import { getUserFeatures } from "@/lib/access/feature-access";

export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [features, { data: portfolios }] = await Promise.all([
    getUserFeatures(user.id),
    supabase.from("portfolios").select("id, name, cash_balance, account_type").eq("user_id", user.id).eq("status", "active"),
  ]);

  const hasBrokerage = features.has("brokerage_connect");
  const hasBank = features.has("bank_connect");
  const anyAccess = hasBrokerage || hasBank;

  const sidebarPortfolios = (portfolios ?? []).map((p) => ({
    id: p.id, name: p.name, cash_balance: Number(p.cash_balance ?? 0), account_type: p.account_type,
  }));

  const cards = [
    { on: hasBrokerage, emoji: "📈", title: "Brokerage", sub: "Robinhood & other brokerages", body: "Auto-import your holdings read-only, so your portfolio stays in sync without manual entry. Trades still happen in your brokerage app.", color: "#00d395" },
    { on: hasBank, emoji: "🏦", title: "Bank accounts", sub: "Checking, savings & cards", body: "Bring in balances and spending to complete your net worth and cash flow automatically.", color: "#818cf8" },
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "var(--bg-base)" }}>
      <div className="hidden lg:flex"><Sidebar userEmail={user.email} portfolios={sidebarPortfolios} /></div>
      <div className="bt-main-col" style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <MobileNav />
        <div style={{ flex: 1, overflowY: "auto", padding: "24px", maxWidth: "820px", width: "100%", margin: "0 auto" }} className="bt-mobile-nav-pad">
          <h1 style={{ fontSize: "24px", fontWeight: 800, fontFamily: "var(--font-display)", color: "var(--text-primary)", margin: "0 0 4px" }}>Connected accounts</h1>
          <p style={{ fontSize: "13px", color: "var(--text-tertiary)", maxWidth: "70ch", marginBottom: "20px" }}>
            Link your accounts so BuyTune keeps itself up to date. In private beta while we roll it out.
          </p>

          {!anyAccess ? (
            <div style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "14px", padding: "22px" }}>
              <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "6px" }}>You&apos;re on the waitlist</div>
              <p style={{ fontSize: "13px", color: "var(--text-tertiary)", lineHeight: 1.6, maxWidth: "60ch" }}>
                Account connections are in private beta and enabled per account. You don&apos;t have access yet. In the meantime, adding holdings manually works everywhere, and the Pulse and reconcile tools keep that data trustworthy.
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px" }}>
              {cards.filter((c) => c.on).map((c) => (
                <div key={c.title} style={{ background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "14px", padding: "18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                    <span style={{ fontSize: "22px" }}>{c.emoji}</span>
                    <div>
                      <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>{c.title}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>{c.sub}</div>
                    </div>
                    <span style={{ marginLeft: "auto", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: c.color, background: `${c.color}1a`, border: `1px solid ${c.color}40`, borderRadius: "6px", padding: "3px 7px" }}>Beta</span>
                  </div>
                  <p style={{ fontSize: "12.5px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "14px" }}>{c.body}</p>
                  <button type="button" disabled title="Live connection wiring is in progress"
                    style={{ width: "100%", padding: "10px", borderRadius: "10px", border: "1px solid var(--card-border)", background: "var(--bg-elevated)", color: "var(--text-tertiary)", fontSize: "13px", fontWeight: 600, cursor: "not-allowed", fontFamily: "var(--font-body)" }}>
                    Connect · coming soon
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
