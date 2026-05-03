---
name: BuyTune
description: AI-powered portfolio management and stock research co-pilot for self-directed investors.
colors:
  bg-base: "#07090f"
  bg-surface: "#0a0d15"
  bg-elevated: "#0d1120"
  bg-overlay: "#111827"
  brand-blue: "#2563eb"
  brand-violet: "#7c3aed"
  violet-light: "#a78bfa"
  signal-green: "#00d395"
  signal-red: "#ff5c5c"
  signal-amber: "#f59e0b"
  text-primary: "#f0f4ff"
  text-secondary: "#94a3b8"
  text-tertiary: "#475569"
  text-muted: "#2d3748"
  card-bg: "rgba(255,255,255,0.025)"
  card-border: "rgba(255,255,255,0.06)"
typography:
  display:
    fontFamily: "'Syne', sans-serif"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  title:
    fontFamily: "'Syne', sans-serif"
    fontWeight: 600
    fontSize: "16px"
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  body:
    fontFamily: "'DM Sans', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "'DM Sans', sans-serif"
    fontSize: "9px"
    fontWeight: 600
    letterSpacing: "0.08em"
  mono:
    fontFamily: "'DM Mono', monospace"
    fontWeight: 500
    letterSpacing: "-0.03em"
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  xl: "18px"
  full: "9999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  6: "24px"
  8: "32px"
components:
  button-primary:
    backgroundColor: "linear-gradient(135deg, #2563eb, #7c3aed)"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "8px 18px"
  button-primary-hover:
    backgroundColor: "linear-gradient(135deg, #2563eb, #7c3aed)"
    padding: "8px 18px"
  button-ghost:
    backgroundColor: "{colors.card-bg}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
  chip-active:
    backgroundColor: "rgba(37,99,235,0.12)"
    textColor: "#93c5fd"
    rounded: "{rounded.full}"
    padding: "5px 13px"
  chip-default:
    backgroundColor: "{colors.card-bg}"
    textColor: "{colors.text-tertiary}"
    rounded: "{rounded.full}"
    padding: "5px 13px"
  card:
    backgroundColor: "{colors.card-bg}"
    rounded: "{rounded.lg}"
    padding: "16px"
---

# Design System: BuyTune

## 1. Overview

**Creative North Star: "The Signal Room"**

BuyTune's visual system is a dark analytics environment built for investors who need to extract signal from noise. The aesthetic is closer to a precision instrument than a consumer app: calibrated, restrained, and data-confident. Every surface is dark enough to reduce eye fatigue during long research sessions, and every element earns its place by carrying information.

The palette is deep navy-black with a single blue-to-violet accent gradient reserved for primary actions. Signal colors (green, red, amber) are used at low saturation, appearing as semantic indicators rather than decorative elements. Whitespace is intentional; density is a feature, not a failure. The typography system mixes Syne's geometric authority for headings with DM Sans's warmth for prose and DM Mono's precision for numbers — three registers, one coherent voice.

This system explicitly rejects: the cluttered Bloomberg terminal (too much, too noisy), the dopamine-casino aesthetic (neon, rockets, streaks), the dated brokerage portal (gray tables, no hierarchy), the generic SaaS dashboard (hero metric cards, identical grids), and the Excel-spreadsheet-as-UI (monochrome, lifeless, clinical).

**Key Characteristics:**
- Deep navy backgrounds with subtle blue-tint glow at page top
- Single blue-to-violet gradient accent, used sparingly on primary actions
- DM Mono for all numeric values, with tight negative letter-spacing
- Micro-surfaces: cards are barely perceptible white-on-dark, distinguished by border not shadow
- Stagger animation on list entries; 0.35-0.45s fade-up, 50ms intervals
- 44px minimum touch targets; horizontal scroll sections on mobile

## 2. Colors: The Signal Palette

A near-black foundation with one vivid accent and four semantic signal colors. Signal colors appear only to communicate state, never for decoration.

### Primary
- **Deep Space** (`#07090f`): Page background. Absolute base.
- **Surface Dark** (`#0a0d15`): Sidebar, secondary surfaces. One step above base.
- **Elevated Dark** (`#0d1120`): Modals, overlays, elevated panels.
- **Electric Blue** (`#2563eb`): Primary accent. Interactive elements, links, active states, focus rings.
- **Deep Violet** (`#7c3aed`): Secondary accent. Used only paired with Electric Blue as a gradient endpoint.

### Secondary
- **Gradient Drift** (`linear-gradient(135deg, #2563eb, #7c3aed)`): The single brand gradient. Applied exclusively to primary CTAs, active nav, and key value indicators.

### Tertiary
- **Violet Mist** (`#a78bfa`): AI-flavored context — AI badges, AI states, violet accent text.

