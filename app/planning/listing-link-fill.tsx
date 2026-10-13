"use client";

import { useState } from "react";

// "Paste a listing link" → fills the planner form from the page. Shared by the apartment
// and car planners. The user always reviews the filled values before saving.

export type ListingFields = Record<string, string | number | null>;

export default function ListingLinkFill({
  kind, onFill, accent = "var(--brand-blue)",
}: {
  kind: "apartment" | "car";
  onFill: (fields: ListingFields, url: string) => void;
  accent?: string;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: "ok" | "err" } | null>(null);

  async function fill() {
    if (!url.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/planning/listing-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), kind }),
      });
      const data = await res.json().catch(() => ({})) as { fields?: ListingFields; url?: string; error?: string };
      if (!res.ok || !data.fields) { setMsg({ text: data.error ?? "Couldn't read that link.", tone: "err" }); return; }
      onFill(data.fields, data.url ?? url.trim());
      const note = typeof data.fields.note === "string" ? ` ${data.fields.note}` : "";
      setMsg({ text: `Filled from the listing. Check the values below before saving.${note}`, tone: "ok" });
      setUrl("");
    } catch {
      setMsg({ text: "Network error. Try again.", tone: "err" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ border: "1px dashed var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "10px 12px", marginBottom: "14px", display: "flex", flexDirection: "column", gap: "6px" }}>
      <label htmlFor={`listing-link-${kind}`} style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--text-secondary)", fontFamily: "var(--font-body)" }}>
        {kind === "apartment" ? "Have a listing link? Paste it to fill this in" : "Have a car listing link? Paste it to fill in the new vehicle"}
      </label>
      <div style={{ display: "flex", gap: "6px" }}>
        <input
          id={`listing-link-${kind}`}
          type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); fill(); } }}
          placeholder={kind === "apartment" ? "https://www.apartments.com/..." : "https://www.cars.com/vehicledetail/..."}
          style={{ flex: 1, minWidth: 0, padding: "8px 10px", minHeight: "36px", background: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", color: "var(--text-primary)", fontSize: "var(--text-sm)", fontFamily: "var(--font-body)", boxSizing: "border-box" }}
        />
        <button type="button" onClick={fill} disabled={busy || !url.trim()}
          style={{ minHeight: "36px", padding: "0 14px", borderRadius: "var(--radius-sm)", border: `1px solid ${accent}`, background: "transparent", color: accent, fontSize: "var(--text-xs)", fontWeight: 600, fontFamily: "var(--font-body)", cursor: busy || !url.trim() ? "default" : "pointer", opacity: !url.trim() ? 0.5 : 1, whiteSpace: "nowrap" }}>
          {busy ? "Reading…" : "Fill"}
        </button>
      </div>
      {msg && (
        <div role={msg.tone === "err" ? "alert" : "status"} style={{ fontSize: "var(--text-xs)", color: msg.tone === "ok" ? "var(--green)" : "var(--red)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
