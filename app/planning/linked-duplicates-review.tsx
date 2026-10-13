"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BalanceSheetItem } from "./planning-actions";
import { deleteBalanceSheetItem } from "./planning-actions";
import type { PortfolioAccount } from "./planning-shared";

// After linking banks, balances the user typed in earlier (balance sheet items, or "Other
// accounts" on Connections) often describe the same money as a linked account or a
// portfolio — counted twice. This finds likely pairs and offers to keep the automatic one.

type Side = { id: string; label: string; value: number; group: string };
type Pair = { key: string; mine: Side & { kind: "sheet" | "other-account" }; auto: Side & { kind: "linked" | "portfolio" } };

const DISMISS_KEY = "bt-dup-review-dismissed";

function group(category: string, isLiability: boolean): string {
  if (isLiability) return category === "credit_card" ? "credit" : category === "mortgage" ? "mortgage" : "loan";
  if (category === "cash") return "cash";
  if (category === "investment" || category === "retirement") return "investment";
  return category;
}

const GENERIC = new Set(["account", "accounts", "checking", "savings", "saving", "card", "credit", "bank", "linked", "total", "individual", "brokerage", "the", "my"]);
function tokens(label: string): Set<string> {
  return new Set(label.toLowerCase().replace(/\(linked\)/g, "").split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !GENERIC.has(w)));
}

function looksSame(a: Side, b: Side): boolean {
  if (a.group !== b.group) return false;
  const ta = tokens(a.label), tb = tokens(b.label);
  const sharedName = [...ta].some((t) => tb.has(t));
  const closeValue = a.value >= 100 && Math.abs(a.value - b.value) <= Math.max(a.value, b.value) * 0.03;
  return sharedName || closeValue;
}

export default function LinkedDuplicatesReview({
  balanceItems, portfolioAccounts, isPrivate,
}: {
  balanceItems: BalanceSheetItem[];
  portfolioAccounts: PortfolioAccount[];
  isPrivate: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // The balance sheet tab is client-only (dynamic, ssr: false), so reading storage in the
  // initializer can't cause a hydration mismatch.
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "[]") as string[]); } catch { return new Set(); }
  });

  const pairs = useMemo(() => {
    const isOtherAccount = (i: BalanceSheetItem) => i.id.startsWith("linked:manual:");
    const linked = balanceItems.filter((i) => i.id.startsWith("linked:") && !isOtherAccount(i));
    const mine = balanceItems.filter((i) => !i.id.startsWith("linked:") || isOtherAccount(i));
    const autos: Pair["auto"][] = [
      ...linked.map((i) => ({ id: i.id, label: i.label, value: i.value, group: group(i.category, i.is_liability), kind: "linked" as const })),
      ...portfolioAccounts.filter((p) => p.value > 0).map((p) => ({ id: `portfolio:${p.id}`, label: p.name, value: p.value, group: "investment", kind: "portfolio" as const })),
    ];
    const used = new Set<string>();
    const out: Pair[] = [];
    for (const m of mine) {
      const side = { id: m.id, label: m.label, value: m.value, group: group(m.category, m.is_liability), kind: isOtherAccount(m) ? "other-account" as const : "sheet" as const };
      const match = autos.find((a) => !used.has(a.id) && looksSame(side, a));
      if (!match) continue;
      const key = `${side.id}|${match.id}`;
      if (dismissed.has(key)) continue;
      used.add(match.id);
      out.push({ key, mine: side, auto: match });
    }
    return out;
  }, [balanceItems, portfolioAccounts, dismissed]);

  if (pairs.length === 0) return null;
  const money = (n: number) => (isPrivate ? "••••" : `$${Math.round(n).toLocaleString()}`);

  function dismiss(key: string) {
    const next = new Set(dismissed).add(key);
    setDismissed(next);
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify([...next])); } catch { /* storage blocked */ }
  }

  function keepAuto(p: Pair) {
    startTransition(async () => {
      await deleteBalanceSheetItem(p.mine.id);
      router.refresh();
    });
  }

  return (
    <div style={{ border: "1px solid var(--amber)", background: "var(--amber-bg)", borderRadius: "var(--radius-md)", padding: "12px 14px", marginBottom: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div>
        <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-body)" }}>
          {`${pairs.length} balance${pairs.length !== 1 ? "s" : ""} might be counted twice`}
        </div>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.5, marginTop: "2px" }}>
          These look like the same money entered by hand and synced automatically. Keeping the synced one means it stays up to date on its own.
        </div>
      </div>
      {pairs.map((p) => (
        <div key={p.key} style={{ display: "flex", flexDirection: "column", gap: "6px", paddingTop: "8px", borderTop: "1px solid var(--border-subtle)" }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", fontFamily: "var(--font-body)", lineHeight: 1.5 }}>
            {"Yours: "}<strong style={{ color: "var(--text-primary)" }}>{p.mine.label}</strong>
            {" "}<span style={{ fontFamily: "var(--font-mono)" }}>{money(p.mine.value)}</span>
            <br />
            {p.auto.kind === "portfolio" ? "Portfolio: " : "Synced: "}<strong style={{ color: "var(--text-primary)" }}>{p.auto.label}</strong>
            {" "}<span style={{ fontFamily: "var(--font-mono)" }}>{money(p.auto.value)}</span>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {p.mine.kind === "sheet" ? (
              <button type="button" disabled={pending} onClick={() => keepAuto(p)}
                style={{ minHeight: "32px", padding: "0 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--green-border)", background: "var(--green-bg)", color: "var(--green)", fontSize: "var(--text-xs)", fontWeight: 600, fontFamily: "var(--font-body)", cursor: "pointer" }}>
                {p.auto.kind === "portfolio" ? "Use the portfolio, remove mine" : "Use synced, remove mine"}
              </button>
            ) : (
              <Link href="/connections"
                style={{ display: "inline-flex", alignItems: "center", minHeight: "32px", padding: "0 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--green-border)", background: "var(--green-bg)", color: "var(--green)", fontSize: "var(--text-xs)", fontWeight: 600, fontFamily: "var(--font-body)", textDecoration: "none" }}>
                Remove it under Connections → Other accounts
              </Link>
            )}
            <button type="button" onClick={() => dismiss(p.key)}
              style={{ minHeight: "32px", padding: "0 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", background: "transparent", color: "var(--text-secondary)", fontSize: "var(--text-xs)", fontFamily: "var(--font-body)", cursor: "pointer" }}>
              Not the same
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
