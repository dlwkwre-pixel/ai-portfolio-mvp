# BuyTune Design Language

Quick-reference for implementation. Full spec in `DESIGN.md` at the repo root.

**North Star:** "The Signal Room" — a dark analytics environment for investors who need to extract signal from noise. Precision instrument, not consumer app.

---

## Color Tokens (CSS Variables)

```css
/* Backgrounds */
--bg-base:      #07090f   /* Page background */
--bg-surface:   #0a0d15   /* Sidebar, secondary surfaces */
--bg-elevated:  #0d1120   /* Modals, overlays */
--bg-overlay:   #111827   /* Highest elevation */

/* Brand */
--brand-blue:   #2563eb   /* Primary accent, interactive */
--brand-violet: #7c3aed   /* Gradient endpoint only */
--violet-light: #a78bfa   /* AI context, badges */

/* Signal (semantic only — never decorative) */
--signal-green: #00d395   /* Gains, bullish, positive */
--signal-red:   #ff5c5c   /* Losses, bearish, negative */
--signal-amber: #f59e0b   /* Neutral, watch, caution */

/* Text */
--text-primary:   #f0f4ff  /* Headlines, prices, key numbers */
--text-secondary: #94a3b8  /* Body, descriptions */
--text-tertiary:  #475569  /* Labels, metadata */
--text-muted:     #2d3748  /* Disabled, placeholder */

/* Surfaces */
--card-bg:     rgba(255,255,255,0.025)
--card-border: rgba(255,255,255,0.06)
```

---

## Typography

| Role | Font | Size | Weight | Notes |
|---|---|---|---|---|
| Display | Syne | clamp(22–32px) | 700 | Page titles, hero stock names |
| Title | Syne | 15–18px | 600 | Section headers, card titles |
| Body | DM Sans | 13px | 400 | Descriptions, news, analysis |
| Label | DM Sans | 9–10px | 600 | ALL CAPS, +0.08em tracking |
| Numeric | DM Mono | variable | 500 | ALL prices, %, counts, scores |
| Ticker chip | DM Mono | 11px | 500 | In pill: `card-hover` bg, `radius-sm` |

**The Numbers Rule:** Every numeric value — prices, percentages, shares, scores — uses DM Mono. No exceptions.

---

## Spacing Scale

`4 / 8 / 12 / 16 / 20 / 24 / 32px` — vary for rhythm, never uniform.

---

## Border Radius

```
sm:   6px   (ticker chips, small badges)
md:   10px  (buttons, inputs, inner cards)
lg:   14px  (cards, panels)
xl:   18px  (modals, large containers)
full: 9999px (filter chips, pills)
```

---

## Primary Action Pattern

```css
background: linear-gradient(135deg, #2563eb, #7c3aed);
color: #f0f4ff;
border-radius: 10px;
padding: 8px 18px;
/* hover: translateY(-1px) + brand glow shadow */
/* active: scale(0.97) */
```

**One Accent Rule:** The blue-violet gradient appears on ≤3 elements per screen.

---

## Card Pattern

```css
background: rgba(255,255,255,0.025);
border: 1px solid rgba(255,255,255,0.06);
border-radius: 14px;
padding: 16px;
/* Flat at rest. Hover: slightly lighter bg + stronger border */
/* No drop shadows at rest */
```

---

## Signal Color Rules

- Green/red/amber are **semantic** — they communicate financial state only
- Always pair with a `+`/`-` sign or explicit label — never color alone
- Never use as decoration, headers, or category fills unrelated to financial state

---

## Motion

```css
/* All entrances */
ease: cubic-bezier(0.23, 1, 0.32, 1)  /* ease-out-quart */
duration: 250–350ms

/* List stagger */
stagger: 50ms between items
animation: bt-fade-up (translateY(8px) → translateY(0), opacity 0→1)

/* Never animate */
height, width, padding  /* layout properties */

/* Button press */
transform: scale(0.97)
```

---

## Anti-Patterns (Hard Bans)

| Pattern | Why banned |
|---|---|
| `border-left` > 1px as accent stripe | Side-stripe pattern — rewrite with background tint |
| `background-clip: text` with gradient | Gradient text — use solid color + weight for emphasis |
| Glass cards by default | Blur is atmospheric, not general-purpose |
| Rocket/moon emojis as decoration | Meme-stock energy, contradicts brand |
| `transition: all` | Always specify exact properties |
| Hover animations without `@media (hover: hover)` | Fires on touch, feels broken |
| Shadow on every card at rest | Bloomberg terminal feel — shadows only on state change |
| Nested cards | Always wrong |

---

## Planning System Design Notes (upcoming `/planning`)

The financial planning module should adopt the same token system but with a distinct visual register:

- **Teal** (`--signal-green`) = positive financial states, on-track forecasts
- **Purple** (`--violet-light`) = forecasting, projections, simulation
- **Amber** (`--signal-amber`) = caution zones, pressure points
- **Red** (`--signal-red`) = stress scenarios, deficit states

Charts should feel institutional: clean axis labels (DM Mono), confidence bands as semi-transparent fills, timeline on X-axis. Inspired by multifamily underwriting dashboards, not consumer finance apps.
