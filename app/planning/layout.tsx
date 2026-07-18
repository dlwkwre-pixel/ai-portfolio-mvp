import { isPageBlocked } from "@/lib/access/page-blocks";
import UnderConstruction from "@/app/components/under-construction";

// Enforcement point for the admin page denylist: when this account is blocked
// from the section, every route under it renders the wall instead of content —
// including deep links the nav never showed.
export default async function SectionLayout({ children }: { children: React.ReactNode }) {
  if (await isPageBlocked("planning")) return <UnderConstruction section="Planning" />;
  return <>{children}</>;
}
