// Expense categories + label→category inference. Lives in lib/ (not planning-shared.tsx,
// which is a "use client" module) so server code — the transaction parser route and
// page.tsx — can use the same classification the Cash Flow UI shows.

export const EXPENSE_CATEGORIES: { label: string; keywords: string[]; emoji: string }[] = [
  { label: "Housing",        keywords: ["rent", "mortgage", "hoa", "property tax", "home insurance", "maintenance", "repair", "condo", "lease", "landlord", "apartment", "storage"],              emoji: "🏠" },
  { label: "Transportation", keywords: ["car", "gas", "fuel", "auto insurance", "parking", "uber", "lyft", "transit", "bus", "subway", "toll", "vehicle", "train", "metro", "tesla", "zipcar", "enterprise", "hertz", "avis", "getaround"],                                                                   emoji: "🚗" },
  { label: "Food & Dining",  keywords: ["grocery", "groceries", "food", "restaurant", "dining", "coffee", "lunch", "dinner", "breakfast", "meal", "delivery", "doordash", "instacart", "takeout", "waffle", "donut", "taco", "burger", "pizza", "sushi", "steak", "grill", "grille", "tavern", "kitchen", "diner", "bistro", "cafe", "bakery", "bbq", "barbecue", "seafood", "noodle", "ramen", "poke", "chipotle", "mcdonald", "wendy", "chick-fil-a", "chick fil", "subway", "panera", "starbucks", "dunkin", "popeyes", "domino", "papa john", "five guys", "shake shack", "in-n-out", "whataburger", "dairy queen", "sonic drive", "jack in the box", "cook out", "cookout", "silver skillet", "spaghetti", "western", "waffle house", "heb", "curbside", "whole foods", "trader joe", "aldi", "kroger", "publix", "safeway", "wegmans", "target grocery", "walmart grocery", "leaf", "grain", "bean", "bottle", "dark horse", "queen donut", "total wine", "specs", "wine", "spirits", "lunchdrop", "grubhub", "uber eats", "postmates", "seamless", "gopuff"], emoji: "🍽️" },
  { label: "Healthcare",     keywords: ["health", "medical", "doctor", "dental", "vision", "pharmacy", "prescription", "therapy", "counseling", "cvs", "walgreen", "rite aid", "urgent care", "hospital", "clinic", "lab", "quest diagnostics"],                                                               emoji: "🏥" },
  { label: "Fitness",        keywords: ["gym", "fitness", "yoga", "workout", "pilates", "peloton", "crossfit", "exercise", "planet fitness", "anytime fitness", "la fitness", "24 hour fitness", "orange theory", "equinox", "barry's", "soul cycle", "classpass"],                                             emoji: "💪" },
  { label: "Insurance",      keywords: ["life insurance", "disability", "renters insurance", "term life", "umbrella policy", "insurance premium", "geico", "state farm", "allstate", "progressive", "lemonade"],                                                                                                 emoji: "🛡️" },
  { label: "Utilities",      keywords: ["electric", "electricity", "gas bill", "water", "internet", "phone", "cell", "utility", "heating", "cooling", "cable", "sewage", "at&t", "verizon", "t-mobile", "comcast", "xfinity", "spectrum", "cox", "clean sky", "reliant", "txu", "pge", "con ed", "duke energy"], emoji: "⚡" },
  { label: "Entertainment",  keywords: ["streaming", "spotify", "netflix", "hulu", "disney", "games", "gaming", "movies", "books", "hobby", "concert", "theater", "apple tv", "hbo", "paramount", "peacock", "crunchyroll", "twitch", "youtube premium", "xbox", "playstation", "steam", "ticketmaster", "stubhub", "amc", "regal", "cinemark"],                                                                   emoji: "🎬" },
  { label: "Travel",         keywords: ["travel", "vacation", "hotel", "flight", "airbnb", "trip", "cruise", "delta", "united", "southwest", "american airlines", "marriott", "hilton", "hyatt", "expedia", "booking", "vrbo", "kayak", "priceline"],                                                          emoji: "✈️" },
  { label: "Subscriptions",  keywords: ["subscription", "membership", "amazon prime", "premium", "software", "saas", "monthly service", "claude", "chatgpt", "openai", "anthropic", "google one", "icloud", "microsoft 365", "adobe", "notion", "figma", "dropbox", "lastpass", "1password", "nordvpn", "expressvpn"],                                                                                           emoji: "📱" },
  { label: "Childcare",      keywords: ["childcare", "daycare", "school", "tuition", "babysitter", "nanny", "kids", "children", "after school", "preschool", "montessori"],                       emoji: "👶" },
  { label: "Other",          keywords: [],                                                                                                                                                         emoji: "📦" },
];

export function getCategoryForExpense(label: string): string {
  const lower = label.toLowerCase();
  // Exact category label match first — handles category-level budget items ("Food & Dining", etc.)
  const exact = EXPENSE_CATEGORIES.find((c) => c.label.toLowerCase() === lower);
  if (exact) return exact.label;
  // Keyword scan
  for (const cat of EXPENSE_CATEGORIES.slice(0, -1)) {
    if (cat.keywords.some((k) => lower.includes(k))) return cat.label;
  }
  return "Other";
}

// Resolve an item's category: user-assigned wins, else infer from the label.
export function categoryOf(item: { label: string; category?: string | null }): string {
  return item.category ?? getCategoryForExpense(item.label);
}

export function normLabel(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