### Neutral
- **Text Primary** (`#f0f4ff`): Headlines, prices, key numbers. Slightly blue-tinted, never stark white.
- **Text Secondary** (`#94a3b8`): Body text, descriptions, supporting information.
- **Text Tertiary** (`#475569`): Labels, metadata, timestamps.
- **Text Muted** (`#2d3748`): Disabled states, placeholder text. Nearly invisible by design.
- **Card Surface** (`rgba(255,255,255,0.025)`): Card backgrounds. Perceptibly distinct from base, not solid.
- **Card Border** (`rgba(255,255,255,0.06)`): Default card edges. Subtle enough to read as texture, not boundary.

### Signal Colors (semantic only)
- **Signal Green** (`#00d395`): Positive price change, bullish rating, upside, gains.
- **Signal Red** (`#ff5c5c`): Negative price change, sell rating, downside, losses.
- **Signal Amber** (`#f59e0b`): Neutral/hold, warnings, watchlist, rebalance signals.

### Named Rules
**The One Accent Rule.** The gradient appears on ≤3 elements per screen. Its scarcity is the authority. Overuse collapses trust.

**The Color = Signal Rule.** Green, red, and amber carry meaning, not mood. Never use them for decoration, category headers, or background fills unrelated to a financial state.

## 3. Typography

**Display Font:** Syne (Google Fonts, weights 400–800)
**Body Font:** DM Sans (Google Fonts, optical size 9–40, weights 300–600)
**Numeric/Code Font:** DM Mono (Google Fonts, weights 300–500)

**Character:** Syne's geometric authority anchors headers with quiet confidence. DM Sans brings human warmth to prose without sacrificing compactness. DM Mono's monospaced precision makes price data feel like instrument readings — the financial data equivalent of a terminal readout.

### Hierarchy
- **Display** (Syne 700, clamp 22px–32px, line-height 1.1, tracking -0.02em): Page titles, stock names in hero positions.
- **Title** (Syne 600, 15–18px, line-height 1.25, tracking -0.01em): Section headers, card titles, tab labels.
- **Body** (DM Sans 400, 13px, line-height 1.55): Descriptions, news headlines, analysis text. Max 65ch.
- **Label** (DM Sans 600, 9–10px, line-height 1, tracking +0.08em, uppercase): Section category labels, field names, stat labels.
- **Numeric** (DM Mono 500, variable sizes, tracking -0.03em): All prices, percentages, counts, scores. Never mix with body font mid-sentence.
- **Ticker** (DM Mono 500, 11px, background card-hover, radius sm, padding 2px 7px): Stock symbol chips. Always monospaced, always in a pill.

### Named Rules
**The Numbers Rule.** Every numeric value uses DM Mono, not DM Sans. This is non-negotiable. Mixed fonts in a price display reads as an error.

**The Label Ceiling.** Labels max out at 10px. A label larger than a body text value is hierarchy inverted — the meta-information shouldn't compete with the data itself.

## 4. Elevation

BuyTune uses tonal layering, not drop shadows, as the primary depth mechanism. The four background levels (base, surface, elevated, overlay) create depth through color alone. Shadows appear only on interactive states and floating elements, never as ambient decoration.

### Shadow Vocabulary
- **Ambient** (`0 1px 3px rgba(0,0,0,0.4)`): Subtle lift for list items and inline cards.
- **Panel** (`0 4px 16px rgba(0,0,0,0.5)`): Popovers, tooltips, floating panels.
- **Modal** (`0 8px 32px rgba(0,0,0,0.6)`): Full modals, bottom sheets.
- **Brand Glow** (`0 4px 20px rgba(37,99,235,0.3)`): Primary CTA hover state only. The blue haze is the button's authority.
- **Brand Glow Lifted** (`0 8px 32px rgba(37,99,235,0.45)`): Active/pressed primary CTA.

### Named Rules
**The Flat-By-Default Rule.** Cards and sections are flat at rest. Shadows appear only in response to state (hover, focus, elevation request). A page full of shadowed cards is a Bloomberg terminal; a page of flat cards with one elevated hover is BuyTune.

**The Tonal Stack Rule.** Depth reads as: base → surface → elevated → overlay. Never put a base-colored element inside an overlay — the hierarchy would collapse.

## 5. Components

### Buttons
- **Shape:** Softly rounded (10px, radius-md). Never pill-shaped for primary actions.
- **Primary:** Blue-to-violet gradient background, white text, 8px 18px padding. Brand glow shadow on hover.
- **Hover / Focus:** `translateY(-1px)` + shadow lift. Focus: 2px solid `#2563eb` ring, 2px offset.
- **Active / Press:** `scale(0.97)` — immediate press feedback per Emil's principles.
- **Ghost:** `card-bg` background, `text-secondary` color, `card-border` stroke. Hover lifts background to `card-hover`.
- **Small:** 5px 11px padding, 12px text, `radius-sm` (6px).

