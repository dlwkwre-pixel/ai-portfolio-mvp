import { redirect } from "next/navigation";

export const metadata = { title: "Terms of Service — BuyTune" };

export default function TermsRedirect() {
  redirect("/legal/terms");
}
