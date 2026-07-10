# Connected-portfolio automation (SnapTrade read-only) — 2026-07

Once a BuyTune portfolio is linked to its brokerage (SnapTrade, read-only), the
product shifts from "a manual ledger you maintain" to "a live mirror of your real
account + an AI/planning layer on top." We NEVER place trades (violates Robinhood
ToS, and SnapTrade can't trade RH anyway). Everything below is read + react.

## What the read-only API actually exposes
- `getUserAccountPositions` — holdings (shares, cost basis) ✅ imported
- `getUserAccountBalance` — cash ✅ imported
- `getActivities` / `getAccountActivities` — transactions: buys, sells, **dividends**, deposits, withdrawals, fees, transfers
- `getUserAccountOrders` / `getUserAccountRecentOrders` — pending + recent orders
- `getUserAccountQuotes` — broker quotes (can include extended-hours)
- `getUserAccountDetails` — broker's reported total value
- `getUserAccountReturnRates` — broker's own computed return (reconciliation source)
- `getUserAccountOptionQuotes` — option positions

## The automation map (by value)

### 1. Keep the mirror fresh (foundation)
Daily cron sync for connected accounts + a manual "Refresh" button + last-synced
stamp. Positions + balances every sync. Turns the reconcile ritual automatic
(freshness = last sync time). SnapTrade "Daily" plan is cheap for the cron;
"Real-time" for manual refresh.

### 2. Auto-import transactions, dividends & cash flows (biggest accuracy win)
Pull `getActivities` → map into BuyTune's transactions + cash_ledger, deduped by
SnapTrade activity id:
- **Buys/sells** → transaction history + realized P/L + tax lots + Tax Center.
- **Dividends** → auto-logged (reason=dividend) → count in returns automatically
  (the manual dividend logger we built becomes hands-free).
- **Deposits/withdrawals** → classified as external flows → TWR/return correct with
  zero manual entry (kills the whole class of return-calc bugs for linked accounts).
Net effect: returns, income, and tax become accurate for free.

### 3. Reconciliation trust badge (biggest trust win)
Compare BuyTune's computed value + return to the broker's `getUserAccountDetails`
total and `getUserAccountReturnRates`. Show "✓ Matches your brokerage" when they
agree (within a tolerance), or flag the gap. This is the thing that makes a
manual-first app finally feel trustworthy. Directly answers Origin's aggregation
advantage.

### 4. Change detection → Pulse + auto-journal + AI ("connected magic")
On each sync, diff new positions/activities vs last snapshot to detect trades the
user made in Robinhood:
- Surface in the Pulse: "Since your last visit: you bought NVDA, sold TSLA."
- Auto-journal detected trades (same idea as the AI-rec auto-journal, but sourced
  from real broker activity).
- Offer a fresh AI take on new/changed positions.
- Closes the rec loop WITHOUT trading: user acts on a rec in Robinhood → next sync
  detects the matching trade → mark the rec "executed" automatically.

### 5. Pricing: during vs after hours
- During hours: keep Finnhub/FMP live quotes (works already, broker-independent).
- After hours / gaps: fall back to broker quotes (`getUserAccountQuotes`) or the
  position price for extended-hours, thinly-traded names, or crypto the free feeds
  miss. Always show an "as of" timestamp.

### 6. Pending orders awareness
`getUserAccountOrders` → surface open orders placed in Robinhood ("Limit order:
AAPL @ $180, open"), so BuyTune reflects intent, not just settled state.

## Guardrails
- Read-only forever for linked accounts; no trade placement.
- A linked portfolio is a mirror: manual edits should be discouraged/locked, or the
  next sync overwrites them. Consider a "linked" flag on the portfolio + a lock UI.
- Dedup everything by SnapTrade ids (activity id, order id) to avoid double-counting
  against the AI-rec-execute flow and manual entries.

## Recommended build order
1. Scheduled auto-sync + Refresh (foundation).
2. Auto-import activities → transactions/dividends/cash flows (accuracy).
3. Reconciliation "matches your brokerage" badge (trust).
4. Change detection → Pulse + auto-journal (+ auto-confirm recs).
5. After-hours broker pricing fallback.
6. Pending orders.
