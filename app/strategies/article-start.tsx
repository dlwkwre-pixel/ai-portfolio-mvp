"use client";

import { useState } from "react";

// "Start from an article" for the Strategy Builder: paste a link to an investing article
// or fund letter; its approach is summarized and sent to Atlas as the user's message, so
// the interview continues with those ideas as the starting point.

type ArticleSummary = { title: string; approach: string; rules: string[]; risks: string | null; url: string };

function composeMessage(a: ArticleSummary): string {
  const rules = a.rules.length > 0 ? `\n\nKey rules from it:\n${a.rules.map((r) => `- ${r}`).join("\n")}` : "";
  const risks = a.risks ? `\n\nThe article's main risk: ${a.risks}` : "";
  return `I'd like my strategy to follow the approach in this article: "${a.title}".\n\nThe approach: ${a.approach}${rules}${risks}`;
}

export default function ArticleStart({ disabled, onUse }: { disabled: boolean; onUse: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function use() {
    if (!url.trim() || busy || disabled) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/strategies/from-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json().catch(() => ({})) as Partial<ArticleSummary> & { error?: string };
      if (!res.ok || !data.approach) { setError(data.error ?? "Couldn't read that article."); return; }
      onUse(composeMessage(data as ArticleSummary));
      setUrl("");
      setOpen(false);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} disabled={disabled}
        style={{ marginTop: "8px", background: "none", border: "none", padding: "4px 0", minHeight: "32px", cursor: disabled ? "default" : "pointer", color: "var(--brand-blue)", fontSize: "var(--text-xs)", fontWeight: 600, fontFamily: "var(--font-body)" }}>
        Have an article or fund letter you like? Start from it
      </button>
    );
  }

  return (
    <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ display: "flex", gap: "6px" }}>
        <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); use(); } }}
          aria-label="Article link" placeholder="Paste a link to an investing article"
          className="bt-input" style={{ flex: 1, minWidth: 0 }} />
        <button type="button" onClick={use} disabled={busy || disabled || !url.trim()}
          style={{ minHeight: "36px", padding: "0 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--brand-blue)", background: "transparent", color: "var(--brand-blue)", fontSize: "var(--text-xs)", fontWeight: 600, fontFamily: "var(--font-body)", cursor: "pointer", whiteSpace: "nowrap", opacity: !url.trim() ? 0.5 : 1 }}>
          {busy ? "Reading…" : "Use article"}
        </button>
        <button type="button" onClick={() => { setOpen(false); setError(null); }} aria-label="Cancel"
          style={{ minWidth: "36px", minHeight: "36px", background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", fontSize: "16px" }}>×</button>
      </div>
      {error && <div role="alert" style={{ fontSize: "var(--text-xs)", color: "var(--red)", fontFamily: "var(--font-body)" }}>{error}</div>}
    </div>
  );
}
