import Link from "next/link";

export const metadata = {
  title: "Accessibility — BuyTune.io",
  description: "BuyTune's accessibility statement and how to reach us about accessibility issues.",
};

// Public accessibility statement (WCAG 2.1 AA target). Having a published statement,
// a contact path, and an ongoing-effort commitment is the standard good-faith posture
// for ADA Title III web accessibility.
export default function AccessibilityPage() {
  return (
    <main style={{ maxWidth: "720px", margin: "0 auto", padding: "48px 24px 80px", color: "var(--text-primary)" }}>
      <h1 style={{ fontSize: "28px", fontWeight: 800, fontFamily: "var(--font-display)", marginBottom: "8px" }}>Accessibility at BuyTune</h1>
      <p style={{ fontSize: "13px", color: "var(--text-tertiary)", marginBottom: "28px" }}>Last updated July 2026</p>

      <section style={{ display: "grid", gap: "18px", fontSize: "14.5px", lineHeight: 1.7, color: "var(--text-secondary)" }}>
        <p>
          BuyTune is committed to making its website and app usable by everyone, including people who rely on
          assistive technology. We aim to conform to the <strong>Web Content Accessibility Guidelines (WCAG) 2.1,
          Level AA</strong>, and we treat accessibility as an ongoing engineering practice, not a one-time checkbox.
        </p>

        <h2 style={{ fontSize: "17px", fontWeight: 700, color: "var(--text-primary)", marginTop: "8px" }}>What we do</h2>
        <ul style={{ paddingLeft: "20px", display: "grid", gap: "8px", listStyle: "disc" }}>
          <li>Keyboard support: interactive controls are reachable and operable without a mouse, with a visible focus indicator and a skip-to-content link.</li>
          <li>Screen-reader support: pages declare their language, controls carry accessible names, dialogs are announced as dialogs, and charts include text alternatives summarizing the data.</li>
          <li>Zoom and text scaling: pinch-zoom and browser text resizing are never blocked.</li>
          <li>Reduced motion: when your device asks for reduced motion, BuyTune disables its animations.</li>
          <li>Touch targets: interactive elements are sized for reliable touch use.</li>
        </ul>

        <h2 style={{ fontSize: "17px", fontWeight: 700, color: "var(--text-primary)", marginTop: "8px" }}>Known limitations</h2>
        <p>
          Some complex, data-dense views (interactive charts and tables) are still being improved for assistive
          technology, and third-party experiences we embed (for example, secure bank- and brokerage-linking widgets)
          are governed by their providers&apos; own accessibility practices. We review these areas regularly.
        </p>

        <h2 style={{ fontSize: "17px", fontWeight: 700, color: "var(--text-primary)", marginTop: "8px" }}>Tell us if something isn&apos;t working</h2>
        <p>
          If any part of BuyTune is difficult to use with assistive technology, we want to know and we will
          prioritize a fix. Use the in-app <strong>Support</strong> option, or email{" "}
          <a href="mailto:support@buytune.io" style={{ color: "var(--brand-blue, #0ea5a0)", textDecoration: "underline" }}>support@buytune.io</a>{" "}
          with the page and the problem you hit. Please include the assistive technology and browser you were using.
        </p>

        <p style={{ marginTop: "10px" }}>
          <Link href="/" style={{ color: "var(--brand-blue, #0ea5a0)", textDecoration: "underline" }}>← Back to BuyTune</Link>
        </p>
      </section>
    </main>
  );
}
