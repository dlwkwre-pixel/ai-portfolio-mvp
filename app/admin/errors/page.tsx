import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import LocalTime from "@/app/components/local-time";

export const metadata = { title: "Errors — BuyTune Admin" };
export const dynamic = "force-dynamic";

type ErrorRow = {
  id: string;
  created_at: string;
  source: "client" | "server";
  message: string;
  stack: string | null;
  path: string | null;
  digest: string | null;
  fingerprint: string;
  user_id: string | null;
  user_agent: string | null;
  context: Record<string, unknown> | null;
};

type Group = { latest: ErrorRow; count: number; users: Set<string>; paths: Set<string>; first: string };

const RETENTION_DAYS = 30;

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

const card: React.CSSProperties = {
  background: "var(--card-bg)", border: "1px solid var(--card-border)", borderRadius: "var(--radius-lg)", padding: "14px 16px",
};

function browserOf(ua: string | null): string {
  if (!ua) return "";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "";
  const b = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return [b, os].filter(Boolean).join(" · ");
}

export default async function ErrorsDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!user || !adminEmail || user.email !== adminEmail) {
    return <p style={{ color: "var(--text-tertiary)" }}>Not authorized.</p>;
  }

  const admin = createAdminClient();
  const since = daysAgoIso(7);
  const dayAgo = daysAgoIso(1);
  const { data, error } = await admin
    .from("app_errors")
    .select("id, created_at, source, message, stack, path, digest, fingerprint, user_id, user_agent, context")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1000);

  // Keep the table small: drop anything past the retention window after the page is sent.
  after(async () => {
    await createAdminClient().from("app_errors").delete().lt("created_at", daysAgoIso(RETENTION_DAYS));
  });

  if (error) {
    return (
      <div style={card}>
        <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)", lineHeight: 1.6 }}>
          Error tracking isn&apos;t set up yet. Run <code style={{ fontFamily: "var(--font-mono)" }}>supabase/app-errors.sql</code> in the Supabase SQL editor, then reload.
        </p>
      </div>
    );
  }

  const rows = (data ?? []) as ErrorRow[];
  const groups = new Map<string, Group>();
  for (const r of rows) {
    const g = groups.get(r.fingerprint);
    if (!g) {
      groups.set(r.fingerprint, { latest: r, count: 1, users: new Set(r.user_id ? [r.user_id] : []), paths: new Set(r.path ? [r.path.split("?")[0]] : []), first: r.created_at });
    } else {
      g.count++;
      if (r.user_id) g.users.add(r.user_id);
      if (r.path) g.paths.add(r.path.split("?")[0]);
      g.first = r.created_at; // rows are newest-first, so the last one seen is the oldest
    }
  }
  const sorted = [...groups.values()].sort((a, b) => b.latest.created_at.localeCompare(a.latest.created_at));
  const last24 = rows.filter((r) => r.created_at > dayAgo).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        {[
          { label: "Errors · last 7 days", value: rows.length },
          { label: "Distinct problems", value: sorted.length },
          { label: "Last 24 hours", value: last24 },
        ].map((k) => (
          <div key={k.label} style={{ ...card, flex: "1 1 150px" }}>
            <div style={{ fontSize: "var(--text-2xs)", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>{k.label}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-lg)", fontWeight: 700, marginTop: "4px" }}>{k.value}</div>
          </div>
        ))}
      </div>
      <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--text-tertiary)", lineHeight: 1.5 }}>
        {`Browser errors your users hit and server errors from page loads, API routes and actions. Repeats of the same problem on the same page are grouped. Kept ${RETENTION_DAYS} days.`}
      </p>

      {sorted.length === 0 ? (
        <div style={card}><p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>No errors in the last 7 days.</p></div>
      ) : sorted.map((g) => (
        <details key={g.latest.fingerprint} style={card}>
          <summary style={{ cursor: "pointer", listStyle: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "var(--text-2xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", padding: "2px 8px", borderRadius: "var(--radius-full)", border: "1px solid var(--border-subtle)", color: g.latest.source === "server" ? "var(--red)" : "var(--amber)" }}>
                {g.latest.source}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>{`${g.count}×`}</span>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)" }}>
                {`${g.users.size} user${g.users.size === 1 ? "" : "s"} · last `}<LocalTime value={g.latest.created_at} options={{ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }} />
              </span>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--text-primary)", wordBreak: "break-word", lineHeight: 1.5 }}>{g.latest.message}</div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", wordBreak: "break-all" }}>{[...g.paths].slice(0, 4).join(", ")}</div>
          </summary>
          <div style={{ marginTop: "10px", borderTop: "1px solid var(--border-subtle)", paddingTop: "10px", display: "flex", flexDirection: "column", gap: "6px", fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>
            <div>{"First seen "}<LocalTime value={g.first} options={{ month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }} />{g.latest.user_agent ? ` · ${browserOf(g.latest.user_agent)}` : ""}{g.latest.digest ? ` · digest ${g.latest.digest}` : ""}</div>
            {g.latest.context && <div style={{ fontFamily: "var(--font-mono)" }}>{JSON.stringify(g.latest.context)}</div>}
            {g.latest.stack && (
              <pre style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: "var(--text-2xs)", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: "260px", overflow: "auto", background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "10px" }}>
                {g.latest.stack}
              </pre>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
