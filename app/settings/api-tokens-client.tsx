"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createApiTokenAction, revokeApiTokenAction, type ApiTokenRow } from "./api-tokens-actions";

export default function ApiTokensClient({ tokens }: { tokens: ApiTokenRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [justCreated, setJustCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function create() {
    setError("");
    const fd = new FormData();
    fd.set("name", name.trim());
    startTransition(async () => {
      const res = await createApiTokenAction(fd);
      if (res?.error) { setError(res.error); return; }
      if (res?.raw) setJustCreated(res.raw);
      setName("");
      router.refresh();
    });
  }

  function revoke(id: string) {
    startTransition(async () => { await revokeApiTokenAction(id); router.refresh(); });
  }

  async function copyToken() {
    if (!justCreated) return;
    await navigator.clipboard.writeText(justCreated);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const mcpUrl = typeof window !== "undefined" ? `${window.location.origin}/api/mcp` : "https://buytuneio.vercel.app/api/mcp";

  return (
    <div>
      <div style={{ marginBottom: "16px" }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "16px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.2px", marginBottom: "2px" }}>
          Connected AI Agents
        </h2>
        <p style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
          Let your own Claude or ChatGPT read your BuyTune portfolio and research directly. Read-only — this never places trades or touches a brokerage.
          {" "}
          <Link href="/agentic-trading" style={{ color: "var(--brand-blue)", textDecoration: "none" }}>Set up autonomous trading →</Link>
        </p>
      </div>

      {justCreated && (
        <div style={{ marginBottom: "14px", padding: "12px 14px", borderRadius: "var(--radius-lg)", border: "1px solid rgba(14,165,160,0.3)", background: "rgba(14,165,160,0.06)" }}>
          <p style={{ fontSize: "12px", fontWeight: 700, color: "var(--brand-blue)", margin: "0 0 6px" }}>
            Copy this token now — it won&apos;t be shown again.
          </p>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <code style={{ flex: 1, fontSize: "11px", fontFamily: "var(--font-mono)", padding: "6px 8px", borderRadius: "6px", background: "var(--bg-elevated, rgba(255,255,255,0.05))", border: "1px solid var(--card-border)", overflowX: "auto", whiteSpace: "nowrap", color: "var(--text-primary)" }}>
              {justCreated}
            </code>
            <button type="button" onClick={copyToken} style={{ fontSize: "11px", fontWeight: 700, padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--card-border)", background: "var(--bg-surface)", color: "var(--text-primary)", cursor: "pointer", fontFamily: "var(--font-body)", whiteSpace: "nowrap" }}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p style={{ fontSize: "10.5px", color: "var(--text-muted)", marginTop: "8px", lineHeight: 1.5 }}>
            Add an MCP connection in Claude Desktop / Claude Code pointing at <code style={{ fontFamily: "var(--font-mono)" }}>{mcpUrl}</code> with this token as a Bearer header.
          </p>
        </div>
      )}

      {tokens.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
          {tokens.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--border-subtle)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-primary)" }}>{t.name}</div>
                <div style={{ fontSize: "10.5px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  {t.token_prefix} · {t.last_used_at ? `last used ${new Date(t.last_used_at).toLocaleDateString()}` : "never used"}
                </div>
              </div>
              <button type="button" onClick={() => revoke(t.id)} disabled={pending} style={{ fontSize: "11px", fontWeight: 600, color: "var(--red)", background: "none", border: "none", cursor: pending ? "wait" : "pointer", fontFamily: "var(--font-body)" }}>
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: "8px" }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this connection, e.g. Claude Desktop"
          style={{ flex: 1, padding: "9px 11px", borderRadius: "8px", border: "1px solid var(--card-border)", background: "var(--bg-elevated, rgba(255,255,255,0.03))", color: "var(--text-primary)", fontSize: "13px", fontFamily: "var(--font-body)", outline: "none" }} />
        <button type="button" onClick={create} disabled={pending || !name.trim()}
          style={{ padding: "9px 16px", borderRadius: "8px", border: "none", background: "var(--brand-blue)", color: "white", fontSize: "13px", fontWeight: 700, cursor: pending || !name.trim() ? "default" : "pointer", opacity: pending || !name.trim() ? 0.6 : 1, fontFamily: "var(--font-body)" }}>
          {pending ? "Creating…" : "Create token"}
        </button>
      </div>
      {error && <p style={{ fontSize: "11.5px", color: "var(--red)", marginTop: "6px" }}>{error}</p>}
    </div>
  );
}
