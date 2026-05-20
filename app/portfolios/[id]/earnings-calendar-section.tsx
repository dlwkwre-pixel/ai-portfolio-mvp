import { getFinnhubEarningsCalendar } from "@/lib/market-data/finnhub";
import EarningsCalendarClient from "./earnings-calendar-client";

type Props = {
  tickers: string[];
};

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export type EarningsRow = {
  symbol: string;
  date: string;
  daysAway: number;
  hour: string;
  epsEstimate: number | null;
  revenueEstimate: number | null;
  quarter: number;
  year: number;
};

export default async function EarningsCalendarSection({ tickers }: Props) {
  if (!tickers.length) return null;

  const earnings = await getFinnhubEarningsCalendar(tickers, 30).catch(() => []);

  const rows: EarningsRow[] = earnings
    .map((e) => ({
      symbol: e.symbol,
      date: e.date,
      daysAway: daysUntil(e.date),
      hour: e.hour ?? "",
      epsEstimate: e.epsEstimate ?? null,
      revenueEstimate: e.revenueEstimate ?? null,
      quarter: e.quarter,
      year: e.year,
    }))
    .filter((e) => e.daysAway >= -1)
    .sort((a, b) => a.daysAway - b.daysAway);

  return <EarningsCalendarClient rows={rows} />;
}
