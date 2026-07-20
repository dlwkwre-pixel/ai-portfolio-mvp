export type BadgeTier = "bronze" | "silver" | "gold" | "legendary";
export type BadgeCategory = "streak" | "setup" | "portfolio" | "strategy" | "ai" | "community";
export type BadgeIcon =
  | "flame" | "rocket" | "graduation" | "chart-line" | "plus-circle"
  | "sparkle" | "cpu" | "check-circle" | "share" | "users" | "star";

// Countable metrics the app already tracks — used to draw a progress bar toward a locked badge.
// Each key maps 1:1 to a field on the BadgeContext gathered in lib/badges/check.ts.
export type BadgeMetric =
  | "longestStreak"
  | "portfolioCount"
  | "holdingCount"
  | "strategyCount"
  | "aiRunCount"
  | "executedCount"
  | "sharedPortfolioCount"
  | "followingCount"
  | "followerCount";

export type Badge = {
  id: string;
  name: string;
  description: string;
  hint: string;
  tier: BadgeTier;
  category: BadgeCategory;
  icon: BadgeIcon;
  // When present, a locked badge shows "current / target" progress toward unlocking.
  progress?: { metric: BadgeMetric; target: number };
};

export const BADGES: Badge[] = [
  // ── Streak ───────────────────────────────────────────────────────────────
  {
    id: "streak_3",
    name: "Consistent",
    description: "3-day login streak",
    hint: "Log in 3 days in a row",
    tier: "bronze",
    category: "streak",
    icon: "flame",
    progress: { metric: "longestStreak", target: 3 },
  },
  {
    id: "streak_7",
    name: "Week Warrior",
    description: "7-day login streak",
    hint: "Log in 7 days in a row",
    tier: "silver",
    category: "streak",
    icon: "flame",
    progress: { metric: "longestStreak", target: 7 },
  },
  {
    id: "streak_30",
    name: "Month Master",
    description: "30-day login streak",
    hint: "Log in 30 days in a row",
    tier: "gold",
    category: "streak",
    icon: "flame",
    progress: { metric: "longestStreak", target: 30 },
  },
  {
    id: "streak_50",
    name: "Dedicated",
    description: "50-day login streak",
    hint: "Log in 50 days in a row",
    tier: "gold",
    category: "streak",
    icon: "flame",
    progress: { metric: "longestStreak", target: 50 },
  },
  {
    id: "streak_100",
    name: "Legendary",
    description: "100-day login streak",
    hint: "Log in 100 days in a row",
    tier: "legendary",
    category: "streak",
    icon: "flame",
    progress: { metric: "longestStreak", target: 100 },
  },

  // ── Setup ─────────────────────────────────────────────────────────────────
  {
    id: "first_login",
    name: "Early Adopter",
    description: "Joined BuyTune",
    hint: "Create your account",
    tier: "bronze",
    category: "setup",
    icon: "rocket",
  },
  {
    id: "tutorial",
    name: "Oriented",
    description: "Completed onboarding",
    hint: "Finish the getting-started tutorial",
    tier: "bronze",
    category: "setup",
    icon: "graduation",
  },

  // ── Portfolio ─────────────────────────────────────────────────────────────
  {
    id: "first_portfolio",
    name: "Portfolio Initiated",
    description: "Created your first portfolio",
    hint: "Create your first portfolio",
    tier: "bronze",
    category: "portfolio",
    icon: "chart-line",
  },
  {
    id: "first_holding",
    name: "First Position",
    description: "Added your first holding",
    hint: "Add a stock to one of your portfolios",
    tier: "bronze",
    category: "portfolio",
    icon: "plus-circle",
  },
  {
    id: "holdings_10",
    name: "Stock Picker",
    description: "Tracking 10 holdings",
    hint: "Add 10 holdings across your portfolios",
    tier: "silver",
    category: "portfolio",
    icon: "plus-circle",
    progress: { metric: "holdingCount", target: 10 },
  },
  {
    id: "holdings_25",
    name: "Deep Bench",
    description: "Tracking 25 holdings",
    hint: "Add 25 holdings across your portfolios",
    tier: "gold",
    category: "portfolio",
    icon: "plus-circle",
    progress: { metric: "holdingCount", target: 25 },
  },
  {
    id: "multi_portfolio",
    name: "Diversified",
    description: "Running 3 portfolios",
    hint: "Create 3 active portfolios",
    tier: "silver",
    category: "portfolio",
    icon: "chart-line",
    progress: { metric: "portfolioCount", target: 3 },
  },

  // ── Strategy ──────────────────────────────────────────────────────────────
  {
    id: "strategist",
    name: "Strategist",
    description: "Created an investment strategy",
    hint: "Build your first investment strategy",
    tier: "bronze",
    category: "strategy",
    icon: "sparkle",
  },

  // ── AI ────────────────────────────────────────────────────────────────────
  {
    id: "ai_first",
    name: "AI Powered",
    description: "Ran your first AI analysis",
    hint: "Run an AI portfolio analysis",
    tier: "bronze",
    category: "ai",
    icon: "cpu",
  },
  {
    id: "ai_10",
    name: "AI Native",
    description: "Ran 10 AI analyses",
    hint: "Run 10 AI portfolio analyses",
    tier: "silver",
    category: "ai",
    icon: "cpu",
    progress: { metric: "aiRunCount", target: 10 },
  },
  {
    id: "ai_25",
    name: "AI Strategist",
    description: "Ran 25 AI analyses",
    hint: "Run 25 AI portfolio analyses",
    tier: "gold",
    category: "ai",
    icon: "cpu",
    progress: { metric: "aiRunCount", target: 25 },
  },
  {
    id: "exec_first",
    name: "Follow Through",
    description: "Executed an AI recommendation",
    hint: "Mark an AI recommendation as executed",
    tier: "silver",
    category: "ai",
    icon: "check-circle",
  },
  {
    id: "exec_10",
    name: "Conviction",
    description: "Executed 10 AI recommendations",
    hint: "Mark 10 AI recommendations as executed",
    tier: "gold",
    category: "ai",
    icon: "check-circle",
    progress: { metric: "executedCount", target: 10 },
  },

  // ── Community ─────────────────────────────────────────────────────────────
  {
    id: "shared",
    name: "Open Book",
    description: "Shared a portfolio publicly",
    hint: "Make one of your portfolios public",
    tier: "bronze",
    category: "community",
    icon: "share",
  },
  {
    id: "following",
    name: "Connected",
    description: "Followed a BuyTune user",
    hint: "Follow another user on BuyTune",
    tier: "bronze",
    category: "community",
    icon: "users",
  },
  {
    id: "follower",
    name: "Noticed",
    description: "Got your first follower",
    hint: "Have someone follow your profile",
    tier: "silver",
    category: "community",
    icon: "star",
  },
  {
    id: "follower_10",
    name: "Influencer",
    description: "Reached 10 followers",
    hint: "Have 10 people follow your profile",
    tier: "gold",
    category: "community",
    icon: "star",
    progress: { metric: "followerCount", target: 10 },
  },
];

