"use client";

import { useState } from "react";

const CHANNELS = [
  { id: "bloomberg", label: "Bloomberg", channelId: "UCIALMKvObZNtJ6AmdCLP7Lg" },
  { id: "yahoo",     label: "Yahoo Finance", channelId: "UCEAZeUIeJs0IjQiqTCdVSIg" },
  { id: "cnbc",      label: "CNBC", channelId: "UCvJJ_dzjViJCoLf5uKUTwoA" },
] as const;

type ChannelId = (typeof CHANNELS)[number]["id"];

export default function MarketNewsChannel() {
  const [open, setOpen] = useState(false);
  const [channelId, setChannelId] = useState<ChannelId>("bloomberg");

  const active = CHANNELS.find((c) => c.id === channelId)!;

  return (
    <div style={{ marginBottom: "14px" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "inline-flex", alignItems: "center", gap: "6px",
          padding: "7px 14px", borderRadius: "var(--radius-full)",
          border: `1px solid ${open ? "var(--brand-blue)" : "var(--card-border)"}`,
          background: open ? "rgba(14,165,160,0.1)" : "var(--card-bg)",
          color: open ? "var(--brand-blue)" : "var(--text-primary)",
          fontSize: "12.5px", fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-body)",
        }}
      >
        <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
          <path d="M2 6a2 2 0 012-2h7a2 2 0 012 2v1.382l3.553-1.776A1 1 0 0118 6.5v7a1 1 0 01-1.447.894L13 11.618V13a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
        </svg>
        {open ? "Hide live market news" : "Watch live market news"}
      </button>

      {open && (
        <div style={{ marginTop: "10px" }}>
          <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
            {CHANNELS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setChannelId(c.id)}
                style={{
                  padding: "5px 12px", borderRadius: "var(--radius-full)",
                  border: `1px solid ${channelId === c.id ? "var(--brand-blue)" : "var(--border-subtle)"}`,
                  background: channelId === c.id ? "rgba(14,165,160,0.15)" : "transparent",
                  color: channelId === c.id ? "var(--brand-blue)" : "var(--text-secondary)",
                  fontSize: "11.5px", fontWeight: channelId === c.id ? 700 : 500,
                  cursor: "pointer", fontFamily: "var(--font-body)",
                }}
              >
                {c.label}
              </button>
            ))}
          </div>

          <div style={{ position: "relative", width: "100%", paddingTop: "56.25%", borderRadius: "var(--radius-lg)", overflow: "hidden", border: "1px solid var(--card-border)", background: "#000" }}>
            {/* key forces a clean remount on channel switch rather than mutating iframe src in place */}
            <iframe
              key={active.id}
              src={`https://www.youtube.com/embed/live_stream?channel=${active.channelId}&autoplay=1&mute=1`}
              title={`${active.label} live market news`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
            />
          </div>
          <p style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "6px" }}>
            Live stream via YouTube — not affiliated with or endorsed by BuyTune. Closing this panel stops playback.
          </p>
        </div>
      )}
    </div>
  );
}
