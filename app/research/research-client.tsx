"use client";

import { useState, useEffect, useRef } from "react";

type SearchResult = {
  ticker: string;
  quote: { c: number; d: number; dp: number };
  profile: { name: string; logo: string; weburl: string } | null;
  recommendation: {
    buy: number; hold: number; sell: number;
    strongBuy: number; strongSell: number;
  } | null;
  priceTarget: { targetMean: number; targetHigh: number; targetLow: number } | null;
  news: { headline: string; source: string; url: string; datetime: number }[];
};

type ScreenerTicker = {
  ticker: string;
  name: string;
  price?: number;
  change?: number;
  changePct?: number;
};

type ScreenerSection = {
  id: string;
  label: string;
  emoji: string;
  tickers: ScreenerTicker[];
};

type NewsItem = {
  id: number;
  headline: string;
  source: string;
  url: string;
  datetime: number;
};

function analystLabel(rec: SearchResult["recommendation"]) {
  if (!rec) return null;
  const bullish = (rec.strongBuy ?? 0) + (rec.buy ?? 0);
  const bearish = (rec.strongSell ?? 0) + (rec.sell ?? 0);
  const neutral = rec.hold ?? 0;
  const total = bullish + bearish + neutral;
  if (total === 0) return null;
  if (bullish / total >= 0.5) return { label: "Buy", color: "var(--green)" };
  if (bearish / total >= 0.4) return { label: "Sell", color: "var(--red)" };
  return { label: "Hold", color: "var(--amber)" };
}

function formatPrice(p: number) {
  return p >= 1000
    ? `$${p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${p.toFixed(2)}`;
}

