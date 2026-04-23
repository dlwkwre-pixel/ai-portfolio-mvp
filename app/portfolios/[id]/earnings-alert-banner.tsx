import { getFinnhubEarningsCalendar } from "@/lib/market-data/finnhub";

type EarningsAlertBannerProps = {
  tickers: string[];
};

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatHour(hour: string) {
  if (hour === "bmo") return "before market open";
  if (hour === "amc") return "after market close";
  if (hour === "dmh") return "during market hours";
  return "";
}

export default async function EarningsAlertBanner({ tickers }: EarningsAlertBannerProps) {
  if (!tickers.length) return null;

  let earnings: Awaited<ReturnType<typeof getFinnhubEarningsCalendar>> = [];

  try {
    earnings = await getFinnhubEarningsCalendar(tickers, 14);
  } catch {
    return null;
  }

  if (!earnings.length) return null;

  // Sort by date ascending, filter to next 14 days
  const upcoming = earnings
    .filter((e) => {
      const days = daysUntil(e.date);
      return days >= 0 && days <= 14;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (!upcoming.length) return null;

  return (
    <div className="mb-5 space-y-2">
      {upcoming.map((earning) => {
        const days = daysUntil(earning.date);
        const isToday = days === 0;
        const isTomorrow = days === 1;
        const isUrgent = days <= 2;

        const dayLabel = isToday ? "today" : isTomorrow ? "tomorrow" : `in ${days} days`;
        const hourLabel = formatHour(earning.hour);

        return (
          <div
            key={`${earning.symbol}-${earning.date}`}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
              isUrgent
                ? "border-amber-500/30 bg-amber-500/10"
                : "border-white/8 bg-white/3"
            }`}
          >
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
              isUrgent ? "bg-amber-500/20" : "bg-white/8"
            }`}>
              <svg viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 ${isUrgent ? "text-amber-400" : "text-slate-400"}`}>
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${isUrgent ? "text-amber-300" : "text-white"}`}>
                <span className="font-bold">{earning.symbol}</span> reports earnings {dayLabel}
                {hourLabel && <span className="font-normal text-xs ml-1 opacity-70">({hourLabel})</span>}
              </p>
              {earning.epsEstimate !== null && (
                <p className="text-xs text-slate-500 mt-0.5">
                  EPS estimate: ${earning.epsEstimate?.toFixed(2)} · Q{earning.quarter} {earning.year}
                </p>
              )}
            </div>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
              isToday ? "border-red-500/30 bg-red-500/15 text-red-300"
              : isTomorrow ? "border-amber-500/30 bg-amber-500/15 text-amber-300"
              : "border-white/10 bg-white/5 text-slate-400"
            }`}>
              {isToday ? "TODAY" : isTomorrow ? "TOMORROW" : `${days}d`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
