// Fixed universe of liquid, well-known large/mid-cap US tickers spanning
// sectors, used as the backtest candidate pool. NOT a historical index
// constituent list — using today's well-known liquid names as a stand-in
// for "the historically tradeable universe" means results carry survivorship
// bias (only companies that are still around and liquid today are testable).
// That's a known, disclosed simplification for a v1 mechanical backtest, not
// an attempt at point-in-time rigor.
export const BACKTEST_UNIVERSE: readonly string[] = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "AVGO", "ORCL", "CRM",
  "ADBE", "NFLX", "AMD", "INTC", "QCOM", "TXN", "CSCO", "IBM", "NOW", "INTU",
  "AMAT", "MU", "LRCX", "PANW", "CRWD", "SNPS", "CDNS", "FTNT", "ADSK", "WDAY",
  "JPM", "V", "MA", "BAC", "MS", "GS", "SCHW", "BLK", "AXP", "PYPL",
  "C", "WFC", "SPGI", "ICE", "CME", "PGR", "TRV", "AIG",
  "UNH", "JNJ", "ABBV", "MRK", "PFE", "LLY", "TMO", "DHR", "MRNA", "CVS",
  "ISRG", "VRTX", "REGN", "GILD", "BSX", "SYK", "MDT", "ELV", "CI", "HUM",
  "HD", "PG", "KO", "PEP", "COST", "WMT", "NKE", "SBUX", "MCD", "LOW",
  "TGT", "DIS", "UBER", "ABNB", "SHOP", "SQ", "COIN", "SNOW", "PLTR", "DASH",
  "CMG", "ROST", "TJX", "YUM", "MAR", "BKNG", "EBAY", "ETSY",
  "XOM", "CVX", "COP", "SLB", "EOG", "OXY", "PSX", "MPC",
  "HON", "CAT", "DE", "BA", "GE", "LMT", "RTX", "UPS", "FDX", "MMM",
  "EMR", "ETN", "ITW", "PH", "GD", "NOC", "UNP", "CSX",
  "TEAM", "DDOG", "NET", "ZS", "MDB", "HUBS", "TTD",
];
