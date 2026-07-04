// Page walkthrough content. Each tutorial runs once on a user's first visit to the page
// (tracked in localStorage) and can be replayed anytime from the Learn tab.
export type TutorialStep = { title: string; body: string };
export type Tutorial = { id: string; label: string; emoji: string; href: string; steps: TutorialStep[] };

export const TUTORIALS: Record<string, Tutorial> = {
  tax: {
    id: "tax",
    label: "Tax Center",
    emoji: "🧾",
    href: "/tax",
    steps: [
      { title: "Your tax picture", body: "This page estimates your federal and state taxes from your income and accounts. It's planning only — nothing is filed, and every figure is an estimate, not tax advice." },
      { title: "Lower this year's bill", body: "Tax-loss harvesting scans your holdings for positions below cost. Realizing a loss can offset gains plus up to $3,000 of income — we flag the opportunities and any wash-sale risk." },
      { title: "Retirement room", body: "See how much 401(k), IRA, and HSA contribution room you have left this year (current IRS limits) and the tax each dollar saves at your bracket." },
      { title: "Make it yours", body: "Adjust filing status, state, and pre-tax contributions to watch your effective rate update live. Switch the year at the top to plan ahead." },
    ],
  },
  research: {
    id: "research",
    label: "Research",
    emoji: "🔎",
    href: "/research",
    steps: [
      { title: "Look up any stock", body: "Search a ticker for the full picture: live price, fundamentals, analyst ratings, news, and an AI take from Atlas." },
      { title: "Curated lists", body: "Browse Trending, the market's real Daily Top Movers, and what's Popular on BuyTune — ranked by how many members hold each name." },
      { title: "Run the scenarios", body: "Use the scenario tools and Ask Atlas to pressure-test a name — bull case, bear case, and what could go wrong — before you commit." },
      { title: "Act on it", body: "Like what you find? Add it straight to one of your portfolios, or save it to revisit later." },
    ],
  },
  planning: {
    id: "planning",
    label: "Planning",
    emoji: "🧭",
    href: "/planning",
    steps: [
      { title: "Your money, mapped", body: "Planning turns your accounts, income, and debts into a live net-worth picture and a long-range forecast of where you're headed." },
      { title: "Cash flow & budget", body: "Track income vs. spending, log what you actually spent each month, and see Budget vs. Actual at a glance — including where every dollar flows." },
      { title: "Plan any life event", body: "Model a home, car, wedding, rental, business, sabbatical, retirement and more. Each planner gives a clear verdict, projections, and stress tests." },
      { title: "Goals & auto-invest", body: "Set savings goals with a target date, and schedule recurring contributions — we'll nudge you when each one is due." },
      { title: "Ask Atlas", body: "Get advisor-style commentary on your plan and pressure-test decisions against your real numbers, right from the hub." },
    ],
  },
  community: {
    id: "community",
    label: "Community",
    emoji: "👥",
    href: "/community",
    steps: [
      { title: "The feed", body: "See what other BuyTune investors are sharing — trades, theses, wins, and questions. Like and save the posts that resonate." },
      { title: "What's trending", body: "Discover the strategies and the most-held stocks the community is gravitating toward right now." },
      { title: "Learn & trivia", body: "Daily bite-sized lessons and trivia to sharpen your investing, right in the community tab." },
      { title: "Share & follow", body: "Post your own take, follow investors you respect, and copy a public strategy as a template for your own portfolio." },
    ],
  },
};

export const TUTORIAL_LIST: Tutorial[] = Object.values(TUTORIALS);
