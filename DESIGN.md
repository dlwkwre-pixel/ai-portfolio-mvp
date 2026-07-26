---
name: BuyTune
description: AI-powered portfolio management and stock research co-pilot for self-directed investors.
colors:
  sage-ground: "oklch(0.9 0.042 150)"
  sage-surface: "oklch(0.985 0.01 150)"
  sage-elevated: "oklch(0.995 0.005 150)"
  sage-overlay: "oklch(0.87 0.035 150)"
  ink-primary: "oklch(0.2 0.03 150)"
  ink-secondary: "oklch(0.4 0.03 150)"
  ink-tertiary: "oklch(0.48 0.03 150)"
  ink-muted: "oklch(0.55 0.025 150)"
  teal-accent: "#0ea5a0"
  green-accent: "#3fae4a"
  signal-green: "#16a34a"
  signal-red: "#dc2626"
  signal-amber: "#c8791e"
  ai-teal: "#0c8a86"
  dark-panel: "oklch(0.22 0.03 150)"
  dark-panel-text: "oklch(0.95 0.015 90)"
  dark-panel-muted: "oklch(0.62 0.02 150)"
  card-border: "rgba(20,30,20,0.13)"
  border-subtle: "rgba(20,30,20,0.10)"
typography:
  display:
    fontFamily: "'DM Sans', sans-serif"
    fontWeight: 600
    letterSpacing: "-0.01em"
  logo:
    fontFamily: "'Syne', sans-serif"
    fontWeight: 700
  title:
    fontFamily: "'DM Sans', sans-serif"
    fontWeight: 700
    fontSize: "17px"
    lineHeight: 1.25
  body:
    fontFamily: "'DM Sans', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "'DM Sans', sans-serif"
    fontSize: "11.5px"
    fontWeight: 700
    letterSpacing: "0.07em"
  mono:
    fontFamily: "'DM Mono', monospace"
    fontWeight: 500
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
  10: "40px"
components:
  button-primary:
    backgroundColor: "linear-gradient(135deg, {colors.green-accent}, {colors.teal-accent})"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "linear-gradient(135deg, {colors.green-accent}, {colors.teal-accent})"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "{colors.sage-surface}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-danger:
    backgroundColor: "rgba(220,38,38,0.09)"
    textColor: "{colors.signal-red}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  chip:
    backgroundColor: "{colors.sage-surface}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.full}"
    padding: "3px 9px"
  card:
    backgroundColor: "{colors.sage-surface}"
    rounded: "{rounded.lg}"
    padding: "16px"
---

# Design System: BuyTune

## 1. Overview

**Creative North Star: "The Sunroom Ledger"**

BuyTune's Sage system reads as a warm, daylight-lit workspace for a serious financial decision, not a trading-floor monitor or a spreadsheet. The palette is a soft sage-green ground, close in value to warm paper, with ink-dark text and a single green-to-teal gradient reserved for the moments that matter: primary actions, active navigation, the logo mark. Cards sit flat on the ground, separated by hairline borders rather than shadows — nothing floats, nothing glows except on interaction. The one true dark surface is the sidebar/footer/CTA-band family, which acts as punctuation: a dark edge that frames the light workspace rather than a competing "dark mode."

This system explicitly rejects the meme-stock casino (no rocket emojis, no neon, no dopamine loops), the Bloomberg terminal (no dense unstructured data grids), the dated brokerage portal (no gray-on-gray, no lifeless tables), the Excel aesthetic (no clinical monochrome), and — specific to this project's own history — the previous dark navy/blue-violet "Signal Room" identity it replaced on 2026-07-18. Numbers still read like instrument output (DM Mono, tight tracking), but the room they sit in is bright, not a cockpit at night.

**Key Characteristics:**
- Warm sage background (`oklch(0.9 0.042 150)`), brightening through card/elevated tiers toward near-white
- Single green→teal brand gradient (`#3fae4a` → `#0ea5a0`), reserved for CTAs, active nav, and the logo — never behind or adjacent to a gain/loss number
- Flat cards at rest: 1px hairline ink-tinted borders, no ambient shadow; shadow only on hover/press and the primary-button glow
- One true dark surface family (sidebar, footer, CTA bands) — not a dark mode, a fixed dark frame around a light workspace
- DM Sans for all display, body, and label text; DM Mono for every number without exception; Syne lives only in the "BuyTune.io" wordmark
- Signal colors (green/red/amber) are semantic only — gains, losses, caution — never decorative

## 2. Colors: The Sunroom Palette

A warm, low-chroma sage neutral carries almost the whole surface; the brand gradient is scarce by design, and signal colors are reserved strictly for financial state.

