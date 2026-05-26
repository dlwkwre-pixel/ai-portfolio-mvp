export const metadata = { title: "Privacy Policy — BuyTune" };

const EFFECTIVE = "May 26, 2026";

export default function PrivacyPage() {
  return (
    <article>
      <div style={{ marginBottom: "32px" }}>
        <div style={{ fontSize: "10px", fontWeight: 700, color: "#2563eb", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px" }}>Legal</div>
        <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: "28px", fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.5px", marginBottom: "8px" }}>Privacy Policy</h1>
        <p style={{ fontSize: "13px", color: "#475569" }}>Effective date: {EFFECTIVE} &nbsp;·&nbsp; Governing law: Texas, United States</p>
      </div>

      <div style={{ padding: "14px 18px", background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.18)", borderRadius: "10px", marginBottom: "32px" }}>
        <p style={{ fontSize: "13px", color: "#6ee7b7", lineHeight: 1.7 }}>
          BuyTune takes your financial data privacy seriously. We collect the minimum data necessary to provide the service. We do not sell your data. We do not share it with advertisers.
        </p>
      </div>

      <section className="legal-section">
        <h2 className="legal-h2">1. Who We Are</h2>
        <p className="legal-p">BuyTune ("we," "us," or "our") operates BuyTune.io, an AI-powered portfolio analysis and financial planning platform. For privacy inquiries, contact us at <strong>privacy@buytune.io</strong>.</p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">2. Information We Collect</h2>
        <h3 className="legal-h3">Account Information</h3>
        <ul className="legal-ul">
          <li>Email address (required to create an account)</li>
          <li>Username and display name</li>
          <li>Profile preferences and avatar settings</li>
        </ul>
        <h3 className="legal-h3">Portfolio and Financial Data</h3>
        <ul className="legal-ul">
          <li>Portfolio holdings: ticker symbols, share quantities, cost basis</li>
          <li>Cash balances and transaction history</li>
          <li>Portfolio names, descriptions, and strategy assignments</li>
        </ul>
        <h3 className="legal-h3">Financial Planning Data</h3>
        <ul className="legal-ul">
          <li>Retirement planning inputs: target age, savings rates, assumptions</li>
          <li>Net worth information: assets and liabilities you manually enter</li>
          <li>Cash flow information: income, expense estimates</li>
          <li>Life event planning: home purchase parameters, future financial goals</li>
        </ul>
        <h3 className="legal-h3">Usage Data</h3>
        <ul className="legal-ul">
          <li>Login activity and session data</li>
          <li>Feature usage patterns (via Vercel Analytics — anonymized)</li>
          <li>Browser type, device type, and general location (country/region)</li>
        </ul>
        <h3 className="legal-h3">Communications</h3>
        <ul className="legal-ul">
          <li>Email digest preferences and delivery logs</li>
          <li>Support communications you send to us</li>
        </ul>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">3. How We Use Your Data</h2>
        <p className="legal-p">We use your data solely to:</p>
        <ul className="legal-ul">
          <li>Provide and improve the BuyTune platform</li>
          <li>Generate AI-powered portfolio analysis and financial planning illustrations</li>
          <li>Send email digests and account notifications you have requested</li>
          <li>Maintain your account security</li>
          <li>Diagnose technical issues and improve platform performance</li>
          <li>Comply with legal obligations</li>
        </ul>
        <p className="legal-p">We do <strong>not</strong> use your data for advertising, profiling for third parties, or sale to data brokers.</p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">4. Third-Party Services</h2>
        <p className="legal-p">BuyTune relies on the following third-party services to operate:</p>
        <ul className="legal-ul">
          <li><strong>Supabase</strong> — Database and authentication. Your portfolio and account data is stored in Supabase-managed databases. <a href="https://supabase.com/privacy" className="legal-link" target="_blank" rel="noopener noreferrer">Supabase Privacy Policy</a></li>
          <li><strong>Vercel</strong> — Hosting and serverless functions. Processes web requests. <a href="https://vercel.com/legal/privacy-policy" className="legal-link" target="_blank" rel="noopener noreferrer">Vercel Privacy Policy</a></li>
          <li><strong>Resend</strong> — Email delivery for digest emails and account notifications. <a href="https://resend.com/privacy" className="legal-link" target="_blank" rel="noopener noreferrer">Resend Privacy Policy</a></li>
          <li><strong>Finnhub</strong> — Real-time and historical market data. Ticker queries are sent to Finnhub servers. <a href="https://finnhub.io/privacy" className="legal-link" target="_blank" rel="noopener noreferrer">Finnhub Privacy Policy</a></li>
          <li><strong>Google Gemini (AI)</strong> — AI analysis generation. Portfolio context is sent to Google&apos;s API to generate insights. <a href="https://policies.google.com/privacy" className="legal-link" target="_blank" rel="noopener noreferrer">Google Privacy Policy</a></li>
          <li><strong>xAI Grok (AI)</strong> — AI analysis generation with live search. Portfolio context may be sent to xAI&apos;s API. <a href="https://x.ai/legal/privacy" className="legal-link" target="_blank" rel="noopener noreferrer">xAI Privacy Policy</a></li>
        </ul>
        <p className="legal-p">When your portfolio data is sent to AI services to generate analysis, it is used only for that request and is not used to train AI models (subject to each provider&apos;s terms).</p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">5. Data Retention</h2>
        <ul className="legal-ul">
          <li>Account data is retained for as long as your account is active</li>
          <li>Portfolio and financial data is retained as long as your account exists</li>
          <li>After account deletion, data is removed from active systems within 30 days</li>
          <li>Backups may retain data for up to 90 days after deletion</li>
          <li>Email delivery logs are retained for up to 12 months</li>
        </ul>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">6. Security Practices</h2>
        <p className="legal-p">We implement industry-standard security measures including:</p>
        <ul className="legal-ul">
          <li>Row-level security (RLS) on all database tables — users can only access their own data</li>
          <li>All connections encrypted with TLS in transit</li>
          <li>API keys stored as environment variables, never in client code</li>
          <li>Authentication managed through Supabase Auth with secure session handling</li>
          <li>No plaintext storage of passwords</li>
        </ul>
        <p className="legal-p">Despite these measures, no system is completely secure. In the event of a data breach that affects your personal information, we will notify you as required by applicable law.</p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">7. Your Rights</h2>
        <p className="legal-p">You have the right to:</p>
        <ul className="legal-ul">
          <li><strong>Access</strong> — Request a copy of the data we hold about you</li>
          <li><strong>Correction</strong> — Update or correct your data through your account settings</li>
          <li><strong>Deletion</strong> — Delete your account and associated data</li>
          <li><strong>Export</strong> — Request an export of your portfolio data in CSV format</li>
          <li><strong>Opt-out</strong> — Unsubscribe from email digests at any time via the unsubscribe link in any email</li>
        </ul>
        <p className="legal-p">To exercise these rights, contact us at <strong>privacy@buytune.io</strong>.</p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">8. Cookies and Local Storage</h2>
        <p className="legal-p">BuyTune uses cookies and browser local storage solely for authentication session management and user preferences (such as theme settings). We do not use tracking cookies or advertising cookies.</p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">9. Children&apos;s Privacy</h2>
        <p className="legal-p">BuyTune is not directed at children under 18. We do not knowingly collect personal information from anyone under 18. If you believe a minor has provided us data, contact us at <strong>privacy@buytune.io</strong> and we will delete it.</p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">10. Changes to This Policy</h2>
        <p className="legal-p">We may update this Privacy Policy periodically. Material changes will be communicated by updating the effective date above and, where appropriate, by email notification. Continued use of the platform after changes constitutes acceptance of the revised policy.</p>
      </section>

      <section className="legal-section">
        <h2 className="legal-h2">11. Contact</h2>
        <p className="legal-p">Privacy questions or requests: <strong>privacy@buytune.io</strong></p>
        <p className="legal-p">General legal matters: <strong>legal@buytune.io</strong></p>
      </section>
    </article>
  );
}
