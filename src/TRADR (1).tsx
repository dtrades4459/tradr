import { useState, useEffect, useRef, useCallback } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const STRATEGIES = {
  "ICT / Smart Money": { color:"#89cff0", icon:"🧠", setups:["OTE (Optimal Trade Entry)","FVG (Fair Value Gap)","Order Block","Breaker Block","Liquidity Sweep","SIBI / BISI","Silver Bullet","Judas Swing","Power of 3","MSS (Market Structure Shift)","Other"],
    checklist:["HTF bias confirmed (Daily / 4H)","Trading in correct session window","Liquidity swept before entry","POI identified (OB / FVG / BB)","LTF confirmation at POI","Stop loss below / above structure","Minimum R:R met (2R+)","No high-impact news in window"],
    rules:["Only trade with HTF narrative — never against it","Wait for liquidity to be taken before entry","Enter only on LTF displacement into a POI","No trades in the first 15 min of session open","Avoid trading 30 min before/after red folder news","Maximum 2 trades per session","Never move SL to breakeven before 1R is hit","If you miss the entry, let it go — no chasing"] },
  "Supply & Demand": { color:"#a78bfa", icon:"⚖️", setups:["Fresh Supply Zone","Fresh Demand Zone","Rally Base Rally (RBR)","Drop Base Drop (DBD)","Rally Base Drop (RBD)","Drop Base Rally (DBR)","Zone Retest Entry","Proximal Line Touch","Distal Line Break","Engulfing at Zone","Other"],
    checklist:["HTF trend direction identified","Zone is fresh (untested)","Strong impulsive move from zone confirmed","Proximal line clearly defined","Entry near proximal, SL beyond distal","No major S/R levels inside the zone","Minimum 3:1 R:R to next opposing zone","No news events during trade window"],
    rules:["Only trade fresh, untested zones","The stronger the departure candle, the better the zone","Avoid zones with too many candles in the base","HTF zones take priority over LTF zones","Never enter mid-zone — wait for proximal line","If price spends too long in a zone, it's weakened","Always check what's on the other side of the zone","Scale out at 2R, let runners go to next zone"] },
  "Wyckoff / VSA": { color:"#34d399", icon:"📊", setups:["Accumulation Schematic","Distribution Schematic","Spring (Phase C)","Upthrust (UT / UTAD)","Sign of Strength (SOS)","Sign of Weakness (SOW)","Last Point of Support (LPS)","Last Supply Point (LPSY)","Shakeout","Creek Break / Jump","Other"],
    checklist:["Identified correct Wyckoff phase (A–E)","Volume confirms price action at key point","Composite Operator narrative is clear","Spring or Upthrust tested (Phase C confirmed)","No supply/demand present at entry bar (VSA)","Price above/below key creek or ice level","SOS or SOW bar confirmed on LTF","Trade aligns with higher phase structure"],
    rules:["Never trade against the Composite Operator","Volume is king — price action without volume means nothing","Wait for Phase C confirmation before entering","A Spring must close back inside the range","High-volume narrow-spread bars signal absorption","No Demand / No Supply bars are your entry triggers","Always mark your creek/ice before the session","If you can't label the phase, stay out"] },
  "ORB (Opening Range Breakout)": { color:"#fb923c", icon:"⏰", setups:["5-min ORB","15-min ORB","30-min ORB","1-hour ORB","Breakout + Retest","False Breakout Fade","Gap & Go","VWAP Reclaim after ORB","Pre-market High/Low Break","Other"],
    checklist:["Opening range clearly defined (high & low marked)","Pre-market trend / gap direction noted","Volume spike on breakout candle confirmed","Price closed outside the range (no wick-only break)","VWAP alignment with breakout direction","No major news in first 30 min of session","First pullback/retest entry identified","Stop placed inside opening range"],
    rules:["Define the opening range before the session starts","Only trade confirmed closes outside the range","Volume must expand on the breakout bar","The best ORBs have a pre-market bias — align with it","Fade false breakouts only after a full close back inside","Avoid ORBs on choppy, low-volume pre-market days","Take partial profits at 1R, trail the rest","No ORB trades after the first 90 min of the session"] },
};
const STRATEGY_NAMES = Object.keys(STRATEGIES);
const SESSIONS = ["London","New York","Asia","London/NY Overlap","Pre-Market","After Hours"];
const BIAS = ["Bullish","Bearish","Neutral"];
const OUTCOMES = ["Win","Loss","Breakeven"];
const REACTIONS = ["🔥","💎","📈","🎯","😤","🧠"];
const TABS = ["home","log","history","stats","checklist"];

// ─── THEMES ──────────────────────────────────────────────────────────────────
const DARK = { bg:"#080808",panel:"#0f0f0f",panel2:"#141414",border:"#1e1e1e",border2:"#2a2a2a",text:"#e5e5e5",text2:"#a0a0a0",muted:"#6b7280",dim:"#3a3a3a",accent:"#89cff0",green:"#22c55e",red:"#ef4444",yellow:"#eab308",inputBg:"#0a0a0a",shadow:"rgba(0,0,0,0.4)" };
const LIGHT = { bg:"#f4f6f8",panel:"#ffffff",panel2:"#f0f2f5",border:"#e2e6ea",border2:"#d0d5dd",text:"#111827",text2:"#4b5563",muted:"#9ca3af",dim:"#d1d5db",accent:"#2563eb",green:"#16a34a",red:"#dc2626",yellow:"#d97706",inputBg:"#ffffff",shadow:"rgba(0,0,0,0.08)" };

function calcRR(e,s,t){const ev=parseFloat(e),sv=parseFloat(s),tv=parseFloat(t);if(!ev||!sv||!tv||ev===sv)return"";return(Math.abs(tv-ev)/Math.abs(ev-sv)).toFixed(2);}
function stratColor(name,C){return STRATEGIES[name]?.color||C.accent;}
function fmtMonth(y,m){return new Date(y,m,1).toLocaleString("default",{month:"long",year:"numeric"});}

// ─── AI INSIGHTS ─────────────────────────────────────────────────────────────
function generateInsights(trades){
  const insights=[];
  if(!trades.length)return[{icon:"📭",text:"Log your first trade to get personalised feedback.",type:"info"}];
  const wins=trades.filter(t=>t.outcome==="Win").length;
  const losses=trades.filter(t=>t.outcome==="Loss").length;
  const wr=trades.length?wins/trades.length:0;
  // Session analysis
  const sesStats={};
  trades.forEach(t=>{if(!t.session)return;if(!sesStats[t.session])sesStats[t.session]={w:0,total:0};if(t.outcome==="Win")sesStats[t.session].w++;sesStats[t.session].total++;});
  Object.entries(sesStats).forEach(([ses,{w,total}])=>{const swr=w/total;if(total>=3&&swr<wr-0.15)insights.push({icon:"⚠️",text:`Your ${ses} session win rate (${(swr*100).toFixed(0)}%) is below your average. Consider trading fewer setups here.`,type:"warning"});if(total>=3&&swr>wr+0.15)insights.push({icon:"⭐",text:`${ses} is your best session with a ${(swr*100).toFixed(0)}% win rate. Prioritise it.`,type:"positive"});});
  // Strategy analysis
  const stratStats={};
  trades.forEach(t=>{if(!t.strategy)return;if(!stratStats[t.strategy])stratStats[t.strategy]={w:0,total:0,pnl:0};if(t.outcome==="Win")stratStats[t.strategy].w++;stratStats[t.strategy].total++;stratStats[t.strategy].pnl+=parseFloat(t.pnl)||0;});
  let bestStrat=null,bestWR=0;
  Object.entries(stratStats).forEach(([s,{w,total}])=>{const swr=total?w/total:0;if(total>=3&&swr>bestWR){bestWR=swr;bestStrat=s;}});
  if(bestStrat)insights.push({icon:"🏆",text:`${bestStrat.split("(")[0].trim()} is your strongest strategy at ${(bestWR*100).toFixed(0)}% win rate.`,type:"positive"});
  // Losing streak
  let streak=0;for(const t of trades){if(t.outcome==="Loss")streak++;else break;}
  if(streak>=3)insights.push({icon:"🚨",text:`You're on a ${streak}-trade losing streak. Consider stepping back and reviewing your process.`,type:"danger"});
  // Overtrading
  const byDay={};
  trades.forEach(t=>{byDay[t.date]=(byDay[t.date]||0)+1;});
  const overtradeDays=Object.values(byDay).filter(c=>c>3).length;
  if(overtradeDays>=2)insights.push({icon:"📊",text:`You've exceeded 3 trades/day on ${overtradeDays} occasions. Overtrading may be hurting your results.`,type:"warning"});
  // RR analysis
  const rrTrades=trades.filter(t=>t.rr);
  if(rrTrades.length>=5){const avgRR=rrTrades.reduce((a,t)=>a+parseFloat(t.rr),0)/rrTrades.length;if(avgRR<1.5)insights.push({icon:"📉",text:`Your average R:R is ${avgRR.toFixed(2)}. Aim for 2R+ to maintain positive expectancy even at 40% win rate.`,type:"warning"});}
  // Positive reinforcement
  if(wr>=0.6&&trades.length>=10)insights.push({icon:"💎",text:`Solid consistency — ${(wr*100).toFixed(0)}% win rate over ${trades.length} trades. Stay disciplined.`,type:"positive"});
  if(!insights.length)insights.push({icon:"✅",text:"No major issues detected. Keep journaling consistently for deeper insights.",type:"info"});
  return insights;
}

// ─── TOAST ───────────────────────────────────────────────────────────────────
function Toast({message,onDone}){
  useEffect(()=>{const t=setTimeout(onDone,2200);return()=>clearTimeout(t);},[]);
  return(
    <div style={{position:"fixed",bottom:"90px",left:"50%",transform:"translateX(-50%)",zIndex:1000,animation:"slideUp 0.25s ease",background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:"20px",padding:"10px 18px",fontSize:"12px",fontWeight:700,color:"#e5e5e5",boxShadow:"0 4px 20px rgba(0,0,0,0.5)",whiteSpace:"nowrap",letterSpacing:"0.04em",fontFamily:"'IBM Plex Mono',monospace"}}>
      {message}
    </div>
  );
}