function timeAgo(unix: number) {
  const diff = Date.now() / 1000 - unix;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function StockCard({ t, onClick }: { t: ScreenerTicker; onClick: (ticker: string) => void }) {
  const isUp = (t.changePct ?? 0) >= 0;
  const hasQuote = t.price != null;
  return (
    <button
      onClick={() => onClick(t.ticker)}
      style={{
        flexShrink: 0,
        width: "140px",
        padding: "12px",
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
        borderRadius: "12px",
        textAlign: "left",
        cursor: "pointer",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(37,99,235,0.4)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--card-border)")}
    >
      <div
        className="ticker"
        style={{ marginBottom: "8px", display: "inline-block" }}
      >
        {t.ticker}
      </div>
      <div style={{
        fontSize: "11px",
        color: "var(--text-tertiary)",
        marginBottom: "8px",
        lineHeight: 1.3,
        height: "28px",
        overflow: "hidden",
      }}>
        {t.name}
      </div>
      {hasQuote ? (
        <>
          <div className="num" style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
            {formatPrice(t.price!)}
          </div>
          <div className="num" style={{
            fontSize: "11px",
            color: isUp ? "var(--green)" : "var(--red)",
            marginTop: "2px",
          }}>
            {isUp ? "+" : ""}{t.changePct?.toFixed(2)}%
          </div>
        </>
      ) : (
        <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>—</div>
      )}
    </button>
  );
}

function NewsCard({ item }: { item: NewsItem }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "block",
        padding: "12px 16px",
        borderBottom: "1px solid var(--border-subtle)",
        textDecoration: "none",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--card-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <div style={{
        fontSize: "12px",
        fontWeight: 500,
        color: "var(--text-primary)",
        lineHeight: 1.4,
        marginBottom: "4px",
      }}>
        {item.headline}
      </div>
      <div style={{ display: "flex", gap: "6px", fontSize: "11px", color: "var(--text-muted)" }}>
        <span>{item.source}</span>
        <span>·</span>
        <span>{timeAgo(item.datetime)}</span>
      </div>
    </a>
  );
}

export default function ResearchClient() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [screener, setScreener] = useState<ScreenerSection[]>([]);
  const [screenerLoading, setScreenerLoading] = useState(true);

  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);

  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/research/screener")
      .then((r) => r.json())
      .then((d) => setScreener(d.sections ?? []))
      .catch(() => {})
      .finally(() => setScreenerLoading(false));

    fetch("/api/research/news")
      .then((r) => r.json())
      .then((d) => setNews(d.news ?? []))
      .catch(() => {})
      .finally(() => setNewsLoading(false));
  }, []);

  function doSearch(ticker: string) {
    const t = ticker.trim().toUpperCase();
    if (!t) return;
    setSearching(true);
    setSearchError(null);
    setSearchResult(null);
    topRef.current?.scrollIntoView({ behavior: "smooth" });
    fetch(`/api/research/search?ticker=${t}`)
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then((d) => setSearchResult(d))
      .catch(() => setSearchError(`No data found for "${t}"`))
      .finally(() => setSearching(false));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    doSearch(query);
  }

  function clearSearch() {
    setQuery("");
    setSearchResult(null);
    setSearchError(null);
  }

  const rating = searchResult ? analystLabel(searchResult.recommendation) : null;
  const upside =
    searchResult?.priceTarget?.targetMean && searchResult.quote.c > 0
      ? ((searchResult.priceTarget.targetMean - searchResult.quote.c) / searchResult.quote.c) * 100
      : null;

  return (
    <div ref={topRef} style={{ maxWidth: "960px" }}>
      {/* Search bar */}
      <form onSubmit={handleSubmit} style={{ marginBottom: "24px" }}>
        <div style={{ position: "relative" }}>
          <svg
            style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)", pointerEvents: "none" }}
            width="16" height="16" viewBox="0 0 20 20" fill="currentColor"
          >
            <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
            placeholder="Search a ticker — AAPL, TSLA, NVDA..."
            style={{
              width: "100%",
              padding: "13px 48px 13px 42px",
              background: "var(--card-bg)",
              border: "1px solid var(--card-border)",
              borderRadius: "12px",
              color: "var(--text-primary)",
              fontSize: "14px",
              fontFamily: "var(--font-mono)",
              outline: "none",
              boxSizing: "border-box",
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => (e.target.style.borderColor = "rgba(37,99,235,0.5)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--card-border)")}
          />
          {query && (
            <button
              type="button"
              onClick={clearSearch}
              style={{
                position: "absolute", right: "14px", top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)",
                padding: "4px", display: "flex", alignItems: "center",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      </form>

      {/* Search state feedback */}
      {searching && (
        <div style={{ padding: "20px 0 8px", color: "var(--text-muted)", fontSize: "13px" }}>
          Loading {query}...
        </div>
      )}

      {searchError && (
        <div style={{
          padding: "14px 16px",
          background: "var(--red-bg)",
          border: "1px solid var(--red-border)",
          borderRadius: "12px",
          color: "var(--red)",
          fontSize: "13px",
          marginBottom: "24px",
        }}>
          {searchError}
        </div>
      )}

      {/* Search result card */}
      {searchResult && !searching && (
        <div style={{
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: "16px",
          marginBottom: "32px",
          overflow: "hidden",
        }}>
          {/* Header row */}
          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border-subtle)" }}>
            <div style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "16px",
              flexWrap: "wrap",
            }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                  <span className="ticker" style={{ fontSize: "13px", padding: "3px 10px" }}>
                    {searchResult.ticker}
                  </span>
                  {rating && (
                    <span style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      padding: "3px 8px",
                      borderRadius: "6px",
                      background: `color-mix(in srgb, ${rating.color} 15%, transparent)`,
                      color: rating.color,
                    }}>
                      {rating.label}
                    </span>
                  )}
                </div>
                <div style={{
                  fontSize: "20px",
                  fontWeight: 700,
                  fontFamily: "var(--font-display)",
                  color: "var(--text-primary)",
                }}>
                  {searchResult.profile?.name || searchResult.ticker}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="num" style={{ fontSize: "26px", fontWeight: 700, color: "var(--text-primary)" }}>
                  {formatPrice(searchResult.quote.c)}
                </div>
                <div className="num" style={{
                  fontSize: "13px",
                  color: searchResult.quote.dp >= 0 ? "var(--green)" : "var(--red)",
                  marginTop: "2px",
                }}>
                  {searchResult.quote.dp >= 0 ? "+" : ""}{searchResult.quote.d.toFixed(2)}
                  {" "}({searchResult.quote.dp >= 0 ? "+" : ""}{searchResult.quote.dp.toFixed(2)}%)
                </div>
              </div>
            </div>
          </div>

          {/* Analyst ratings + price target */}
          {(searchResult.recommendation || searchResult.priceTarget) && (
            <div style={{
              padding: "16px 24px",
              borderBottom: "1px solid var(--border-subtle)",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "20px",
            }}>
              {searchResult.recommendation && (() => {
                const rec = searchResult.recommendation!;
                const total = rec.strongBuy + rec.buy + rec.hold + rec.sell + rec.strongSell;
                const bullPct = total > 0 ? ((rec.strongBuy + rec.buy) / total) * 100 : 0;
                const holdPct = total > 0 ? (rec.hold / total) * 100 : 0;
                const bearPct = total > 0 ? ((rec.strongSell + rec.sell) / total) * 100 : 0;
                return (
                  <div>
                    <div style={{
                      fontSize: "10px",
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom: "8px",
                    }}>
                      Analyst Ratings
                    </div>
                    <div style={{
                      display: "flex",
                      gap: "3px",
                      height: "5px",
                      borderRadius: "3px",
                      overflow: "hidden",
                      marginBottom: "8px",
                    }}>
                      <div style={{ width: `${bullPct}%`, background: "var(--green)", borderRadius: "3px 0 0 3px" }} />
                      <div style={{ width: `${holdPct}%`, background: "var(--amber)" }} />
                      <div style={{ width: `${bearPct}%`, background: "var(--red)", borderRadius: "0 3px 3px 0" }} />
                    </div>
                    <div style={{ display: "flex", gap: "14px", fontSize: "11px" }}>
                      <span style={{ color: "var(--green)" }}>Buy {rec.strongBuy + rec.buy}</span>
                      <span style={{ color: "var(--amber)" }}>Hold {rec.hold}</span>
                      <span style={{ color: "var(--red)" }}>Sell {rec.strongSell + rec.sell}</span>
                    </div>
                  </div>
                );
              })()}
              {searchResult.priceTarget && (
                <div>
                  <div style={{
                    fontSize: "10px",
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: "8px",
                  }}>
                    Price Target
                  </div>
                  <div className="num" style={{ fontSize: "20px", fontWeight: 600, color: "var(--text-primary)" }}>
                    {formatPrice(searchResult.priceTarget.targetMean)}
                  </div>
                  {upside !== null && (
                    <div className="num" style={{
                      fontSize: "12px",
                      color: upside >= 0 ? "var(--green)" : "var(--red)",
                      marginTop: "2px",
                    }}>
                      {upside >= 0 ? "+" : ""}{upside.toFixed(1)}% upside
                    </div>
                  )}
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "3px" }}>
                    {formatPrice(searchResult.priceTarget.targetLow)} – {formatPrice(searchResult.priceTarget.targetHigh)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Recent news */}
          {searchResult.news.length > 0 && (
            <div>
              <div style={{
                padding: "12px 24px 0",
                fontSize: "10px",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}>
                Recent News
              </div>
              {searchResult.news.slice(0, 4).map((item, i) => (
                <a
                  key={i}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "block",
                    padding: "12px 24px",
                    borderTop: "1px solid var(--border-subtle)",
                    textDecoration: "none",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--card-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <div style={{
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "var(--text-primary)",
                    lineHeight: 1.4,
                    marginBottom: "3px",
                  }}>
                    {item.headline}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    {item.source} · {timeAgo(item.datetime)}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main two-column layout */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 300px",
        gap: "24px",
        alignItems: "start",
      }}
        className="research-grid"
      >
        {/* Screener sections */}
        <div>
          {screenerLoading ? (
            <div style={{ color: "var(--text-muted)", fontSize: "13px", paddingTop: "8px" }}>
              Loading market data...
            </div>
          ) : (
            screener.map((section) => (
              <div key={section.id} style={{ marginBottom: "28px" }}>
                <div style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-display)",
                  marginBottom: "12px",
                }}>
                  {section.emoji} {section.label}
                </div>
                <div style={{
                  display: "flex",
                  gap: "10px",
                  overflowX: "auto",
                  paddingBottom: "6px",
                }}>
                  {section.tickers.map((t) => (
                    <StockCard
                      key={t.ticker}
                      t={t}
                      onClick={(ticker) => {
                        setQuery(ticker);
                        doSearch(ticker);
                      }}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* News sidebar */}
        <div style={{
          background: "var(--card-bg)",
          border: "1px solid var(--card-border)",
          borderRadius: "16px",
          overflow: "hidden",
          position: "sticky",
          top: "20px",
        }}>
          <div style={{
            padding: "14px 16px",
            borderBottom: "1px solid var(--border-subtle)",
          }}>
            <div style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--text-primary)",
              fontFamily: "var(--font-display)",
            }}>
              Market News
            </div>
          </div>
          {newsLoading ? (
            <div style={{ padding: "20px 16px", color: "var(--text-muted)", fontSize: "13px" }}>
              Loading...
            </div>
          ) : news.length === 0 ? (
            <div style={{ padding: "20px 16px", color: "var(--text-muted)", fontSize: "13px" }}>
              No news available.
            </div>
          ) : (
            news.map((item) => <NewsCard key={item.id} item={item} />)
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .research-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}