### Filter Chips
- **Default:** `card-bg` background, `text-tertiary` text, `card-border` border, full radius.
- **Active:** `rgba(37,99,235,0.12)` background, `#93c5fd` text, `rgba(37,99,235,0.5)` border, subtle blue glow.
- **Scroll:** Horizontal scroll container, no wrap. `scrollbar-width: none` on mobile.

### Cards / Containers
- **Corner Style:** Gently rounded (14px, radius-lg). Nested inner elements use radius-md (10px).
- **Background:** `card-bg` (rgba white at 2.5% opacity on dark).
- **Shadow Strategy:** Flat by default. Hover adds `card-hover` background + `border-strong` border.
- **Border:** `card-border` (rgba white at 6%). Never thicker than 1px.
- **Internal Padding:** 16px default, 12px on mobile.

### Stock Ticker Chip
- **Style:** DM Mono 500, 11px, `card-hover` background, `radius-sm`, 2px 7px padding.
- **Always inline** before company name. The chip is the ticker's identity badge.

### Analyst Bar
- **Three segments:** green (buy) / amber (hold) / red (sell). Height 5px, full-width, radius 3px.
- **Below bar:** DM Mono counts. "B 14 H 6 S 2" — letter abbreviation, space, number. Never spell out "Buy", "Hold", "Sell" in the bar — label length should never exceed 1 character + space + number.

### Inputs / Fields
- **Style:** `card-bg` background, `card-border` stroke, radius-md (10px), 10px 14px padding.
- **Focus:** `brand-blue` border, `rgba(37,99,235,0.12)` ring shadow (0 0 0 3px).
- **Search specific:** Search icon left-inset at 14px. Mono font for ticker input.
- **Placeholder:** `text-muted` color.

### Navigation (Sidebar / Mobile Bottom Nav)
- **Sidebar:** `bg-surface` background, `sidebar-border` right edge, 240px wide.
- **Nav item default:** `text-tertiary`, no background, 10px 14px padding, radius-md.
- **Nav item active:** `nav-active-bg` background, `nav-active-border` left edge, `nav-active-text` color.
- **Mobile:** Bottom fixed bar, 5 icons, `bg-surface` fill, `border-subtle` top edge.

### Detail Panel (Stock Research)
- **Opens inline** below search, pushing content down. Not a modal — keeps spatial context.
- **Tab bar:** Flush left, border-bottom underline on active tab. No background fill on tabs.
- **Close control:** Small ghost button top-left. 26px × 26px, `bg-surface` background.

## 6. Do's and Don'ts

### Do:
- **Do** use DM Mono for every price, percentage, count, and score — without exception.
- **Do** show analyst ratings as "Buy 14 / Hold 6 / Sell 2" precision, not "mostly bullish" vagueness. Confidence through precision.
- **Do** keep the gradient reserved for primary CTAs and active nav states only. Three gradient elements per screen maximum.
- **Do** use stagger animation (50ms intervals, `bt-fade-up`) when lists of cards appear — never all at once.
- **Do** size touch targets at 44px minimum on mobile. Research cards must be fully tappable.
- **Do** treat horizontal scroll sections as a feature on mobile — they're TradingView's compact row pattern translated to touch.
- **Do** use `scale(0.97)` on button `:active` for press feedback.
- **Do** apply `ease-out` with cubic-bezier(0.23, 1, 0.32, 1) on all entrances. Slow-in feels broken.
- **Do** pair signal colors with labels — never use red/green alone to convey up/down without a + or - sign.

### Don't:
- **Don't** build a meme-stock casino. No rocket emojis as decorative elements, no dopamine loops, no "🚀 to the moon" energy anywhere in the UI.
- **Don't** build a Bloomberg terminal. No data dumps, no raw table grids without hierarchy, no information that isn't answering a question the user actually has.
- **Don't** copy dated brokerage portals (E*Trade 2015 era). No light gray backgrounds, no bordered tables everywhere, no lifeless typography.
- **Don't** use Excel aesthetics. No clinical monochrome, no spreadsheet-like column headers dominating the design.
- **Don't** use dopamine-heavy patterns. No gamification, no streaks, no push-notification anxiety culture.
- **Don't** use `border-left` wider than 1px as a colored accent stripe on cards. Rewrite with background tint or full border.
- **Don't** use gradient text (`background-clip: text`). Solid colors only. Weight and size carry emphasis.
- **Don't** animate layout properties (`height`, `width`, `padding`). Animate `transform` and `opacity` only.
- **Don't** exceed 300ms on UI element transitions. The interface should feel immediate, not ceremonial.
- **Don't** show hover animations on touch devices. Gate with `@media (hover: hover) and (pointer: fine)`.
- **Don't** use `transition: all` — specify exact properties.
- **Don't** add a glassmorphism card as a default pattern. Blur is reserved for rare atmospheric moments, not general UI.
