"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Money out: linked banks feed Cash Flow automatically. Shows when it last synced and a
// manual "Sync now"; for people with bank access but nothing linked, a pointer to connect.

export type BankLinkInfo = { linked: boolean; lastSyncedAt: string | null; institutions: string[] };

function ago(iso: string | null): string {
  if (!iso) return "not synced yet";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

export default function BankSyncNote({ info }: { info: BankLinkInfo }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!info.linked) {
    return (
      <p style={{ margin: "0 0 12px", fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
        Tired of pasting statements?{" "}
        <Link href="/connections" style={{ color: "var(--brand-blue)", fontWeight: 600 }}>Connect a bank or card</Link>
        {" "}and transactions show up here on their own.
      </p>
    );
  }

  async function sync() {
    setSyncing(true);
    setMsg(null);
    try {
      const res = await fetch("/api/connections/plaid/refresh", { method: "POST" });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) { setMsg(data.error ?? "Couldn't sync right now."); return; }
      setMsg("Synced.");
      router.refresh();
    } catch {
      setMsg("Network error. Try again.");
    } finally {
      setSyncing(false);
    }
  }

  const names = info.institutions.filter(Boolean);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", margin: "0 0 12px", fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
      <span>
        {`Linked ${names.length > 0 ? names.join(", ") : "accounts"} sync automatically · last ${ago(info.lastSyncedAt)}. Anything you already imported from a statement isn't added twice.`}
      </span>
      <button type="button" onClick={sync} disabled={syncing}
        style={{ minHeight: "32px", padding: "0 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", background: "transparent", color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 600, cursor: "pointer" }}>
        {syncing ? "Syncing…" : "Sync now"}
      </button>
      {msg && <span role="status" style={{ color: msg === "Synced." ? "var(--green)" : "var(--red)" }}>{msg}</span>}
    </div>
  );
}
