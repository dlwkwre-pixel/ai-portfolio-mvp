import { redirect } from "next/navigation";

export const metadata = { title: "Privacy Policy — BuyTune" };

export default function PrivacyRedirect() {
  redirect("/legal/privacy");
}