### Primary
- **Sunroom Ground** (`oklch(0.9 0.042 150)`): Page background. The base warmth everything else sits on.
- **Sunroom Surface** (`oklch(0.985 0.01 150)`): Cards, panels — the default "paper" a piece of content sits on.
- **Sunroom Elevated** (`oklch(0.995 0.005 150)`): Popovers, the brightest tier, reserved for content that sits above a card.

### Secondary
- **Ledger Teal** (`#0ea5a0`): Primary interactive accent — links, focus states, one end of the brand gradient.
- **Ledger Green** (`#3fae4a`): The gradient's other endpoint; paired with teal, never used alone as an accent.

### Tertiary
- **Atlas Teal** (`#0c8a86`): The AI-assistant accent — reserved for Atlas/AI-flavored badges, callouts, and "thinking" states, distinct from the interactive teal so AI moments read as their own register.

### Neutral
- **Ink Primary** (`oklch(0.2 0.03 150)`): Headings, prices, primary text.
- **Ink Secondary** (`oklch(0.4 0.03 150)`): Body copy, descriptions.
- **Ink Tertiary** (`oklch(0.48 0.03 150)`): Labels, metadata, timestamps.
- **Ink Muted** (`oklch(0.55 0.025 150)`): Placeholder and disabled text.
- **Card Border** (`rgba(20,30,20,0.13)`): Default hairline edge on every card.
- **Dark Panel** (`oklch(0.22 0.03 150)`): The one dark surface — sidebar, footer, CTA bands.
- **Dark Panel Text** (`oklch(0.95 0.015 90)`): Text on the dark panel family, warm off-white.

### Signal Colors (semantic only)
- **Signal Green** (`#16a34a`): Gains, positive returns, "buy"/"up" states.
- **Signal Red** (`#dc2626`): Losses, negative returns, "sell"/"down" states. Deliberately more saturated than a typical pastel error red — a washed-out red read as "not serious enough" on the light ground during QA.
- **Signal Amber** (`#c8791e`): Caution, "trim"/"hold" states, warnings.

### Named Rules
**The Gradient Scarcity Rule.** The green→teal gradient appears only on primary CTAs, active nav, and the logo mark. It never sits behind, beside, or as a container for a numeric gain/loss value — those stay on solid signal tokens so a user's eye never has to disambiguate "brand color" from "your money moved."

**The One Dark Surface Rule.** There is no dark mode. The dark-panel family (sidebar, footer, CTA bands) is a fixed structural element, not a theme — never introduce a second dark surface or a light/dark toggle.

## 3. Typography

**Display Font:** DM Sans (self-hosted via next/font, Google Fonts fallback)
**Body Font:** DM Sans
**Logo Font:** Syne — wordmark only
**Numeric Font:** DM Mono

**Character:** DM Sans carries every heading and every sentence of prose — warm, humanist, unshowy. Syne's geometric wideness was tried for headings and read as stretched at large sizes (user-confirmed), so it was pulled back to a single job: the "BuyTune.io" wordmark. DM Mono gives every number in the product a consistent, instrument-like precision against the otherwise soft, humanist type.

### Hierarchy
- **Display** (DM Sans 600, page titles, -0.01em tracking): Page-level headings.
- **Title** (DM Sans 700, 17px, line-height 1.25): Section headers, card titles.
- **Body** (DM Sans 400, 14px, line-height 1.55): Descriptions, prose. Max ~70ch.
- **Label** (DM Sans 700, 11.5px, +0.07em tracking, uppercase): Section eyebrows, field names, stat labels.
- **Numeric** (DM Mono 500): Every price, percentage, count, score — no exceptions.

### Named Rules
**The Numbers Rule.** Every numeric value — price, percent, share count, score — renders in DM Mono, never DM Sans. A number in the body font reads as a bug, not a style choice.

**The Wordmark-Only Rule.** Syne appears in exactly one place: the "BuyTune.io" logo text. It is never used for page or section headings — its wide letterforms read as stretched at heading sizes.

## 4. Elevation

Sage is flat and calm by default. Cards rest on a hairline border (`rgba(20,30,20,0.13)`), not a shadow — depth comes from tonal steps (ground → surface → elevated), not ambient drop shadows. Shadows exist, but they're reserved for genuine elevation moments: popovers, hover lift, and the primary button's brand-glow. The dark-panel family (sidebar, footer, CTA bands) is the one true dark surface in the system — it isn't a "raised" or "lowered" tier, it's a fixed dark frame that grounds the light workspace, present on every screen rather than toggled.

