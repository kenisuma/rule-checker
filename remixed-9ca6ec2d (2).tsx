import { useState, useRef, useCallback, useEffect } from "react";

/* ── Anthropic backend (only API allowed in artifacts) ── */
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

const ModerationService = {
  async moderate({ rules, text, imageBase64, imageMime }, attempt = 0) {
    const userContent = [];
    if (imageBase64) {
      userContent.push({ type: "image", source: { type: "base64", media_type: imageMime, data: imageBase64 } });
    }
    userContent.push({
      type: "text",
      text: imageBase64
        ? "Analyze this screenshot for group rule violations."
        : `Analyze this message for group rule violations:\n"${text}"`,
    });

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        system: `You are a strict group moderation AI. Evaluate content against these rules:\n${rules}\n\nRespond ONLY with raw JSON, no markdown:\n{"percent":<0-100>,"action":"none"|"normal_warning"|"big_warning"|"kick","violations":[],"reasoning":"<short>","quote":"<excerpt or null>"}\npercent: 0=clean,100=worst. action: none(<20),normal_warning(20-49),big_warning(50-79),kick(80+).`,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    // Retry on overload (529) or server error (500/503) up to 3 times
    if ((r.status === 529 || r.status === 500 || r.status === 503) && attempt < 3) {
      const wait = (attempt + 1) * 2000;
      await sleep(wait);
      return ModerationService.moderate({ rules, text, imageBase64, imageMime }, attempt + 1);
    }

    if (!r.ok) { const e = await r.json(); throw new Error(e.error?.message || `HTTP ${r.status}`); }
    const data = await r.json();
    const raw = data.content?.find(b => b.type === "text")?.text || "{}";
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  },
};

/* ── action config ── */
const ACTIONS = {
  none:           { label: "No Action",      emoji: "✅", color: "#2d6a4f", bg: "#d8f3dc", border: "#52b788" },
  normal_warning: { label: "Normal Warning", emoji: "📢", color: "#7b4f12", bg: "#fff3cd", border: "#ffc107" },
  big_warning:    { label: "Big Warning",    emoji: "⚠️", color: "#7d1a1a", bg: "#ffe0e0", border: "#e63946" },
  kick:           { label: "KICK",           emoji: "🚪", color: "#fff",    bg: "#c1121f", border: "#a4161a" },
};

const PERCENT_COLOR = (p) =>
  p < 20 ? "#2d6a4f" : p < 50 ? "#e9c46a" : p < 80 ? "#e76f51" : "#c1121f";

