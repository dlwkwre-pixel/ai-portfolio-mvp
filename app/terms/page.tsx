import Link from "next/link";

export const metadata = {
  title: "Terms of Service — BuyTune",
  description: "BuyTune Terms of Service and User Agreement",
};

const EFFECTIVE_DATE = "May 18, 2026";
const TERMS_VERSION  = "2026-05-18";

export default function TermsPage() {
  return (
    <main style={{
      minHeight: "100vh",
      background: "var(--bg-base)",
      color: "var(--text-primary)",
      fontFamily: "var(--font-body)",
    }}>
      <div style={{ maxWidth: "760px", margin: "0 auto", padding: "48px 24px 80px" }}>

        {/* Header */}
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
            Terms of Service
          </h1>
          <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Effective: {EFFECTIVE_DATE} · Version {TERMS_VERSION}
          </p>
        </div>

        {/* NOT financial advice — prominent callout */}
        <div style={{
          padding: "16px 20px",
          background: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.2)",
          borderRadius: "10px",
          marginBottom: "36px",
        }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#f87171", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Important: Not Financial or Investment Advice
          </div>
          <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
            BuyTune is a portfolio tracking and AI-assisted analysis tool. BuyTune is <strong>not</strong> a registered investment advisor, broker-dealer, or financial planner. Nothing on this platform constitutes investment advice, a recommendation to buy or sell any security, or a solicitation of any investment. All AI-generated analysis, recommendations, and insights are for <strong>informational and educational purposes only</strong>. Always consult a qualified financial professional before making investment decisions.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "32px", fontSize: "14px", lineHeight: 1.7, color: "var(--text-secondary)" }}>

          <Section title="1. Agreement to These Terms">
            <p>
              By creating an account or using BuyTune (&quot;the Service,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service. We reserve the right to update these Terms at any time; continued use of the Service after changes constitutes acceptance.
            </p>
          </Section>

          <Section title="2. Description of Service">
            <p>
              BuyTune is a web-based portfolio tracking, analysis, and AI-assisted investment research platform. The Service allows users to manually track investment holdings, view performance analytics, receive AI-generated portfolio commentary, explore stock research data, and access financial planning tools.
            </p>
          </Section>

          <Section title="3. Not Investment Advice — Full Disclaimer">
            <p>
              <strong style={{ color: "var(--text-primary)" }}>BuyTune is not a licensed investment advisor, broker, or financial institution.</strong> We are not registered with the SEC, FINRA, or any other financial regulatory body. The AI-generated analyses, buy/sell signals, portfolio recommendations, risk assessments, and any other content on BuyTune are provided solely for informational and educational purposes. They are not personalized investment advice.
            </p>
            <p style={{ marginTop: "12px" }}>
              Past performance displayed on BuyTune does not guarantee future results. AI models may produce inaccurate, outdated, or misleading outputs. You acknowledge that:
            </p>
            <ul style={{ marginTop: "8px", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "4px" }}>
              <li>All investment decisions are made solely at your own risk and discretion</li>
              <li>You will consult a qualified financial advisor before making investment decisions</li>
              <li>BuyTune is not responsible for any financial losses resulting from your use of the Service</li>
              <li>AI-generated content may reflect outdated market conditions</li>
            </ul>
          </Section>

          <Section title="4. Eligibility">
            <p>
              You must be at least 18 years of age and capable of forming a binding contract to use BuyTune. By using the Service you represent that you meet these requirements.
            </p>
          </Section>

          <Section title="5. User Accounts">
            <p>
              You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You agree to notify us immediately of any unauthorized access to your account. We reserve the right to suspend or terminate accounts that violate these Terms.
            </p>
          </Section>

          <Section title="6. Acceptable Use">
            <p>You agree not to:</p>
            <ul style={{ marginTop: "8px", paddingLeft: "20px", display: "flex", flexDirection: "column", gap: "4px" }}>
              <li>Use the Service for any unlawful purpose or in violation of applicable regulations</li>
              <li>Attempt to reverse-engineer, scrape, or extract data from the Service at scale</li>
              <li>Submit false or misleading portfolio data</li>
              <li>Redistribute or resell AI-generated content from the Service without authorization</li>
              <li>Interfere with the operation of the Service or its underlying infrastructure</li>
            </ul>
          </Section>

          <Section title="7. Data and Privacy">
            <p>
              Your use of the Service is also governed by our{" "}
              <Link href="/privacy" style={{ color: "var(--brand-blue)" }}>Privacy Policy</Link>,
              which is incorporated into these Terms. By using BuyTune you consent to the collection and use of your data as described in the Privacy Policy.
            </p>
            <p style={{ marginTop: "12px" }}>
              Portfolio data you enter is stored in our database and transmitted to third-party AI providers (including xAI/Grok and Google Gemini) for the purpose of generating analysis. By using AI features you consent to this transmission. We do not sell your personal portfolio data to third parties.
            </p>
          </Section>

          <Section title="8. Third-Party Services">
            <p>
              BuyTune integrates with third-party data providers including Finnhub (market data), xAI (Grok AI), Google (Gemini AI), Supabase (database), and Vercel (hosting). Your use of these services through BuyTune is subject to their respective terms. We are not responsible for the availability, accuracy, or actions of third-party providers.
            </p>
          </Section>

          <Section title="9. Market Data Accuracy">
            <p>
              Stock quotes, prices, and market data displayed on BuyTune are sourced from third-party providers and may be delayed, inaccurate, or unavailable. Do not rely on BuyTune&apos;s market data for real-time trading decisions. BuyTune makes no warranty regarding the accuracy, completeness, or timeliness of market data.
            </p>
          </Section>

          <Section title="10. Intellectual Property">
            <p>
              The BuyTune platform, design, software, and brand are owned by BuyTune and protected by applicable intellectual property laws. User-generated content (portfolio data, notes, strategies) remains your property. By publishing strategies or portfolios publicly on BuyTune, you grant BuyTune a license to display that content to other users of the Service.
            </p>
          </Section>

          <Section title="11. Limitation of Liability">
            <p>
              To the maximum extent permitted by applicable law, BuyTune and its operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including but not limited to lost profits, investment losses, or data loss, arising from your use of or inability to use the Service, even if we have been advised of the possibility of such damages.
            </p>
            <p style={{ marginTop: "12px" }}>
              Our total liability to you for any claim arising from these Terms or your use of the Service shall not exceed the amount you paid to BuyTune in the 12 months preceding the claim, or $50 USD if you have not paid anything.
            </p>
          </Section>

          <Section title="12. Disclaimers">
            <p>
              The Service is provided &quot;as is&quot; and &quot;as available&quot; without any warranties, express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement. We do not warrant that the Service will be uninterrupted, error-free, or free of viruses or other harmful components.
            </p>
          </Section>

          <Section title="13. Indemnification">
            <p>
              You agree to indemnify and hold harmless BuyTune and its operators from any claims, liabilities, damages, and expenses (including legal fees) arising from your violation of these Terms or your use of the Service.
            </p>
          </Section>

          <Section title="14. Changes to Terms">
            <p>
              We may update these Terms from time to time. We will notify you of material changes by updating the effective date and, where appropriate, through in-app notification. Your continued use of the Service after changes take effect constitutes your acceptance of the revised Terms.
            </p>
          </Section>

          <Section title="15. Governing Law">
            <p>
              These Terms are governed by the laws of the United States. Any disputes arising from these Terms shall be resolved through binding arbitration or in the courts of competent jurisdiction, as applicable.
            </p>
          </Section>

          <Section title="16. Contact">
            <p>
              Questions about these Terms? Contact us at the email address associated with your BuyTune account or through the platform&apos;s support channels.
            </p>
          </Section>

        </div>

        {/* Footer */}
        <div style={{ marginTop: "48px", paddingTop: "24px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link href="/privacy" style={{ fontSize: "12px", color: "var(--brand-blue)", textDecoration: "none" }}>
            Privacy Policy →
          </Link>
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            BuyTune · Version {TERMS_VERSION}
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
        fontSize: "15px",
        fontWeight: 600,
        color: "var(--text-primary)",
        letterSpacing: "-0.2px",
        marginBottom: "10px",
      }}>
        {title}
      </h2>
      {children}
    </div>
  );
}