// Category display order + labels for the Achievements hub.
export const BADGE_CATEGORY_ORDER: BadgeCategory[] = [
  "setup", "portfolio", "strategy", "ai", "streak", "community",
];
export const BADGE_CATEGORY_LABEL: Record<BadgeCategory, string> = {
  setup:     "Getting started",
  portfolio: "Portfolio",
  strategy:  "Strategy",
  ai:        "AI analysis",
  streak:    "Consistency",
  community: "Community",
};

export const TIER_LABEL: Record<BadgeTier, string> = {
  bronze: "Bronze", silver: "Silver", gold: "Gold", legendary: "Legendary",
};

export const BADGE_MAP = new Map(BADGES.map((b) => [b.id, b]));

// Tiers are tuned to read as clearly distinct: bronze = muted copper-brown,
// silver = cool platinum, gold = bright yellow-gold, legendary = violet.
// Medal tiers, darkened for legibility on the Sage light ground (the metallic
// dark-mode values — esp. platinum silver — vanished on light; user QA 2026-07-20).
export const TIER_COLOR: Record<BadgeTier, string> = {
  bronze:    "#a5622a", // copper brown
  silver:    "#6b7885", // pewter (was near-white platinum)
  gold:      "#b8860b", // deep gold
  legendary: "#9333ea", // violet
};

export const TIER_BG: Record<BadgeTier, string> = {
  bronze:    "rgba(165,98,42,0.14)",
  silver:    "rgba(107,120,133,0.13)",
  gold:      "rgba(184,134,11,0.15)",
  legendary: "rgba(147,51,234,0.13)",
};

export const TIER_BORDER: Record<BadgeTier, string> = {
  bronze:    "rgba(165,98,42,0.42)",
  silver:    "rgba(107,120,133,0.36)",
  gold:      "rgba(184,134,11,0.44)",
  legendary: "rgba(147,51,234,0.4)",
};
