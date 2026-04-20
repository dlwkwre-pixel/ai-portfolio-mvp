export type FinnhubQuote = {
  c: number;
  d: number;
  dp: number;
  h: number;
  l: number;
  o: number;
  pc: number;
  t: number;
};

export type FinnhubCandlesResponse = {
  c: number[];
  h: number[];
  l: number[];
  o: number[];
  s: string;
  t: number[];
  v: number[];
};

export async function getFinnhubQuote(symbol: string): Promise<FinnhubQuote | null> {
  const apiKey = process.env.FINNHUB_API_KEY;

  if (!apiKey) {
    throw new Error("Missing FINNHUB_API_KEY in environment variables.");
  }

  const normalizedSymbol = symbol.trim().toUpperCase();

  if (!normalizedSymbol) {
    return null;
  }

  const url = new URL("https://finnhub.io/api/v1/quote");
  url.searchParams.set("symbol", normalizedSymbol);
  url.searchParams.set("token", apiKey);

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Finnhub quote request failed for ${normalizedSymbol} with status ${response.status}.`
    );
  }

  const data = (await response.json()) as Partial<FinnhubQuote>;

  if (!data) {
    return null;
  }

  const currentPrice =
    typeof data.c === "number" && data.c > 0
      ? Number(data.c)
      : typeof data.pc === "number" && data.pc > 0
      ? Number(data.pc)
      : null;

  if (currentPrice === null) {
    return null;
  }

  return {
    c: currentPrice,
    d: typeof data.d === "number" ? Number(data.d) : 0,
    dp: typeof data.dp === "number" ? Number(data.dp) : 0,
    h: typeof data.h === "number" ? Number(data.h) : 0,
    l: typeof data.l === "number" ? Number(data.l) : 0,
    o: typeof data.o === "number" ? Number(data.o) : 0,
    pc: typeof data.pc === "number" ? Number(data.pc) : currentPrice,
    t: typeof data.t === "number" ? Number(data.t) : 0,
  };
}

export async function getFinnhubDailyCandles(args: {
  symbol: string;
  fromUnix: number;
  toUnix: number;
}): Promise<FinnhubCandlesResponse | null> {
  const apiKey = process.env.FINNHUB_API_KEY;

  if (!apiKey) {
    throw new Error("Missing FINNHUB_API_KEY in environment variables.");
  }

  const symbol = args.symbol.trim().toUpperCase();

  if (!symbol) {
    return null;
  }

  const url = new URL("https://finnhub.io/api/v1/stock/candle");
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("resolution", "D");
  url.searchParams.set("from", String(args.fromUnix));
  url.searchParams.set("to", String(args.toUnix));
  url.searchParams.set("token", apiKey);

  const response = await fetch(url.toString(), {
    method: "GET",
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    throw new Error(
      `Finnhub candle request failed for ${symbol} with status ${response.status}.`
    );
  }

  const data = (await response.json()) as Partial<FinnhubCandlesResponse>;

  if (!data || data.s !== "ok" || !Array.isArray(data.c) || !Array.isArray(data.t)) {
    return null;
  }

  return {
    c: data.c.map(Number),
    h: Array.isArray(data.h) ? data.h.map(Number) : [],
    l: Array.isArray(data.l) ? data.l.map(Number) : [],
    o: Array.isArray(data.o) ? data.o.map(Number) : [],
    s: data.s,
    t: data.t.map(Number),
    v: Array.isArray(data.v) ? data.v.map(Number) : [],
  };
}