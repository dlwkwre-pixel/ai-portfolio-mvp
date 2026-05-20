import { getFinnhubEarningsCalendar } from "@/lib/market-data/finnhub";

type Props = {
  tickers: string[];
};

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function weekLabel(days: number): string {
  if (days < 0) return "Past";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days <= 7) return "This Week";
  if (days <= 14) return "Next Week";
  return "Later";
}

function hourLabel(hour: string): string {
  if (hour === "bmo") return "BMO";
  if (hour === "amc") return "AMC";
  if (hour === "dmh") return "DMH";
  return "";
}

export default async function EarningsCalendarSection({ tickers }: Props) {
  if (!tickers.length) return null;

  const earnings = await getFinnhubEarningsCalendar(tickers, 30).catch(() => []);

  const upcoming = earnings
    .map((e) => ({ ...e, daysAway: daysUntil(e.date) }))
    .filter((e) => e.daysAway >= -1)
    .sort((a, b) => a.daysAway - b.daysAway);

  if (!upcoming.length) {
    return (
      <div className="bt-card">
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
          <svg width="12" height="12" viewBox="0 0 20 20" fill="#a78bfa">
            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
          </svg>
          <h2 style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)" }}>Upcoming Earnings</h2>
        </div>
        <p style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>No earnings scheduled in the next 30 days.</p>
      </div>
    );
  }

  // Group by week label, preserving order
  const groups: { label: string; items: typeof upcoming }[] = [];
  for (const item of upcoming) {
    const label = weekLabel(item.daysAway);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.items.push(item);
    } else {
      groups.push({ label, items: [item] });
    }
  }

  return (
    <div className="bt-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg width="12" height="12" viewBox="0 0 20 20" fill="#a78bfa">
            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
          </svg>
          <h2 style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-secondary)" }}>Upcoming Earnings</h2>
        </div>
        <span style={{ fontSize: "10px", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          30-day window
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {groups.map(({ label, items }) => (
          <div key={label}>
            <p style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>
              {label}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              {items.map((e) => {
                const isUrgent = e.daysAway <= 2;
                const hasEpsEst = e.epsEstimate != null;
                const hourTag = hourLabel(e.hour ?? "");

                return (
                  <div
                    key={e.symbol + e.date}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "8px 10px",
                      background: isUrgent ? "rgba(124,58,237,0.06)" : "var(--bg-elevated)",
                      border: `1px solid ${isUrgent ? "rgba(124,58,237,0.2)" : "var(--border-subtle)"}`,
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    {/* Ticker */}
                    <span style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "11px",
                      fontWeight: 700,
                      color: isUrgent ? "#a78bfa" : "var(--text-primary)",
                      minWidth: "44px",
                    }}>
                      {e.symbol}
                    </span>

                    {/* Date */}
                    <span style={{ fontSize: "11px", color: "var(--text-secondary)", flex: 1 }}>
                      {formatDate(e.date)}
                    </span>

                    {/* EPS estimate */}
                    {hasEpsEst && (
                      <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                        est&nbsp;{Number(e.epsEstimate).toFixed(2)}
                      </span>
                    )}

                    {/* Timing tag */}
                    {hourTag && (
                      <span style={{
                        fontSize: "9px",
                        fontWeight: 600,
                        color: hourTag === "BMO" ? "#60a5fa" : hourTag === "AMC" ? "#f59e0b" : "var(--text-muted)",
                        background: hourTag === "BMO" ? "rgba(96,165,250,0.08)" : hourTag === "AMC" ? "rgba(245,158,11,0.08)" : "rgba(255,255,255,0.04)",
                        border: `1px solid ${hourTag === "BMO" ? "rgba(96,165,250,0.2)" : hourTag === "AMC" ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.08)"}`,
                        padding: "1px 6px",
                        borderRadius: "var(--radius-sm)",
                        letterSpacing: "0.04em",
                      }}>
                        {hourTag}
                      </span>
                    )}

                    {/* Days pill */}
                    <span style={{
                      fontSize: "9px",
                      fontFamily: "var(--font-mono)",
                      color: isUrgent ? "#a78bfa" : "var(--text-muted)",
                      minWidth: "28px",
                      textAlign: "right",
                    }}>
                      {e.daysAway === 0 ? "today" : e.daysAway === 1 ? "tmrw" : `${e.daysAway}d`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "10px" }}>
        BMO = before market open · AMC = after market close
      </p>
    </div>
  );
}
