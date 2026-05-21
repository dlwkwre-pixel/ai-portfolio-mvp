import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Disable streaming metadata so og:image tags are in the initial HTML response.
  // Next.js 16 streams metadata by default but only waits for known bots (Google, Bing,
  // Twitter, Slack). Apple's iMessage scraper isn't in that list, so it misses the tags.
  // Setting /.+/ ensures metadata is blocking for every request.
  htmlLimitedBots: /.+/,
};

export default nextConfig;