// ─── MINI SPARKLINE ──────────────────────────────────────────────────────────
function MiniSparkline({trades,C}){
  if(trades.length<2)return null;
  let r=0;const pts=trades.slice().reverse().map(t=>{r+=parseFloat(t.pnl)||0;return r;});
  const min=Math.min(...pts),max=Math.max(...pts),range=max-min||1,w=72,h=24;
  const p=pts.map((v,i)=>`${(i/(pts.length-1))*w},${h-((v-min)/range)*h}`).join(" ");
  return <svg width={w} height={h}><polyline points={p} fill="none" stroke={pts[pts.length-1]>=0?C.green:C.red} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

// ─── PNL CHART ───────────────────────────────────────────────────────────────
function PnLChart({trades,C}){
  if(!trades.length)return null;
  let r=0;const pts=[{x:0,y:0}];
  trades.slice().reverse().forEach((t,i)=>{r+=parseFloat(t.pnl)||0;pts.push({x:i+1,y:r});});
  const minY=Math.min(...pts.map(p=>p.y)),maxY=Math.max(...pts.map(p=>p.y)),rangeY=maxY-minY||1;
  const W=320,H=90,PAD=6;
  const cx=x=>PAD+(x/(pts.length-1||1))*(W-PAD*2);
  const cy=y=>H-PAD-((y-minY)/rangeY)*(H-PAD*2);
  const pathD=pts.map((p,i)=>`${i===0?"M":"L"}${cx(p.x)},${cy(p.y)}`).join(" ");
  const areaD=`${pathD} L${cx(pts[pts.length-1].x)},${H-PAD} L${cx(0)},${H-PAD} Z`;
  const col=pts[pts.length-1].y>=0?C.green:C.red;
  const zeroY=cy(0);
  return(
    <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
      <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={col} stopOpacity="0.2"/><stop offset="100%" stopColor={col} stopOpacity="0"/></linearGradient></defs>
      {zeroY>PAD&&zeroY<H-PAD&&<line x1={PAD} y1={zeroY} x2={W-PAD} y2={zeroY} stroke={C.border2} strokeWidth="1" strokeDasharray="3,3"/>}
      <path d={areaD} fill="url(#ag)"/><path d={pathD} fill="none" stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      {pts[pts.length-1]&&<circle cx={cx(pts[pts.length-1].x)} cy={cy(pts[pts.length-1].y)} r="3" fill={col}/>}
    </svg>
  );
}

// ─── MONTHLY PNL CHART ───────────────────────────────────────────────────────
function MonthlyPnLChart({trades,C}){
  const monthly={};
  trades.forEach(t=>{const k=t.date?.slice(0,7);if(k){if(!monthly[k])monthly[k]=0;monthly[k]+=parseFloat(t.pnl)||0;}});
  const entries=Object.entries(monthly).sort(([a],[b])=>a.localeCompare(b)).slice(-6);
  if(entries.length<2)return null;
  const vals=entries.map(([,v])=>v);
  const min=Math.min(...vals,0),max=Math.max(...vals,0),range=max-min||1;
  const W=320,H=90,PAD=8,barW=Math.max(18,(W-PAD*2)/entries.length-8);
  return(
    <svg width="100%" viewBox={`0 0 ${W} ${H+20}`}>
      {entries.map(([k,v],i)=>{
        const x=PAD+i*(W-PAD*2)/entries.length+(W-PAD*2)/entries.length/2-barW/2;
        const zeroY=H-PAD-((0-min)/range)*(H-PAD*2);
        const barH=Math.abs((v/range)*(H-PAD*2));
        const y=v>=0?zeroY-barH:zeroY;
        const col=v>=0?C.green:C.red;
        return(
          <g key={k}>
            <rect x={x} y={y} width={barW} height={Math.max(barH,2)} rx="3" fill={col} opacity="0.8"/>
            <text x={x+barW/2} y={H+14} textAnchor="middle" fontSize="8" fill={C.muted} fontFamily="IBM Plex Mono">{k.slice(5)}</text>
          </g>
        );
      })}
      <line x1={PAD} y1={H-PAD-((0-min)/range)*(H-PAD*2)} x2={W-PAD} y2={H-PAD-((0-min)/range)*(H-PAD*2)} stroke={C.border2} strokeWidth="1" strokeDasharray="3,3"/>
    </svg>
  );
}

// ─── WIN RATE BAR CHART ──────────────────────────────────────────────────────
function WinRateChart({trades,C}){
  const stratStats={};
  trades.forEach(t=>{if(!t.strategy)return;if(!stratStats[t.strategy])stratStats[t.strategy]={w:0,total:0};if(t.outcome==="Win")stratStats[t.strategy].w++;stratStats[t.strategy].total++;});
  const entries=Object.entries(stratStats).filter(([,{total}])=>total>=1);
  if(!entries.length)return <div style={{fontSize:"11px",color:C.muted,textAlign:"center",padding:"20px 0"}}>Log trades with a strategy to see win rates.</div>;
  return(
    <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
      {entries.map(([s,{w,total}])=>{
        const wr=total?w/total:0;const col=stratColor(s,C);
        return(
          <div key={s}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:"5px"}}>
              <span style={{fontSize:"10px",color:C.text2,display:"flex",alignItems:"center",gap:"5px"}}><span>{STRATEGIES[s]?.icon}</span>{s.split("(")[0].trim()}</span>
              <span style={{fontSize:"10px",fontWeight:700,color:wr>=0.5?C.green:C.red}}>{(wr*100).toFixed(0)}% <span style={{color:C.muted,fontWeight:400}}>({total}T)</span></span>
              {/* ══ CIRCLES ══ */}
        {view==="circles"&&(
          <TradingCircles
            myCircles={myCircles} circlesView={circlesView} setCirclesView={setCirclesView}
            activeCircle={activeCircle} setActiveCircle={setActiveCircle}
            circleForm={circleForm} setCircleForm={setCircleForm}
            circleJoinCode={circleJoinCode} setCircleJoinCode={setCircleJoinCode}
            circleMsg={circleMsg} setCircleMsg={setCircleMsg}
            createCircle={createCircle} joinCircle={joinCircle}
            publishToCircle={publishToCircle} fetchCircleLeaderboard={fetchCircleLeaderboard}
            profile={profile} getMyCode={getMyCode} showToast={showToast}
            wins={wins} losses={losses} total={total} winRate={winRate}
            totalPnL={totalPnL} pnlPos={pnlPos} avgRR={avgRR} streak={streak}
            STRATEGY_NAMES={STRATEGY_NAMES} STRATEGIES={STRATEGIES} C={C} inp={inp} sel={sel} lbl={lbl}
          />
        )}

      </div>
            <div style={{background:C.panel2,borderRadius:"4px",height:"8px",overflow:"hidden"}}>
              <div style={{background:col,height:"8px",borderRadius:"4px",width:`${wr*100}%`,transition:"width 0.6s ease"}}/>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── CALENDAR ────────────────────────────────────────────────────────────────
function CalendarView({trades,C,onDayClick}){
  const [year,setYear]=useState(new Date().getFullYear());
  const [month,setMonth]=useState(new Date().getMonth());
  const dayPnL={};
  trades.forEach(t=>{if(t.date){if(!dayPnL[t.date])dayPnL[t.date]={pnl:0,count:0};dayPnL[t.date].pnl+=parseFloat(t.pnl)||0;dayPnL[t.date].count++;}});
  const firstDay=new Date(year,month,1).getDay();
  const daysInMonth=new Date(year,month+1,0).getDate();
  const cells=[];
  for(let i=0;i<firstDay;i++)cells.push(null);
  for(let d=1;d<=daysInMonth;d++)cells.push(d);
  while(cells.length%7!==0)cells.push(null);
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"12px"}}>
        <button onClick={()=>{if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1);}} style={{background:"none",border:`1px solid ${C.border2}`,borderRadius:"6px",color:C.muted,padding:"6px 12px",cursor:"pointer",fontFamily:"inherit",fontSize:"12px"}}>‹</button>
        <span style={{fontSize:"11px",fontWeight:700,color:C.text,letterSpacing:"0.08em"}}>{fmtMonth(year,month).toUpperCase()}</span>
        <button onClick={()=>{if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1);}} style={{background:"none",border:`1px solid ${C.border2}`,borderRadius:"6px",color:C.muted,padding:"6px 12px",cursor:"pointer",fontFamily:"inherit",fontSize:"12px"}}>›</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:"3px",marginBottom:"4px"}}>
        {["S","M","T","W","T","F","S"].map((d,i)=><div key={i} style={{textAlign:"center",fontSize:"9px",color:C.muted,padding:"2px 0",fontWeight:700}}>{d}</div>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:"3px"}}>
        {cells.map((d,i)=>{
          if(!d)return <div key={i}/>;
          const key=`${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
          const data=dayPnL[key];
          const isToday=key===new Date().toISOString().split("T")[0];
          const bg=data?(data.pnl>0?`${C.green}22`:data.pnl<0?`${C.red}22`:C.panel2):C.panel2;
          const textCol=data?(data.pnl>0?C.green:data.pnl<0?C.red:C.muted):C.muted;
          return(
            <div key={i} onClick={()=>data&&onDayClick(key)} style={{background:bg,border:`1px solid ${isToday?C.accent:data?C.border2:C.border}`,borderRadius:"6px",padding:"5px 3px",textAlign:"center",cursor:data?"pointer":"default",minHeight:"42px",display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",gap:"1px"}}>
              <div style={{fontSize:"10px",fontWeight:isToday?700:400,color:isToday?C.accent:C.text2}}>{d}</div>
              {data&&<div style={{fontSize:"8px",fontWeight:700,color:textCol}}>{data.pnl>=0?"+":""}{data.pnl.toFixed(1)}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── AVATAR ──────────────────────────────────────────────────────────────────
function AvatarCircle({name,avatar,size=42,color,onClick}){
  const initials=(name||"TR").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  const col=color||"#89cff0";
  const style={width:size,height:size,borderRadius:"50%",border:`2px solid ${col}`,flexShrink:0,cursor:onClick?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",objectFit:"cover"};
  if(avatar)return <img src={avatar} alt="av" style={{...style}} onClick={onClick}/>;
  return <div style={{...style,background:"#0d1020"}} onClick={onClick}><span style={{fontSize:size*0.36,fontWeight:700,color:col,letterSpacing:"-0.02em"}}>{initials}</span></div>;
}

// ─── IMAGE COMPRESS ──────────────────────────────────────────────────────────
function compressImage(file,maxSize=600){
  return new Promise(res=>{
    const reader=new FileReader();
    reader.onload=e=>{
      const img=new Image();
      img.onload=()=>{
        const canvas=document.createElement("canvas");
        const scale=Math.min(1,maxSize/Math.max(img.width,img.height));
        canvas.width=img.width*scale;canvas.height=img.height*scale;
        canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
        res(canvas.toDataURL("image/jpeg",0.75));
      };
      img.src=e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ─── BADGE ───────────────────────────────────────────────────────────────────
function Badge({color,children,C}){
  const map={green:{bg:`${C.green}18`,fg:C.green,br:`${C.green}40`},red:{bg:`${C.red}18`,fg:C.red,br:`${C.red}40`},yellow:{bg:`${C.yellow}18`,fg:C.yellow,br:`${C.yellow}40`},blue:{bg:`${C.accent}12`,fg:C.accent,br:`${C.accent}30`},gray:{bg:C.panel2,fg:C.muted,br:C.border2},gold:{bg:`${C.accent}12`,fg:C.accent,br:`${C.accent}30`},purple:{bg:"#a78bfa18",fg:"#a78bfa",br:"#a78bfa40"},green2:{bg:"#34d39918",fg:"#34d399",br:"#34d39940"},orange:{bg:"#fb923c18",fg:"#fb923c",br:"#fb923c40"}};
  const s=map[color]||map.gray;
  return <span style={{background:s.bg,color:s.fg,border:`1px solid ${s.br}`,padding:"2px 8px",borderRadius:"4px",fontSize:"10px",fontWeight:700,letterSpacing:"0.06em",whiteSpace:"nowrap"}}>{children}</span>;
}

function stratBadgeColor(name){const m={"ICT / Smart Money":"blue","Supply & Demand":"purple","Wyckoff / VSA":"green2","ORB (Opening Range Breakout)":"orange"};return m[name]||"blue";}

// ─── STRATEGY PILL ───────────────────────────────────────────────────────────
function StrategyPill({name,selected,onClick,C}){
  const col=STRATEGIES[name]?.color||C.accent;
  return <button onClick={onClick} style={{background:selected?`${col}18`:"transparent",border:`1px solid ${selected?col:C.border2}`,borderRadius:"20px",padding:"7px 12px",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:"6px",transition:"all 0.15s",whiteSpace:"nowrap"}}>
    <span style={{fontSize:"12px"}}>{STRATEGIES[name].icon}</span>
    <span style={{fontSize:"10px",fontWeight:700,color:selected?col:C.muted,letterSpacing:"0.04em"}}>{name.split("(")[0].trim()}</span>
  </button>;
}

// ─── EDIT INLINE ─────────────────────────────────────────────────────────────
function EditInline({val,onSave,onCancel,accent}){
  const [text,setText]=useState(val);
  return <div style={{display:"flex",gap:"6px",flex:1,alignItems:"center"}}>
    <input autoFocus value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")onSave(text);if(e.key==="Escape")onCancel();}} style={{background:"#0a0a0a",border:`1px solid ${accent}`,borderRadius:"5px",color:"#e5e5e5",padding:"5px 8px",fontSize:"12px",outline:"none",fontFamily:"'IBM Plex Mono',monospace",flex:1,boxSizing:"border-box"}}/>
    <button onClick={()=>onSave(text)} style={{background:accent,color:"#000",border:"none",borderRadius:"4px",padding:"5px 9px",fontSize:"9px",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>✓</button>
    <button onClick={onCancel} style={{background:"none",border:"1px solid #2a2a2a",borderRadius:"4px",padding:"5px 9px",fontSize:"9px",color:"#6b7280",cursor:"pointer",fontFamily:"inherit"}}>✕</button>
  </div>;
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
const EMPTY_TRADE={id:null,date:new Date().toISOString().split("T")[0],pair:"",session:"",bias:"",strategy:"",setup:"",entryPrice:"",slPrice:"",tpPrice:"",rr:"",outcome:"",pnl:"",notes:"",emotions:"",screenshot:"",comments:[],reactions:{}};
const DEF_PROFILE={name:"Trader",handle:"@trader",bio:"Multi-strategy trader | Consistency over everything",avatar:"",broker:"",timezone:"London (GMT)",startDate:new Date().toISOString().split("T")[0],targetRR:"2",maxTradesPerDay:"2"};

export default function Tradr(){
  const [trades,setTrades]=useState([]);
  const [view,setView]=useState("home");
  const [darkMode,setDarkMode]=useState(true);
  const C=darkMode?DARK:LIGHT;
  const [form,setForm]=useState(EMPTY_TRADE);
  const [editId,setEditId]=useState(null);
  const [filter,setFilter]=useState({outcome:"",setup:"",pair:"",strategy:""});
  const [loading,setLoading]=useState(true);
  const [expandedId,setExpandedId]=useState(null);
  const [confirmDelete,setConfirmDelete]=useState(null);
  const [profile,setProfile]=useState(DEF_PROFILE);
  const [editingProfile,setEditingProfile]=useState(false);
  const [profileDraft,setProfileDraft]=useState(DEF_PROFILE);
  const [commentInputs,setCommentInputs]=useState({});
  const [friends,setFriends]=useState([]);
  const [friendFeed,setFriendFeed]=useState([]);
  const [showAddFriend,setShowAddFriend]=useState(false);
  const [friendCodeInput,setFriendCodeInput]=useState("");
  const [friendMsg,setFriendMsg]=useState("");
  const [toast,setToast]=useState(null);
  const [homeSection,setHomeSection]=useState("feed"); // feed | analytics | ai | settings | rules
  const [activeStrategy,setActiveStrategy]=useState(STRATEGY_NAMES[0]);
  const [stratChecklists,setStratChecklists]=useState(()=>Object.fromEntries(STRATEGY_NAMES.map(s=>[s,STRATEGIES[s].checklist.map((t,i)=>({id:i+1,text:t}))])));
  const [stratRules,setStratRules]=useState(()=>Object.fromEntries(STRATEGY_NAMES.map(s=>[s,STRATEGIES[s].rules.map((t,i)=>({id:i+1,text:t}))])));
  const [checked,setChecked]=useState({});
  const [checklistTab,setChecklistTab]=useState("pretrade");
  const [editingCheckItem,setEditingCheckItem]=useState(null);
  const [editingRule,setEditingRule]=useState(null);
  const [newCheckText,setNewCheckText]=useState("");
  const [newRuleText,setNewRuleText]=useState("");
  const [addingCheck,setAddingCheck]=useState(false);
  const [addingRule,setAddingRule]=useState(false);
  const [calDayTrades,setCalDayTrades]=useState(null);
  const [statsTab,setStatsTab]=useState("overview"); // overview | strategies | calendar
  const [savingTrade,setSavingTrade]=useState(false);

  // Swipe
  const swipeRef=useRef(null);
  const touchStartX=useRef(null);
  const touchStartY=useRef(null);

  const showToast=useCallback((msg)=>{setToast(msg);setTimeout(()=>setToast(null),2500);},[]);

  const [stratThresholds, setStratThresholds] = useState(() =>
    Object.fromEntries(STRATEGY_NAMES.map(s => [s, { minCount: Math.ceil(STRATEGIES[s].checklist.length * 0.75), required: [] }]))
  );

  useEffect(() => { loadAll(); }, []);

  async function loadAll(){
    try{const t=await window.storage.get("tradr_trades");if(t)setTrades(JSON.parse(t.value));}catch{}
    try{const pr=await window.storage.get("tradr_profile");if(pr){const p=JSON.parse(pr.value);setProfile(p);setProfileDraft(p);}}catch{}
    try{const fr=await window.storage.get("tradr_friends");if(fr)setFriends(JSON.parse(fr.value));}catch{}
    try{const ff=await window.storage.get("tradr_feed",true);if(ff)setFriendFeed(JSON.parse(ff.value));}catch{}
    try{const sc=await window.storage.get("tradr_checklists");if(sc)setStratChecklists(JSON.parse(sc.value));}catch{}
    try{const sr=await window.storage.get("tradr_rules");if(sr)setStratRules(JSON.parse(sr.value));}catch{}
    try{const dm=await window.storage.get("tradr_dark");if(dm)setDarkMode(JSON.parse(dm.value));}catch{}
    try{const ci=await window.storage.get("tradr_circles");if(ci)setMyCircles(JSON.parse(ci.value));}catch{}
    try{const st=await window.storage.get("tradr_thresholds");if(st)setStratThresholds(JSON.parse(st.value));}catch{}
    setLoading(false);
  }

  async function saveTrades(u){setTrades(u);await window.storage.set("tradr_trades",JSON.stringify(u));}
  async function saveProfile(u){setProfile(u);await window.storage.set("tradr_profile",JSON.stringify(u));}
  async function saveFriends(u){setFriends(u);await window.storage.set("tradr_friends",JSON.stringify(u));}
  async function saveStratChecklists(u){setStratChecklists(u);await window.storage.set("tradr_checklists",JSON.stringify(u));}
  async function saveMyCircles(u){setMyCircles(u);await window.storage.set("tradr_circles",JSON.stringify(u));}

  async function createCircle(){
    if(!circleForm.name.trim())return;
    const code=circleForm.name.replace(/\s+/g,"").toUpperCase().slice(0,6)+"-"+Math.random().toString(36).slice(2,6).toUpperCase();
    const circle={
      id:Date.now(), code, name:circleForm.name.trim(),
      description:circleForm.description.trim(),
      strategy:circleForm.strategy, privacy:circleForm.privacy,
      createdBy:profile.name||"Trader", createdAt:new Date().toISOString(),
      members:[{name:profile.name||"Trader",handle:profile.handle||"@trader",avatar:profile.avatar||"",code:getMyCode(),joinedAt:new Date().toISOString()}],
    };
    // publish circle to shared storage
    await window.storage.set("tradr_circle_"+code, JSON.stringify(circle), true);
    const updated=[...myCircles,{...circle,isOwner:true}];
    await saveMyCircles(updated);
    setCircleForm({name:"",description:"",strategy:"",privacy:"public"});
    setCirclesView("browse");
    showToast("Circle created 🎉");
  }

  async function joinCircle(){
    const code=circleJoinCode.trim().toUpperCase();
    if(!code){setCircleMsg("Enter a circle code.");return;}
    if(myCircles.find(c=>c.code===code)){setCircleMsg("Already a member.");setTimeout(()=>setCircleMsg(""),2000);return;}
    try{
      const res=await window.storage.get("tradr_circle_"+code,true);
      if(!res){setCircleMsg("Circle not found. Check the code.");setTimeout(()=>setCircleMsg(""),2500);return;}
      const circle=JSON.parse(res.value);
      const me={name:profile.name||"Trader",handle:profile.handle||"@trader",avatar:profile.avatar||"",code:getMyCode(),joinedAt:new Date().toISOString()};
      const updatedCircle={...circle,members:[...circle.members.filter(m=>m.code!==me.code),me]};
      await window.storage.set("tradr_circle_"+code,JSON.stringify(updatedCircle),true);
      const updated=[...myCircles,{...updatedCircle,isOwner:false}];
      await saveMyCircles(updated);
      setCircleJoinCode("");
      setCircleMsg("Joined! 🎉");
      setTimeout(()=>setCircleMsg(""),2000);
    }catch{setCircleMsg("Error joining. Try again.");setTimeout(()=>setCircleMsg(""),2500);}
  }

  async function publishToCircle(circleCode){
    const myCode=getMyCode();
    const entry={
      memberCode:myCode, name:profile.name||"Trader",
      handle:profile.handle||"@trader", avatar:profile.avatar||"",
      wins, losses, total,
      winRate:parseFloat(winRate),
      totalPnL:parseFloat(totalPnL),
      avgRR:avgRR==="—"?0:parseFloat(avgRR),
      streak:streak.count>0?{type:streak.type,count:streak.count}:null,
      topStrategy:Object.entries(stratStats).sort((a,b)=>b[1].w/Math.max(b[1].count,1)-a[1].w/Math.max(a[1].count,1))[0]?.[0]||null,
      updatedAt:new Date().toISOString(),
    };
    await window.storage.set("tradr_circle_entry_"+circleCode+"_"+myCode,JSON.stringify(entry),true);
    showToast("Stats published ✓");
  }

  async function fetchCircleLeaderboard(circle){
    const entries=[];
    for(const m of circle.members){
      try{
        const r=await window.storage.get("tradr_circle_entry_"+circle.code+"_"+m.code,true);
        if(r)entries.push(JSON.parse(r.value));
        else entries.push({memberCode:m.code,name:m.name,handle:m.handle,avatar:m.avatar,wins:0,losses:0,total:0,winRate:0,totalPnL:0,avgRR:0,streak:null,topStrategy:null,updatedAt:null});
      }catch{entries.push({memberCode:m.code,name:m.name,handle:m.handle,avatar:m.avatar,wins:0,losses:0,total:0,winRate:0,totalPnL:0,avgRR:0,streak:null,topStrategy:null,updatedAt:null});}
    }
    entries.sort((a,b)=>b.totalPnL-a.totalPnL);
    return entries;
  }

  async function saveStratThresholds(u){setStratThresholds(u);await window.storage.set("tradr_thresholds",JSON.stringify(u));}
  async function saveStratRules(u){setStratRules(u);await window.storage.set("tradr_rules",JSON.stringify(u));}
  async function toggleDark(){const nd=!darkMode;setDarkMode(nd);await window.storage.set("tradr_dark",JSON.stringify(nd));}

  // Swipe handlers
  function onTouchStart(e){touchStartX.current=e.touches[0].clientX;touchStartY.current=e.touches[0].clientY;}
  function onTouchEnd(e){
    if(touchStartX.current===null)return;
    const dx=e.changedTouches[0].clientX-touchStartX.current;
    const dy=e.changedTouches[0].clientY-touchStartY.current;
    if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5){
      const idx=TABS.indexOf(view);
      if(dx<0&&idx<TABS.length-1)setView(TABS[idx+1]);
      if(dx>0&&idx>0)setView(TABS[idx-1]);
    }
    touchStartX.current=null;touchStartY.current=null;
  }

  function handleChange(e){
    const{name,value}=e.target;
    const u={...form,[name]:value};
    if(["entryPrice","slPrice","tpPrice"].includes(name))u.rr=calcRR(name==="entryPrice"?value:u.entryPrice,name==="slPrice"?value:u.slPrice,name==="tpPrice"?value:u.tpPrice);
    if(name==="strategy")u.setup="";
    setForm(u);
  }

  async function submitTrade(){
    if(!form.pair||!form.date||!form.outcome||savingTrade)return;
    setSavingTrade(true);
    const base={comments:[],reactions:{},...form};
    let u;
    if(editId){u=trades.map(t=>t.id===editId?{...base,id:editId}:t);setEditId(null);}
    else{u=[{...base,id:Date.now()},...trades];}
    await saveTrades(u);setForm(EMPTY_TRADE);
    showToast("Trade saved ✅");
    setTimeout(()=>setSavingTrade(false),1500);
    setView("history");
  }

  function editTrade(t){setForm(t);setEditId(t.id);setView("log");}
  async function deleteTrade(id){await saveTrades(trades.filter(t=>t.id!==id));setConfirmDelete(null);showToast("Trade deleted");}
  async function toggleReaction(tid,emoji){const u=trades.map(t=>{if(t.id!==tid)return t;const r={...(t.reactions||{})};r[emoji]=(r[emoji]||0)+1;return{...t,reactions:r};});await saveTrades(u);}
  async function addComment(tid){const text=(commentInputs[tid]||"").trim();if(!text)return;const c={id:Date.now(),author:profile.name||"You",text,ts:new Date().toLocaleString()};const u=trades.map(t=>t.id===tid?{...t,comments:[...(t.comments||[]),c]}:t);await saveTrades(u);setCommentInputs(p=>({...p,[tid]:""}))}
  async function deleteComment(tid,cid){const u=trades.map(t=>t.id===tid?{...t,comments:(t.comments||[]).filter(c=>c.id!==cid)}:t);await saveTrades(u);}

  // Screenshot upload
  async function handleScreenshotUpload(e,tradeId){
    const file=e.target.files?.[0];if(!file)return;
    const compressed=await compressImage(file,800);
    if(tradeId){const u=trades.map(t=>t.id===tradeId?{...t,screenshot:compressed}:t);await saveTrades(u);}
    else setForm(f=>({...f,screenshot:compressed}));
  }
  async function removeScreenshot(tradeId){
    if(tradeId){const u=trades.map(t=>t.id===tradeId?{...t,screenshot:""}:t);await saveTrades(u);}
    else setForm(f=>({...f,screenshot:""}));
  }

  // Avatar upload
  async function handleAvatarUpload(e){
    const file=e.target.files?.[0];if(!file)return;
    const compressed=await compressImage(file,300);
    setProfileDraft(d=>({...d,avatar:compressed}));
  }

  // Checklist helpers
  const checkItems=stratChecklists[activeStrategy]||[];
  const ruleItems=stratRules[activeStrategy]||[];
  function toggleCheck(id){setChecked(p=>({...p,[`${activeStrategy}-${id}`]:!p[`${activeStrategy}-${id}`]}));}
  function isChecked(id){return!!checked[`${activeStrategy}-${id}`];}
  function resetChecklist(){const n={...checked};checkItems.forEach(i=>{delete n[`${activeStrategy}-${i.id}`];});setChecked(n);}
  async function addCheckItem(){if(!newCheckText.trim())return;const u={...stratChecklists,[activeStrategy]:[...checkItems,{id:Date.now(),text:newCheckText.trim()}]};await saveStratChecklists(u);setNewCheckText("");setAddingCheck(false);}
  async function deleteCheckItem(id){const u={...stratChecklists,[activeStrategy]:checkItems.filter(i=>i.id!==id)};await saveStratChecklists(u);}
  async function saveEditCheck(id,text){const u={...stratChecklists,[activeStrategy]:checkItems.map(i=>i.id===id?{...i,text}:i)};await saveStratChecklists(u);setEditingCheckItem(null);}
  async function addRule(){if(!newRuleText.trim())return;const u={...stratRules,[activeStrategy]:[...ruleItems,{id:Date.now(),text:newRuleText.trim()}]};await saveStratRules(u);setNewRuleText("");setAddingRule(false);}
  async function deleteRule(id){const u={...stratRules,[activeStrategy]:ruleItems.filter(r=>r.id!==id)};await saveStratRules(u);}
  async function saveEditRule(id,text){const u={...stratRules,[activeStrategy]:ruleItems.map(r=>r.id===id?{...r,text}:r)};await saveStratRules(u);setEditingRule(null);}

  // Friends
  function getMyCode(){const uid=profile.uid||Math.random().toString(36).slice(2,8).toUpperCase();if(!profile.uid)saveProfile({...profile,uid});return`${(profile.name||"TRADER").toUpperCase().replace(/\s+/g,"").slice(0,6)}-${uid}`;}
  async function addFriend(){const code=friendCodeInput.trim().toUpperCase();if(!code)return;if(friends.find(f=>f.code===code)){setFriendMsg("Already added.");setTimeout(()=>setFriendMsg(""),2000);return;}const u=[...friends,{code,name:code.split("-")[0],addedAt:new Date().toISOString()}];await saveFriends(u);setFriendCodeInput("");setFriendMsg("Friend added! 🎉");setTimeout(()=>setFriendMsg(""),2500);}
  async function removeFriend(code){await saveFriends(friends.filter(f=>f.code!==code));}
  async function publishFeed(){const mc=getMyCode();const items=trades.slice(0,10).map(t=>({authorCode:mc,authorName:profile.name||"Trader",authorHandle:profile.handle||"@trader",authorAvatar:profile.avatar||"",tradeId:t.id,pair:t.pair,date:t.date,outcome:t.outcome,pnl:t.pnl,rr:t.rr,strategy:t.strategy,setup:t.setup,notes:t.notes,session:t.session,reactions:t.reactions||{},comments:(t.comments||[]).length,publishedAt:new Date().toISOString()}));await window.storage.set(`tradr_feed_${mc}`,JSON.stringify(items),true);}
  async function refreshFeed(){const items=[];for(const f of friends){try{const r=await window.storage.get(`tradr_feed_${f.code}`,true);if(r){const d=JSON.parse(r.value);items.push(...d);}}catch{}}items.sort((a,b)=>new Date(b.publishedAt)-new Date(a.publishedAt));setFriendFeed(items);await window.storage.set("tradr_feed",JSON.stringify(items));}
  async function reactToFeed(ac,tid,emoji){setFriendFeed(p=>p.map(item=>{if(item.authorCode!==ac||item.tradeId!==tid)return item;const r={...item.reactions};r[emoji]=(r[emoji]||0)+1;return{...item,reactions:r};}));}

  // Stats
  const wins=trades.filter(t=>t.outcome==="Win").length;
  const losses=trades.filter(t=>t.outcome==="Loss").length;
  const bes=trades.filter(t=>t.outcome==="Breakeven").length;
  const total=trades.length;
  const winRate=total?((wins/total)*100).toFixed(1):0;
  const totalPnL=trades.reduce((a,t)=>a+(parseFloat(t.pnl)||0),0).toFixed(2);
  const rrTrades=trades.filter(t=>t.rr);
  const avgRR=rrTrades.length?(rrTrades.reduce((a,t)=>a+parseFloat(t.rr),0)/rrTrades.length).toFixed(2):"—";
  const pnlPos=parseFloat(totalPnL)>=0;
  const streak=(()=>{if(!trades.length)return{type:null,count:0};let count=0,type=null;for(const t of trades){if(t.outcome==="Win"||t.outcome==="Loss"){if(type===null){type=t.outcome;count=1;}else if(t.outcome===type)count++;else break;}};return{type,count};})();
  const stratStats=trades.reduce((acc,t)=>{if(t.strategy){if(!acc[t.strategy])acc[t.strategy]={w:0,l:0,be:0,pnl:0,count:0};acc[t.strategy].count++;if(t.outcome==="Win")acc[t.strategy].w++;if(t.outcome==="Loss")acc[t.strategy].l++;if(t.outcome==="Breakeven")acc[t.strategy].be++;acc[t.strategy].pnl+=parseFloat(t.pnl)||0;}return acc;},{});
  const sessionStats=trades.reduce((acc,t)=>{if(t.session){if(!acc[t.session])acc[t.session]={w:0,l:0,pnl:0};if(t.outcome==="Win")acc[t.session].w++;if(t.outcome==="Loss")acc[t.session].l++;acc[t.session].pnl+=parseFloat(t.pnl)||0;}return acc;},{});
  const pairStats=trades.reduce((acc,t)=>{if(t.pair){if(!acc[t.pair])acc[t.pair]={w:0,l:0,pnl:0};if(t.outcome==="Win")acc[t.pair].w++;if(t.outcome==="Loss")acc[t.pair].l++;acc[t.pair].pnl+=parseFloat(t.pnl)||0;}return acc;},{});
  const filteredTrades=trades.filter(t=>{if(filter.outcome&&t.outcome!==filter.outcome)return false;if(filter.setup&&t.setup!==filter.setup)return false;if(filter.pair&&!t.pair.toLowerCase().includes(filter.pair.toLowerCase()))return false;if(filter.strategy&&t.strategy!==filter.strategy)return false;return true;});

  const checkedCount=checkItems.filter(i=>isChecked(i.id)).length;
  const totalItems=checkItems.length;
  const allGood=checkedCount===totalItems&&totalItems>0;
  const scorePct=totalItems?Math.round((checkedCount/totalItems)*100):0;
  const accentCol=stratColor(activeStrategy,C);
  const insights=generateInsights(trades);
  const allSetups=STRATEGY_NAMES.flatMap(s=>STRATEGIES[s].setups).filter((v,i,a)=>a.indexOf(v)===i);

  const inp={background:C.inputBg,border:`1px solid ${C.border2}`,borderRadius:"8px",color:C.text,padding:"10px 12px",fontSize:"13px",width:"100%",outline:"none",fontFamily:"'IBM Plex Mono',monospace",boxSizing:"border-box"};
  const sel={...inp,cursor:"pointer"};
  const lbl={fontSize:"9px",color:C.muted,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:"5px",display:"block",fontWeight:700};

  const NAV_TABS=[{id:"home",label:"HOME",icon:"⌂"},{id:"log",label:"LOG",icon:"+"},{id:"history",label:"TRADES",icon:"≡"},{id:"stats",label:"STATS",icon:"◎"},    {id:"checklist",label:"CHECK",icon:"✓"},
    {id:"circles",label:"CIRCLES",icon:"◈"}];

  if(loading)return <div style={{minHeight:"100vh",background:DARK.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'IBM Plex Mono',monospace",color:DARK.muted,fontSize:"11px",letterSpacing:"0.1em"}}>LOADING TRADR...</div>;

  return(
    <div ref={swipeRef} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'IBM Plex Mono',monospace",maxWidth:"480px",margin:"0 auto",paddingBottom:"76px",transition:"background 0.2s,color 0.2s"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-thumb{background:#2a2a2a;border-radius:2px;}
        input::placeholder,textarea::placeholder{color:${C.dim};}
        select option{background:${C.inputBg};color:${C.text};}
        input[type=date]::-webkit-calendar-picker-indicator{filter:${darkMode?"invert(0.4)":"invert(0.6)"};}
        .hvr:hover{opacity:0.7;} .row-hvr:hover{background:${C.panel2}!important;}
        .check-row:hover .ca{opacity:1!important;} .rbtn:hover{transform:scale(1.15);}
        @keyframes slideUp{from{transform:translateX(-50%) translateY(20px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .fade-in{animation:fadeIn 0.2s ease;}
        input[type=file]{display:none;}
      `}</style>

      {/* ── HEADER ── */}
      <div style={{padding:"12px 16px 10px",borderBottom:`1px solid ${C.border}`,position:"sticky",top:0,background:C.bg,zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
            <AvatarCircle name={profile.name} avatar={profile.avatar} size={34} color={C.accent} onClick={()=>setView("home")}/>
            <div>
              <div style={{fontSize:"19px",fontWeight:700,color:C.accent,letterSpacing:"0.12em",lineHeight:1}}>TRADR</div>
              <div style={{fontSize:"9px",color:C.muted,letterSpacing:"0.1em"}}>{profile.handle||"@trader"}</div>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:"3px"}}>
            <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
              <MiniSparkline trades={trades} C={C}/>
              <div style={{fontSize:"17px",fontWeight:700,color:pnlPos?C.green:C.red}}>{pnlPos?"+":""}{totalPnL}R</div>
            </div>
            <div style={{fontSize:"9px",color:C.muted}}>
              {total}T · {winRate}% WR
              {streak.count>1&&<span style={{marginLeft:"5px",color:streak.type==="Win"?C.green:C.red}}>{streak.count}{streak.type==="Win"?"W":"L"}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* ── CONTENT ── */}
      <div style={{padding:"12px 14px 0"}} className="fade-in" key={view}>

        {/* ══ HOME ══ */}
        {view==="home"&&(
          <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
            {/* Home sub-nav */}
            <HomeDropdown homeSection={homeSection} setHomeSection={setHomeSection} setView={setView} C={C}/>

            {/* FEED */}
            {homeSection==="feed"&&(
              <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
                  {[{label:"WIN RATE",value:`${winRate}%`,color:C.green},{label:"TOTAL P&L",value:`${pnlPos?"+":""}${totalPnL}R`,color:pnlPos?C.green:C.red},{label:"AVG R:R",value:avgRR==="—"?"—":`${avgRR}R`,color:C.accent},{label:"STREAK",value:streak.count>0?`${streak.count}${streak.type==="Win"?"W":"L"}`:"—",color:streak.type==="Win"?C.green:streak.type==="Loss"?C.red:C.muted}].map(s=>(
                    <div key={s.label} style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:"10px",padding:"12px 14px"}}>
                      <div style={{fontSize:"8px",color:C.muted,letterSpacing:"0.14em",marginBottom:"5px"}}>{s.label}</div>
                      <div style={{fontSize:"22px",fontWeight:700,color:s.color,lineHeight:1}}>{s.value}</div>
                    </div>
                  ))}
                </div>
                {total>0&&<div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:"10px",padding:"12px 14px"}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:"8px"}}><span style={{fontSize:"8px",color:C.muted,letterSpacing:"0.14em"}}>BREAKDOWN</span><span style={{fontSize:"9px",color:C.muted}}>{wins}W · {losses}L · {bes}BE</span></div><div style={{display:"flex",borderRadius:"3px",overflow:"hidden",height:"6px",gap:"2px"}}>{wins>0&&<div style={{flex:wins,background:C.green,borderRadius:"3px"}}/>}{bes>0&&<div style={{flex:bes,background:C.yellow}}/>}{losses>0&&<div style={{flex:losses,background:C.red,borderRadius:"3px"}}/>}</div></div>}
                {trades.length>1&&<div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:"10px",padding:"12px 14px"}}><div style={{fontSize:"8px",color:C.muted,letterSpacing:"0.14em",marginBottom:"8px"}}>CUMULATIVE P&L</div><PnLChart trades={trades} C={C}/></div>}
                {/* Strategy mini */}
                {Object.keys(stratStats).length>0&&<div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:"10px",padding:"12px 14px"}}><div style={{fontSize:"8px",color:C.muted,letterSpacing:"0.14em",marginBottom:"10px"}}>BY STRATEGY</div>{Object.entries(stratStats).map(([s,{w,l,pnl,count}])=>{const wr=w+l>0?((w/(w+l))*100).toFixed(0):0;const col=STRATEGIES[s]?.color||C.accent;return(<div key={s} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}><div style={{display:"flex",alignItems:"center",gap:"6px"}}><span>{STRATEGIES[s]?.icon}</span><span style={{fontSize:"10px",color:C.text2}}>{s.split("(")[0].trim()}</span></div><div style={{display:"flex",gap:"8px"}}><span style={{fontSize:"9px",color:C.muted}}>{count}×</span><span style={{fontSize:"10px",fontWeight:700,color:wr>=50?C.green:C.red}}>{wr}%</span><span style={{fontSize:"9px",color:pnl>=0?C.green:C.red}}>{pnl>=0?"+":""}{pnl.toFixed(1)}R</span></div></div>);})}</div>}
                {/* Recent trades */}
                {trades.length>0&&<div><div style={{fontSize:"8px",color:C.muted,letterSpacing:"0.14em",marginBottom:"8px"}}>RECENT TRADES</div>{trades.slice(0,5).map(t=><div key={t.id} className="row-hvr" onClick={()=>editTrade(t)} style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:"8px",padding:"10px 12px",marginBottom:"5px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><div style={{display:"flex",alignItems:"center",gap:"5px"}}><span style={{fontWeight:700,fontSize:"13px"}}>{t.pair||"—"}</span>{t.strategy&&<span>{STRATEGIES[t.strategy]?.icon}</span>}</div><div style={{fontSize:"9px",color:C.muted,marginTop:"2px"}}>{t.date} · {t.session||"—"}</div></div><div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:"4px"}}><Badge C={C} color={t.outcome==="Win"?"green":t.outcome==="Loss"?"red":"yellow"}>{t.outcome}</Badge>{t.rr&&<span style={{fontSize:"9px",color:C.accent}}>{t.rr}R</span>}</div></div>)}{trades.length>5&&<button onClick={()=>setView("history")} style={{width:"100%",background:"none",border:`1px solid ${C.border}`,borderRadius:"8px",color:C.muted,fontSize:"10px",padding:"9px",cursor:"pointer",fontFamily:"inherit"}}>VIEW ALL {trades.length} TRADES →</button>}</div>}
                {/* Friends */}
                <FriendsFeed friends={friends} friendFeed={friendFeed} showAddFriend={showAddFriend} setShowAddFriend={setShowAddFriend} friendCodeInput={friendCodeInput} setFriendCodeInput={setFriendCodeInput} friendMsg={friendMsg} addFriend={addFriend} removeFriend={removeFriend} publishFeed={publishFeed} refreshFeed={refreshFeed} reactToFeed={reactToFeed} getMyCode={getMyCode} profile={profile} C={C} REACTIONS={REACTIONS} STRATEGIES={STRATEGIES}/>
              </div>
            )}

            {/* ANALYTICS */}
            {homeSection==="analytics"&&(
              <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
                <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:"10px",padding:"14px"}}>
                  <div style={{fontSize:"9px",color:C.accent,letterSpacing:"0.14em",fontWeight:700,marginBottom:"12px"}}>WIN RATE BY STRATEGY</div>
                  <WinRateChart trades={trades} C={C}/>
                </div>
                <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:"10px",padding:"14px"}}>
                  <div style={{fontSize:"9px",color:C.accent,letterSpacing:"0.14em",fontWeight:700,marginBottom:"10px"}}>MONTHLY P&L</div>
                  {trades.length<2?<div style={{fontSize:"11px",color:C.muted,textAlign:"center",padding:"20px 0"}}>Log more trades to see monthly trends.</div>:<MonthlyPnLChart trades={trades} C={C}/>}
                </div>
                <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:"10px",padding:"14px"}}>
                  <div style={{fontSize:"9px",color:C.accent,letterSpacing:"0.14em",fontWeight:700,marginBottom:"12px"}}>SESSION PERFORMANCE</div>
                  {Object.entries(sessionStats).map(([session,{w,l,pnl}])=>{const wr=w+l>0?((w/(w+l))*100).toFixed(0):0;const sp=pnl.toFixed(2);return(<div key={session} style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:"8px",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${C.border}`}}><span style={{fontSize:"10px",color:C.text2}}>{session}</span><span style={{fontSize:"10px",fontWeight:700,color:wr>=50?C.green:C.red}}>{wr}%</span><span style={{fontSize:"9px",color:parseFloat(sp)>=0?C.green:C.red}}>{parseFloat(sp)>=0?"+":""}{sp}R</span></div>);})}
                </div>
                <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:"10px",padding:"14px"}}>
                  <div style={{fontSize:"9px",color:C.accent,letterSpacing:"0.14em",fontWeight:700,marginBottom:"10px"}}>PNL CALENDAR</div>
                  <CalendarView trades={trades} C={C} onDayClick={key=>{const dt=trades.filter(t=>t.date===key);setCalDayTrades({key,trades:dt});}}/>
                  {calDayTrades&&(
                    <div style={{marginTop:"14px",borderTop:`1px solid ${C.border}`,paddingTop:"12px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
                        <span style={{fontSize:"9px",color:C.muted,letterSpacing:"0.1em"}}>{calDayTrades.key} · {calDayTrades.trades.length} TRADE{calDayTrades.trades.length!==1?"S":""}</span>
                        <button onClick={()=>setCalDayTrades(null)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:"14px",fontFamily:"inherit"}}>✕</button>
                      </div>
                      {calDayTrades.trades.map(t=><div key={t.id} className="row-hvr" onClick={()=>{setView("history");setExpandedId(t.id);}} style={{background:C.panel2,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"8px 10px",marginBottom:"4px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontWeight:700,fontSize:"12px"}}>{t.pair}</span><div style={{display:"flex",gap:"6px",alignItems:"center"}}>{t.rr&&<span style={{fontSize:"9px",color:C.accent}}>{t.rr}R</span>}<Badge C={C} color={t.outcome==="Win"?"green":t.outcome==="Loss"?"red":"yellow"}>{t.outcome}</Badge></div></div>)}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* AI INSIGHTS */}
            {homeSection==="ai"&&(
              <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                <div style={{fontSize:"9px",color:C.muted,letterSpacing:"0.1em",marginBottom:"4px"}}>RULE-BASED INSIGHTS · Updates after each trade</div>
                {insights.map((ins,i)=>{
                  const colMap={positive:C.green,warning:C.yellow,danger:C.red,info:C.accent};
                  const col=colMap[ins.type]||C.accent;
                  return(
                    <div key={i} style={{background:C.panel,border:`1px solid ${col}30`,borderLeft:`3px solid ${col}`,borderRadius:"0 10px 10px 0",padding:"12px 14px",display:"flex",gap:"10px",alignItems:"flex-start"}}>
                      <span style={{fontSize:"16px",flexShrink:0}}>{ins.icon}</span>
                      <span style={{fontSize:"11px",color:C.text2,lineHeight:1.65}}>{ins.text}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* RULES */}
            {homeSection==="rules"&&(
              <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
                <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
                  {STRATEGY_NAMES.map(s=><StrategyPill key={s} name={s} selected={activeStrategy===s} onClick={()=>{setActiveStrategy(s);setEditingRule(null);}} C={C}/>)}
                </div>
                <div style={{fontSize:"9px",color:C.muted,letterSpacing:"0.1em"}}>Read before every {activeStrategy.split("(")[0].trim()} session.</div>
                {ruleItems.map((rule,idx)=>(
                  <div key={rule.id} className="check-row" style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:"8px",padding:"12px",display:"flex",alignItems:"center",gap:"10px"}}>
                    <span style={{fontSize:"10px",color:accentCol,fontWeight:700,minWidth:"18px"}}>{String(idx+1).padStart(2,"0")}</span>
                    {editingRule===rule.id?<EditInline val={rule.text} onSave={t=>saveEditRule(rule.id,t)} onCancel={()=>setEditingRule(null)} accent={accentCol}/>:<>
                      <span style={{flex:1,fontSize:"12px",color:C.text,lineHeight:1.55}}>{rule.text}</span>
                      <div className="ca" style={{display:"flex",gap:"4px",opacity:0,transition:"opacity 0.15s"}}>
                        <button onClick={()=>setEditingRule(rule.id)} className="hvr" style={{background:"none",border:`1px solid ${C.border2}`,borderRadius:"3px",color:C.muted,fontSize:"8px",padding:"3px 6px",cursor:"pointer",fontFamily:"inherit"}}>EDIT</button>
                        <button onClick={()=>deleteRule(rule.id)} className="hvr" style={{background:"none",border:`1px solid ${C.red}40`,borderRadius:"3px",color:C.red,fontSize:"8px",padding:"3px 6px",cursor:"pointer",fontFamily:"inherit"}}>✕</button>
                      </div>
                    </>}
                  </div>
                ))}
                {addingRule?<div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:"8px",padding:"10px 12px",display:"flex",gap:"6px",alignItems:"center"}}><input autoFocus value={newRuleText} onChange={e=>setNewRuleText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addRule();if(e.key==="Escape"){setAddingRule(false);setNewRuleText("");}}} placeholder="New rule..." style={{...inp,flex:1}}/><button onClick={addRule} style={{background:accentCol,color:"#000",border:"none",borderRadius:"5px",padding:"9px 12px",fontSize:"10px",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>ADD</button><button onClick={()=>{setAddingRule(false);setNewRuleText("");}} className="hvr" style={{background:"none",border:`1px solid ${C.border2}`,borderRadius:"5px",padding:"9px",fontSize:"10px",color:C.muted,cursor:"pointer",fontFamily:"inherit"}}>✕</button></div>:<button onClick={()=>setAddingRule(true)} style={{background:"none",border:`1px dashed ${C.border2}`,borderRadius:"8px",padding:"11px",color:C.muted,fontSize:"10px",cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.08em"}}>+ ADD RULE</button>}
              </div>
            )}

            {/* SETTINGS */}
            {homeSection==="settings"&&(
              <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
                {/* Profile */}
                <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:"12px",padding:"16px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"16px"}}>
                    <div style={{position:"relative"}}>
                      <AvatarCircle name={profile.name} avatar={profileDraft.avatar||profile.avatar} size={52} color={C.accent} onClick={()=>document.getElementById("avatarInput").click()}/>
                      <div style={{position:"absolute",bottom:0,right:0,background:C.accent,borderRadius:"50%",width:"16px",height:"16px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"9px",cursor:"pointer"}} onClick={()=>document.getElementById("avatarInput").click()}>✏</div>
                    </div>
                    <input id="avatarInput" type="file" accept="image/jpeg,image/png" onChange={handleAvatarUpload}/>
                    <div>
                      <div style={{fontSize:"15px",fontWeight:700,color:C.text}}>{profile.name}</div>
                      <div style={{fontSize:"11px",color:C.accent}}>{profile.handle}</div>
                    </div>
                    <button onClick={()=>{setProfileDraft({...profile});setEditingProfile(!editingProfile);}} style={{marginLeft:"auto",background:editingProfile?C.accent:"none",color:editingProfile?"#000":C.accent,border:`1px solid ${C.accent}`,borderRadius:"6px",fontSize:"9px",fontWeight:700,padding:"6px 10px",cursor:"pointer",fontFamily:"inherit"}}>{editingProfile?"CANCEL":"EDIT"}</button>
                  </div>
                  {editingProfile&&(
                    <div style={{display:"flex",flexDirection:"column",gap:"9px"}}>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
                        <div><label style={lbl}>Name</label><input value={profileDraft.name} onChange={e=>setProfileDraft({...profileDraft,name:e.target.value})} style={inp}/></div>
                        <div><label style={lbl}>Handle</label><input value={profileDraft.handle} onChange={e=>setProfileDraft({...profileDraft,handle:e.target.value})} style={inp}/></div>
                      </div>
                      <div><label style={lbl}>Bio</label><textarea value={profileDraft.bio} onChange={e=>setProfileDraft({...profileDraft,bio:e.target.value})} rows={2} style={{...inp,resize:"vertical",lineHeight:1.6}}/></div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
                        <div><label style={lbl}>Broker</label><input value={profileDraft.broker} onChange={e=>setProfileDraft({...profileDraft,broker:e.target.value})} placeholder="IC Markets" style={inp}/></div>
                        <div><label style={lbl}>Timezone</label><input value={profileDraft.timezone} onChange={e=>setProfileDraft({...profileDraft,timezone:e.target.value})} style={inp}/></div>
                      </div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
                        <div><label style={lbl}>Target R:R</label><input type="number" value={profileDraft.targetRR} onChange={e=>setProfileDraft({...profileDraft,targetRR:e.target.value})} style={inp}/></div>
                        <div><label style={lbl}>Max Trades/Day</label><input type="number" value={profileDraft.maxTradesPerDay} onChange={e=>setProfileDraft({...profileDraft,maxTradesPerDay:e.target.value})} style={inp}/></div>
                      </div>
                      <button onClick={async()=>{await saveProfile(profileDraft);setEditingProfile(false);showToast("Profile saved ✅");}} style={{background:C.accent,color:"#000",border:"none",borderRadius:"8px",padding:"12px",fontSize:"12px",fontWeight:700,letterSpacing:"0.1em",cursor:"pointer",fontFamily:"inherit"}}>SAVE PROFILE</button>
                    </div>
                  )}
                </div>
                {/* Preferences */}
                <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:"10px",padding:"14px"}}>
                  <div style={{fontSize:"9px",color:C.muted,letterSpacing:"0.14em",marginBottom:"12px"}}>PREFERENCES</div>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                    <span style={{fontSize:"12px",color:C.text}}>Dark Mode</span>
                    <button onClick={toggleDark} style={{background:darkMode?C.accent:C.border2,border:"none",borderRadius:"20px",width:"44px",height:"24px",cursor:"pointer",position:"relative",transition:"background 0.2s"}}>
                      <div style={{position:"absolute",top:"3px",left:darkMode?"22px":"3px",width:"18px",height:"18px",borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
                    </button>
                  </div>
                  {[["Broker",profile.broker||"—"],["Timezone",profile.timezone||"—"],["Target R:R",profile.targetRR?`${profile.targetRR}R`:"—"],["Max Trades/Day",profile.maxTradesPerDay||"—"]].map(([k,v])=>(
                    <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                      <span style={{fontSize:"11px",color:C.muted}}>{k}</span><span style={{fontSize:"11px",fontWeight:600}}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══ LOG TRADE ══ */}
        {view==="log"&&(
          <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
            <div style={{fontSize:"10px",color:C.accent,letterSpacing:"0.12em",fontWeight:700}}>{editId?"✏ EDIT TRADE":"+ NEW TRADE"}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
              <div><label style={lbl}>Date</label><input type="date" name="date" value={form.date} onChange={handleChange} style={inp}/></div>
              <div><label style={lbl}>Pair / Instrument</label><input name="pair" value={form.pair} onChange={handleChange} placeholder="EURUSD" style={inp}/></div>
            </div>
            <div><label style={lbl}>Strategy</label><div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>{STRATEGY_NAMES.map(s=><StrategyPill key={s} name={s} selected={form.strategy===s} onClick={()=>setForm(f=>({...f,strategy:s,setup:""}))} C={C}/>)}</div></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
              <div><label style={lbl}>Session</label><select name="session" value={form.session} onChange={handleChange} style={sel}><option value="">Select</option>{SESSIONS.map(s=><option key={s}>{s}</option>)}</select></div>
              <div><label style={lbl}>Bias</label><select name="bias" value={form.bias} onChange={handleChange} style={sel}><option value="">Select</option>{BIAS.map(b=><option key={b}>{b}</option>)}</select></div>
            </div>
            <div><label style={lbl}>Setup {form.strategy&&<span style={{color:stratColor(form.strategy,C)}}>{STRATEGIES[form.strategy]?.icon}</span>}</label><select name="setup" value={form.setup} onChange={handleChange} style={{...sel,borderColor:form.strategy?stratColor(form.strategy,C):C.border2}}><option value="">Select setup</option>{(form.strategy?STRATEGIES[form.strategy]?.setups||[]:allSetups).map(s=><option key={s}>{s}</option>)}</select></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"6px"}}>
              <div><label style={lbl}>Entry</label><input type="number" name="entryPrice" value={form.entryPrice} onChange={handleChange} placeholder="0.00" style={inp}/></div>
              <div><label style={lbl}>Stop Loss</label><input type="number" name="slPrice" value={form.slPrice} onChange={handleChange} placeholder="0.00" style={inp}/></div>
              <div><label style={lbl}>Take Profit</label><input type="number" name="tpPrice" value={form.tpPrice} onChange={handleChange} placeholder="0.00" style={inp}/></div>
            </div>
            {form.rr&&<div style={{background:`${C.accent}10`,border:`1px solid ${C.accent}30`,borderRadius:"8px",padding:"9px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:"10px",color:C.muted}}>Calculated R:R</span><span style={{fontSize:"14px",fontWeight:700,color:C.accent}}>{form.rr}R</span></div>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
              <div><label style={lbl}>Outcome</label><select name="outcome" value={form.outcome} onChange={handleChange} style={sel}><option value="">Select</option>{OUTCOMES.map(o=><option key={o}>{o}</option>)}</select></div>
              <div><label style={lbl}>P&L (R multiples)</label><input type="number" name="pnl" value={form.pnl} onChange={handleChange} placeholder="+2.5 or -1" style={inp}/></div>
            </div>
            <div><label style={lbl}>Notes</label><textarea name="notes" value={form.notes} onChange={handleChange} placeholder="What did price do? Why did you enter?" rows={3} style={{...inp,resize:"vertical",lineHeight:1.6}}/></div>
            <div><label style={lbl}>Emotional State</label><input name="emotions" value={form.emotions} onChange={handleChange} placeholder="Calm, FOMO, disciplined..." style={inp}/></div>
            {/* Screenshot upload */}
            <div>
              <label style={lbl}>Screenshot</label>
              {form.screenshot?(
                <div style={{position:"relative",marginBottom:"4px"}}>
                  <img src={form.screenshot} alt="screenshot" style={{width:"100%",borderRadius:"8px",border:`1px solid ${C.border}`,display:"block",maxHeight:"180px",objectFit:"cover"}}/>
                  <button onClick={()=>removeScreenshot(null)} style={{position:"absolute",top:"6px",right:"6px",background:"rgba(0,0,0,0.7)",border:"none",borderRadius:"50%",color:"#fff",width:"24px",height:"24px",cursor:"pointer",fontSize:"11px",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                </div>
              ):(
                <label htmlFor="ssUpload" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:"8px",border:`1px dashed ${C.border2}`,borderRadius:"8px",padding:"16px",cursor:"pointer",color:C.muted,fontSize:"11px"}}>
                  📷 Upload screenshot<input id="ssUpload" type="file" accept="image/jpeg,image/png" onChange={e=>handleScreenshotUpload(e,null)}/>
                </label>
              )}
            </div>
            <button onClick={submitTrade} disabled={savingTrade} style={{background:(form.pair&&form.date&&form.outcome&&!savingTrade)?C.accent:"#222",color:(form.pair&&form.date&&form.outcome&&!savingTrade)?"#000":C.muted,border:"none",borderRadius:"10px",padding:"15px",fontSize:"12px",fontWeight:700,letterSpacing:"0.1em",cursor:"pointer",fontFamily:"inherit",width:"100%",transition:"all 0.15s"}}>
              {savingTrade?"SAVING...":editId?"UPDATE TRADE":"SAVE TRADE"}
            </button>
            {editId&&<button onClick={()=>{setForm(EMPTY_TRADE);setEditId(null);setView("history");}} style={{background:"none",border:`1px solid ${C.border2}`,borderRadius:"10px",padding:"11px",fontSize:"10px",color:C.muted,cursor:"pointer",fontFamily:"inherit",width:"100%"}}>CANCEL EDIT</button>}
          </div>
        )}

        {/* ══ HISTORY ══ */}
        {view==="history"&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px",marginBottom:"6px"}}>
              <input placeholder="Pair..." value={filter.pair} onChange={e=>setFilter({...filter,pair:e.target.value})} style={{...inp,fontSize:"11px"}}/>
              <select value={filter.outcome} onChange={e=>setFilter({...filter,outcome:e.target.value})} style={{...sel,fontSize:"11px"}}><option value="">All outcomes</option>{OUTCOMES.map(o=><option key={o}>{o}</option>)}</select>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px",marginBottom:"12px"}}>
              <select value={filter.strategy} onChange={e=>setFilter({...filter,strategy:e.target.value,setup:""})} style={{...sel,fontSize:"11px"}}><option value="">All strategies</option>{STRATEGY_NAMES.map(s=><option key={s}>{s}</option>)}</select>
              <select value={filter.setup} onChange={e=>setFilter({...filter,setup:e.target.value})} style={{...sel,fontSize:"11px"}}><option value="">All setups</option>{(filter.strategy?STRATEGIES[filter.strategy]?.setups||[]:allSetups).map(s=><option key={s} value={s}>{s.split("(")[0].trim()}</option>)}</select>
            </div>
            {filteredTrades.length===0?<div style={{textAlign:"center",padding:"48px 0",color:C.dim,fontSize:"11px"}}>No trades match.</div>:filteredTrades.map(t=>{
              const expanded=expandedId===t.id;
              const commentText=commentInputs[t.id]||"";
              const totalR=Object.values(t.reactions||{}).reduce((a,b)=>a+b,0);
              const sc=t.strategy?stratColor(t.strategy,C):C.accent;
              return(
                <div key={t.id} style={{background:C.panel,border:`1px solid ${expanded?C.border2:C.border}`,borderRadius:"10px",marginBottom:"8px",overflow:"hidden"}}>
                  <div className="row-hvr" onClick={()=>setExpandedId(expanded?null:t.id)} style={{padding:"12px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                      <div><div style={{display:"flex",alignItems:"center",gap:"5px"}}><span style={{fontWeight:700,fontSize:"13px"}}>{t.pair}</span>{t.strategy&&<span>{STRATEGIES[t.strategy]?.icon}</span>}</div><div style={{fontSize:"9px",color:C.muted,marginTop:"2px"}}>{t.date}</div></div>
                      {t.session&&<Badge C={C} color="gray">{t.session}</Badge>}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:"5px"}}>
                      {totalR>0&&<span style={{fontSize:"9px",color:C.muted}}>{totalR}✦</span>}
                      {(t.comments||[]).length>0&&<span style={{fontSize:"9px",color:C.muted}}>💬{(t.comments||[]).length}</span>}
                      {t.rr&&<span style={{fontSize:"10px",color:sc,fontWeight:700}}>{t.rr}R</span>}
                      <Badge C={C} color={t.outcome==="Win"?"green":t.outcome==="Loss"?"red":"yellow"}>{t.outcome}</Badge>
                      <span style={{color:C.muted,fontSize:"10px"}}>{expanded?"▲":"▼"}</span>
                    </div>
                  </div>
                  {expanded&&(
                    <div style={{borderTop:`1px solid ${C.border}`,padding:"12px"}}>
                      <div style={{display:"flex",gap:"5px",flexWrap:"wrap",marginBottom:"10px"}}>
                        {t.strategy&&<Badge C={C} color={stratBadgeColor(t.strategy)}>{STRATEGIES[t.strategy]?.icon} {t.strategy.split("(")[0].trim()}</Badge>}
                        {t.bias&&<Badge C={C} color={t.bias==="Bullish"?"green":t.bias==="Bearish"?"red":"gray"}>{t.bias}</Badge>}
                        {t.setup&&<Badge C={C} color="gray">{t.setup.split("(")[0].trim()}</Badge>}
                        {t.pnl&&<Badge C={C} color={parseFloat(t.pnl)>=0?"green":"red"}>{parseFloat(t.pnl)>=0?"+":""}{t.pnl}R</Badge>}
                      </div>
                      {t.entryPrice&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"6px",marginBottom:"10px"}}>{[["ENTRY",t.entryPrice],["SL",t.slPrice],["TP",t.tpPrice]].map(([l2,v])=>v?<div key={l2} style={{background:C.panel2,borderRadius:"6px",padding:"6px 8px",border:`1px solid ${C.border}`}}><div style={{fontSize:"8px",color:C.muted,marginBottom:"2px"}}>{l2}</div><div style={{fontSize:"11px",fontWeight:600}}>{v}</div></div>:null)}</div>}
                      {/* Screenshot */}
                      {t.screenshot?(
                        <div style={{marginBottom:"10px",position:"relative"}}>
                          <img src={t.screenshot} alt="chart" style={{width:"100%",borderRadius:"8px",border:`1px solid ${C.border}`,display:"block",maxHeight:"200px",objectFit:"cover"}}/>
                          <div style={{position:"absolute",top:"6px",right:"6px",display:"flex",gap:"4px"}}>
                            <label htmlFor={`ss-${t.id}`} style={{background:"rgba(0,0,0,0.7)",borderRadius:"4px",padding:"5px 8px",fontSize:"9px",color:"#fff",cursor:"pointer"}}>↻<input id={`ss-${t.id}`} type="file" accept="image/jpeg,image/png" onChange={e=>handleScreenshotUpload(e,t.id)}/></label>
                            <button onClick={()=>removeScreenshot(t.id)} style={{background:"rgba(0,0,0,0.7)",border:"none",borderRadius:"4px",color:"#fff",padding:"5px 8px",fontSize:"9px",cursor:"pointer"}}>✕</button>
                          </div>
                        </div>
                      ):(
                        <label htmlFor={`ss-${t.id}`} style={{display:"flex",alignItems:"center",gap:"6px",border:`1px dashed ${C.border2}`,borderRadius:"8px",padding:"10px",cursor:"pointer",color:C.muted,fontSize:"10px",marginBottom:"10px"}}>
                          📷 Add screenshot<input id={`ss-${t.id}`} type="file" accept="image/jpeg,image/png" onChange={e=>handleScreenshotUpload(e,t.id)}/>
                        </label>
                      )}
                      {t.notes&&<div style={{fontSize:"11px",color:C.text2,lineHeight:1.6,marginBottom:"8px",borderLeft:`2px solid ${C.border2}`,paddingLeft:"9px"}}>{t.notes}</div>}
                      {t.emotions&&<div style={{fontSize:"10px",color:C.muted,marginBottom:"10px"}}>🧠 {t.emotions}</div>}
                      <div style={{marginBottom:"10px"}}>
                        <div style={{fontSize:"8px",color:C.muted,letterSpacing:"0.1em",marginBottom:"7px"}}>REACTIONS</div>
                        <div style={{display:"flex",gap:"5px",flexWrap:"wrap"}}>{REACTIONS.map(emoji=>{const count=(t.reactions||{})[emoji]||0;return<button key={emoji} className="rbtn" onClick={()=>toggleReaction(t.id,emoji)} style={{background:count>0?`${C.accent}15`:C.panel2,border:`1px solid ${count>0?`${C.accent}40`:C.border}`,borderRadius:"20px",padding:"5px 8px",cursor:"pointer",fontSize:"13px",display:"flex",alignItems:"center",gap:"4px",transition:"transform 0.1s",fontFamily:"inherit"}}><span>{emoji}</span>{count>0&&<span style={{fontSize:"9px",color:C.accent,fontWeight:700}}>{count}</span>}</button>;})}</div>
                      </div>
                      <div style={{marginBottom:"10px"}}>
                        <div style={{fontSize:"8px",color:C.muted,letterSpacing:"0.1em",marginBottom:"8px"}}>NOTES {(t.comments||[]).length>0&&`(${(t.comments||[]).length})`}</div>
                        {(t.comments||[]).map(c=>(
                          <div key={c.id} style={{background:C.panel2,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"8px 10px",marginBottom:"5px",display:"flex",gap:"8px",alignItems:"flex-start"}}>
                            <AvatarCircle name={c.author} size={22} color={C.accent}/>
                            <div style={{flex:1,minWidth:0}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:"3px"}}><span style={{fontSize:"10px",fontWeight:700,color:C.accent}}>{c.author}</span><div style={{display:"flex",gap:"6px",alignItems:"center"}}><span style={{fontSize:"8px",color:C.dim}}>{c.ts}</span><button onClick={()=>deleteComment(t.id,c.id)} className="hvr" style={{background:"none",border:"none",color:C.dim,fontSize:"11px",cursor:"pointer"}}>✕</button></div></div><div style={{fontSize:"11px",color:C.text2,lineHeight:1.5,wordBreak:"break-word"}}>{c.text}</div></div>
                          </div>
                        ))}
                        <div style={{display:"flex",gap:"6px",alignItems:"center",marginTop:"6px"}}>
                          <AvatarCircle name={profile.name} avatar={profile.avatar} size={24} color={C.accent}/>
                          <input value={commentText} onChange={e=>setCommentInputs(p=>({...p,[t.id]:e.target.value}))} onKeyDown={e=>{if(e.key==="Enter")addComment(t.id);}} placeholder="Add a note..." style={{...inp,fontSize:"11px",padding:"7px 10px",flex:1}}/>
                          <button onClick={()=>addComment(t.id)} style={{background:commentText.trim()?C.accent:"#222",color:commentText.trim()?"#000":C.muted,border:"none",borderRadius:"6px",padding:"7px 10px",fontSize:"10px",fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}>POST</button>
                        </div>
                      </div>
                      <div style={{display:"flex",gap:"6px"}}>
                        <button className="hvr" onClick={()=>editTrade(t)} style={{background:"none",border:`1px solid ${C.border2}`,borderRadius:"6px",color:C.muted,fontSize:"9px",padding:"7px 12px",cursor:"pointer",fontFamily:"inherit"}}>EDIT</button>
                        {confirmDelete===t.id?(<><button className="hvr" onClick={()=>deleteTrade(t.id)} style={{background:`${C.red}18`,border:`1px solid ${C.red}40`,borderRadius:"6px",color:C.red,fontSize:"9px",padding:"7px 12px",cursor:"pointer",fontFamily:"inherit",fontWeight:700}}>CONFIRM</button><button className="hvr" onClick={()=>setConfirmDelete(null)} style={{background:"none",border:`1px solid ${C.border2}`,borderRadius:"6px",color:C.muted,fontSize:"9px",padding:"7px 12px",cursor:"pointer",fontFamily:"inherit"}}>CANCEL</button></>):(<button className="hvr" onClick={()=>setConfirmDelete(t.id)} style={{background:"none",border:`1px solid ${C.red}40`,borderRadius:"6px",color:C.red,fontSize:"9px",padding:"7px 12px",cursor:"pointer",fontFamily:"inherit"}}>DELETE</button>)}
                        {t.screenshot&&<a href={t.screenshot} target="_blank" rel="noreferrer" style={{fontSize:"9px",color:C.accent,padding:"7px 12px",border:`1px solid ${C.accent}30`,borderRadius:"6px",textDecoration:"none"}}>CHART ↗</a>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ══ STATS ══ */}
        {view==="stats"&&(
          <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
            <div style={{display:"flex",gap:"5px"}}>
              {[["overview","Overview"],["strategies","Strategies"],["calendar","Calendar"]].map(([id,label])=>(
                <button key={id} onClick={()=>setStatsTab(id)} style={{background:statsTab===id?C.accent:"transparent",color:statsTab===id?"#000":C.muted,border:`1px solid ${statsTab===id?C.accent:C.border2}`,borderRadius:"16px",padding:"6px 12px",fontSize:"9px",fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}>{label}</button>
              ))}
            </div>
            {statsTab==="overview"&&total===0&&<div style={{textAlign:"center",padding:"48px 0",color:C.dim,fontSize:"11px"}}>Log trades to see stats.</div>}
            {statsTab==="overview"&&total>0&&(
              <>
                <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:"10px",padding:"14px"}}>
                  <div style={{fontSize:"8px",color:C.muted,letterSpacing:"0.14em",marginBottom:"10px"}}>OVERVIEW</div>
                  {[["Total Trades",total],["Win Rate",`${winRate}%`],["Total P&L",`${pnlPos?"+":""}${totalPnL}R`],["Average R:R",avgRR==="—"?"—":`${avgRR}R`],["Wins / Losses / B/E",`${wins} / ${losses} / ${bes}`],["Best Streak",(()=>{let best=0,cur=0,last=null;trades.slice().reverse().forEach(t=>{if(t.outcome==="Win"){cur=last==="Win"?cur+1:1;last="Win";best=Math.max(best,cur);}else{last=t.outcome;cur=0;}});return best>0?`${best}W`:"—";})()]].map(([k,v])=>(<div key={k} style={{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.border}`}}><span style={{fontSize:"10px",color:C.muted}}>{k}</span><span style={{fontSize:"11px",fontWeight:600}}>{v}</span></div>))}
                </div>
                {Object.entries(sessionStats).length>0&&<div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:"10px",padding:"14px"}}><div style={{fontSize:"8px",color:C.muted,letterSpacing:"0.14em",marginBottom:"10px"}}>SESSION BREAKDOWN</div>{Object.entries(sessionStats).map(([session,{w,l,pnl}])=>{const wr=w+l>0?((w/(w+l))*100).toFixed(0):0;const sp=pnl.toFixed(2);return(<div key={session} style={{display:"grid",gridTemplateColumns:"1fr auto auto",gap:"8px",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${C.border}`}}><span style={{fontSize:"10px",color:C.muted}}>{session}</span><span style={{fontSize:"10px",fontWeight:700,color:wr>=50?C.green:C.red}}>{wr}%</span><span style={{fontSize:"9px",color:parseFloat(sp)>=0?C.green:C.red}}>{parseFloat(sp)>=0?"+":""}{sp}R</span></div>);})}</div>}
                {Object.entries(pairStats).length>0&&<div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:"10px",padding:"14px"}}><div style={{fontSize:"8px",color:C.muted,letterSpacing:"0.14em",marginBottom:"10px"}}>PAIR PERFORMANCE</div>{Object.entries(pairStats).sort((a,b)=>b[1].pnl-a[1].pnl).map(([pair,{w,l,pnl}])=>{const wr=w+l>0?((w/(w+l))*100).toFixed(0):0;const sp=pnl.toFixed(2);return(<div key={pair} style={{display:"grid",gridTemplateColumns:"1fr auto auto auto",gap:"8px",alignItems:"center",padding:"7px 0",borderBottom:`1px solid ${C.border}`}}><span style={{fontSize:"11px",fontWeight:700}}>{pair}</span><span style={{fontSize:"9px",color:C.muted}}>{w+l}T</span><span style={{fontSize:"10px",fontWeight:700,color:wr>=50?C.green:C.red}}>{wr}%</span><span style={{fontSize:"9px",color:parseFloat(sp)>=0?C.green:C.red}}>{parseFloat(sp)>=0?"+":""}{sp}R</span></div>);})}</div>}
              </>
            )}
            {statsTab==="strategies"&&(
              <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
                <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:"10px",padding:"14px"}}><div style={{fontSize:"9px",color:C.accent,letterSpacing:"0.14em",fontWeight:700,marginBottom:"12px"}}>WIN RATE BY STRATEGY</div><WinRateChart trades={trades} C={C}/></div>
                <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:"10px",padding:"14px"}}><div style={{fontSize:"9px",color:C.accent,letterSpacing:"0.14em",fontWeight:700,marginBottom:"10px"}}>MONTHLY P&L</div><MonthlyPnLChart trades={trades} C={C}/></div>
                {Object.entries(stratStats).length>0&&<div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:"10px",padding:"14px"}}><div style={{fontSize:"8px",color:C.muted,letterSpacing:"0.14em",marginBottom:"12px"}}>STRATEGY DETAIL</div>{Object.entries(stratStats).map(([s,{w,l,be,pnl,count}])=>{const wr=w+l>0?((w/(w+l))*100).toFixed(0):0;const col=STRATEGIES[s]?.color||C.accent;return(<div key={s} style={{marginBottom:"14px"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"6px"}}><div style={{display:"flex",alignItems:"center",gap:"6px"}}><span>{STRATEGIES[s]?.icon}</span><span style={{fontSize:"10px",color:C.text,fontWeight:600}}>{s.split("(")[0].trim()}</span></div><div style={{display:"flex",gap:"8px"}}><span style={{fontSize:"9px",color:C.muted}}>{count}T</span><span style={{fontSize:"10px",fontWeight:700,color:wr>=50?C.green:C.red}}>{wr}% WR</span><span style={{fontSize:"10px",color:pnl>=0?C.green:C.red,fontWeight:700}}>{pnl>=0?"+":""}{pnl.toFixed(1)}R</span></div></div><div style={{background:C.panel2,borderRadius:"3px",height:"4px"}}><div style={{background:col,height:"4px",borderRadius:"3px",width:`${Math.min((count/total)*100,100)}%`,transition:"width 0.5s ease"}}/></div></div>);})}</div>}
              </div>
            )}
            {statsTab==="calendar"&&(
              <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:"10px",padding:"14px"}}>
                <CalendarView trades={trades} C={C} onDayClick={key=>{const dt=trades.filter(t=>t.date===key);setCalDayTrades({key,trades:dt});}}/>
                {calDayTrades&&<div style={{marginTop:"14px",borderTop:`1px solid ${C.border}`,paddingTop:"12px"}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:"8px"}}><span style={{fontSize:"9px",color:C.muted}}>{calDayTrades.key} · {calDayTrades.trades.length} TRADE{calDayTrades.trades.length!==1?"S":""}</span><button onClick={()=>setCalDayTrades(null)} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:"14px"}}>✕</button></div>{calDayTrades.trades.map(t=><div key={t.id} className="row-hvr" onClick={()=>{setView("history");setExpandedId(t.id);}} style={{background:C.panel2,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"8px 10px",marginBottom:"4px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontWeight:700,fontSize:"12px"}}>{t.pair}</span><div style={{display:"flex",gap:"6px",alignItems:"center"}}>{t.rr&&<span style={{fontSize:"9px",color:C.accent}}>{t.rr}R</span>}<Badge C={C} color={t.outcome==="Win"?"green":t.outcome==="Loss"?"red":"yellow"}>{t.outcome}</Badge></div></div>)}</div>}
              </div>
            )}
          </div>
        )}

        {/* ══ CHECKLIST ══ */}
        {view==="checklist"&&(
          <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
            <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>{STRATEGY_NAMES.map(s=><StrategyPill key={s} name={s} selected={activeStrategy===s} onClick={()=>{setActiveStrategy(s);setEditingCheckItem(null);setEditingRule(null);}} C={C}/>)}</div>
            <div style={{display:"flex",background:C.panel,border:`1px solid ${C.border}`,borderRadius:"8px",overflow:"hidden"}}>
              {[{id:"pretrade",label:"PRE-TRADE"},{id:"rules",label:"RULES"}].map(st=>(
                <button key={st.id} onClick={()=>setChecklistTab(st.id)} style={{flex:1,padding:"11px",background:checklistTab===st.id?C.panel2:"none",border:"none",borderBottom:checklistTab===st.id?`2px solid ${accentCol}`:"2px solid transparent",color:checklistTab===st.id?accentCol:C.muted,fontSize:"9px",fontWeight:700,letterSpacing:"0.1em",cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}>{st.label}</button>
              ))}
            </div>
            {checklistTab==="pretrade"&&(
              <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
                <ConfluenceTracker
                  checkItems={checkItems}
                  checkedCount={checkedCount}
                  totalItems={totalItems}
                  isChecked={isChecked}
                  activeStrategy={activeStrategy}
                  accentCol={accentCol}
                  C={C}
                  stratThresholds={stratThresholds}
                  setStratThresholds={setStratThresholds}
                  saveStratThresholds={saveStratThresholds}
                />
                {checkItems.map(item=>(
                  <div key={item.id} className="check-row" style={{background:C.panel,border:`1px solid ${isChecked(item.id)?C.green:C.border}`,borderRadius:"10px",padding:"12px",display:"flex",alignItems:"center",gap:"10px",transition:"border-color 0.2s"}}>
                    <div onClick={()=>toggleCheck(item.id)} style={{width:"20px",height:"20px",borderRadius:"5px",border:`2px solid ${isChecked(item.id)?C.green:C.border2}`,background:isChecked(item.id)?`${C.green}20`:"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,transition:"all 0.15s"}}>
                      {isChecked(item.id)&&<span style={{color:C.green,fontSize:"11px",lineHeight:1}}>✓</span>}
                    </div>
                    {editingCheckItem===item.id?<EditInline val={item.text} onSave={t=>saveEditCheck(item.id,t)} onCancel={()=>setEditingCheckItem(null)} accent={accentCol}/>:<>
                      <span onClick={()=>toggleCheck(item.id)} style={{flex:1,fontSize:"12px",color:isChecked(item.id)?C.muted:C.text,textDecoration:isChecked(item.id)?"line-through":"none",cursor:"pointer",lineHeight:1.5}}>{item.text}</span>
                      <div className="ca" style={{display:"flex",gap:"4px",opacity:0,transition:"opacity 0.15s"}}>
                        <button onClick={()=>setEditingCheckItem(item.id)} className="hvr" style={{background:"none",border:`1px solid ${C.border2}`,borderRadius:"3px",color:C.muted,fontSize:"8px",padding:"3px 6px",cursor:"pointer",fontFamily:"inherit"}}>EDIT</button>
                        <button onClick={()=>deleteCheckItem(item.id)} className="hvr" style={{background:"none",border:`1px solid ${C.red}40`,borderRadius:"3px",color:C.red,fontSize:"8px",padding:"3px 6px",cursor:"pointer",fontFamily:"inherit"}}>✕</button>
                      </div>
                    </>}
                  </div>
                ))}
                {addingCheck?<div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:"10px",padding:"10px 12px",display:"flex",gap:"6px",alignItems:"center"}}><input autoFocus value={newCheckText} onChange={e=>setNewCheckText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addCheckItem();if(e.key==="Escape"){setAddingCheck(false);setNewCheckText("");}}} placeholder="New condition..." style={{...inp,flex:1}}/><button onClick={addCheckItem} style={{background:accentCol,color:"#000",border:"none",borderRadius:"6px",padding:"9px 12px",fontSize:"10px",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>ADD</button><button onClick={()=>{setAddingCheck(false);setNewCheckText("");}} className="hvr" style={{background:"none",border:`1px solid ${C.border2}`,borderRadius:"6px",padding:"9px",fontSize:"10px",color:C.muted,cursor:"pointer",fontFamily:"inherit"}}>✕</button></div>:<button onClick={()=>setAddingCheck(true)} style={{background:"none",border:`1px dashed ${C.border2}`,borderRadius:"10px",padding:"12px",color:C.muted,fontSize:"10px",cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.08em"}}>+ ADD CONDITION</button>}
                {checkedCount>0&&<button onClick={resetChecklist} className="hvr" style={{background:"none",border:`1px solid ${C.border}`,borderRadius:"10px",padding:"10px",color:C.muted,fontSize:"9px",cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.08em"}}>↺ RESET CHECKLIST</button>}
              </div>
            )}
            {checklistTab==="rules"&&(
              <div style={{display:"flex",flexDirection:"column",gap:"6px"}}>
                <div style={{fontSize:"9px",color:C.muted,letterSpacing:"0.1em",marginBottom:"4px"}}>Read before every {activeStrategy.split("(")[0].trim()} session.</div>
                {ruleItems.map((rule,idx)=>(
                  <div key={rule.id} className="check-row" style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:"10px",padding:"12px",display:"flex",alignItems:"center",gap:"10px"}}>
                    <span style={{fontSize:"10px",color:accentCol,fontWeight:700,minWidth:"18px"}}>{String(idx+1).padStart(2,"0")}</span>
                    {editingRule===rule.id?<EditInline val={rule.text} onSave={t=>saveEditRule(rule.id,t)} onCancel={()=>setEditingRule(null)} accent={accentCol}/>:<>
                      <span style={{flex:1,fontSize:"12px",color:C.text,lineHeight:1.55}}>{rule.text}</span>
                      <div className="ca" style={{display:"flex",gap:"4px",opacity:0,transition:"opacity 0.15s"}}>
                        <button onClick={()=>setEditingRule(rule.id)} className="hvr" style={{background:"none",border:`1px solid ${C.border2}`,borderRadius:"3px",color:C.muted,fontSize:"8px",padding:"3px 6px",cursor:"pointer",fontFamily:"inherit"}}>EDIT</button>
                        <button onClick={()=>deleteRule(rule.id)} className="hvr" style={{background:"none",border:`1px solid ${C.red}40`,borderRadius:"3px",color:C.red,fontSize:"8px",padding:"3px 6px",cursor:"pointer",fontFamily:"inherit"}}>✕</button>
                      </div>
                    </>}
                  </div>
                ))}
                {addingRule?<div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:"10px",padding:"10px 12px",display:"flex",gap:"6px",alignItems:"center"}}><input autoFocus value={newRuleText} onChange={e=>setNewRuleText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addRule();if(e.key==="Escape"){setAddingRule(false);setNewRuleText("");}}} placeholder="New rule..." style={{...inp,flex:1}}/><button onClick={addRule} style={{background:accentCol,color:"#000",border:"none",borderRadius:"6px",padding:"9px 12px",fontSize:"10px",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>ADD</button><button onClick={()=>{setAddingRule(false);setNewRuleText("");}} className="hvr" style={{background:"none",border:`1px solid ${C.border2}`,borderRadius:"6px",padding:"9px",fontSize:"10px",color:C.muted,cursor:"pointer",fontFamily:"inherit"}}>✕</button></div>:<button onClick={()=>setAddingRule(true)} style={{background:"none",border:`1px dashed ${C.border2}`,borderRadius:"10px",padding:"12px",color:C.muted,fontSize:"10px",cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.08em"}}>+ ADD RULE</button>}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── BOTTOM NAV ── */}
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:"480px",background:C.bg,borderTop:`1px solid ${C.border}`,display:"flex",zIndex:10,paddingBottom:"env(safe-area-inset-bottom)"}}>
        {NAV_TABS.map(tab=>(
          <button key={tab.id} onClick={()=>setView(tab.id)} style={{flex:1,padding:"10px 4px 8px",background:"none",border:"none",borderTop:view===tab.id?`2px solid ${C.accent}`:"2px solid transparent",color:view===tab.id?C.accent:C.muted,fontSize:"7px",fontWeight:700,letterSpacing:"0.08em",cursor:"pointer",fontFamily:"inherit",display:"flex",flexDirection:"column",alignItems:"center",gap:"3px",transition:"color 0.1s"}}>
            <span style={{fontSize:"16px",lineHeight:1}}>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {toast&&<Toast message={toast} onDone={()=>setToast(null)}/>}
    </div>
  );
}

// ── HOME DROPDOWN MENU ───────────────────────────────────────────────────────
function HomeDropdown({homeSection,setHomeSection,setView,C}){
  const [open,setOpen]=useState(false);
  const ref=useRef(null);

  useEffect(()=>{
    function handle(e){if(ref.current&&!ref.current.contains(e.target))setOpen(false);}
    document.addEventListener("mousedown",handle);document.addEventListener("touchstart",handle);
    return()=>{document.removeEventListener("mousedown",handle);document.removeEventListener("touchstart",handle);};
  },[]);

  const SECTIONS=[
    {id:"feed",    label:"📊 Feed",             desc:"Stats, trades & friends"},
    {id:"analytics",label:"📈 Analytics",       desc:"Charts, calendar & P&L"},
    {id:"ai",      label:"🤖 AI Insights",       desc:"Rule-based trade feedback"},
    {id:"rules",   label:"📋 Strategy Rules",    desc:"Read before each session"},
    {id:"settings",label:"⚙️ Settings",          desc:"Profile & preferences"},
  ];
  const SHORTCUTS=[
    {label:"✓ Checklist",  action:()=>{setView("checklist");setOpen(false);}},
    {label:"+ Log Trade",  action:()=>{setView("log");setOpen(false);}},
    {label:"≡ History",    action:()=>{setView("history");setOpen(false);}},
    {label:"◎ Stats",      action:()=>{setView("stats");setOpen(false);}},
  ];

  const active=SECTIONS.find(s=>s.id===homeSection);

  return(
    <div ref={ref} style={{position:"relative",zIndex:20}}>
      {/* Trigger row */}
      <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
        {/* Current section pill */}
        <button onClick={()=>setOpen(!open)} style={{display:"flex",alignItems:"center",gap:"8px",background:C.panel,border:`1px solid ${open?C.accent:C.border2}`,borderRadius:"10px",padding:"9px 13px",cursor:"pointer",fontFamily:"inherit",flex:1,transition:"border-color 0.15s"}}>
          <span style={{fontSize:"13px"}}>{active?active.label.split(" ")[0]:"📊"}</span>
          <div style={{flex:1,textAlign:"left"}}>
            <div style={{fontSize:"10px",fontWeight:700,color:C.text,letterSpacing:"0.04em"}}>{active?active.label.split(" ").slice(1).join(" "):"Feed"}</div>
            <div style={{fontSize:"8px",color:C.muted,marginTop:"1px"}}>{active?active.desc:""}</div>
          </div>
          <span style={{fontSize:"10px",color:C.muted,transition:"transform 0.2s",transform:open?"rotate(180deg)":"rotate(0deg)"}}>▼</span>
        </button>
        {/* Quick shortcut pills */}
        {SHORTCUTS.slice(0,2).map(s=>(
          <button key={s.label} onClick={s.action} style={{background:"transparent",border:`1px solid ${C.border2}`,borderRadius:"10px",padding:"9px 11px",cursor:"pointer",fontFamily:"inherit",fontSize:"10px",color:C.muted,fontWeight:700,whiteSpace:"nowrap",transition:"all 0.15s"}}>
            {s.label.split(" ")[0]}
          </button>
        ))}
      </div>

      {/* Dropdown panel */}
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,right:0,background:C.panel,border:`1px solid ${C.border2}`,borderRadius:"12px",boxShadow:`0 8px 32px ${C.shadow}`,overflow:"hidden",animation:"fadeIn 0.15s ease"}}>
          {/* Section heading */}
          <div style={{padding:"10px 14px 6px",borderBottom:`1px solid ${C.border}`}}>
            <div style={{fontSize:"8px",color:C.muted,letterSpacing:"0.14em",fontWeight:700}}>HOME SECTIONS</div>
          </div>
          {SECTIONS.map(s=>(
            <button key={s.id} onClick={()=>{setHomeSection(s.id);setOpen(false);}} style={{width:"100%",display:"flex",alignItems:"center",gap:"12px",padding:"11px 14px",background:homeSection===s.id?`${C.accent}10`:"transparent",border:"none",borderBottom:`1px solid ${C.border}`,cursor:"pointer",fontFamily:"inherit",textAlign:"left",transition:"background 0.1s"}}>
              <span style={{fontSize:"16px",width:"20px",textAlign:"center"}}>{s.label.split(" ")[0]}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:"11px",fontWeight:700,color:homeSection===s.id?C.accent:C.text}}>{s.label.split(" ").slice(1).join(" ")}</div>
                <div style={{fontSize:"9px",color:C.muted,marginTop:"1px"}}>{s.desc}</div>
              </div>
              {homeSection===s.id&&<span style={{fontSize:"10px",color:C.accent}}>●</span>}
            </button>
          ))}
          {/* Shortcuts divider */}
          <div style={{padding:"8px 14px 6px",borderTop:`1px solid ${C.border}`}}>
            <div style={{fontSize:"8px",color:C.muted,letterSpacing:"0.14em",fontWeight:700}}>QUICK NAVIGATION</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px",padding:"6px 10px 10px"}}>
            {SHORTCUTS.map(s=>(
              <button key={s.label} onClick={s.action} style={{background:C.panel2,border:`1px solid ${C.border2}`,borderRadius:"8px",padding:"10px 8px",cursor:"pointer",fontFamily:"inherit",fontSize:"10px",fontWeight:700,color:C.text,textAlign:"center",transition:"background 0.1s"}}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── CONFLUENCE TRACKER ───────────────────────────────────────────────────────
function ConfluenceTracker({checkItems,checkedCount,totalItems,isChecked,activeStrategy,accentCol,C,stratThresholds,setStratThresholds,saveStratThresholds}){
  const [editMode,setEditMode]=useState(false);
  const thresh=stratThresholds[activeStrategy]||{minCount:Math.ceil(totalItems*0.75),required:[]};
  const minCount=thresh.minCount||1;
  const required=thresh.required||[];

  const reqMet=required.every(id=>isChecked(id));
  const countMet=checkedCount>=minCount;
  const greenLight=reqMet&&countMet;
  const pct=totalItems?Math.round((checkedCount/totalItems)*100):0;

  // colour per progress
  const barCol=greenLight?C.green:pct>=Math.round((minCount/totalItems)*100)?C.yellow:C.red;
  const statusIcon=greenLight?"🟢":countMet&&!reqMet?"🟡":"🔴";
  const statusText=greenLight?"CLEAR TO ENTER":(!countMet)?`NEED ${minCount - checkedCount} MORE CONFLUENCE${minCount-checkedCount!==1?"S":""}`:("REQUIRED CONFLUENCE MISSING");

  function toggleRequired(id){
    const updated=required.includes(id)?required.filter(r=>r!==id):[...required,id];
    const u={...stratThresholds,[activeStrategy]:{...thresh,required:updated}};
    saveStratThresholds(u);
  }
  function setMin(val){
    const v=Math.max(1,Math.min(totalItems,parseInt(val)||1));
    const u={...stratThresholds,[activeStrategy]:{...thresh,minCount:v}};
    saveStratThresholds(u);
  }

  return(
    <div>
      {/* Score card */}
      <div style={{background:C.panel,border:`2px solid ${greenLight?C.green:barCol+"60"}`,borderRadius:"12px",padding:"14px",marginBottom:"8px",transition:"border-color 0.3s"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"12px"}}>
          <div>
            <div style={{fontSize:"8px",color:C.muted,letterSpacing:"0.14em",marginBottom:"4px"}}>CONFLUENCE SCORE</div>
            <div style={{display:"flex",alignItems:"baseline",gap:"4px"}}>
              <span style={{fontSize:"28px",fontWeight:700,color:barCol,lineHeight:1}}>{checkedCount}</span>
              <span style={{fontSize:"14px",color:C.muted}}>/ {totalItems}</span>
            </div>
            <div style={{fontSize:"9px",color:C.muted,marginTop:"3px"}}>Min required: <span style={{color:barCol,fontWeight:700}}>{minCount}</span></div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:"22px",marginBottom:"4px"}}>{statusIcon}</div>
            <div style={{fontSize:"9px",fontWeight:700,color:barCol,letterSpacing:"0.06em",maxWidth:"120px",textAlign:"right",lineHeight:1.4}}>{statusText}</div>
          </div>
        </div>
        {/* Progress bar */}
        <div style={{position:"relative",background:C.panel2,borderRadius:"6px",height:"10px",overflow:"hidden"}}>
          <div style={{background:barCol,height:"10px",borderRadius:"6px",width:`${pct}%`,transition:"width 0.35s ease"}}/>
          {/* threshold marker */}
          <div style={{position:"absolute",top:0,bottom:0,left:`${Math.round((minCount/totalItems)*100)}%`,width:"2px",background:"#fff",opacity:0.5}}/>
        </div>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:"5px"}}>
          <span style={{fontSize:"8px",color:C.muted}}>{pct}% met</span>
          <span style={{fontSize:"8px",color:C.muted}}>threshold: {Math.round((minCount/totalItems)*100)}%</span>
        </div>
        {/* Required badges */}
        {required.length>0&&(
          <div style={{marginTop:"10px",paddingTop:"10px",borderTop:`1px solid ${C.border}`}}>
            <div style={{fontSize:"8px",color:C.muted,letterSpacing:"0.1em",marginBottom:"6px"}}>MUST-HAVE CONFLUENCES</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:"5px"}}>
              {required.map(rid=>{
                const item=checkItems.find(i=>i.id===rid);
                if(!item)return null;
                const met=isChecked(rid);
                return <span key={rid} style={{background:met?`${C.green}18`:`${C.red}15`,border:`1px solid ${met?C.green:C.red}40`,borderRadius:"5px",padding:"3px 8px",fontSize:"9px",color:met?C.green:C.red,fontWeight:700}}>{met?"✓":"✕"} {item.text.split("(")[0].trim()}</span>;
              })}
            </div>
          </div>
        )}
        {/* Edit button */}
        <button onClick={()=>setEditMode(!editMode)} style={{marginTop:"12px",width:"100%",background:"none",border:`1px dashed ${C.border2}`,borderRadius:"7px",padding:"8px",fontSize:"9px",color:C.muted,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.08em",transition:"border-color 0.15s"}}>
          {editMode?"▲ CLOSE SETTINGS":"⚙ ENTRY RULE SETTINGS"}
        </button>
      </div>

      {/* Settings panel */}
      {editMode&&(
        <div style={{background:C.panel,border:`1px solid ${accentCol}30`,borderRadius:"12px",padding:"14px",marginBottom:"8px"}}>
          <div style={{fontSize:"9px",color:accentCol,letterSpacing:"0.12em",fontWeight:700,marginBottom:"14px"}}>⚙ ENTRY RULES — {activeStrategy.split("(")[0].trim().toUpperCase()}</div>

          {/* Min count slider */}
          <div style={{marginBottom:"16px"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:"8px"}}>
              <label style={{fontSize:"10px",color:C.text,fontWeight:600}}>Minimum confluences to enter</label>
              <span style={{fontSize:"13px",fontWeight:700,color:accentCol}}>{minCount} / {totalItems}</span>
            </div>
            <input type="range" min={1} max={totalItems} value={minCount} onChange={e=>setMin(e.target.value)} style={{width:"100%",accentColor:accentCol,cursor:"pointer"}}/>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:"3px"}}>
              <span style={{fontSize:"8px",color:C.dim}}>1 (lenient)</span>
              <span style={{fontSize:"8px",color:C.dim}}>{totalItems} (strict)</span>
            </div>
          </div>

          {/* Required toggles */}
          <div>
            <div style={{fontSize:"9px",color:C.muted,letterSpacing:"0.1em",fontWeight:700,marginBottom:"8px"}}>MARK AS REQUIRED (must-have)</div>
            <div style={{fontSize:"9px",color:C.dim,marginBottom:"10px",lineHeight:1.5}}>Toggle any confluence as required — the green light will only fire if these are checked, regardless of your minimum count.</div>
            {checkItems.map(item=>{
              const isReq=required.includes(item.id);
              return(
                <div key={item.id} onClick={()=>toggleRequired(item.id)} style={{display:"flex",alignItems:"center",gap:"10px",padding:"9px 10px",marginBottom:"5px",background:isReq?`${accentCol}10`:C.panel2,border:`1px solid ${isReq?accentCol+"40":C.border}`,borderRadius:"8px",cursor:"pointer",transition:"all 0.15s"}}>
                  <div style={{width:"18px",height:"18px",borderRadius:"4px",border:`2px solid ${isReq?accentCol:C.border2}`,background:isReq?`${accentCol}25`:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"all 0.15s"}}>
                    {isReq&&<span style={{color:accentCol,fontSize:"10px",lineHeight:1}}>★</span>}
                  </div>
                  <span style={{fontSize:"11px",color:isReq?C.text:C.muted,fontWeight:isReq?600:400,lineHeight:1.4,flex:1}}>{item.text}</span>
                  <span style={{fontSize:"9px",color:isReq?accentCol:C.dim,fontWeight:700,whiteSpace:"nowrap"}}>{isReq?"REQUIRED":"OPTIONAL"}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── TRADING CIRCLES ──────────────────────────────────────────────────────────
function TradingCircles({myCircles,circlesView,setCirclesView,activeCircle,setActiveCircle,circleForm,setCircleForm,circleJoinCode,setCircleJoinCode,circleMsg,setCircleMsg,createCircle,joinCircle,publishToCircle,fetchCircleLeaderboard,profile,getMyCode,showToast,wins,losses,total,winRate,totalPnL,pnlPos,avgRR,streak,STRATEGY_NAMES,STRATEGIES,C,inp,sel,lbl}){
  const [leaderboard,setLeaderboard]=useState([]);
  const [loadingLB,setLoadingLB]=useState(false);

  async function openCircle(circle){
    setActiveCircle(circle);
    setCirclesView("detail");
    setLoadingLB(true);
    const entries=await fetchCircleLeaderboard(circle);
    setLeaderboard(entries);
    setLoadingLB(false);
  }

  const MEDALS=["🥇","🥈","🥉"];

  return(
    <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>

      {/* ── BROWSE ── */}
      {circlesView==="browse"&&(
        <>
          {/* Header card */}
          <div style={{background:`linear-gradient(135deg,${C.accent}15 0%,${C.panel} 100%)`,border:`1px solid ${C.accent}30`,borderRadius:"12px",padding:"16px"}}>
            <div style={{fontSize:"18px",fontWeight:700,color:C.accent,letterSpacing:"0.08em",marginBottom:"4px"}}>◈ TRADING CIRCLES</div>
            <div style={{fontSize:"11px",color:C.text2,lineHeight:1.6}}>Create or join a circle to compete, compare stats, and level up with other traders.</div>
            <div style={{display:"flex",gap:"8px",marginTop:"12px"}}>
              <button onClick={()=>setCirclesView("create")} style={{flex:1,background:C.accent,color:"#000",border:"none",borderRadius:"8px",padding:"11px",fontSize:"11px",fontWeight:700,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.06em"}}>+ CREATE CIRCLE</button>
              <button onClick={()=>setCirclesView("join")} style={{flex:1,background:"transparent",color:C.accent,border:`1px solid ${C.accent}`,borderRadius:"8px",padding:"11px",fontSize:"11px",fontWeight:700,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.06em"}}>⤵ JOIN CIRCLE</button>
            </div>
          </div>

          {/* My circles */}
          {myCircles.length>0?(
            <div>
              <div style={{fontSize:"8px",color:C.muted,letterSpacing:"0.14em",marginBottom:"8px",fontWeight:700}}>MY CIRCLES ({myCircles.length})</div>
              {myCircles.map(circle=>(
                <div key={circle.id} className="row-hvr" onClick={()=>openCircle(circle)} style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:"10px",padding:"13px",marginBottom:"7px",cursor:"pointer"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"8px"}}>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:"7px",marginBottom:"3px"}}>
                        <span style={{fontSize:"16px"}}>◈</span>
                        <span style={{fontSize:"14px",fontWeight:700,color:C.text}}>{circle.name}</span>
                        {circle.isOwner&&<span style={{fontSize:"8px",background:`${C.accent}15`,color:C.accent,border:`1px solid ${C.accent}30`,borderRadius:"4px",padding:"1px 6px",fontWeight:700}}>OWNER</span>}
                      </div>
                      {circle.description&&<div style={{fontSize:"10px",color:C.muted,lineHeight:1.5}}>{circle.description}</div>}
                    </div>
                    <span style={{fontSize:"10px",color:C.muted}}>›</span>
                  </div>
                  <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
                    <span style={{fontSize:"9px",background:C.panel2,border:`1px solid ${C.border2}`,borderRadius:"5px",padding:"3px 8px",color:C.muted}}>👥 {circle.members?.length||1} members</span>
                    {circle.strategy&&<span style={{fontSize:"9px",background:C.panel2,border:`1px solid ${C.border2}`,borderRadius:"5px",padding:"3px 8px",color:C.muted}}>{STRATEGIES[circle.strategy]?.icon} {circle.strategy.split("(")[0].trim()}</span>}
                    <span style={{fontSize:"9px",background:circle.privacy==="public"?`${C.green}15`:`${C.yellow}15`,border:`1px solid ${circle.privacy==="public"?C.green:C.yellow}30`,borderRadius:"5px",padding:"3px 8px",color:circle.privacy==="public"?C.green:C.yellow}}>{circle.privacy==="public"?"🌐 Public":"🔒 Private"}</span>
                  </div>
                </div>
              ))}
            </div>
          ):(
            <div style={{textAlign:"center",padding:"32px 0",border:`1px dashed ${C.border2}`,borderRadius:"12px"}}>
              <div style={{fontSize:"28px",marginBottom:"10px"}}>◈</div>
              <div style={{fontSize:"11px",color:C.muted,lineHeight:1.8}}>No circles yet.<br/>Create one or join with a code.</div>
            </div>
          )}
        </>
      )}

      {/* ── CREATE ── */}
      {circlesView==="create"&&(
        <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
            <button onClick={()=>setCirclesView("browse")} style={{background:"none",border:`1px solid ${C.border2}`,borderRadius:"7px",padding:"7px 11px",color:C.muted,fontSize:"11px",cursor:"pointer",fontFamily:"inherit"}}>‹</button>
            <span style={{fontSize:"11px",fontWeight:700,color:C.accent,letterSpacing:"0.1em"}}>CREATE A CIRCLE</span>
          </div>
          <div><label style={lbl}>Circle Name</label><input value={circleForm.name} onChange={e=>setCircleForm(f=>({...f,name:e.target.value}))} placeholder="e.g. London ICT Traders" style={inp}/></div>
          <div><label style={lbl}>Description (optional)</label><textarea value={circleForm.description} onChange={e=>setCircleForm(f=>({...f,description:e.target.value}))} placeholder="What's this circle about?" rows={2} style={{...inp,resize:"vertical",lineHeight:1.6}}/></div>
          <div><label style={lbl}>Strategy Focus (optional)</label><select value={circleForm.strategy} onChange={e=>setCircleForm(f=>({...f,strategy:e.target.value}))} style={sel}><option value="">Any strategy</option>{STRATEGY_NAMES.map(s=><option key={s}>{s}</option>)}</select></div>
          <div><label style={lbl}>Privacy</label>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
              {[["public","🌐 Public","Anyone with the code can join"],["private","🔒 Private","Invite only"]].map(([val,label,desc])=>(
                <div key={val} onClick={()=>setCircleForm(f=>({...f,privacy:val}))} style={{background:circleForm.privacy===val?`${C.accent}12`:C.panel2,border:`1px solid ${circleForm.privacy===val?C.accent:C.border2}`,borderRadius:"8px",padding:"10px 12px",cursor:"pointer",transition:"all 0.15s"}}>
                  <div style={{fontSize:"11px",fontWeight:700,color:circleForm.privacy===val?C.accent:C.text,marginBottom:"2px"}}>{label}</div>
                  <div style={{fontSize:"9px",color:C.muted}}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
          <button onClick={createCircle} style={{background:circleForm.name.trim()?C.accent:"#222",color:circleForm.name.trim()?"#000":C.muted,border:"none",borderRadius:"10px",padding:"14px",fontSize:"12px",fontWeight:700,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.08em",transition:"all 0.15s"}}>CREATE CIRCLE</button>
        </div>
      )}

      {/* ── JOIN ── */}
      {circlesView==="join"&&(
        <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
            <button onClick={()=>setCirclesView("browse")} style={{background:"none",border:`1px solid ${C.border2}`,borderRadius:"7px",padding:"7px 11px",color:C.muted,fontSize:"11px",cursor:"pointer",fontFamily:"inherit"}}>‹</button>
            <span style={{fontSize:"11px",fontWeight:700,color:C.accent,letterSpacing:"0.1em"}}>JOIN A CIRCLE</span>
          </div>
          <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:"10px",padding:"14px"}}>
            <div style={{fontSize:"10px",color:C.text2,lineHeight:1.7,marginBottom:"12px"}}>Ask the circle owner for their invite code, then enter it below.</div>
            <div><label style={lbl}>Circle Code</label>
              <div style={{display:"flex",gap:"7px"}}>
                <input value={circleJoinCode} onChange={e=>setCircleJoinCode(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&joinCircle()} placeholder="CIRCLE-XXXX" style={{...inp,flex:1,letterSpacing:"0.08em"}}/>
                <button onClick={joinCircle} style={{background:C.accent,color:"#000",border:"none",borderRadius:"8px",padding:"0 16px",fontSize:"11px",fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>JOIN</button>
              </div>
            </div>
            {circleMsg&&<div style={{fontSize:"10px",color:circleMsg.includes("🎉")?C.green:C.red,marginTop:"8px"}}>{circleMsg}</div>}
          </div>
        </div>
      )}

      {/* ── CIRCLE DETAIL / LEADERBOARD ── */}
      {circlesView==="detail"&&activeCircle&&(
        <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
            <button onClick={()=>{setCirclesView("browse");setActiveCircle(null);setLeaderboard([]);}} style={{background:"none",border:`1px solid ${C.border2}`,borderRadius:"7px",padding:"7px 11px",color:C.muted,fontSize:"11px",cursor:"pointer",fontFamily:"inherit"}}>‹</button>
            <div style={{flex:1}}>
              <div style={{fontSize:"13px",fontWeight:700,color:C.text}}>{activeCircle.name}</div>
              <div style={{fontSize:"9px",color:C.muted}}>{activeCircle.members?.length||1} members · {activeCircle.code}</div>
            </div>
          </div>

          {/* Circle info */}
          {activeCircle.description&&<div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:"10px",padding:"12px 14px",fontSize:"11px",color:C.text2,lineHeight:1.6}}>{activeCircle.description}</div>}

          {/* Publish my stats */}
          <div style={{background:`${C.accent}10`,border:`1px solid ${C.accent}25`,borderRadius:"10px",padding:"13px 14px"}}>
            <div style={{fontSize:"9px",color:C.accent,letterSpacing:"0.12em",fontWeight:700,marginBottom:"8px"}}>YOUR STATS TO PUBLISH</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"6px",marginBottom:"12px"}}>
              {[["W/L",`${wins}/${losses}`],["WR",`${winRate}%`],["P&L",`${pnlPos?"+":""}${totalPnL}R`],["R:R",avgRR==="—"?"—":`${avgRR}R`]].map(([k,v])=>(
                <div key={k} style={{background:C.panel,borderRadius:"7px",padding:"7px 6px",textAlign:"center",border:`1px solid ${C.border}`}}>
                  <div style={{fontSize:"8px",color:C.muted,marginBottom:"2px"}}>{k}</div>
                  <div style={{fontSize:"11px",fontWeight:700,color:C.text}}>{v}</div>
                </div>
              ))}
            </div>
            <button onClick={()=>publishToCircle(activeCircle.code)} style={{width:"100%",background:C.accent,color:"#000",border:"none",borderRadius:"8px",padding:"11px",fontSize:"11px",fontWeight:700,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.06em"}}>📤 PUBLISH MY STATS</button>
          </div>

          {/* Leaderboard */}
          <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:"10px",overflow:"hidden"}}>
            <div style={{padding:"12px 14px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:"9px",color:C.muted,letterSpacing:"0.14em",fontWeight:700}}>🏆 LEADERBOARD</span>
              <button onClick={async()=>{setLoadingLB(true);const e=await fetchCircleLeaderboard(activeCircle);setLeaderboard(e);setLoadingLB(false);}} style={{background:"none",border:`1px solid ${C.border2}`,borderRadius:"5px",color:C.muted,fontSize:"9px",padding:"4px 9px",cursor:"pointer",fontFamily:"inherit"}}>↻ REFRESH</button>
            </div>
            {loadingLB?(
              <div style={{padding:"24px",textAlign:"center",color:C.muted,fontSize:"10px"}}>Loading...</div>
            ):leaderboard.length===0?(
              <div style={{padding:"24px",textAlign:"center",color:C.muted,fontSize:"10px"}}>No stats published yet. Be the first!</div>
            ):(
              leaderboard.map((entry,i)=>{
                const isMe=entry.memberCode===getMyCode();
                const medal=MEDALS[i]||null;
                const pPos=entry.totalPnL>=0;
                return(
                  <div key={entry.memberCode} style={{padding:"12px 14px",borderBottom:`1px solid ${C.border}`,background:isMe?`${C.accent}08`:"transparent",display:"flex",alignItems:"center",gap:"10px"}}>
                    {/* Rank */}
                    <div style={{width:"28px",textAlign:"center",flexShrink:0}}>
                      {medal?<span style={{fontSize:"18px"}}>{medal}</span>:<span style={{fontSize:"13px",fontWeight:700,color:C.muted}}>#{i+1}</span>}
                    </div>
                    {/* Avatar */}
                    <AvatarCircle name={entry.name} avatar={entry.avatar} size={34} color={isMe?C.accent:C.muted}/>
                    {/* Info */}
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:"5px",marginBottom:"2px"}}>
                        <span style={{fontSize:"12px",fontWeight:700,color:isMe?C.accent:C.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{entry.name}</span>
                        {isMe&&<span style={{fontSize:"8px",background:`${C.accent}20`,color:C.accent,border:`1px solid ${C.accent}30`,borderRadius:"4px",padding:"1px 5px",fontWeight:700,flexShrink:0}}>YOU</span>}
                      </div>
                      <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
                        <span style={{fontSize:"9px",color:C.muted}}>{entry.total} trades</span>
                        <span style={{fontSize:"9px",color:entry.winRate>=50?C.green:C.red,fontWeight:700}}>{entry.winRate.toFixed(0)}% WR</span>
                        {entry.topStrategy&&<span style={{fontSize:"9px",color:C.muted}}>{STRATEGIES[entry.topStrategy]?.icon}</span>}
                        {entry.streak&&entry.streak.count>=2&&<span style={{fontSize:"9px",color:entry.streak.type==="Win"?C.green:C.red,fontWeight:700}}>{entry.streak.count}{entry.streak.type==="Win"?"W":"L"} 🔥</span>}
                      </div>
                    </div>
                    {/* P&L */}
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontSize:"14px",fontWeight:700,color:pPos?C.green:C.red,lineHeight:1}}>{pPos?"+":""}{entry.totalPnL.toFixed(1)}R</div>
                      <div style={{fontSize:"8px",color:C.muted,marginTop:"2px"}}>{entry.avgRR?`${entry.avgRR.toFixed(1)}R avg`:""}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Invite */}
          <div style={{background:C.panel,border:`1px solid ${C.border}`,borderRadius:"10px",padding:"13px 14px"}}>
            <div style={{fontSize:"9px",color:C.muted,letterSpacing:"0.12em",marginBottom:"8px",fontWeight:700}}>INVITE LINK</div>
            <div style={{display:"flex",gap:"6px",alignItems:"center"}}>
              <div style={{flex:1,background:C.panel2,border:`1px solid ${C.border2}`,borderRadius:"7px",padding:"9px 12px",fontSize:"12px",fontWeight:700,color:C.accent,letterSpacing:"0.08em"}}>{activeCircle.code}</div>
              <button onClick={()=>{navigator.clipboard?.writeText(activeCircle.code);showToast("Code copied 📋");}} style={{background:C.accent,color:"#000",border:"none",borderRadius:"7px",padding:"9px 14px",fontSize:"10px",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>COPY</button>
            </div>
            <div style={{fontSize:"9px",color:C.dim,marginTop:"6px"}}>Share this code so others can join your circle.</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── FRIENDS FEED COMPONENT ───────────────────────────────────────────────────
function FriendsFeed({friends,friendFeed,showAddFriend,setShowAddFriend,friendCodeInput,setFriendCodeInput,friendMsg,addFriend,removeFriend,publishFeed,refreshFeed,reactToFeed,getMyCode,profile,C,REACTIONS,STRATEGIES}){
  const inp={background:C.inputBg,border:`1px solid ${C.border2}`,borderRadius:"8px",color:C.text,padding:"10px 12px",fontSize:"13px",width:"100%",outline:"none",fontFamily:"'IBM Plex Mono',monospace",boxSizing:"border-box"};
  return(
    <div style={{marginTop:"4px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
        <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
          <span style={{fontSize:"8px",color:C.muted,letterSpacing:"0.14em"}}>FRIENDS FEED</span>
          {friends.length>0&&<span style={{fontSize:"9px",color:C.accent,background:`${C.accent}12`,border:`1px solid ${C.accent}30`,borderRadius:"10px",padding:"1px 7px"}}>{friends.length}</span>}
        </div>
        <div style={{display:"flex",gap:"6px"}}>
          {friends.length>0&&<button onClick={async()=>{await publishFeed();await refreshFeed();}} className="hvr" style={{background:"none",border:`1px solid ${C.border2}`,borderRadius:"16px",color:C.muted,fontSize:"9px",padding:"5px 10px",cursor:"pointer",fontFamily:"inherit"}}>↻</button>}
          <button onClick={()=>setShowAddFriend(!showAddFriend)} style={{background:showAddFriend?C.accent:"transparent",color:showAddFriend?"#000":C.accent,border:`1px solid ${C.accent}`,borderRadius:"16px",fontSize:"9px",fontWeight:700,padding:"5px 12px",cursor:"pointer",fontFamily:"inherit"}}>+ FRIEND</button>
        </div>
      </div>
      {showAddFriend&&(
        <div style={{background:C.panel,border:`1px solid ${C.accent}22`,borderRadius:"10px",padding:"14px",marginBottom:"10px"}}>
          <div style={{background:`${C.accent}10`,border:`1px solid ${C.accent}25`,borderRadius:"8px",padding:"10px 12px",marginBottom:"12px"}}>
            <div style={{fontSize:"8px",color:C.muted,letterSpacing:"0.12em",marginBottom:"5px"}}>YOUR CODE</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:"14px",fontWeight:700,color:C.accent,letterSpacing:"0.1em"}}>{getMyCode()}</span><button onClick={async()=>{await publishFeed();}} style={{background:`${C.accent}15`,border:`1px solid ${C.accent}30`,borderRadius:"5px",color:C.accent,fontSize:"9px",padding:"5px 9px",cursor:"pointer",fontFamily:"inherit"}}>PUBLISH</button></div>
          </div>
          <div style={{marginBottom:"8px"}}>
            <div style={{fontSize:"9px",color:C.muted,letterSpacing:"0.12em",marginBottom:"5px",fontWeight:700}}>FRIEND'S CODE</div>
            <div style={{display:"flex",gap:"6px"}}><input value={friendCodeInput} onChange={e=>setFriendCodeInput(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&addFriend()} placeholder="HANDLE-XXXXXX" style={{...inp,flex:1,letterSpacing:"0.08em"}}/><button onClick={addFriend} style={{background:C.accent,color:"#000",border:"none",borderRadius:"6px",padding:"0 14px",fontSize:"10px",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>ADD</button></div>
          </div>
          {friendMsg&&<div style={{fontSize:"10px",color:C.green,marginTop:"4px"}}>{friendMsg}</div>}
          {friends.length>0&&<div style={{marginTop:"12px",borderTop:`1px solid ${C.border}`,paddingTop:"10px"}}><div style={{fontSize:"8px",color:C.muted,letterSpacing:"0.12em",marginBottom:"8px"}}>FOLLOWING ({friends.length})</div>{friends.map(f=><div key={f.code} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderBottom:`1px solid ${C.border}`}}><div style={{display:"flex",alignItems:"center",gap:"8px"}}><AvatarCircle name={f.name} size={26} color={C.accent}/><div><div style={{fontSize:"11px",fontWeight:700,color:C.text}}>{f.name}</div><div style={{fontSize:"9px",color:C.muted}}>{f.code}</div></div></div><button onClick={()=>removeFriend(f.code)} className="hvr" style={{background:"none",border:`1px solid ${C.red}40`,borderRadius:"4px",color:C.red,fontSize:"8px",padding:"4px 8px",cursor:"pointer",fontFamily:"inherit"}}>REMOVE</button></div>)}</div>}
        </div>
      )}
      {friends.length===0&&!showAddFriend&&<div style={{textAlign:"center",padding:"24px 0",border:`1px dashed ${C.border2}`,borderRadius:"10px"}}><div style={{fontSize:"22px",marginBottom:"8px"}}>👥</div><div style={{fontSize:"11px",color:C.muted,lineHeight:1.7}}>No friends yet.<br/>Add a friend to see their trades here.</div></div>}
            {friendFeed.length>0&&(
        <div style={{display:"flex",flexDirection:"column",gap:"8px"}}>
          {friendFeed.map((item,i)=>{
            const totalR=Object.values(item.reactions||{}).reduce((a,b)=>a+b,0);
            const sc=item.strategy?(STRATEGIES[item.strategy]?STRATEGIES[item.strategy].color:C.accent):C.accent;
            return(
              <div key={item.authorCode+"-"+item.tradeId+"-"+i} style={{background:C.panel,border:"1px solid "+C.border,borderRadius:"10px",padding:"12px 13px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                    <AvatarCircle name={item.authorName} avatar={item.authorAvatar} size={30} color={sc}/>
                    <div>
                      <div style={{fontSize:"11px",fontWeight:700,color:C.text}}>{item.authorName}</div>
                      <div style={{fontSize:"9px",color:C.muted}}>{item.authorHandle||"@trader"}</div>
                    </div>
                  </div>
                  <span style={{fontSize:"8px",color:C.muted}}>{item.date}</span>
                </div>
                <div style={{display:"flex",gap:"7px",alignItems:"center",marginBottom:item.notes?"8px":"10px"}}>
                  <span style={{fontSize:"14px",fontWeight:700,color:C.text}}>{item.pair||"—"}</span>
                  {item.strategy&&<span>{STRATEGIES[item.strategy]?STRATEGIES[item.strategy].icon:""}</span>}
                  {item.rr&&<span style={{fontSize:"10px",color:sc,fontWeight:700,marginLeft:"auto"}}>{item.rr}R</span>}
                  {item.pnl&&<span style={{fontSize:"11px",fontWeight:700,color:parseFloat(item.pnl)>=0?C.green:C.red}}>{parseFloat(item.pnl)>=0?"+":""}{item.pnl}R</span>}
                </div>
                {item.notes&&<div style={{fontSize:"11px",color:C.text2,lineHeight:1.6,marginBottom:"10px",borderLeft:"2px solid "+C.border2,paddingLeft:"9px"}}>{item.notes.slice(0,140)}{item.notes.length>140?"…":""}</div>}
                <div style={{display:"flex",gap:"5px",flexWrap:"wrap",alignItems:"center"}}>
                  {REACTIONS.map(emoji=>{
                    const count=(item.reactions||{})[emoji]||0;
                    return(
                      <button key={emoji} className="rbtn" onClick={()=>reactToFeed(item.authorCode,item.tradeId,emoji)} style={{background:count>0?C.accent+"12":C.panel2,border:"1px solid "+(count>0?C.accent+"30":C.border),borderRadius:"20px",padding:"4px 7px",cursor:"pointer",fontSize:"12px",display:"flex",alignItems:"center",gap:"3px",transition:"transform 0.1s",fontFamily:"inherit"}}>
                        <span>{emoji}</span>
                        {count>0&&<span style={{fontSize:"9px",color:C.accent,fontWeight:700}}>{count}</span>}
                      </button>
                    );
                  })}
                  {item.comments>0&&<span style={{marginLeft:"auto",fontSize:"9px",color:C.muted}}>{"💬 "+item.comments}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {friends.length>0&&friendFeed.length===0&&!showAddFriend&&<div style={{textAlign:"center",padding:"20px 0",border:`1px dashed ${C.border2}`,borderRadius:"10px"}}><div style={{fontSize:"11px",color:C.muted,lineHeight:1.7}}>Ask friends to publish, then hit ↻</div></div>}
    </div>
  );
}
