export type RangeKey = "1M" | "3M" | "6M" | "YTD" | "1Y" | "3Y" | "5Y" | "MAX";

export type BenchmarkBar = {
  date: string;
  close: number;
  adjClose: number;
  volume?: number;
  source: "fmp" | "finnhub";
};

export type IndexedPoint = {
  date: string;
  value: number;
};