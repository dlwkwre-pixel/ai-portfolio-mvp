"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// Money out: linked banks feed Cash Flow automatically. Opening the page syncs when the
// last sync is stale; right after linking, Plaid can still be pulling history from the
// bank, so it re-checks a few times and says what's happening instead of a bare "Synced".

export type BankLinkInfo = { linked: boolean; lastSyncedAt: string | null; institutions: string[] };

type SyncResult = {
  synced?: number; total?: number; newTransactions?: number; loading?: number; error?: string;
  transfers?: { merchant: string; amount: number; date: string }[];
};

const STALE_MS = 3 * 60 * 60 * 1000;
const RECHECK_MS = 45_000;
const MAX_RECHECKS = 6;

function ago(iso: string | null): string {
  if (!iso) return "not synced yet";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

function describe(r: SyncResult): { text: string; tone: "ok" | "info" | "err" } {
  if (r.error) return { text: r.error, tone: "err" };
  const added = r.newTransactions ?? 0;
  const failed = (r.total ?? 0) - (r.synced ?? 0);
  const parts: string[] = [added > 0 ? `${added} new transaction${added !== 1 ? "s" : ""} added` : "Up to date, nothing new"];
  const xfers = r.transfers ?? [];
  if (xfers.length > 0) {
    const shown = xfers.slice(0, 3).map((t) => `${t.merchant} $${t.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`).join(", ");
    parts.push(`Found ${xfers.length} transfer${xfers.length !== 1 ? "s" : ""} between your own accounts (${shown}${xfers.length > 3 ? ", …" : ""}), not counted as income or spending`);
  }
  if ((r.loading ?? 0) > 0) parts.push(`${r.loading} bank${r.loading !== 1 ? "s are" : " is"} still sending history (normal for a few minutes after linking). Checking again shortly`);
  if (failed > 0) parts.push(`${failed} connection${failed !== 1 ? "s" : ""} couldn't sync. See Connections`);
  return { text: parts.join(". ") + ".", tone: failed > 0 ? "err" : (r.loading ?? 0) > 0 ? "info" : "ok" };
}

export default function BankSyncNote({ info }: { info: BankLinkInfo }) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tone: "ok" | "info" | "err" } | null>(null);
  const rechecks = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sync = useCallback(async (auto: boolean) => {
    setSyncing(true);
    try {
      const res = await fetch("/api/connections/plaid/refresh", { method: "POST" });
      const data = await res.json().catch(() => ({})) as SyncResult;
      const result = res.ok ? data : { error: data.error ?? "Couldn't sync right now." };
      const d = describe(result);
      // A quiet automatic sync with nothing new doesn't need a message.
      if (!(auto && d.tone === "ok" && !(result.newTransactions ?? 0) && !(result.transfers ?? []).length)) setMsg(d);
      if ((result.newTransactions ?? 0) > 0 || !auto) router.refresh();
      if ((result.loading ?? 0) > 0 && rechecks.current < MAX_RECHECKS) {
        rechecks.current++;
        timer.current = setTimeout(() => { void sync(true); }, RECHECK_MS);
      }
    } catch {
      if (!auto) setMsg({ text: "Network error. Try again.", tone: "err" });
    } finally {
      setSyncing(false);
    }
  }, [router]);

  useEffect(() => {
    if (!info.linked) return;
    const stale = !info.lastSyncedAt || Date.now() - new Date(info.lastSyncedAt).getTime() > STALE_MS;
    if (stale) void sync(true);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // run once on mount — later syncs are user- or recheck-driven
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!info.linked) {
    return (
      <p style={{ margin: "0 0 12px", fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
        Tired of pasting statements?{" "}
        <Link href="/connections" style={{ color: "var(--brand-blue)", fontWeight: 600 }}>Connect a bank or card</Link>
        {" "}and transactions show up here on their own.
      </p>
    );
  }

  const names = info.institutions.filter(Boolean);
  const color = msg?.tone === "ok" ? "var(--green)" : msg?.tone === "err" ? "var(--red)" : "var(--text-secondary)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px", margin: "0 0 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", fontSize: "var(--text-xs)", color: "var(--text-tertiary)", fontFamily: "var(--font-body)" }}>
        <span>
          {`${names.length > 0 ? Array.from(new Set(names)).join(", ") : "Linked accounts"} sync automatically · last ${syncing ? "syncing now…" : ago(info.lastSyncedAt)}`}
        </span>
        <button type="button" onClick={() => { rechecks.current = 0; void sync(false); }} disabled={syncing}
          style={{ minHeight: "32px", padding: "0 10px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", background: "transparent", color: "var(--text-secondary)", fontFamily: "var(--font-body)", fontSize: "var(--text-xs)", fontWeight: 600, cursor: "pointer" }}>
          {syncing ? "Syncing…" : "Sync now"}
        </button>
      </div>
      {msg && <span role="status" style={{ fontSize: "var(--text-xs)", color, fontFamily: "var(--font-body)", lineHeight: 1.5 }}>{msg.text}</span>}
    </div>
  );
}
