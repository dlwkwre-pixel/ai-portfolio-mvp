export type BadgeTier = "bronze" | "silver" | "gold" | "legendary";
export type BadgeCategory = "streak" | "setup" | "portfolio" | "strategy" | "ai" | "community";
export type BadgeIcon =
  | "flame" | "rocket" | "graduation" | "chart-line" | "plus-circle"
  | "sparkle" | "cpu" | "check-circle" | "share" | "users" | "star";

export type Badge = {
  id: string;
  name: string;
  description: string;
  hint: string;
  tier: BadgeTier;
  category: BadgeCategory;
  icon: BadgeIcon;
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
  },
  {
    id: "streak_7",
    name: "Week Warrior",
    description: "7-day login streak",
    hint: "Log in 7 days in a row",
    tier: "silver",
    category: "streak",
    icon: "flame",
  },
  {
    id: "streak_30",
    name: "Month Master",
    description: "30-day login streak",
    hint: "Log in 30 days in a row",
    tier: "gold",
    category: "streak",
    icon: "flame",
  },
  {
    id: "streak_50",
    name: "Dedicated",
    description: "50-day login streak",
    hint: "Log in 50 days in a row",
    tier: "gold",
    category: "streak",
    icon: "flame",
  },
  {
    id: "streak_100",
    name: "Legendary",
    description: "100-day login streak",
    hint: "Log in 100 days in a row",
    tier: "legendary",
    category: "streak",
    icon: "flame",
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
];

export const BADGE_MAP = new Map(BADGES.map((b) => [b.id, b]));

export const TIER_COLOR: Record<BadgeTier, string> = {
  bronze:    "#cd7f32",
  silver:    "#94a3b8",
  gold:      "#f59e0b",
  legendary: "#a855f7",
};

export const TIER_BG: Record<BadgeTier, string> = {
  bronze:    "rgba(205,127,50,0.10)",
  silver:    "rgba(148,163,184,0.10)",
  gold:      "rgba(245,158,11,0.10)",
  legendary: "rgba(168,85,247,0.12)",
};

export const TIER_BORDER: Record<BadgeTier, string> = {
  bronze:    "rgba(205,127,50,0.25)",
  silver:    "rgba(148,163,184,0.20)",
  gold:      "rgba(245,158,11,0.25)",
  legendary: "rgba(168,85,247,0.30)",
};