### Shadow Vocabulary
- **Ambient** (`0 1px 3px rgba(20,30,20,0.08)`): Subtle lift for list rows and inline cards.
- **Panel** (`0 4px 16px rgba(20,30,20,0.10)`): Popovers, dropdowns, floating panels.
- **Modal** (`0 8px 32px rgba(20,30,20,0.14)`): Full modals, bottom sheets.
- **Brand Glow** (`0 4px 20px rgba(14,165,160,0.25)`): Primary CTA at rest — the only shadow with color, and only on the gradient button.
- **Brand Glow Lifted** (`0 8px 32px rgba(14,165,160,0.35)`): Primary CTA hover/press.

### Named Rules
**The Flat-By-Default Rule.** Cards carry a border, not a shadow, at rest. A shadow appears only in response to state — hover, focus, or a floating element that needs to visually separate from the page beneath it.

**The Dark-Frame Rule.** The dark-panel surfaces are structural, not elevational — they don't sit "above" or "below" the sage cards in the tonal stack, they frame the whole workspace on every screen.

## 5. Components

Buttons, cards, and chips share one restrained shape language: 10px-radius interactive elements, 14px-radius containers, flat by default, gradient reserved for the single most important action on screen.

### Buttons
- **Shape:** 10px radius (`--radius-md`), small variant drops to 6px (`--radius-sm`).
- **Primary:** Green→teal gradient background, white text, `8px 16px` padding, brand-glow shadow; hover lifts shadow + `translateY(-1px)`.
- **Ghost:** Sage-surface background, ink-secondary text, card-border stroke; hover shifts to card-hover fill and ink-primary text.
- **Danger:** Red-tinted background (`rgba(220,38,38,0.09)`), signal-red text and border.
- **Small:** `5px 11px` padding, 6px radius, used inline in tables and dense rows.

### Chips / Badges
- **Chip:** Full-radius pill, tone-mapped background (`up` = green tint, `down` = red tint, `brand` = teal tint, `neutral` = surface), 1px border in the matching tone.
- **Badge:** 6px-radius rectangle, uppercase 9px label — used for action tags (BUY/SELL/TRIM/HOLD) inside AI recommendation rows.

### Cards / Containers
- **Corner Style:** 14px radius (`--radius-lg`).
- **Background:** Sage-surface.
- **Shadow Strategy:** Flat at rest (see Elevation); hover adds card-hover background + border-strong edge where the card is interactive.
- **Border:** 1px card-border, always present — this is the primary depth signal, not a shadow.
- **Internal Padding:** 16px default (`--space-4`).

### Inputs / Fields
- **Style:** Sage-surface background, card-border stroke, 10px radius, comfortable padding.
- **Focus:** Border shifts to teal-accent with a soft teal ring.

### Navigation (Sidebar / Mobile Bottom Nav)
- **Sidebar:** Dark-panel background, 224px wide, three labeled nav groups (Portfolio / Plan / Discover), active item gets a green-tinted pill background and light-green text.
- **Mobile:** Fixed bottom bar, icon row, sage-surface fill.

### Dark Panel (signature component)
The one recurring dark surface — sidebar, footer, and marketing CTA bands all share the same `oklch(0.22 0.03 150)` background with warm off-white text. It's the system's anchor: every other surface is light, and this is the deliberate exception that frames them.

## 6. Do's and Don'ts

### Do:
- **Do** use DM Mono for every price, percentage, count, and score, without exception.
- **Do** keep the brand gradient to CTAs, active nav, and the logo — nowhere else.
- **Do** pair signal colors with a `+`/`−` sign or label, never color alone, for gain/loss states.
- **Do** use flat cards with a 1px hairline border as the default container — shadows are a state response, not a resting style.
- **Do** treat the dark-panel family as a fixed structural frame present on every screen, not a toggleable mode.
- **Do** size touch targets at 44px minimum on mobile.

### Don't:
- **Don't** build a meme-stock casino — no rocket emojis, no dopamine loops, no "to the moon" energy.
- **Don't** build a Bloomberg terminal — no dense unstructured data dumps, no raw table grids without hierarchy.
- **Don't** copy a dated brokerage portal — no gray-on-gray, no bordered tables everywhere, no lifeless typography.
- **Don't** use the Excel aesthetic — no clinical monochrome, no spreadsheet-style column headers dominating a page.
- **Don't** use gamification patterns — no streaks-as-pressure, no push-notification anxiety culture.
- **Don't** reintroduce dark mode or a second dark surface — the Sage refresh (2026-07-18) deliberately dropped it; the dark-panel family is the only dark surface, permanently.
- **Don't** use `border-left` wider than 1px as a colored accent stripe — use a full border or background tint instead.
- **Don't** use gradient text (`background-clip: text`) — solid ink color only, weight and size carry emphasis.
- **Don't** use Syne anywhere but the wordmark — its wide letterforms read as stretched at heading sizes.
- **Don't** put the brand gradient behind or adjacent to a numeric gain/loss value.
