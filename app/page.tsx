import Link from "next/link";
import MarketRibbon from "@/app/components/market-ribbon";

export default function LandingPage() {
  return (
    <>
      <style>{`
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html{scroll-behavior:smooth}
        body{background:#07090f;color:#e2e8f0;font-family:'DM Sans',sans-serif;overflow-x:hidden}

        @keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
        @keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}

        .fu0{animation:fadeUp 0.55s cubic-bezier(0.23,1,0.32,1) both}
        .fu1{animation:fadeUp 0.55s 0.08s cubic-bezier(0.23,1,0.32,1) both}
        .fu2{animation:fadeUp 0.55s 0.16s cubic-bezier(0.23,1,0.32,1) both}
        .fu3{animation:fadeUp 0.55s 0.24s cubic-bezier(0.23,1,0.32,1) both}
        .fu4{animation:fadeUp 0.55s 0.34s cubic-bezier(0.23,1,0.32,1) both}

        nav{position:fixed;top:0;left:0;right:0;z-index:100;padding:14px 48px;display:flex;align-items:center;justify-content:space-between;background:rgba(7,9,15,0.88);backdrop-filter:blur(20px);border-bottom:1px solid rgba(255,255,255,0.05)}
        .nav-logo{display:flex;align-items:center;gap:10px;text-decoration:none}
        .nav-mark{width:32px;height:32px;background:linear-gradient(135deg,#2563eb,#7c3aed);border-radius:8px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(37,99,235,0.35)}
        .nav-name{font-family:'Syne',sans-serif;font-weight:700;font-size:16px;color:#f0f4ff;letter-spacing:-0.3px}
        .nav-name span{color:#7c3aed}
        .nav-links{display:flex;gap:28px}
        .nav-links a{font-size:13px;color:#475569;text-decoration:none;transition:color 0.15s ease}
        .nav-links a:hover{color:#e2e8f0}
        .nav-btns{display:flex;gap:8px;align-items:center}
        .btn-ghost{padding:8px 16px;border-radius:8px;font-size:13px;font-weight:500;color:#94a3b8;background:transparent;border:1px solid rgba(255,255,255,0.08);text-decoration:none;transition:color 0.15s ease,border-color 0.15s ease}
        .btn-ghost:hover{color:#f0f4ff;border-color:rgba(255,255,255,0.18)}
        .btn-primary{padding:8px 18px;border-radius:8px;font-size:13px;font-weight:600;color:#fff;background:linear-gradient(135deg,#2563eb,#7c3aed);border:none;text-decoration:none;box-shadow:0 4px 16px rgba(37,99,235,0.28);transition:box-shadow 0.2s ease,transform 0.18s cubic-bezier(0.23,1,0.32,1)}
        .btn-primary:hover{box-shadow:0 6px 24px rgba(37,99,235,0.5);transform:translateY(-1px)}

        /* Hero */
        .hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:100px 24px 60px;position:relative}
        .hero-bg{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 90% 70% at 50% -10%,rgba(37,99,235,0.15) 0%,transparent 55%),radial-gradient(ellipse 50% 50% at 85% 30%,rgba(124,58,237,0.08) 0%,transparent 50%),radial-gradient(ellipse 40% 40% at 15% 70%,rgba(37,99,235,0.06) 0%,transparent 50%)}
        .hero-grid{position:absolute;inset:0;pointer-events:none;opacity:0.025;background-image:linear-gradient(rgba(255,255,255,0.6) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.6) 1px,transparent 1px);background-size:60px 60px}

        .badge{display:inline-flex;align-items:center;gap:7px;padding:6px 14px;border-radius:99px;border:1px solid rgba(37,99,235,0.28);background:rgba(37,99,235,0.07);font-size:12px;color:#93c5fd;font-weight:500;margin-bottom:24px}
        .badge-dot{width:6px;height:6px;border-radius:50%;background:#3b82f6;animation:pulse 2s ease infinite}

        h1.hero-h{font-family:'Syne',sans-serif;font-size:clamp(42px,7vw,82px);font-weight:800;letter-spacing:-2.5px;line-height:1.03;color:#f0f4ff;margin:0 0 20px;max-width:820px}
        .hero-h .accent{color:#93c5fd}
        .hero-sub{font-size:clamp(14px,1.8vw,17px);color:#64748b;line-height:1.72;max-width:540px;margin:0 auto 16px}
        .hero-trust{font-size:12px;color:#334155;margin:0 auto 36px;letter-spacing:0.01em}
        .hero-trust strong{color:#475569;font-weight:500}

        .hero-btns{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-bottom:56px}
        .btn-hero{padding:13px 28px;border-radius:10px;font-size:15px;font-weight:600;color:#fff;background:linear-gradient(135deg,#2563eb,#7c3aed);border:none;text-decoration:none;box-shadow:0 8px 28px rgba(37,99,235,0.38);transition:box-shadow 0.2s ease,transform 0.18s cubic-bezier(0.23,1,0.32,1);display:inline-flex;align-items:center;gap:8px;cursor:pointer}
        .btn-hero:hover{box-shadow:0 12px 40px rgba(37,99,235,0.55);transform:translateY(-2px)}
        .btn-hero:active{transform:scale(0.97)}
        .btn-hero-ghost{padding:13px 28px;border-radius:10px;font-size:15px;font-weight:500;color:#94a3b8;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.09);text-decoration:none;transition:color 0.15s ease,border-color 0.15s ease;cursor:pointer}
        .btn-hero-ghost:hover{color:#f0f4ff;border-color:rgba(255,255,255,0.18)}

        /* App mockup */
        .mockup-wrap{position:relative;width:100%;max-width:900px;margin:0 auto}
        .mockup-halo{position:absolute;inset:-60px;background:radial-gradient(ellipse 70% 60% at 50% 60%,rgba(37,99,235,0.12),transparent 70%);pointer-events:none}
        .mockup-window{border-radius:14px;border:1px solid rgba(255,255,255,0.09);background:#0a0d15;overflow:hidden;box-shadow:0 40px 100px rgba(0,0,0,0.7),0 0 0 1px rgba(255,255,255,0.03);position:relative;z-index:1}
        .mockup-bar{padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.05);display:flex;align-items:center;gap:6px;background:#0a0d15}
        .m-dot{width:10px;height:10px;border-radius:50%}
        .mockup-url{flex:1;display:flex;justify-content:center}
        .mockup-url-inner{background:rgba(255,255,255,0.04);border-radius:6px;padding:3px 16px;font-size:11px;color:#334155;font-family:'DM Mono',monospace}
        .mockup-body{display:flex;height:340px}
        .m-sidebar{width:158px;min-width:158px;border-right:1px solid rgba(255,255,255,0.05);padding:14px 10px;display:flex;flex-direction:column;gap:2px}
        .m-pv{background:rgba(37,99,235,0.07);border:1px solid rgba(37,99,235,0.13);border-radius:8px;padding:10px 12px;margin-bottom:10px}
        .m-pv-l{font-size:8px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#2d3748;margin-bottom:3px}
        .m-pv-v{font-family:'DM Mono',monospace;font-size:16px;font-weight:500;color:#f0f4ff}
        .m-pv-c{font-family:'DM Mono',monospace;font-size:10px;color:#00d395;margin-top:1px}
        .m-ni{display:flex;align-items:center;gap:7px;padding:6px 8px;border-radius:6px;font-size:11px}
        .m-ni.on{background:rgba(37,99,235,0.1);color:#93c5fd}
        .m-ni:not(.on){color:#2d3748}
        .m-main{flex:1;padding:14px 16px;overflow:hidden;display:flex;flex-direction:column;gap:9px}
        .m-chart{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:12px 14px;position:relative;overflow:hidden;height:124px;flex-shrink:0}
        .m-chart-l{font-size:8px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#334155;margin-bottom:3px}
        .m-chart-v{font-family:'DM Mono',monospace;font-size:20px;font-weight:500;color:#f0f4ff}
        .m-chart-c{font-family:'DM Mono',monospace;font-size:10px;color:#00d395;margin-top:2px}
        .m-chart-sub{font-size:8px;color:#2d3748;margin-top:1px}

        /* AI rec cards */
        .m-recs{display:flex;flex-direction:column;gap:7px;flex:1}
        .m-rec{border-radius:8px;padding:9px 11px;display:flex;align-items:flex-start;gap:9px}
        .m-rec-trim{background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.16)}
        .m-rec-buy{background:rgba(0,211,149,0.04);border:1px solid rgba(0,211,149,0.13)}
        .m-rec-action{flex-shrink:0;padding:2px 6px;border-radius:4px;font-family:'DM Mono',monospace;font-size:8px;font-weight:700;letter-spacing:0.06em;margin-top:1px}
        .m-rec-action-trim{background:rgba(245,158,11,0.15);color:#f59e0b}
        .m-rec-action-buy{background:rgba(0,211,149,0.15);color:#00d395}
        .m-rec-body{flex:1;min-width:0}
        .m-rec-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:3px}
        .m-rec-ticker{font-family:'DM Mono',monospace;font-size:11px;font-weight:600;color:#f0f4ff}
        .m-rec-conf{font-size:8px;color:#334155}
        .m-rec-reason{font-size:9px;color:#64748b;line-height:1.45;margin-bottom:5px}
        .m-rec-bar{display:flex;gap:2px;height:3px;border-radius:2px;overflow:hidden;margin-bottom:3px}
        .m-rec-labels{display:flex;gap:8px;font-size:7px;font-family:'DM Mono',monospace}

        /* Ticker ribbon */
        .ribbon{overflow:hidden;border-top:1px solid rgba(255,255,255,0.04);border-bottom:1px solid rgba(255,255,255,0.04);padding:9px 0;background:rgba(255,255,255,0.01)}
        .ribbon-inner{display:flex;gap:36px;width:max-content;animation:ticker 35s linear infinite}
        .t-item{display:flex;align-items:center;gap:6px;font-family:'DM Mono',monospace;font-size:11px;white-space:nowrap;color:#334155}
        .t-up{color:#00d395}.t-dn{color:#ff5c5c}

        /* Sections */
        .section{padding:80px 48px;max-width:1080px;margin:0 auto}
        .s-label{font-size:10px;font-weight:600;letter-spacing:0.11em;text-transform:uppercase;color:#3b82f6;margin-bottom:14px}
        .s-title{font-family:'Syne',sans-serif;font-size:clamp(26px,3.5vw,40px);font-weight:700;letter-spacing:-1px;color:#f0f4ff;margin:0 0 13px;line-height:1.15}
        .s-sub{font-size:14px;color:#475569;line-height:1.72;max-width:480px;margin:0 0 48px}

        /* Steps */
        .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
        .step{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:24px;transition:border-color 0.2s ease}
        .step:hover{border-color:rgba(37,99,235,0.22)}
        .step-n{font-family:'DM Mono',monospace;font-size:10px;color:#2d3748;margin-bottom:16px;letter-spacing:0.04em}
        .step-icon{width:38px;height:38px;border-radius:9px;display:flex;align-items:center;justify-content:center;margin-bottom:13px}
        .step-title{font-family:'Syne',sans-serif;font-size:15px;font-weight:600;color:#e2e8f0;margin:0 0 7px}
        .step-desc{font-size:13px;color:#475569;line-height:1.62;margin:0}

        /* Features */
        .features{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
        .feat{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:22px;transition:border-color 0.2s ease,background 0.2s ease,transform 0.18s cubic-bezier(0.23,1,0.32,1)}
        @media (hover:hover) and (pointer:fine){.feat:hover{background:rgba(255,255,255,0.03);border-color:rgba(255,255,255,0.09);transform:translateY(-2px)}}
        .feat-icon{width:36px;height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;margin-bottom:12px}
        .feat-title{font-family:'Syne',sans-serif;font-size:14px;font-weight:600;color:#e2e8f0;margin:0 0 6px}
        .feat-desc{font-size:12px;color:#475569;line-height:1.64;margin:0}

        /* VS */
        .vs{display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:700px}
        .vs-card{border-radius:14px;padding:22px 26px}
        .vs-bad{background:rgba(255,92,92,0.03);border:1px solid rgba(255,92,92,0.09)}
        .vs-good{background:rgba(37,99,235,0.05);border:1px solid rgba(37,99,235,0.13)}
        .vs-title{font-family:'Syne',sans-serif;font-size:13px;font-weight:600;margin:0 0 13px}
        .vs-bad .vs-title{color:#ff5c5c}.vs-good .vs-title{color:#93c5fd}
        .vs-item{display:flex;gap:8px;font-size:12px;color:#475569;margin-bottom:9px;line-height:1.5;align-items:flex-start}
        .vs-note{font-size:10px;color:#2d3748;line-height:1.6;margin-top:14px;padding-top:13px;border-top:1px solid rgba(255,255,255,0.04)}

        /* CTA */
        .cta-wrap{padding:80px 48px;text-align:center;position:relative}
        .cta-glow{position:absolute;inset:0;background:radial-gradient(ellipse 60% 50% at 50% 50%,rgba(37,99,235,0.09),transparent 70%);pointer-events:none}
        .cta-box{max-width:600px;margin:0 auto;position:relative;z-index:1;background:rgba(37,99,235,0.04);border:1px solid rgba(37,99,235,0.13);border-radius:20px;padding:52px 44px}
        .cta-title{font-family:'Syne',sans-serif;font-size:clamp(24px,3.8vw,36px);font-weight:800;letter-spacing:-1px;color:#f0f4ff;margin:0 0 10px;line-height:1.18}
        .cta-accent{color:#93c5fd}
        .cta-sub{font-size:14px;color:#475569;margin:0 0 30px;line-height:1.66;max-width:460px;margin-left:auto;margin-right:auto}
        .cta-fine{font-size:11px;color:#2d3748;margin-top:16px;line-height:1.6}

        footer{padding:24px 48px;border-top:1px solid rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:space-between;font-size:12px;color:#2d3748}
        footer a{color:#2d3748;text-decoration:none;transition:color 0.15s ease}
        footer a:hover{color:#475569}

        /* Mobile */
        @media (max-width: 768px) {
          nav{padding:12px 16px}
          .nav-links{display:none}
          .nav-btns .btn-ghost{display:none}
          .btn-primary{padding:7px 14px;font-size:12px}

          .hero{padding:80px 20px 40px;min-height:auto}
          h1.hero-h{font-size:clamp(32px,9vw,52px);letter-spacing:-1.5px;margin-bottom:16px}
          .hero-sub{font-size:14px;margin-bottom:12px}
          .hero-trust{margin-bottom:28px}
          .hero-btns{flex-direction:column;align-items:center;gap:10px;margin-bottom:36px}
          .btn-hero{width:100%;max-width:280px;justify-content:center;padding:13px 24px}
          .btn-hero-ghost{width:100%;max-width:280px;text-align:center;padding:13px 24px}

          .mockup-wrap{display:none}

          .section{padding:48px 20px}
          .s-title{font-size:clamp(22px,6vw,32px)}
          .s-sub{font-size:14px;margin-bottom:32px}

          .steps{grid-template-columns:1fr}
          .features{grid-template-columns:1fr 1fr}
          .vs{grid-template-columns:1fr;max-width:100%}

          .cta-wrap{padding:48px 20px}
          .cta-box{padding:32px 24px}
          .cta-title{font-size:clamp(22px,6vw,30px)}

          footer{padding:20px 16px;flex-direction:column;gap:12px;text-align:center}
          .hero-grid{display:none}
        }
        @media (max-width: 480px) {
          .features{grid-template-columns:1fr}
        }
      `}</style>

      {/* Nav */}
      <nav>
        <a href="/" className="nav-logo">
          <div className="nav-mark">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
              <path d="M4 16c2.5-3 4.5-4 7-4 2 0 3.5 1 5 3 1.5-4 3-7 4-8"/>
              <circle cx="5" cy="16" r="1.2" fill="white" stroke="none"/>
              <circle cx="11" cy="12" r="1.2" fill="white" stroke="none"/>
              <circle cx="16" cy="15" r="1.2" fill="white" stroke="none"/>
              <circle cx="20" cy="7" r="1.2" fill="white" stroke="none"/>
            </svg>
          </div>
          <span className="nav-name">Buy<span>Tune</span>.io</span>
        </a>
        <div className="nav-links">
          <a href="#how-it-works">How it works</a>
          <a href="#features">Features</a>
          <a href="#why">Why BuyTune</a>
        </div>
        <div className="nav-btns">
          <Link href="/login" className="btn-ghost">Sign in</Link>
          <Link href="/signup" className="btn-primary">Get started free</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero">
        <div className="hero-bg"/>
        <div className="hero-grid"/>

        <div className="badge fu0">
          <div className="badge-dot"/>
          AI-powered investment recommendations
        </div>

        <h1 className="hero-h fu1">
          Your portfolio,{" "}
          <span className="accent">analyzed</span>
          <br/>and tuned by AI
        </h1>

        <p className="hero-sub fu2">
          Connect your holdings, set a strategy, and get specific buy, trim, hold, or sell calls
          backed by live prices, earnings data, and market sentiment — every recommendation
          tied to your actual positions.
        </p>

        <p className="hero-trust fu2">
          <strong>BuyTune recommends. You decide and act.</strong> No auto-trading, ever.
        </p>

        <div className="hero-btns fu3">
          <Link href="/signup" className="btn-hero">
            Start for free
            <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd"/>
            </svg>
          </Link>
          <Link href="/login" className="btn-hero-ghost">Sign in to your account</Link>
        </div>

        {/* App mockup */}
        <div className="mockup-wrap fu4">
          <div className="mockup-halo"/>
          <div className="mockup-window">
            <div className="mockup-bar">
              <div className="m-dot" style={{background:"#ff5f57"}}/>
              <div className="m-dot" style={{background:"#febc2e"}}/>
              <div className="m-dot" style={{background:"#28c840"}}/>
              <div className="mockup-url">
                <div className="mockup-url-inner">app.buytune.io/dashboard</div>
              </div>
            </div>
            <div className="mockup-body">
              {/* Sidebar */}
              <div className="m-sidebar">
                <div className="m-pv">
                  <div className="m-pv-l">Portfolio Value</div>
                  <div className="m-pv-v">$124,830</div>
                  <div className="m-pv-c">+14.2% all-time</div>
                </div>
                {[
                  {l:"Dashboard",on:true},
                  {l:"Portfolios",on:false},
                  {l:"Research",on:false},
                  {l:"Strategies",on:false},
                  {l:"Community",on:false},
                ].map(item => (
                  <div key={item.l} className={`m-ni ${item.on ? "on" : ""}`}>
                    <div style={{width:"4px",height:"4px",borderRadius:"50%",background:item.on?"#93c5fd":"#1e293b",flexShrink:0}}/>
                    {item.l}
                  </div>
                ))}
              </div>

              {/* Main */}
              <div className="m-main">
                {/* Chart */}
                <div className="m-chart">
                  <div className="m-chart-l">Investment Return</div>
                  <div className="m-chart-v">+14.2%</div>
                  <div className="m-chart-c">+3.1% vs SPY</div>
                  <div className="m-chart-sub">Modified Dietz · deposits excluded</div>
                  <svg style={{position:"absolute",bottom:0,left:0,right:0,width:"100%",height:"52px"}} viewBox="0 0 600 52" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#00d395" stopOpacity="0.18"/>
                        <stop offset="100%" stopColor="#00d395" stopOpacity="0"/>
                      </linearGradient>
                    </defs>
                    <path d="M0,44 C60,38 120,30 180,22 C240,14 300,9 360,6 C420,4 480,3 540,2 L600,2 L600,52 L0,52 Z" fill="url(#g1)"/>
                    <path d="M0,44 C60,38 120,30 180,22 C240,14 300,9 360,6 C420,4 480,3 540,2 L600,2" fill="none" stroke="#00d395" strokeWidth="1.5"/>
                  </svg>
                </div>

                {/* AI recommendation cards */}
                <div className="m-recs">
                  <div style={{fontSize:"8px",fontWeight:600,letterSpacing:"0.09em",textTransform:"uppercase",color:"#2d3748",marginBottom:"1px"}}>AI Recommendations</div>

                  {/* TRIM NVDA */}
                  <div className="m-rec m-rec-trim">
                    <div className="m-rec-action m-rec-action-trim">TRIM</div>
                    <div className="m-rec-body">
                      <div className="m-rec-head">
                        <span className="m-rec-ticker">NVDA</span>
                        <span className="m-rec-conf">High conf.</span>
                      </div>
                      <div className="m-rec-reason">Tech at 62% vs your 40% cap. Reduce 10–12 shares (~$10,500).</div>
                      <div className="m-rec-bar">
                        <div style={{width:"72%",background:"#00d395"}}/>
                        <div style={{width:"18%",background:"#f59e0b"}}/>
                        <div style={{width:"10%",background:"#ff5c5c"}}/>
                      </div>
                      <div className="m-rec-labels">
                        <span style={{color:"#00d395"}}>B 39</span>
                        <span style={{color:"#f59e0b"}}>H 12</span>
                        <span style={{color:"#ff5c5c"}}>S 3</span>
                      </div>
                    </div>
                  </div>

                  {/* BUY MSFT */}
                  <div className="m-rec m-rec-buy">
                    <div className="m-rec-action m-rec-action-buy">BUY</div>
                    <div className="m-rec-body">
                      <div className="m-rec-head">
                        <span className="m-rec-ticker">MSFT</span>
                        <span className="m-rec-conf">Med. conf.</span>
                      </div>
                      <div className="m-rec-reason">Underweight vs strategy target. Buy 5–8 shares at market.</div>
                      <div className="m-rec-bar">
                        <div style={{width:"68%",background:"#00d395"}}/>
                        <div style={{width:"20%",background:"#f59e0b"}}/>
                        <div style={{width:"12%",background:"#ff5c5c"}}/>
                      </div>
                      <div className="m-rec-labels">
                        <span style={{color:"#00d395"}}>B 51</span>
                        <span style={{color:"#f59e0b"}}>H 9</span>
                        <span style={{color:"#ff5c5c"}}>S 4</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <MarketRibbon />

      {/* How it works */}
      <div id="how-it-works">
        <div className="section">
          <div className="s-label">How it works</div>
          <h2 className="s-title">Three steps to your first recommendation</h2>
          <p className="s-sub">BuyTune sits between you and your brokerage. You stay in full control — the AI does the analysis.</p>
          <div className="steps">
            {[
              {
                n:"01",
                title:"Add your portfolio",
                desc:"Enter your holdings and cash balance. BuyTune tracks true investment return, calculates performance excluding deposits, and monitors every position against benchmarks.",
                bg:"rgba(37,99,235,0.1)",
                icon:<svg width="18" height="18" viewBox="0 0 20 20" fill="#3b82f6"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/></svg>,
              },
              {
                n:"02",
                title:"Set your strategy",
                desc:"Define your style — growth, value, income. Set position size caps, sector limits, and holding rules. BuyTune checks every recommendation against them before surfacing it.",
                bg:"rgba(124,58,237,0.1)",
                icon:<svg width="18" height="18" viewBox="0 0 20 20" fill="#a78bfa"><path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192z"/><path d="M6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.897l-2.051-.684a1 1 0 01-.633-.633L6.95 5.684z"/></svg>,
              },
              {
                n:"03",
                title:"Review your recommendations",
                desc:"Grok searches live prices, recent earnings, and market sentiment — then returns specific buy, trim, hold, or sell calls for your holdings. You review the reasoning and decide.",
                bg:"rgba(0,211,149,0.1)",
                icon:<svg width="18" height="18" viewBox="0 0 20 20" fill="#00d395"><path fillRule="evenodd" d="M12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z" clipRule="evenodd"/></svg>,
              },
            ].map(s => (
              <div key={s.n} className="step">
                <div className="step-n">{s.n}</div>
                <div className="step-icon" style={{background:s.bg}}>{s.icon}</div>
                <h3 className="step-title">{s.title}</h3>
                <p className="step-desc">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Features */}
      <div id="features">
        <div className="section" style={{paddingTop:0}}>
          <div className="s-label">Features</div>
          <h2 className="s-title">Built for investors who want<br/>data behind every decision.</h2>
          <p className="s-sub">Not a passive tracker. Not an overwhelming terminal. The intelligence layer your portfolio is missing.</p>
          <div className="features">
            {[
              {
                title:"Grok AI Recommendations",
                desc:"For each holding, Grok searches live prices, recent earnings, news, and market sentiment — then returns a specific buy, trim, hold, or sell call with the reasoning behind it.",
                bg:"rgba(124,58,237,0.1)",
                icon:<svg width="17" height="17" viewBox="0 0 20 20" fill="#a78bfa"><path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192z"/><path d="M6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.897l-2.051-.684a1 1 0 01-.633-.633L6.95 5.684z"/></svg>,
              },
              {
                title:"True Return Tracking",
                desc:"Modified Dietz calculation strips deposits so you see actual investment gain — not inflated by cash adds. Side-by-side benchmark comparison against SPY, QQQ, or any index.",
                bg:"rgba(0,211,149,0.1)",
                icon:<svg width="17" height="17" viewBox="0 0 20 20" fill="#00d395"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/></svg>,
              },
              {
                title:"Strategy Rules Engine",
                desc:"Define position size caps, sector allocation limits, and holding criteria. Every AI recommendation is checked against your rules before it surfaces — no generic advice.",
                bg:"rgba(37,99,235,0.1)",
                icon:<svg width="17" height="17" viewBox="0 0 20 20" fill="#3b82f6"><path fillRule="evenodd" d="M3 3a1 1 0 000 2h11a1 1 0 100-2H3zm0 4a1 1 0 000 2h7a1 1 0 100-2H3zm0 4a1 1 0 100 2h4a1 1 0 100-2H3z" clipRule="evenodd"/></svg>,
              },
              {
                title:"Stock Research Panel",
                desc:"Search any ticker for analyst consensus (exact Buy / Hold / Sell counts), mean price target, upside percentage, recent news, and Reddit/X sentiment — all in one panel.",
                bg:"rgba(56,189,248,0.08)",
                icon:<svg width="17" height="17" viewBox="0 0 20 20" fill="#38bdf8"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd"/></svg>,
              },
              {
                title:"Portfolio Health Score",
                desc:"Gemini cross-checks your portfolio against diversification, concentration risk, and sector balance — and returns a 1–100 score with a written assessment of your weaknesses.",
                bg:"rgba(124,58,237,0.1)",
                icon:<svg width="17" height="17" viewBox="0 0 20 20" fill="#a78bfa"><path fillRule="evenodd" d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944zM11 14a1 1 0 11-2 0 1 1 0 012 0zm0-7a1 1 0 10-2 0v3a1 1 0 102 0V7z" clipRule="evenodd"/></svg>,
              },
              {
                title:"Earnings Alerts",
                desc:"A banner appears before any holding reports earnings so you can pull up the AI recommendation, check analyst expectations, and decide before the market moves.",
                bg:"rgba(245,158,11,0.1)",
                icon:<svg width="17" height="17" viewBox="0 0 20 20" fill="#f59e0b"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z"/></svg>,
              },
            ].map(f => (
              <div key={f.title} className="feat">
                <div className="feat-icon" style={{background:f.bg}}>{f.icon}</div>
                <h3 className="feat-title">{f.title}</h3>
                <p className="feat-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Why */}
      <div id="why">
        <div className="section" style={{paddingTop:0}}>
          <div className="s-label">Why BuyTune</div>
          <h2 className="s-title">The gap between DIY<br/>and an advisor — closed.</h2>
          <p className="s-sub">You have a brokerage account and goals. What you're missing is the intelligence layer in between.</p>
          <div className="vs">
            <div className="vs-card vs-bad">
              <div className="vs-title">Without BuyTune</div>
              {[
                "Financial advisors charge 1–2% AUM annually",
                "Decisions made without live prices or earnings context",
                "Manual return tracking across spreadsheets",
                "No benchmark to know if you're actually winning",
                "Generic advice disconnected from your actual holdings",
              ].map(t => (
                <div key={t} className="vs-item">
                  <svg width="11" height="11" viewBox="0 0 20 20" fill="#ff5c5c" style={{flexShrink:0,marginTop:"2px"}}><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
                  {t}
                </div>
              ))}
            </div>
            <div className="vs-card vs-good">
              <div className="vs-title">With BuyTune</div>
              {[
                "Free — your brokerage account stays exactly where it is",
                "Live prices, earnings, and sentiment in every recommendation",
                "True return tracking with automatic benchmark comparison",
                "Recommendations follow your exact strategy and sizing rules",
                "Review every call with full reasoning before you act",
              ].map(t => (
                <div key={t} className="vs-item">
                  <svg width="11" height="11" viewBox="0 0 20 20" fill="#00d395" style={{flexShrink:0,marginTop:"2px"}}><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd"/></svg>
                  {t}
                </div>
              ))}
              <div className="vs-note">
                BuyTune provides informational recommendations only. All investment decisions are made by you. BuyTune never places trades on your behalf.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="cta-wrap">
        <div className="cta-glow"/>
        <div className="cta-box">
          <h2 className="cta-title">
            Add your portfolio.<br/>
            Set a strategy.<br/>
            <span className="cta-accent">Get your first AI recommendation.</span>
          </h2>
          <p className="cta-sub">
            Create a portfolio, define your rules, and see what BuyTune recommends in your first session.
            You keep full control — review every call before acting.
          </p>
          <Link href="/signup" className="btn-hero" style={{display:"inline-flex"}}>
            Create free account
            <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd"/></svg>
          </Link>
          <p className="cta-fine">
            No subscription · No credit card required · Works with any brokerage<br/>
            Recommendations are informational only — you decide and act
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer>
        <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
          <div style={{width:"20px",height:"20px",background:"linear-gradient(135deg,#2563eb,#7c3aed)",borderRadius:"5px",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M4 16c2.5-3 4.5-4 7-4 2 0 3.5 1 5 3 1.5-4 3-7 4-8"/></svg>
          </div>
          <span style={{color:"#334155"}}>BuyTune.io</span>
        </div>
        <span>© 2026 BuyTune. All rights reserved.</span>
        <div style={{display:"flex",gap:"20px"}}>
          <a href="#">Privacy</a>
          <a href="#">Terms</a>
        </div>
      </footer>
    </>
  );
}
