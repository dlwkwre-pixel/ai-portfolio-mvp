import Link from "next/link";
import MarketRibbon from "@/app/components/market-ribbon";

export default function LandingPage() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=DM+Mono:wght@400;500&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html{scroll-behavior:smooth}
        body{background:#07090f;color:#e2e8f0;font-family:'DM Sans',sans-serif;overflow-x:hidden}

        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}

        .fu0{animation:fadeUp 0.6s ease both}
        .fu1{animation:fadeUp 0.6s 0.1s ease both}
        .fu2{animation:fadeUp 0.6s 0.2s ease both}
        .fu3{animation:fadeUp 0.6s 0.3s ease both}
        .fu4{animation:fadeUp 0.6s 0.4s ease both}

        nav{position:fixed;top:0;left:0;right:0;z-index:100;padding:14px 48px;display:flex;align-items:center;justify-content:space-between;background:rgba(7,9,15,0.85);backdrop-filter:blur(20px);border-bottom:1px solid rgba(255,255,255,0.05)}
        .nav-logo{display:flex;align-items:center;gap:10px;text-decoration:none}
        .nav-mark{width:32px;height:32px;background:linear-gradient(135deg,#2563eb,#7c3aed);border-radius:8px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(37,99,235,0.4)}
        .nav-name{font-family:'Syne',sans-serif;font-weight:700;font-size:16px;color:#fff;letter-spacing:-0.3px}
        .nav-name span{color:#7c3aed}
        .nav-links{display:flex;gap:28px}
        .nav-links a{font-size:13px;color:#64748b;text-decoration:none;transition:color 0.15s}
        .nav-links a:hover{color:#e2e8f0}
        .nav-btns{display:flex;gap:8px;align-items:center}
        .btn-ghost{padding:8px 16px;border-radius:8px;font-size:13px;font-weight:500;color:#94a3b8;background:transparent;border:1px solid rgba(255,255,255,0.08);text-decoration:none;transition:all 0.15s}
        .btn-ghost:hover{color:#fff;border-color:rgba(255,255,255,0.18)}
        .btn-primary{padding:8px 18px;border-radius:8px;font-size:13px;font-weight:600;color:#fff;background:linear-gradient(135deg,#2563eb,#7c3aed);border:none;text-decoration:none;box-shadow:0 4px 16px rgba(37,99,235,0.3);transition:all 0.2s}
        .btn-primary:hover{box-shadow:0 6px 24px rgba(37,99,235,0.5);transform:translateY(-1px)}

        /* Hero */
        .hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:100px 24px 60px;position:relative}
        .hero-bg{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 90% 70% at 50% -10%,rgba(37,99,235,0.18) 0%,transparent 55%),radial-gradient(ellipse 50% 50% at 85% 30%,rgba(124,58,237,0.1) 0%,transparent 50%),radial-gradient(ellipse 40% 40% at 15% 70%,rgba(37,99,235,0.07) 0%,transparent 50%)}
        .hero-grid{position:absolute;inset:0;pointer-events:none;opacity:0.03;background-image:linear-gradient(rgba(255,255,255,0.5) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.5) 1px,transparent 1px);background-size:60px 60px}

        .badge{display:inline-flex;align-items:center;gap:7px;padding:6px 14px;border-radius:99px;border:1px solid rgba(37,99,235,0.3);background:rgba(37,99,235,0.08);font-size:12px;color:#93c5fd;font-weight:500;margin-bottom:24px}
        .badge-dot{width:6px;height:6px;border-radius:50%;background:#3b82f6;animation:pulse 2s ease infinite}

        h1.hero-h{font-family:'Syne',sans-serif;font-size:clamp(44px,7vw,84px);font-weight:800;letter-spacing:-2.5px;line-height:1.02;color:#fff;margin:0 0 20px;max-width:860px}
        .hero-h .accent{color:#93c5fd}
        .hero-sub{font-size:clamp(15px,2vw,18px);color:#64748b;line-height:1.7;max-width:520px;margin:0 auto 36px}

        .hero-btns{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-bottom:56px}
        .btn-hero{padding:14px 28px;border-radius:12px;font-size:15px;font-weight:600;color:#fff;background:linear-gradient(135deg,#2563eb,#7c3aed);border:none;text-decoration:none;box-shadow:0 8px 32px rgba(37,99,235,0.4);transition:all 0.2s;display:inline-flex;align-items:center;gap:8px;cursor:pointer}
        .btn-hero:hover{box-shadow:0 12px 40px rgba(37,99,235,0.6);transform:translateY(-2px)}
        .btn-hero-ghost{padding:14px 28px;border-radius:12px;font-size:15px;font-weight:500;color:#94a3b8;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);text-decoration:none;transition:all 0.15s;cursor:pointer}
        .btn-hero-ghost:hover{color:#fff;border-color:rgba(255,255,255,0.2)}

        /* App mockup */
        .mockup-wrap{position:relative;width:100%;max-width:880px;margin:0 auto}
        .mockup-halo{position:absolute;inset:-60px;background:radial-gradient(ellipse 70% 60% at 50% 60%,rgba(37,99,235,0.15),transparent 70%);pointer-events:none}
        .mockup-window{border-radius:14px;border:1px solid rgba(255,255,255,0.1);background:#0a0d15;overflow:hidden;box-shadow:0 40px 100px rgba(0,0,0,0.7),0 0 0 1px rgba(255,255,255,0.04);position:relative;z-index:1}
        .mockup-bar{padding:10px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;gap:6px;background:#0a0d15}
        .m-dot{width:10px;height:10px;border-radius:50%}
        .mockup-url{flex:1;display:flex;justify-content:center}
        .mockup-url-inner{background:rgba(255,255,255,0.05);border-radius:6px;padding:3px 16px;font-size:11px;color:#475569;font-family:'DM Mono',monospace}
        .mockup-body{display:flex;height:320px}
        .m-sidebar{width:160px;min-width:160px;border-right:1px solid rgba(255,255,255,0.05);padding:14px 10px;display:flex;flex-direction:column;gap:2px}
        .m-pv{background:rgba(37,99,235,0.08);border:1px solid rgba(37,99,235,0.15);border-radius:8px;padding:10px 12px;margin-bottom:10px}
        .m-pv-l{font-size:8px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#334155;margin-bottom:3px}
        .m-pv-v{font-family:'DM Mono',monospace;font-size:16px;font-weight:500;color:#fff}
        .m-pv-c{font-family:'DM Mono',monospace;font-size:10px;color:#00d395;margin-top:1px}
        .m-ni{display:flex;align-items:center;gap:7px;padding:6px 8px;border-radius:6px;font-size:11px}
        .m-ni.on{background:rgba(37,99,235,0.1);color:#93c5fd}
        .m-ni:not(.on){color:#334155}
        .m-main{flex:1;padding:14px 16px;overflow:hidden;display:flex;flex-direction:column;gap:10px}
        .m-chart{background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:12px 14px;position:relative;overflow:hidden;height:130px;flex-shrink:0}
        .m-chart-l{font-size:8px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#475569;margin-bottom:3px}
        .m-chart-v{font-family:'DM Mono',monospace;font-size:20px;font-weight:500;color:#fff}
        .m-chart-c{font-family:'DM Mono',monospace;font-size:11px;color:#00d395;margin-top:1px}
        .m-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px}
        .m-card{background:rgba(255,255,255,0.025);border:1px solid rgba(255,255,255,0.05);border-radius:7px;padding:8px 10px}
        .m-card-l{font-size:8px;text-transform:uppercase;letter-spacing:0.07em;color:#334155;margin-bottom:3px}
        .m-card-v{font-size:12px;font-weight:500;color:#e2e8f0;font-family:'DM Mono',monospace}
        .m-ai{background:rgba(124,58,237,0.07);border:1px solid rgba(124,58,237,0.15);border-radius:7px;padding:8px 10px;display:flex;align-items:flex-start;gap:7px}
        .m-ai-icon{width:18px;height:18px;background:rgba(124,58,237,0.2);border-radius:5px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
        .m-ai-text{font-size:10px;color:#94a3b8;line-height:1.5}
        .m-ai-label{font-size:8px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#a78bfa;margin-bottom:2px}

        /* Ticker */
        .ticker{overflow:hidden;border-top:1px solid rgba(255,255,255,0.04);border-bottom:1px solid rgba(255,255,255,0.04);padding:9px 0;background:rgba(255,255,255,0.01);margin:0}
        .ticker-inner{display:flex;gap:36px;width:max-content;animation:ticker 35s linear infinite}
        .t-item{display:flex;align-items:center;gap:6px;font-family:'DM Mono',monospace;font-size:11px;white-space:nowrap;color:#475569}
        .t-up{color:#00d395}.t-dn{color:#ff5c5c}

        /* Sections */
        .section{padding:80px 48px;max-width:1080px;margin:0 auto}
        .s-label{font-size:11px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:#3b82f6;margin-bottom:14px}
        .s-title{font-family:'Syne',sans-serif;font-size:clamp(26px,3.5vw,40px);font-weight:700;letter-spacing:-1px;color:#fff;margin:0 0 14px;line-height:1.15}
        .s-sub{font-size:15px;color:#64748b;line-height:1.7;max-width:500px;margin:0 0 48px}

        /* Steps */
        .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
        .step{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:24px;transition:border-color 0.2s}
        .step:hover{border-color:rgba(37,99,235,0.25)}
        .step-n{font-family:'DM Mono',monospace;font-size:10px;color:#334155;margin-bottom:16px}
        .step-icon{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;margin-bottom:14px}
        .step-title{font-family:'Syne',sans-serif;font-size:16px;font-weight:600;color:#e2e8f0;margin:0 0 7px}
        .step-desc{font-size:13px;color:#64748b;line-height:1.6;margin:0}

        /* Features */
        .features{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
        .feat{background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:22px;transition:all 0.2s}
        .feat:hover{background:rgba(255,255,255,0.03);border-color:rgba(255,255,255,0.09);transform:translateY(-2px)}
        .feat-icon{width:38px;height:38px;border-radius:9px;display:flex;align-items:center;justify-content:center;margin-bottom:12px;font-size:18px}
        .feat-title{font-family:'Syne',sans-serif;font-size:14px;font-weight:600;color:#e2e8f0;margin:0 0 6px}
        .feat-desc{font-size:12px;color:#64748b;line-height:1.6;margin:0}

        /* VS */
        .vs{display:grid;grid-template-columns:1fr 1fr;gap:14px;max-width:680px}
        .vs-card{border-radius:14px;padding:22px 26px}
        .vs-bad{background:rgba(255,92,92,0.04);border:1px solid rgba(255,92,92,0.1)}
        .vs-good{background:rgba(37,99,235,0.06);border:1px solid rgba(37,99,235,0.14)}
        .vs-title{font-family:'Syne',sans-serif;font-size:13px;font-weight:600;margin:0 0 12px}
        .vs-bad .vs-title{color:#ff5c5c}.vs-good .vs-title{color:#93c5fd}
        .vs-item{display:flex;gap:8px;font-size:12px;color:#64748b;margin-bottom:8px;line-height:1.5;align-items:flex-start}

        /* CTA */
        .cta-wrap{padding:80px 48px;text-align:center;position:relative}
        .cta-glow{position:absolute;inset:0;background:radial-gradient(ellipse 60% 50% at 50% 50%,rgba(37,99,235,0.1),transparent 70%);pointer-events:none}
        .cta-box{max-width:580px;margin:0 auto;position:relative;z-index:1;background:rgba(37,99,235,0.05);border:1px solid rgba(37,99,235,0.15);border-radius:20px;padding:48px 40px}
        .cta-title{font-family:'Syne',sans-serif;font-size:clamp(26px,4vw,38px);font-weight:800;letter-spacing:-1px;color:#fff;margin:0 0 12px;line-height:1.15}
        .shimmer{background:linear-gradient(90deg,#fff 0%,#93c5fd 25%,#a78bfa 50%,#93c5fd 75%,#fff 100%);background-size:200% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:shimmer 4s linear infinite}
        .cta-sub{font-size:14px;color:#64748b;margin:0 0 28px;line-height:1.6}

        footer{padding:24px 48px;border-top:1px solid rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:space-between;font-size:12px;color:#334155}
        footer a{color:#334155;text-decoration:none}
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
          AI-powered portfolio analysis
        </div>

        <h1 className="hero-h fu1">
          Your portfolio,{" "}
          <span className="accent">analyzed</span>
          <br/>and tuned by AI
        </h1>

        <p className="hero-sub fu2">
          BuyTune gives every investor — beginner to seasoned — institutional-grade AI insights,
          personalized to their strategy and risk profile.
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
                  <div className="m-pv-l">Total Portfolio</div>
                  <div className="m-pv-v">$124,830</div>
                  <div className="m-pv-c">▲ +14.2%</div>
                </div>
                {[{l:"Dashboard",on:true},{l:"Portfolios",on:false},{l:"AI Analysis",on:false},{l:"Strategies",on:false},{l:"Learn",on:false}].map(item => (
                  <div key={item.l} className={`m-ni ${item.on ? "on" : ""}`}>
                    <div style={{width:"4px",height:"4px",borderRadius:"50%",background:item.on?"#93c5fd":"#1e293b"}}/>
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
                  <div className="m-chart-c">▲ Deposits excluded · All time</div>
                  <svg style={{position:"absolute",bottom:0,left:0,right:0,width:"100%",height:"60px"}} viewBox="0 0 600 60" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#00d395" stopOpacity="0.2"/>
                        <stop offset="100%" stopColor="#00d395" stopOpacity="0"/>
                      </linearGradient>
                    </defs>
                    <path d="M0,50 C60,44 120,36 180,28 C240,20 300,14 360,10 C420,7 480,5 540,4 L600,3 L600,60 L0,60 Z" fill="url(#g1)"/>
                    <path d="M0,50 C60,44 120,36 180,28 C240,20 300,14 360,10 C420,7 480,5 540,4 L600,3" fill="none" stroke="#00d395" strokeWidth="2"/>
                  </svg>
                </div>
                {/* Stats + AI */}
                <div className="m-grid">
                  <div className="m-card"><div className="m-card-l">Total Value</div><div className="m-card-v">$124,830</div></div>
                  <div className="m-card"><div className="m-card-l">vs SPY</div><div className="m-card-v" style={{color:"#00d395"}}>+11.8%</div></div>
                  <div className="m-card"><div className="m-card-l">AI Score</div><div className="m-card-v" style={{color:"#a78bfa"}}>84/100</div></div>
                </div>
                <div className="m-ai">
                  <div className="m-ai-icon">
                    <svg width="10" height="10" viewBox="0 0 20 20" fill="#a78bfa">
                      <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192z"/>
                    </svg>
                  </div>
                  <div>
                    <div className="m-ai-label">AI Recommendation</div>
                    <div className="m-ai-text">Tech at 62% — above your 40% target. Consider trimming NVDA or MSFT to rebalance.</div>
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
          <h2 className="s-title">Three steps to smarter investing</h2>
          <p className="s-sub">BuyTune sits between you and your brokerage — you stay in control, the AI does the heavy lifting.</p>
          <div className="steps">
            {[
              {n:"01",title:"Add your portfolio",desc:"Enter your existing holdings and cash balance. BuyTune tracks performance, calculates real returns, and monitors every position.",bg:"rgba(37,99,235,0.1)",icon:<svg width="18" height="18" viewBox="0 0 20 20" fill="#3b82f6"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/></svg>},
              {n:"02",title:"Set your strategy",desc:"Define your investing style — growth, value, income. Use our AI questionnaire or write your own rules. The AI follows them.",bg:"rgba(124,58,237,0.1)",icon:<svg width="18" height="18" viewBox="0 0 20 20" fill="#a78bfa"><path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.962l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.962 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.962l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192z"/><path d="M6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.684a1 1 0 01.633.632l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.897l-2.051-.684a1 1 0 01-.633-.633L6.95 5.684z"/></svg>},
              {n:"03",title:"Get AI recommendations",desc:"Grok searches live prices, news, and X sentiment then gives you buy, hold, and sell recommendations grounded in real data.",bg:"rgba(0,211,149,0.1)",icon:<svg width="18" height="18" viewBox="0 0 20 20" fill="#00d395"><path fillRule="evenodd" d="M12 2a1 1 0 01.967.744L14.146 7.2 17.5 9.134a1 1 0 010 1.732l-3.354 1.935-1.18 4.455a1 1 0 01-1.933 0L9.854 12.8 6.5 10.866a1 1 0 010-1.732l3.354-1.935 1.18-4.455A1 1 0 0112 2z" clipRule="evenodd"/></svg>},
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
          <h2 className="s-title">Everything your advisor has.<br/>None of the fees.</h2>
          <p className="s-sub">Built for self-directed investors who want data-driven decisions without the noise.</p>
          <div className="features">
            {[
              {title:"Live AI Analysis",desc:"Grok searches real-time prices, earnings, and X market sentiment before every recommendation.",icon:"🤖",bg:"rgba(124,58,237,0.1)"},
              {title:"True Performance",desc:"Modified Dietz strips out deposits so you see actual investment returns — not inflated by cash.",icon:"📈",bg:"rgba(0,211,149,0.1)"},
              {title:"Benchmark Comparison",desc:"Compare against SPY, QQQ, or any index. See if you're actually beating the market.",icon:"⚖️",bg:"rgba(56,189,248,0.1)"},
              {title:"Earnings Alerts",desc:"Get notified before any holding reports earnings so you're never caught off guard.",icon:"📅",bg:"rgba(245,158,11,0.1)"},
              {title:"Custom Strategies",desc:"Define position limits, sector rules, holding periods. The AI follows your strategy every time.",icon:"🎯",bg:"rgba(37,99,235,0.1)"},
              {title:"Portfolio Health Score",desc:"Gemini Flash cross-checks every analysis with a 1–100 health score. Know your weaknesses.",icon:"💡",bg:"rgba(124,58,237,0.1)"},
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
          <p className="s-sub">You have a brokerage account. You have goals. What you're missing is the intelligence layer in between.</p>
          <div className="vs">
            <div className="vs-card vs-bad">
              <div className="vs-title">Without BuyTune</div>
              {["Advisors charge 1–2% AUM annually","No live market context for decisions","Manual tracking across spreadsheets","No benchmark comparison","Generic advice not tied to your strategy"].map(t => (
                <div key={t} className="vs-item">
                  <svg width="11" height="11" viewBox="0 0 20 20" fill="#ff5c5c" style={{flexShrink:0,marginTop:"2px"}}><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/></svg>
                  {t}
                </div>
              ))}
            </div>
            <div className="vs-card vs-good">
              <div className="vs-title">With BuyTune</div>
              {["Free — your brokerage stays yours","Grok searches live data before every rec","Daily snapshots + automatic performance","Beat the market? You'll know exactly","AI follows YOUR strategy and sizing rules"].map(t => (
                <div key={t} className="vs-item">
                  <svg width="11" height="11" viewBox="0 0 20 20" fill="#00d395" style={{flexShrink:0,marginTop:"2px"}}><path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd"/></svg>
                  {t}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="cta-wrap">
        <div className="cta-glow"/>
        <div className="cta-box">
          <div style={{fontSize:"28px",marginBottom:"14px"}}>✦</div>
          <h2 className="cta-title">Start investing<br/><span className="shimmer">with an edge.</span></h2>
          <p className="cta-sub">Connect your holdings, set your strategy, and let AI do the analysis. No subscription. No advisor fees.</p>
          <Link href="/signup" className="btn-hero" style={{display:"inline-flex"}}>
            Create free account
            <svg width="15" height="15" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd"/></svg>
          </Link>
          <p style={{fontSize:"12px",color:"#334155",marginTop:"14px"}}>Works with any brokerage · No credit card required</p>
        </div>
      </div>

      {/* Footer */}
      <footer>
        <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
          <div style={{width:"20px",height:"20px",background:"linear-gradient(135deg,#2563eb,#7c3aed)",borderRadius:"5px",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M4 16c2.5-3 4.5-4 7-4 2 0 3.5 1 5 3 1.5-4 3-7 4-8"/></svg>
          </div>
          <span style={{color:"#475569"}}>BuyTune.io</span>
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
