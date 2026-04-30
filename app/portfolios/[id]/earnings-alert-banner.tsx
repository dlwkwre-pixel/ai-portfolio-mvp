import { getFinnhubEarningsCalendar, getFinnhubNews } from "@/lib/market-data/finnhub";

type Props = {
  tickers: string[];
};

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function hourLabel(hour: string) {
  if (hour === "bmo") return "before open";
  if (hour === "amc") return "after close";
  if (hour === "dmh") return "during market hours";
  return "";
}

export default async function PortfolioAlertsBanner({ tickers }: Props) {
  if (!tickers.length) return null;

  // Fetch earnings and top news in parallel
  const [earnings, ...newsArrays] = await Promise.all([
    getFinnhubEarningsCalendar(tickers, 14).catch(() => []),
    // Get news for up to 5 tickers (most important ones)
    ...tickers.slice(0, 5).map((t) =>
      getFinnhubNews(t, 3).catch(() => [])
    ),
  ]);

  // Build alerts list
  type Alert = {
    type: "earnings" | "news";
    ticker: string;
    label: string;
    detail: string;
    urgency: "high" | "medium" | "low";
    url?: string;
  };

  const alerts: Alert[] = [];

  // Earnings alerts
  for (const e of earnings) {
    const days = daysUntil(e.date);
    if (days < 0 || days > 14) continue;

    const urgency = days <= 2 ? "high" : days <= 7 ? "medium" : "low";
    const when = days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`;
    const time = hourLabel(e.hour);

    alerts.push({
      type: "earnings",
      ticker: e.symbol,
      label: `${e.symbol} earnings ${when.toLowerCase()}`,
      detail: `Reports ${when}${time ? " " + time : ""} · ${e.date}`,
      urgency,
    });
  }

  // Top news alerts (only headline per ticker, skip duplicates)
  const seenTickers = new Set<string>();
  for (let i = 0; i < tickers.slice(0, 5).length; i++) {
    const ticker = tickers[i];
    const news = newsArrays[i] as Awaited<ReturnType<typeof getFinnhubNews>>;
    if (!news?.length || seenTickers.has(ticker)) continue;
    seenTickers.add(ticker);

    const top = news[0];
    if (!top?.headline) continue;

    alerts.push({
      type: "news",
      ticker,
      label: ticker,
      detail: top.headline.length > 80 ? top.headline.slice(0, 77) + "..." : top.headline,
      urgency: "low",
      url: top.url || undefined,
    });
  }

  if (!alerts.length) return null;

  // Sort: earnings first (by urgency), then news
  alerts.sort((a, b) => {
    if (a.type !== b.type) return a.type === "earnings" ? -1 : 1;
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.urgency] - order[b.urgency];
  });

  // Show max 4 alerts
  const visible = alerts.slice(0, 4);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      marginBottom: "16px",
    }}>
      {visible.map((alert, i) => {
        const isEarnings = alert.type === "earnings";
        const isHigh = alert.urgency === "high";
        const isMedium = alert.urgency === "medium";

        const bg = isEarnings
          ? isHigh
            ? "rgba(245,158,11,0.08)"
            : isMedium
            ? "rgba(245,158,11,0.05)"
            : "rgba(245,158,11,0.04)"
          : "rgba(255,255,255,0.02)";

        const border = isEarnings
          ? isHigh
            ? "rgba(245,158,11,0.3)"
            : isMedium
            ? "rgba(245,158,11,0.18)"
            : "rgba(245,158,11,0.1)"
          : "rgba(255,255,255,0.06)";

        const iconColor = isEarnings
          ? isHigh ? "#f59e0b" : "#d97706"
          : "#64748b";

        const content = (
          <div
            key={i}
            className="bt-banner-enter"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "9px 14px",
              background: bg,
              border: `1px solid ${border}`,
              borderRadius: "var(--radius-md)",
              textDecoration: "none",
              cursor: alert.url ? "pointer" : "default",
              transition: "var(--transition-base)",
            }}
          >
            {/* Icon */}
            <div style={{ flexShrink: 0 }}>
              {isEarnings ? (
                <svg width="14" height="14" viewBox="0 0 20 20" fill={iconColor}>
                  <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 20 20" fill={iconColor}>
                  <path fillRule="evenodd" d="M2 5a2 2 0 012-2h8a2 2 0 012 2v10a2 2 0 002 2H4a2 2 0 01-2-2V5zm3 1h6v4H5V6zm6 6H5v2h6v-2z" clipRule="evenodd"/>
                  <path d="M15 7h1a2 2 0 012 2v5.5a1.5 1.5 0 01-3 0V7z"/>
                </svg>
              )}
            </div>

            {/* Ticker badge */}
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              fontWeight: 600,
              color: isEarnings ? "#f59e0b" : "var(--text-tertiary)",
              background: isEarnings ? "rgba(245,158,11,0.1)" : "var(--card-bg)",
              border: `1px solid ${isEarnings ? "rgba(245,158,11,0.2)" : "var(--card-border)"}`,
              padding: "1px 6px",
              borderRadius: "var(--radius-sm)",
              flexShrink: 0,
            }}>
              {alert.ticker}
            </span>

            {/* Detail */}
            <span style={{
              fontSize: "12px",
              color: isEarnings ? "var(--text-secondary)" : "var(--text-tertiary)",
              lineHeight: 1.4,
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {alert.detail}
            </span>

            {/* Urgency dot for earnings */}
            {isEarnings && isHigh && (
              <div style={{
                width: "6px", height: "6px", borderRadius: "50%",
                background: "#f59e0b", flexShrink: 0,
                boxShadow: "0 0 6px rgba(245,158,11,0.6)",
                animation: "pulse-glow 2s infinite",
              }} />
            )}

            {/* External link icon for news */}
            {alert.url && (
              <svg width="11" height="11" viewBox="0 0 20 20" fill="var(--text-muted)" style={{ flexShrink: 0 }}>
                <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"/>
                <path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"/>
              </svg>
            )}
          </div>
        );

        return alert.url ? (
          <a key={i} href={alert.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
            {content}
          </a>
        ) : (
          <div key={i}>{content}</div>
        );
      })}
    </div>
  );
}