export default function App() {
  const [rules, setRules]         = useState("1. No hate speech or discrimination\n2. Respect all members\n3. No spamming or flooding\n4. No NSFW content\n5. No sharing personal information");
  const [activeTab, setActiveTab] = useState("text");
  const [message, setMessage]     = useState("");
  const [image, setImage]         = useState(null);
  const [imageB64, setImageB64]   = useState(null);
  const [result, setResult]       = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [mounted, setMounted]     = useState(false);
  const fileRef = useRef();

  useEffect(() => { setTimeout(() => setMounted(true), 50); }, []);

  const handleImage = (file) => {
    if (!file?.type.startsWith("image/")) return;
    setImage(file);
    const rd = new FileReader();
    rd.onload = (e) => setImageB64(e.target.result.split(",")[1]);
    rd.readAsDataURL(file);
  };

  const onDrop = useCallback((e) => { e.preventDefault(); handleImage(e.dataTransfer.files[0]); }, []);

  const analyze = async () => {
    if (!rules.trim()) { setError("Please enter group rules."); return; }
    if (activeTab === "text" && !message.trim()) { setError("Please enter a message."); return; }
    if (activeTab === "screenshot" && !imageB64) { setError("Please upload a screenshot."); return; }
    setError(""); setLoading(true); setResult(null);
    try {
      const res = await ModerationService.moderate({
        rules,
        text: message,
        imageBase64: activeTab === "screenshot" ? imageB64 : null,
        imageMime: image?.type,
      });
      setResult(res);
    } catch (e) { setError(e.message || "Analysis failed."); }
    setLoading(false);
  };

  const act = result ? ACTIONS[result.action] || ACTIONS.none : null;
  const pct = result?.percent ?? 0;
  const pctColor = PERCENT_COLOR(pct);

  return (
    <div style={{ minHeight:"100vh", background:"#1a1f3c", fontFamily:"'Georgia',serif", overflow:"hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;700;900&family=Special+Elite&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:6px} ::-webkit-scrollbar-track{background:#12162b} ::-webkit-scrollbar-thumb{background:#8b1a1a;border-radius:3px}
        .page-enter{opacity:0;transform:translateY(30px);transition:opacity .7s ease,transform .7s ease}
        .page-enter.in{opacity:1;transform:translateY(0)}
        .hero-banner{background:linear-gradient(180deg,#c8102e 0%,#9b0b22 100%);border-top:8px solid #f5f5dc;border-bottom:6px solid #002868;padding:28px 20px 22px;text-align:center;position:relative;overflow:hidden}
        .hero-banner::before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent,transparent 60px,rgba(255,255,255,.04) 60px,rgba(255,255,255,.04) 61px)}
        .hero-title{font-family:'Oswald',sans-serif;font-weight:900;font-size:clamp(36px,8vw,72px);color:#f5f5dc;letter-spacing:6px;text-shadow:4px 4px 0 #8b0000,6px 6px 0 #000;line-height:1}
        .hero-sub{font-family:'Special Elite',serif;font-size:clamp(12px,2.5vw,18px);color:#ffd700;letter-spacing:4px;margin-top:10px;text-shadow:1px 1px 0 #000}
        .star{display:inline-block;animation:spin 6s linear infinite;font-size:22px}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .card{background:#f5f5dc;border:3px solid #002868;border-radius:4px;box-shadow:0 4px 20px #00000066,inset 0 0 60px rgba(0,0,0,.04)}
        .section-title{font-family:'Oswald',sans-serif;font-weight:700;font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#8b1a1a;border-bottom:2px solid #8b1a1a;padding-bottom:6px;margin-bottom:14px}
        textarea{background:#fffef5!important;border:2px solid #8b8b6b!important;color:#1a1a1a!important;font-family:'Special Elite',serif!important;font-size:13px!important;padding:10px 12px!important;border-radius:3px!important;width:100%;outline:none!important;transition:border-color .2s;resize:vertical}
        textarea:focus{border-color:#002868!important;box-shadow:0 0 0 3px #00286822}
        .tab-btn{background:transparent;border:2px solid #8b8b6b;color:#555;font-family:'Oswald',sans-serif;font-size:12px;letter-spacing:2px;padding:7px 18px;cursor:pointer;transition:all .2s}
        .tab-btn.active{background:#002868;border-color:#002868;color:#f5f5dc}
        .tab-btn:hover:not(.active){background:#e8e8cc;border-color:#002868}
        .drop-zone{border:3px dashed #8b8b6b;border-radius:4px;background:#fffef5;cursor:pointer;transition:all .2s;text-align:center;padding:36px 20px}
        .drop-zone:hover{border-color:#002868;background:#eef0ff}
        .analyze-btn{background:linear-gradient(135deg,#c8102e,#8b0000);border:3px solid #8b0000;color:#f5f5dc;font-family:'Oswald',sans-serif;font-size:18px;font-weight:900;letter-spacing:4px;padding:16px 48px;border-radius:4px;cursor:pointer;transition:all .2s;text-transform:uppercase;box-shadow:0 4px 0 #5a0000;position:relative;top:0}
        .analyze-btn:hover:not(:disabled){top:2px;box-shadow:0 2px 0 #5a0000;background:linear-gradient(135deg,#a80d26,#6b0000)}
        .analyze-btn:disabled{opacity:.5;cursor:not-allowed;box-shadow:none}
        .result-card{background:#f5f5dc;border:4px solid #8b1a1a;border-radius:4px;box-shadow:0 6px 30px #00000088;animation:popIn .5s cubic-bezier(.16,1,.3,1) forwards}
        @keyframes popIn{from{opacity:0;transform:scale(.9) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}
        .violation-tag{display:inline-block;background:#8b1a1a22;border:1px solid #8b1a1a66;color:#8b1a1a;font-size:11px;padding:3px 10px;border-radius:20px;margin:2px;font-family:'Special Elite',serif}
        .footer-banner{background:linear-gradient(180deg,#002868,#001640);border-top:6px solid #c8102e;padding:40px 20px 30px;text-align:center;margin-top:40px}
        .footer-poster{background:linear-gradient(180deg,#e8e0cc,#d4cbb0);border:6px solid #002868;border-radius:4px;padding:24px 20px;max-width:360px;margin:0 auto 20px;box-shadow:0 8px 30px #00000066;position:relative;overflow:hidden}
        .footer-poster::before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.02) 3px,rgba(0,0,0,.02) 4px)}
        .pulse-dot{width:8px;height:8px;border-radius:50%;display:inline-block;animation:blink 1.2s ease infinite}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:.2}}
        .shimmer{background:linear-gradient(90deg,#c8102e 0%,#ff6b6b 50%,#c8102e 100%);background-size:200% auto;animation:shimmer 2s linear infinite;-webkit-background-clip:text;-webkit-text-fill-color:transparent}
        @keyframes shimmer{to{background-position:200% center}}
      `}</style>

      {/* HERO */}
      <div className="hero-banner">
        <div style={{marginBottom:10}}>
          <span className="star">⭐</span>
          <span style={{fontFamily:"'Oswald',sans-serif",fontSize:13,letterSpacing:6,color:"#ffd700",margin:"0 16px"}}>ORDER IS OUR PRIORITY</span>
          <span className="star">⭐</span>
        </div>
        <div className="hero-title">FOLLOW THE RULES</div>
        <div className="hero-sub">GROUP MODERATION SYSTEM</div>
        <div style={{marginTop:12,fontSize:11,letterSpacing:3,color:"rgba(245,245,220,.5)",fontFamily:"'Oswald',sans-serif"}}>
          POWERED BY CLAUDE AI · INSTANT ENFORCEMENT
        </div>
      </div>

      {/* MAIN */}
      <div className={`page-enter ${mounted?"in":""}`} style={{maxWidth:940,margin:"0 auto",padding:"32px 16px"}}>

        {/* Notice */}
        <div style={{background:"#d8f3dc",border:"2px solid #52b788",borderRadius:4,padding:"12px 18px",marginBottom:24,display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20}}>✅</span>
          <div>
            <div style={{fontFamily:"'Oswald',sans-serif",fontWeight:700,fontSize:13,letterSpacing:2,color:"#2d6a4f"}}>NO API KEY NEEDED</div>
            <div style={{fontFamily:"'Special Elite',serif",fontSize:12,color:"#555",marginTop:2}}>This tool runs on Claude AI — just enter your rules and analyze content directly.</div>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:20}}>

          {/* Group Rules */}
          <div className="card" style={{padding:"20px 24px"}}>
            <div className="section-title">📋 Group Rules</div>
            <textarea
              rows={11}
              value={rules}
              onChange={e=>setRules(e.target.value)}
              placeholder="Enter your group rules, one per line…"
              style={{lineHeight:1.8}}
            />
            <div style={{marginTop:8,fontSize:11,color:"#8b8b6b",fontFamily:"'Oswald',sans-serif",letterSpacing:1}}>
              {rules.split("\n").filter(r=>r.trim()).length} RULES LOADED
            </div>
          </div>

          {/* Evidence */}
          <div className="card" style={{padding:"20px 24px"}}>
            <div className="section-title">🔎 Evidence</div>
            <div style={{display:"flex",gap:8,marginBottom:16}}>
              <button className={`tab-btn ${activeTab==="text"?"active":""}`} onClick={()=>setActiveTab("text")}>💬 Message</button>
              <button className={`tab-btn ${activeTab==="screenshot"?"active":""}`} onClick={()=>setActiveTab("screenshot")}>📸 Screenshot</button>
            </div>

            {activeTab==="text" ? (
              <textarea rows={9} value={message} onChange={e=>setMessage(e.target.value)}
                placeholder="Paste the member's message here…" style={{lineHeight:1.7}} />
            ) : (
              <>
                <div className="drop-zone"
                  onClick={()=>fileRef.current?.click()}
                  onDragOver={e=>e.preventDefault()} onDrop={onDrop}>
                  {image ? (
                    <>
                      <img src={URL.createObjectURL(image)} alt="preview"
                        style={{maxHeight:160,maxWidth:"100%",borderRadius:3,marginBottom:8,border:"2px solid #002868"}}/>
                      <div style={{fontSize:11,color:"#555",fontFamily:"'Special Elite',serif"}}>{image.name}</div>
                    </>
                  ) : (
                    <>
                      <div style={{fontSize:36,marginBottom:10,opacity:.4}}>📸</div>
                      <div style={{fontFamily:"'Oswald',sans-serif",fontSize:13,letterSpacing:2,color:"#555"}}>DROP SCREENSHOT HERE</div>
                      <div style={{fontSize:11,color:"#8b8b6b",marginTop:4}}>or click to browse · PNG, JPG, WEBP</div>
                    </>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}}
                  onChange={e=>handleImage(e.target.files[0])}/>
              </>
            )}
          </div>
        </div>

        {error && (
          <div style={{background:"#ffe0e0",border:"2px solid #e63946",borderRadius:3,padding:"10px 16px",marginBottom:16,fontSize:13,color:"#c1121f",fontFamily:"'Oswald',sans-serif",letterSpacing:1}}>
            ⚠ {error}
          </div>
        )}

        <div style={{textAlign:"center",marginBottom:32}}>
          <button className="analyze-btn" onClick={analyze}
            disabled={loading||!rules.trim()||(activeTab==="text"?!message.trim():!imageB64)}>
            {loading ? (
              <span style={{display:"flex",alignItems:"center",gap:12,justifyContent:"center"}}>
                <span className="pulse-dot" style={{background:"#f5f5dc",width:10,height:10}}/>
                ANALYZING… (auto-retry if busy)
              </span>
            ) : "⚖ JUDGE NOW"}
          </button>
        </div>

        {/* RESULT */}
        {result && !error && (() => {
          const a = ACTIONS[result.action] || ACTIONS.none;
          return (
            <div className="result-card" style={{padding:28,marginBottom:32}}>
              <div style={{textAlign:"center",borderBottom:"3px solid #8b1a1a",paddingBottom:20,marginBottom:24}}>
                <div style={{fontFamily:"'Oswald',sans-serif",fontSize:13,letterSpacing:4,color:"#8b1a1a",marginBottom:8}}>VERDICT</div>
                <div style={{display:"inline-flex",flexDirection:"column",alignItems:"center",marginBottom:16}}>
                  <svg width="120" height="120" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="#ddd" strokeWidth="10"/>
                    <circle cx="60" cy="60" r="50" fill="none" stroke={pctColor} strokeWidth="10"
                      strokeDasharray={`${2*Math.PI*50}`}
                      strokeDashoffset={`${2*Math.PI*50*(1-pct/100)}`}
                      strokeLinecap="round" transform="rotate(-90 60 60)"
                      style={{transition:"stroke-dashoffset 1.2s cubic-bezier(.16,1,.3,1)"}}/>
                    <text x="60" y="56" textAnchor="middle" fill={pctColor}
                      style={{fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:28}}>{pct}%</text>
                    <text x="60" y="74" textAnchor="middle" fill="#888"
                      style={{fontFamily:"'Oswald',sans-serif",fontSize:10,letterSpacing:1}}>SEVERITY</text>
                  </svg>
                </div>
                <div style={{display:"inline-block",background:a.bg,border:`3px solid ${a.border}`,borderRadius:6,padding:"14px 32px",fontFamily:"'Oswald',sans-serif",fontSize:26,fontWeight:900,color:a.color,letterSpacing:4,boxShadow:`0 4px 0 ${a.border}88`}}>
                  {a.emoji} {a.label.toUpperCase()}
                </div>
              </div>

              {result.violations?.length > 0 && (
                <div style={{marginBottom:18}}>
                  <div style={{fontFamily:"'Oswald',sans-serif",fontSize:11,letterSpacing:3,color:"#8b1a1a",marginBottom:8}}>RULES BROKEN</div>
                  {result.violations.map((v,i)=><span key={i} className="violation-tag">⚠ {v}</span>)}
                </div>
              )}

              {result.quote && (
                <div style={{marginBottom:18}}>
                  <div style={{fontFamily:"'Oswald',sans-serif",fontSize:11,letterSpacing:3,color:"#8b1a1a",marginBottom:8}}>FLAGGED CONTENT</div>
                  <div style={{background:"#fff0f0",border:"2px solid #c1121f",borderLeft:"5px solid #c1121f",padding:"10px 14px",borderRadius:"0 4px 4px 0",fontSize:13,color:"#6b0000",fontFamily:"'Special Elite',serif",fontStyle:"italic"}}>
                    "{result.quote}"
                  </div>
                </div>
              )}

              <div>
                <div style={{fontFamily:"'Oswald',sans-serif",fontSize:11,letterSpacing:3,color:"#8b1a1a",marginBottom:8}}>ANALYSIS</div>
                <div style={{background:"#fffef5",border:"2px solid #8b8b6b",padding:"12px 16px",borderRadius:3,fontSize:13,color:"#333",lineHeight:1.8,fontFamily:"'Special Elite',serif"}}>
                  {result.reasoning}
                </div>
              </div>
            </div>
          );
        })()}

        {/* FOOTER */}
        <div className="footer-banner">
          <div className="footer-poster">
            <div style={{position:"absolute",top:0,left:0,right:0,height:18,background:"#002868",zIndex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              {"★★★★★★★".split("").map((s,i)=><span key={i} style={{color:"#f5f5dc",fontSize:9}}>{s}</span>)}
            </div>
            <div style={{paddingTop:22,position:"relative",zIndex:2}}>
              <div style={{textAlign:"center",marginBottom:4}}>
                <div style={{display:"inline-block"}}>
                  <div style={{width:60,height:12,background:"#002868",margin:"0 auto",borderRadius:"3px 3px 0 0"}}/>
                  <div style={{width:50,height:30,background:"#f5f5dc",border:"2px solid #c8102e",margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    <div style={{width:24,height:24,background:"#002868",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <span style={{color:"#f5f5dc",fontSize:11}}>★</span>
                    </div>
                  </div>
                  <div style={{width:80,height:8,background:"#c8102e",margin:"0 auto"}}/>
                </div>
              </div>
              <div style={{textAlign:"center",fontSize:52,lineHeight:1,marginBottom:6}}>🫵</div>
              <div style={{fontFamily:"'Oswald',sans-serif",fontWeight:900,fontSize:28,color:"#1a1a1a",letterSpacing:2,lineHeight:1,textShadow:"2px 2px 0 #c8102e",marginBottom:4}}>
                FOLLOW<br/>THE RULES
              </div>
              <div style={{width:"80%",height:3,background:"#c8102e",margin:"8px auto"}}/>
              <div style={{fontFamily:"'Oswald',sans-serif",fontSize:11,letterSpacing:3,color:"#002868",marginBottom:4}}>ORDER IS OUR PRIORITY</div>
            </div>
            <div style={{position:"absolute",bottom:0,left:0,right:0,height:14,background:"#c8102e",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              {"★★★★★★★".split("").map((s,i)=><span key={i} style={{color:"#f5f5dc",fontSize:8}}>{s}</span>)}
            </div>
          </div>
          <div style={{color:"#ffd700",fontFamily:"'Oswald',sans-serif",fontSize:14,letterSpacing:4,marginBottom:4}}>
            ★ CREATED BY <span className="shimmer" style={{fontWeight:900,fontSize:16}}>KENISUMA</span> ★
          </div>
          <div style={{color:"rgba(245,245,220,.4)",fontSize:11,letterSpacing:3,fontFamily:"'Oswald',sans-serif"}}>
            FOLLOW THE RULES · GROUP MODERATION ENGINE · POWERED BY CLAUDE AI
          </div>
        </div>
      </div>
    </div>
  );
}
