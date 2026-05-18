import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — BuyTune",
  description: "BuyTune Privacy Policy — how we collect, use, and protect your data",
};

const EFFECTIVE_DATE = "May 18, 2026";
const VERSION        = "2026-05-18";

export default function PrivacyPage() {
  return (
    <main style={{
      minHeight: "100vh",
      background: "var(--bg-base)",
      color: "var(--text-primary)",
      fontFamily: "var(--font-body)",
    }}>
      <div style={{ maxWidth: "760px", margin: "0 auto", padding: "48px 24px 80px" }}>

        <div style={{ marginBottom: "40px" }}>
          <Link href="/dashboard" style={{
            fontSize: "12px", color: "var(--text-muted)",
            textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "4px",
            marginBottom: "24px",
          }}>
            ← Back
          </Link>
          <div style={{
            fontFamily: "var(--font-display)", fontSize: "11px", fontWeight: 600,
            letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--brand-blue)",
            marginBottom: "10px",
          }}>
            BuyTune
          </div>
          <h1 style={{
            fontFamily: "var(--font-display)", fontSize: "28px", fontWeight: 700,
            color: "var(--text-primary)", letterSpacing: "-0.5px", marginBottom: "8px",
          }}>
            Privacy Policy
          </h1>
          <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Effective: {EFFECTIVE_DATE} · Version {VERSION}
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "32px", fontSize: "14px", lineHeight: 1.7, color: "var(--text-secondary)" }}>

          <Section title="Overview">
            <p>
              BuyTune (&quot;we,&quot; &quot;us,&quot; &quot;our&quot;) is committed to protecting your privacy. This policy explains what information we collect, how we use it, and your rights regarding that information. By using BuyTune you agree to this policy.
            </p>
          </Section>

          <Section title="1. Information We Collect">
            <Subsection title="Account Information">
              When you create an account we collect your email address and the username/display name you choose.
            </Subsection>
            <Subsection title="Portfolio and Financial Data">
              Information you voluntarily enter: portfolio holdings (ticker symbols, share quantities, cost basis), transaction records, cash balances, and financial planning data (income, expenses, balance sheet items). <strong style={{ color: "var(--text-primary)" }}>We never have access to your real brokerage accounts or banking credentials.</strong> All portfolio data is manually entered by you.
            </Subsection>
            <Subsection title="Usage Data">
              We collect information about how you use the Service — pages visited, features used, search queries on the Research page, and session activity — to improve the product.
            </Subsection>
            <Subsection title="Device and Technical Data">
              IP address, browser type, operating system, and device identifiers, collected automatically when you use the Service.
            </Subsection>
          </Section>

          <Section title="2. How We Use Your Information">
            <ul style={{ paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "6px" }}>
              <li>To provide and operate the Service (portfolio tracking, performance calculations, AI analysis)</li>
              <li>To transmit relevant portfolio data to AI providers (xAI/Grok, Google Gemini) for generating analysis — this is the core functionality of AI features</li>
              <li>To personalize your experience and remember your preferences</li>
              <li>To communicate with you about the Service (account emails, important updates)</li>
              <li>To analyze usage patterns and improve the product</li>
              <li>To prevent fraud and enforce our Terms of Service</li>
            </ul>
          </Section>

          <Section title="3. Third-Party Services We Use">
            <p style={{ marginBottom: "12px" }}>
              We share data with the following third-party service providers as necessary to operate BuyTune:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                ["Supabase", "Database and authentication. Your account and portfolio data is stored on Supabase servers."],
                ["xAI (Grok)", "AI analysis provider. Portfolio data is sent to Grok for generating portfolio commentary and recommendations."],
                ["Google (Gemini Flash)", "AI analysis provider. Used for strategy building and portfolio health scoring."],
                ["Groq", "AI inference provider. Used for per-stock analysis on the Research page."],
                ["Finnhub", "Stock market data provider. Ticker symbols are sent to Finnhub to retrieve quotes and company data."],
                ["Vercel", "Hosting and deployment platform. Vercel Analytics collects anonymous usage data."],
              ].map(([name, desc]) => (
                <div key={name} style={{
                  padding: "10px 14px",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "8px",
                }}>
                  <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "3px" }}>{name}</div>
                  <div style={{ fontSize: "12px" }}>{desc}</div>
                </div>
              ))}
            </div>
            <p style={{ marginTop: "12px" }}>
              We do not sell your personal or portfolio data to any third party for advertising or marketing purposes.
            </p>
          </Section>

          <Section title="4. AI Processing of Portfolio Data">
            <p>
              When you use AI features (Run AI Analysis, AI Strategy Builder, Research AI Analysis), portfolio data including holding tickers, quantities, and values is transmitted to third-party AI providers. This data is used solely to generate the requested analysis and is subject to those providers&apos; data usage policies. We recommend you review the privacy policies of{" "}
              <span style={{ color: "var(--text-primary)" }}>xAI</span> and{" "}
              <span style={{ color: "var(--text-primary)" }}>Google</span> if you have concerns about AI data processing.
            </p>
          </Section>

          <Section title="5. Data Security">
            <p>
              We implement reasonable technical and organizational measures to protect your data, including encrypted connections (HTTPS), row-level security on our database, and access controls. However, no method of data transmission or storage is 100% secure. We cannot guarantee the absolute security of your data.
            </p>
          </Section>

          <Section title="6. Data Retention">
            <p>
              We retain your account and portfolio data for as long as your account is active. If you delete your account, we will delete your personal data within a reasonable period, except where retention is required by law or for legitimate business purposes.
            </p>
          </Section>

          <Section title="7. Your Rights">
            <p>Depending on your location, you may have the right to:</p>
            <ul style={{ marginTop: "8px", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "4px" }}>
              <li><strong style={{ color: "var(--text-primary)" }}>Access</strong> — request a copy of the data we hold about you</li>
              <li><strong style={{ color: "var(--text-primary)" }}>Correction</strong> — update or correct inaccurate personal data</li>
              <li><strong style={{ color: "var(--text-primary)" }}>Deletion</strong> — request deletion of your account and associated data</li>
              <li><strong style={{ color: "var(--text-primary)" }}>Portability</strong> — receive your data in a structured, machine-readable format (available via the Excel export feature)</li>
              <li><strong style={{ color: "var(--text-primary)" }}>Objection</strong> — object to certain types of data processing</li>
            </ul>
            <p style={{ marginTop: "12px" }}>
              To exercise these rights, contact us through your account or by email. We will respond within 30 days.
            </p>
          </Section>

          <Section title="8. Cookies">
            <p>
              BuyTune uses essential cookies for authentication and session management. We use Vercel Analytics for anonymous, aggregate usage tracking. We do not use third-party advertising cookies or cross-site tracking.
            </p>
          </Section>

          <Section title="9. Children&apos;s Privacy">
            <p>
              BuyTune is not intended for users under 18 years of age. We do not knowingly collect personal information from minors. If you believe a minor has created an account, contact us and we will remove the account.
            </p>
          </Section>

          <Section title="10. International Users">
            <p>
              BuyTune is operated from the United States. By using the Service, users outside the US consent to the transfer and processing of their data in the United States. If you are located in the European Economic Area, you have additional rights under the GDPR. Contact us for GDPR-specific requests.
            </p>
          </Section>

          <Section title="11. Changes to This Policy">
            <p>
              We may update this Privacy Policy periodically. We will notify you of material changes by updating the effective date and, where appropriate, through in-app notification. Continued use of the Service after changes constitutes acceptance of the revised policy.
            </p>
          </Section>

          <Section title="12. Contact">
            <p>
              Questions or concerns about this Privacy Policy or your data? Contact us through the BuyTune platform or at the email address associated with your account.
            </p>
          </Section>

        </div>

        <div style={{ marginTop: "48px", paddingTop: "24px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link href="/terms" style={{ fontSize: "12px", color: "var(--brand-blue)", textDecoration: "none" }}>
            Terms of Service →
          </Link>
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            BuyTune · Version {VERSION}
          </span>
        </div>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 style={{
        fontFamily: "var(--font-display)",
        fontSize: "15px", fontWeight: 600,
        color: "var(--text-primary)", letterSpacing: "-0.2px",
        marginBottom: "10px",
      }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Subsection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "10px" }}>
      <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>{title}</div>
      <div>{children}</div>
    </div>
  );
}
