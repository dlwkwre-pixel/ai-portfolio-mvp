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
  "AMAT", "MU", "LRCX", "JPM", "V", "MA", "BAC", "MS", "GS", "SCHW",
  "BLK", "AXP", "PYPL", "UNH", "JNJ", "ABBV", "MRK", "PFE", "LLY", "TMO",
  "DHR", "MRNA", "CVS", "HD", "PG", "KO", "PEP", "COST", "WMT", "NKE",
  "SBUX", "MCD", "LOW", "TGT", "DIS", "UBER", "ABNB", "SHOP", "SQ", "COIN",
  "SNOW", "PLTR", "XOM", "CVX", "HON", "CAT", "DE", "BA", "GE", "LMT",
  "RTX", "UPS", "FDX",
];
