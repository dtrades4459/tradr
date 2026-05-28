import { useState } from "react";
import type { Trade } from "./types";
import { MONO, BODY, DISPLAY, stratCode, stratShort } from "./shared";
import type { Insight } from "./types";
import type { Theme } from "./theme";
import type React from "react";

type ChartProps = { trades: Trade[]; C: Theme };

// ─── AI INSIGHTS ─────────────────────────────────────────────────────────────
export function generateInsights(trades: Trade[]): Insight[] {
  const insights: Insight[] = [];
  if (!trades.length) return [{ kicker: "START", text: "Log your first trade to get personalised feedback.", type: "info" }];
  const wins = trades.filter(t => t.outcome === "Win").length;
  const losses = trades.filter(t => t.outcome === "Loss").length;
  const wr = trades.length ? wins / trades.length : 0;
  const sesStats: Record<string, { w: number; total: number }> = {};
  trades.forEach(t => { if (!t.session) return; if (!sesStats[t.session]) sesStats[t.session] = { w: 0, total: 0 }; if (t.outcome === "Win") sesStats[t.session].w++; sesStats[t.session].total++; });
  const SESSION_MIN = 10;
  Object.entries(sesStats).forEach(([ses, v]) => {
    const swr = v.w / v.total;
    if (v.total >= SESSION_MIN && swr < wr - 0.15) insights.push({ kicker: "WARN", text: `Your ${ses} session win rate (${(swr * 100).toFixed(0)}%) is below your average. Consider trading fewer setups here.`, type: "warning" });
    if (v.total >= SESSION_MIN && swr > wr + 0.15) insights.push({ kicker: "NOTE", text: `${ses} is your best session with a ${(swr * 100).toFixed(0)}% win rate. Prioritise it.`, type: "positive" });
  });
  const stratS: Record<string, { w: number; total: number; pnl: number }> = {};
  trades.forEach(t => { if (!t.strategy) return; if (!stratS[t.strategy]) stratS[t.strategy] = { w: 0, total: 0, pnl: 0 }; if (t.outcome === "Win") stratS[t.strategy].w++; stratS[t.strategy].total++; stratS[t.strategy].pnl += parseFloat(t.pnl) || 0; });
  let bestStrat: string | null = null, bestWR = 0;
  Object.entries(stratS).forEach(([s, v]) => { const swr = v.total ? v.w / v.total : 0; if (v.total >= SESSION_MIN && swr > bestWR) { bestWR = swr; bestStrat = s; } });
  if (bestStrat) insights.push({ kicker: "EDGE", text: `${stratShort(bestStrat)} is your strongest strategy at ${(bestWR * 100).toFixed(0)}% win rate.`, type: "positive" });
  let streak = 0;
  for (const t of trades) { if (t.outcome === "Loss") streak++; else break; }
  if (streak >= 3) insights.push({ kicker: "STOP", text: `You're on a ${streak}-trade losing streak. Consider stepping back and reviewing your process.`, type: "danger" });
  const byDay: Record<string, number> = {};
  trades.forEach(t => { byDay[t.date] = (byDay[t.date] || 0) + 1; });
  const overtradeDays = Object.values(byDay).filter(c => c > 3).length;
  if (overtradeDays >= 2) insights.push({ kicker: "WARN", text: `You've exceeded 3 trades/day on ${overtradeDays} occasions. Overtrading may be hurting your results.`, type: "warning" });
  const rrTrades = trades.filter(t => t.rr);
  if (rrTrades.length >= SESSION_MIN) {
    const avgRR = rrTrades.reduce((a, t) => a + parseFloat(t.rr), 0) / rrTrades.length;
    if (avgRR < 1.5) insights.push({ kicker: "R:R", text: `Your average R:R is ${avgRR.toFixed(2)}. Aim for 2R+ to maintain positive expectancy even at 40% win rate.`, type: "warning" });
  }
  if (wr >= 0.6 && trades.length >= 20) insights.push({ kicker: "HOLD", text: `Solid consistency — ${(wr * 100).toFixed(0)}% win rate over ${trades.length} trades. Stay disciplined.`, type: "positive" });
  if (!insights.length) insights.push({ kicker: "OKAY", text: "No major issues detected. Keep journaling consistently for deeper insights.", type: "info" });
  return insights;
}
// ─── MINI SPARKLINE ──────────────────────────────────────────────────────────
export function MiniSparkline({ trades, C }: ChartProps) {
  if (trades.length < 2) return null;
  let r = 0;
  const pts = trades.slice().reverse().map(t => { r += parseFloat(t.pnl) || 0; return r; });
  const min = Math.min(...pts), max = Math.max(...pts), range = max - min || 1, w = 72, h = 20;
  const p = pts.map((v: number, i: number) => `${(i / (pts.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  return <svg width={w} height={h}><polyline points={p} fill="none" stroke={C.text} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

// ─── PNL CHART ───────────────────────────────────────────────────────────────
export function PnLChart({ trades, C }: ChartProps) {
  if (!trades.length) return null;
  let r = 0;
  const pts: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }];
  trades.slice().reverse().forEach((t, i) => { r += parseFloat(t.pnl) || 0; pts.push({ x: i + 1, y: r }); });
  const minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y)), rangeY = maxY - minY || 1;
  const W = 320, H = 96, PAD = 8;
  const cx = (x: number) => PAD + (x / (pts.length - 1 || 1)) * (W - PAD * 2);
  const cy = (y: number) => H - PAD - ((y - minY) / rangeY) * (H - PAD * 2);
  const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"}${cx(p.x)},${cy(p.y)}`).join(" ");
  const zeroY = cy(0);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
      {zeroY > PAD && zeroY < H - PAD && <line x1={PAD} y1={zeroY} x2={W - PAD} y2={zeroY} stroke={C.border} strokeWidth="1" strokeDasharray="2,3" />}
      <path d={pathD} fill="none" stroke={C.text} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      {pts[pts.length - 1] && <circle cx={cx(pts[pts.length - 1].x)} cy={cy(pts[pts.length - 1].y)} r="2" fill={C.text} />}
    </svg>
  );
}

// ─── MONTHLY PNL CHART ───────────────────────────────────────────────────────
export function MonthlyPnLChart({ trades, C }: ChartProps) {
  const monthly: Record<string, number> = {};
  trades.forEach(t => { const k = t.date?.slice(0, 7); if (k) { if (!monthly[k]) monthly[k] = 0; monthly[k] += parseFloat(t.pnl) || 0; } });
  const entries = Object.entries(monthly).sort(([a], [b]) => a.localeCompare(b)).slice(-6);
  if (entries.length < 2) return null;
  const vals = entries.map(([, v]) => v);
  const min = Math.min(...vals, 0), max = Math.max(...vals, 0), range = max - min || 1;
  const W = 320, H = 96, PAD = 8, barW = Math.max(14, (W - PAD * 2) / entries.length - 10);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H + 22}`}>
      {entries.map(([k, v], i) => {
        const x = PAD + i * (W - PAD * 2) / entries.length + (W - PAD * 2) / entries.length / 2 - barW / 2;
        const zeroY = H - PAD - ((0 - min) / range) * (H - PAD * 2);
        const barH = Math.abs((v / range) * (H - PAD * 2));
        const y = v >= 0 ? zeroY - barH : zeroY;
        const col = v >= 0 ? C.green : C.red;
        return (
          <g key={k}>
            <rect x={x} y={y} width={barW} height={Math.max(barH, 2)} fill={col} />
            <text x={x + barW / 2} y={H + 14} textAnchor="middle" fontSize="8" fill={C.muted} fontFamily="IBM Plex Mono" style={{ letterSpacing: "0.06em" }}>{k.slice(5)}</text>
          </g>
        );
      })}
      <line x1={PAD} y1={H - PAD - ((0 - min) / range) * (H - PAD * 2)} x2={W - PAD} y2={H - PAD - ((0 - min) / range) * (H - PAD * 2)} stroke={C.border} strokeWidth="1" strokeDasharray="2,3" />
    </svg>
  );
}

// ─── WIN RATE BAR CHART ──────────────────────────────────────────────────────
export function WinRateChart({ trades, C }: ChartProps) {
  const stratStats: Record<string, { w: number; total: number }> = {};
  trades.forEach(t => { if (!t.strategy) return; if (!stratStats[t.strategy]) stratStats[t.strategy] = { w: 0, total: 0 }; if (t.outcome === "Win") stratStats[t.strategy].w++; stratStats[t.strategy].total++; });
  const entries = Object.entries(stratStats).filter(([, v]) => v.total >= 1);
  if (!entries.length) return <div style={{ fontSize: "12px", color: C.muted, padding: "16px 0", fontFamily: BODY }}>Log trades with a strategy to see win rates.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      {entries.map(([s, v], idx) => {
        const wr = v.total ? v.w / v.total : 0;
        return (
          <div key={s}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" }}>
              <span style={{ fontSize: "11px", color: C.text, fontFamily: MONO, letterSpacing: "0.06em" }}>
                <span style={{ color: C.muted, marginRight: "10px" }}>{String(idx + 1).padStart(2, "0")}</span>
                {stratCode(s)} <span style={{ color: C.muted, marginLeft: "6px" }}>— {stratShort(s)}</span>
              </span>
              <span style={{ fontSize: "11px", color: C.text, fontFamily: MONO, letterSpacing: "0.06em" }}>{(wr * 100).toFixed(0)}% <span style={{ color: C.muted }}>({v.total})</span></span>
            </div>
            <div style={{ background: C.border, height: "2px", width: "100%" }}>
              <div style={{ background: C.text, height: "2px", width: `${wr * 100}%`, transition: "width 0.6s ease" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── DURATION HELPERS ────────────────────────────────────────────────────────
export const DURATION_BUCKETS = [
  { label: "Under 15 sec", min: 0, max: 15 },
  { label: "15-45 sec", min: 15, max: 45 },
  { label: "45 sec - 1 min", min: 45, max: 60 },
  { label: "1 min - 2 min", min: 60, max: 120 },
  { label: "2 min - 5 min", min: 120, max: 300 },
  { label: "5 min - 10 min", min: 300, max: 600 },
  { label: "10 min - 30 min", min: 600, max: 1800 },
  { label: "30 min - 1 hour", min: 1800, max: 3600 },
  { label: "1 hour - 2 hours", min: 3600, max: 7200 },
  { label: "2 hours - 4 hours", min: 7200, max: 14400 },
  { label: "4 hours and up", min: 14400, max: Infinity },
];

export function parseDurationSec(entryTime: string | undefined, exitTime: string | undefined): number | null {
  if (!entryTime || !exitTime) return null;
  const ep = entryTime.split(":"); const xp = exitTime.split(":");
  const eh = parseInt(ep[0]); const em = parseInt(ep[1]);
  const xh = parseInt(xp[0]); const xm = parseInt(xp[1]);
  if (isNaN(eh)||isNaN(em)||isNaN(xh)||isNaN(xm)) return null;
  const en = eh * 3600 + em * 60; let ex = xh * 3600 + xm * 60;
  if (ex < en) ex += 86400;
  return ex - en;
}

export function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec/60)}m ${sec%60}s`;
  return `${Math.floor(sec/3600)}h ${Math.floor((sec%3600)/60)}m`;
}

// ─── TRADE DURATION CHART ─────────────────────────────────────────────────────
export function TradeDurationChart({ trades, C }: ChartProps) {
  const withDur = trades.map(t => ({ ...t, _dur: parseDurationSec(t.entryTime, t.exitTime) })).filter(t => t._dur !== null);
  if (!withDur.length) return <div style={{ textAlign:"center", padding:"40px 0", color:C.muted, fontSize:"11px", fontFamily:MONO, letterSpacing:"0.06em" }}>ADD ENTRY + EXIT TIME WHEN LOGGING TRADES TO SEE DURATION ANALYSIS</div>;
  const bd = DURATION_BUCKETS.map(b => {
    const bk = withDur.filter(t => t._dur! >= b.min && t._dur! < b.max);
    const w = bk.filter(t => t.outcome === "Win").length;
    const l = bk.filter(t => t.outcome === "Loss").length;
    return { ...b, count: bk.length, wr: (w+l) > 0 ? Math.round(w/(w+l)*100) : null };
  });
  const mx = Math.max(...bd.map(b => b.count), 1);
  const LW = 124;
  const barRow = (label: string, pct: number, val: string, color: string) => (
    <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"7px" }}>
      <div style={{ width:`${LW}px`, fontSize:"9px", color:C.muted, fontFamily:MONO, textAlign:"right", flexShrink:0 }}>{label}</div>
      <div style={{ flex:1, height:"22px", background:C.panel2, borderRadius:"3px", overflow:"hidden" }}>
        {pct > 0 && <div style={{ height:"100%", width:`${Math.max(pct,5)}%`, background:color, borderRadius:"3px", display:"flex", alignItems:"center", paddingLeft:"6px" }}>
          <span style={{ fontFamily:MONO, fontSize:"10px", color:"#0C0C0B", fontWeight:700 }}>{val}</span>
        </div>}
      </div>
    </div>
  );
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
      <div style={{ background:C.panel, borderRadius:"10px", padding:"16px 14px" }}>
        <div style={{ fontFamily:BODY, fontWeight:700, fontSize:"14px", marginBottom:"12px", color:C.text }}>Trade Count</div>
        {bd.map(b => barRow(b.label, b.count/mx*100, String(b.count), "#5BC2E7"))}
      </div>
      <div style={{ background:C.panel, borderRadius:"10px", padding:"16px 14px" }}>
        <div style={{ fontFamily:BODY, fontWeight:700, fontSize:"14px", marginBottom:"12px", color:C.text }}>Win Rate</div>
        {bd.map(b => barRow(b.label, b.wr ?? 0, b.wr !== null && b.count > 0 ? String(b.wr) : "", C.green))}
      </div>
    </div>
  );
}

// ─── NET DAILY P&L ───────────────────────────────────────────────────────────
export function NetDailyPnLChart({ trades, C, useDollar }: ChartProps & { useDollar?: boolean }) {
  const dm: Record<string,number> = {};
  trades.forEach(t => { if (!t.date) return; dm[t.date] = (dm[t.date]||0) + (useDollar ? parseFloat(t.pnlDollar)||0 : parseFloat(t.pnl)||0); });
  const days = Object.keys(dm).sort().slice(-30);
  if (!days.length) return null;
  const vals = days.map(d => dm[d]);
  const maxA = Math.max(...vals.map(v => Math.abs(v)), 0.1);
  const bW = Math.max(12, Math.min(40, Math.floor(560/days.length)-3));
  return (
    <div style={{ background:C.panel, borderRadius:"10px", padding:"16px 14px" }}>
      <div style={{ fontFamily:BODY, fontWeight:700, fontSize:"14px", color:C.text, marginBottom:"4px" }}>Net Daily P&L</div>
      <div style={{ fontSize:"10px", color:C.muted, fontFamily:MONO, marginBottom:"12px", letterSpacing:"0.06em" }}>{useDollar?"DOLLAR":"R-MULTIPLE"} · LAST {days.length} DAYS</div>
      <div style={{ overflowX:"auto" }}>
        <div style={{ display:"flex", alignItems:"flex-end", gap:"3px", height:"100px", minWidth:`${days.length*(bW+3)}px` }}>
          {vals.map((v,i) => {
            const h = Math.max(Math.abs(v)/maxA*90,2);
            return <div key={days[i]} title={`${days[i]}: ${v>=0?"+":""}${v.toFixed(2)}`} style={{ flex:`0 0 ${bW}px`, height:"100%", display:"flex", alignItems:v>=0?"flex-end":"flex-start" }}>
              <div style={{ width:"100%", height:`${h}%`, background:v>=0?C.green:C.red, borderRadius:v>=0?"3px 3px 0 0":"0 0 3px 3px" }} />
            </div>;
          })}
        </div>
        <div style={{ display:"flex", gap:"3px", marginTop:"4px", minWidth:`${days.length*(bW+3)}px` }}>
          {days.map((d,i) => <div key={d} style={{ flex:`0 0 ${bW}px`, textAlign:"center", fontSize:"8px", color:C.muted, fontFamily:MONO }}>{i%Math.max(1,Math.floor(days.length/7))===0?d.slice(5):""}</div>)}
        </div>
      </div>
    </div>
  );
}

// ─── CUMULATIVE P&L LINE ─────────────────────────────────────────────────────
export function DailyCumulativePnLChart({ trades, C, useDollar }: ChartProps & { useDollar?: boolean }) {
  const dm: Record<string,number> = {};
  trades.forEach(t => { if (!t.date) return; dm[t.date] = (dm[t.date]||0) + (useDollar ? parseFloat(t.pnlDollar)||0 : parseFloat(t.pnl)||0); });
  const days = Object.keys(dm).sort();
  if (days.length < 2) return null;
  let cum = 0;
  const pts = days.map(d => { cum += dm[d]; return cum; });
  const minV = Math.min(...pts, 0); const maxV = Math.max(...pts, 0.01); const range = maxV - minV || 1;
  const W=520,H=100,P=6;
  const toX = (i: number) => P + i*(W-P*2)/Math.max(pts.length-1,1);
  const toY = (v: number) => P + (maxV-v)/range*(H-P*2);
  const ln = pts.map((v,i)=>`${i===0?"M":"L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  const z0 = toY(0);
  const fill = `${ln} L${toX(pts.length-1).toFixed(1)},${z0.toFixed(1)} L${toX(0).toFixed(1)},${z0.toFixed(1)} Z`;
  const last = pts[pts.length-1]; const pos = last >= 0;
  return (
    <div style={{ background:C.panel, borderRadius:"10px", padding:"16px 14px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:"4px" }}>
        <div style={{ fontFamily:BODY, fontWeight:700, fontSize:"14px", color:C.text }}>Daily Cumulative PnL</div>
        <div style={{ fontFamily:MONO, fontSize:"12px", color:pos?C.green:C.red }}>{pos?"+":""}{last.toFixed(2)}{useDollar?"$":"R"}</div>
      </div>
      <div style={{ fontSize:"10px", color:C.muted, fontFamily:MONO, marginBottom:"10px", letterSpacing:"0.06em" }}>{useDollar?"DOLLAR":"R-MULTIPLE"}</div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display:"block", height:"100px" }}>
        <line x1={P} y1={z0} x2={W-P} y2={z0} stroke={C.border2} strokeWidth="1" strokeDasharray="4,3"/>
        <path d={fill} fill={pos?C.green:C.red} fillOpacity="0.12"/>
        <path d={ln} fill="none" stroke={pos?C.green:C.red} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
        <circle cx={toX(pts.length-1)} cy={toY(last)} r="3.5" fill={pos?C.green:C.red}/>
      </svg>
    </div>
  );
}

// ─── TRADE STAT CARDS ────────────────────────────────────────────────────────
export function TradeStatCards({ trades, C }: ChartProps) {
  const withDur = trades.map(t => ({...t, _d: parseDurationSec(t.entryTime,t.exitTime)})).filter(t => t._d !== null);
  const avgSec = withDur.length ? Math.round(withDur.reduce((a,t)=>a+t._d!,0)/withDur.length) : null;
  const dm: Record<string,number> = {};
  trades.forEach(t => { if (t.date) dm[t.date] = (dm[t.date]||0)+(parseFloat(t.pnl)||0); });
  const tot = Object.values(dm).reduce((a,v)=>a+v,0);
  const best = Math.max(...Object.values(dm),0);
  const pct = tot>0 ? Math.round(best/tot*100) : 0;
  const DNS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const dc: Record<string,number> = {};
  trades.forEach(t => { if (!t.date) return; const n=DNS[new Date(t.date+"T12:00:00").getDay()]; dc[n]=(dc[n]||0)+1; });
  const mad = Object.keys(dc).sort((a,b)=>dc[b]-dc[a])[0]||"—";
  const bde = Object.entries(dm).sort((a,b)=>b[1]-a[1])[0];
  const bdt = bde ? trades.filter(t=>t.date===bde[0]) : [];
  const cards: Array<{label:string;value:string;sub?:string}> = [
    {label:"Total Number Of Trades",value:String(trades.length)},
    {label:"Avg. Trade Duration",value:avgSec!==null?fmtDuration(avgSec):"—"},
    {label:"Best Day % Of Total Profit",value:String(pct)},
    {label:"Most Active Day",value:mad,sub:bde?`Date: ${bde[0]}  Trades: ${bdt.length}  Winning: ${bdt.filter(t=>t.outcome==="Win").length}`:""},
  ];
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:"10px" }}>
      {cards.map(c=>(
        <div key={c.label} style={{ background:C.panel, borderRadius:"10px", padding:"16px 14px" }}>
          <div style={{ fontSize:"10px", color:C.muted, fontFamily:MONO, letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:"8px", lineHeight:1.4 }}>{c.label}</div>
          <div style={{ fontSize:"24px", fontWeight:700, fontFamily:DISPLAY, color:C.text, letterSpacing:"-0.02em", lineHeight:1 }}>{c.value}</div>
          {c.sub && <div style={{ fontSize:"9px", color:C.muted, fontFamily:MONO, marginTop:"7px", lineHeight:1.5 }}>{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}

// ─── AVERAGE STATS CARDS ─────────────────────────────────────────────────────
export function AvgStatsCards({ trades, C }: ChartProps) {
  const wins = trades.filter(t=>t.outcome==="Win");
  const losses = trades.filter(t=>t.outcome==="Loss");
  const gp = wins.reduce((a,t)=>a+Math.max(parseFloat(t.pnl)||0,0),0);
  const gl = Math.abs(losses.reduce((a,t)=>a+Math.min(parseFloat(t.pnl)||0,0),0));
  const pfN = gl>0?gp/gl:(gp>0?99:0);
  const pfS = gl>0?pfN.toFixed(2):(gp>0?"∞":"0");
  const el = trades.filter(t=>t.outcome==="Win"||t.outcome==="Loss");
  const wr = el.length ? Math.round(wins.length/el.length*100) : 0;
  const aw = wins.length ? wins.reduce((a,t)=>a+(parseFloat(t.pnl)||0),0)/wins.length : 0;
  const al = losses.length ? Math.abs(losses.reduce((a,t)=>a+(parseFloat(t.pnl)||0),0)/losses.length) : 0;
  const wlS = al>0?(aw/al).toFixed(2):(aw>0?"∞":"0");
  const lo = trades.filter(t=>t.direction==="Long"||(!t.direction&&t.bias==="Bullish")).length;
  const sh = trades.filter(t=>t.direction==="Short"||(!t.direction&&t.bias==="Bearish")).length;
  const td = lo+sh||1;
  const lp = Math.round(lo/td*100); const sp = 100-lp;
  const ring = (pct: number, col: string) => {
    const r=22,c=2*Math.PI*r,d=pct/100*c;
    return <svg width="52" height="52" viewBox="0 0 52 52" style={{flexShrink:0}}>
      <circle cx="26" cy="26" r={r} fill="none" stroke={C.panel2} strokeWidth="5"/>
      <circle cx="26" cy="26" r={r} fill="none" stroke={col} strokeWidth="5" strokeDasharray={`${d} ${c-d}`} strokeDashoffset={c/4} strokeLinecap="round"/>
    </svg>;
  };
  const cards = [
    {label:"Profit Factor",val:pfS,pct:Math.min(pfN/4*100,100),col:C.green,subs:[{l:"Total Profit",v:`${gp.toFixed(1)}R`,c:C.green},{l:"Total Loss",v:`${gl.toFixed(1)}R`,c:C.red}],dir:null},
    {label:"Trade Win",val:String(wr),pct:wr,col:C.green,subs:[{l:"Win Count",v:String(wins.length),c:C.green},{l:"Loss Count",v:String(losses.length),c:C.red}],dir:null},
    {label:"Avg. Win To Loss",val:wlS,pct:Math.min(parseFloat(wlS)/4*100,100)||0,col:C.green,subs:[{l:"Avg. Win",v:`${aw.toFixed(2)}R`,c:C.green},{l:"Avg. Loss",v:`${al.toFixed(2)}R`,c:C.red}],dir:null},
    {label:"Trade Direction",val:String(lp),pct:null,col:C.green,subs:[{l:"Long",v:String(lo),c:C.green},{l:"Short",v:String(sh),c:C.red}],dir:{lo:lp,sh:sp}},
  ];
  return (
    <div>
      <div style={{ fontSize:"10px", color:C.muted, fontFamily:MONO, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:"12px" }}>Additional Averages</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:"10px" }}>
        {cards.map(c=>(
          <div key={c.label} style={{ background:C.panel, borderRadius:"10px", padding:"16px 14px" }}>
            <div style={{ fontSize:"10px", color:C.muted, fontFamily:MONO, letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:"10px" }}>{c.label}</div>
            <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"10px" }}>
              <div style={{ fontSize:"26px", fontWeight:700, fontFamily:DISPLAY, color:C.text, letterSpacing:"-0.02em", lineHeight:1 }}>{c.val}</div>
              {c.pct!==null && ring(c.pct, c.col)}
              {c.dir && <div style={{ flex:1, display:"flex", flexDirection:"column", gap:"4px" }}>
                <div style={{ height:"14px", borderRadius:"3px", overflow:"hidden", background:C.panel2 }}><div style={{ width:`${c.dir.lo}%`, height:"100%", background:C.green }}/></div>
                <div style={{ height:"14px", borderRadius:"3px", overflow:"hidden", background:C.panel2 }}><div style={{ width:`${c.dir.sh}%`, height:"100%", background:C.red }}/></div>
              </div>}
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:"3px" }}>
              {c.subs.map(s=>(
                <div key={s.l} style={{ display:"flex", alignItems:"center", gap:"5px" }}>
                  <div style={{ width:"6px", height:"6px", borderRadius:"50%", background:s.c, flexShrink:0 }}/>
                  <span style={{ fontSize:"9px", color:C.muted, fontFamily:MONO }}>{s.l}</span>
                  <span style={{ fontSize:"9px", color:C.text2, fontFamily:MONO, marginLeft:"auto" }}>{s.v}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── DAILY INSIGHTS ───────────────────────────────────────────────────────────
export function DailyInsights({ trades, C, useDollar }: ChartProps & { useDollar?: boolean }) {
  if (!trades.length) return null;
  const dm: Record<string,{pnl:number;dlr:number}> = {};
  trades.forEach(t => { if (!t.date) return; if (!dm[t.date]) dm[t.date]={pnl:0,dlr:0}; dm[t.date].pnl+=parseFloat(t.pnl)||0; dm[t.date].dlr+=parseFloat(t.pnlDollar)||0; });
  const days = Object.keys(dm).sort(); if (!days.length) return null;
  const fday = (d: string) => { try { return new Date(d+"T12:00:00").toLocaleDateString("en-US",{weekday:"long"}); } catch { return d; } };
  const fval = (d: string) => useDollar&&dm[d].dlr ? `$${dm[d].dlr.toFixed(2)}` : `${dm[d].pnl.toFixed(2)}R`;
  const best = days.reduce((a,b)=>dm[a].pnl>=dm[b].pnl?a:b,days[0]);
  const worst = days.reduce((a,b)=>dm[a].pnl<=dm[b].pnl?a:b,days[0]);
  const wt = trades.filter(t=>t.outcome==="Win"&&parseFloat(t.pnl)>0);
  const lt = trades.filter(t=>t.outcome==="Loss"&&parseFloat(t.pnl)<0);
  const bt = wt.length ? wt.reduce((a,b)=>parseFloat(a.pnl)>=parseFloat(b.pnl)?a:b) : null;
  const wort = lt.length ? lt.reduce((a,b)=>parseFloat(a.pnl)<=parseFloat(b.pnl)?a:b) : null;
  const ftv = (t: Trade) => useDollar&&t.pnlDollar ? `$${Math.abs(parseFloat(t.pnlDollar)).toFixed(1)}` : `${Math.abs(parseFloat(t.pnl)).toFixed(1)}R`;
  const cards = [
    {label:"Most Profitable Day",primary:fval(best),secondary:fday(best),sub:"",color:C.green},
    {label:"Less Profitable Day",primary:fval(worst),secondary:fday(worst),sub:"",color:C.red},
    bt?{label:"Best Trade",primary:ftv(bt),secondary:`${bt.direction||bt.bias||""} ${bt.pair}`.trim(),sub:bt.date,color:C.green}:null,
    wort?{label:"Worst Trade",primary:ftv(wort),secondary:`${wort.direction||wort.bias||""} ${wort.pair}`.trim(),sub:wort.date,color:C.red}:null,
  ].filter(Boolean);
  return (
    <div>
      <div style={{ fontSize:"10px", color:C.muted, fontFamily:MONO, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:"12px" }}>Daily Insights</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:"10px" }}>
        {cards.map(c=>(
          <div key={c.label} style={{ background:C.panel, borderRadius:"10px", padding:"16px 14px" }}>
            <div style={{ fontSize:"10px", color:C.muted, fontFamily:MONO, letterSpacing:"0.06em", textTransform:"uppercase", marginBottom:"10px" }}>{c.label}</div>
            <div style={{ fontSize:"24px", fontWeight:700, fontFamily:DISPLAY, color:c.color, letterSpacing:"-0.02em", lineHeight:1.1, marginBottom:"5px" }}>{c.primary}</div>
            <div style={{ fontSize:"13px", fontWeight:600, color:C.text, fontFamily:BODY }}>{c.secondary}</div>
            {c.sub && <div style={{ fontSize:"9px", color:C.muted, fontFamily:MONO, marginTop:"4px" }}>{c.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CALENDAR ────────────────────────────────────────────────────────────────
function fmtMonth(y: number, m: number) { return new Date(y, m, 1).toLocaleString("default", { month: "long", year: "numeric" }); }

export function CalendarView({ trades, C, onDayClick }: ChartProps & { onDayClick?: (key: string) => void }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth());
  const hasDollar = trades.some(t => t.pnlDollar && t.pnlDollar !== "");
  const [showDollar, setShowDollar] = useState(false);
  const dayPnL: Record<string, { pnl: number; pnlDollar: number; count: number }> = {};
  trades.forEach(t => { if (t.date) { if (!dayPnL[t.date]) dayPnL[t.date] = { pnl: 0, pnlDollar: 0, count: 0 }; dayPnL[t.date].pnl += parseFloat(t.pnl) || 0; dayPnL[t.date].pnlDollar += Number(t.pnlDollar) || 0; dayPnL[t.date].count++; } });
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const navBtn: React.CSSProperties = { background: "none", border: "none", color: C.text, padding: "6px 10px", cursor: "pointer", fontFamily: MONO, fontSize: "12px", letterSpacing: "0.06em" };
  return (
    <div>
      {hasDollar && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}>
          <div style={{ display: "flex", background: C.panel, borderRadius: "999px", border: `1px solid ${C.border2}`, padding: "2px" }}>
            {(["R", "$"] as const).map(mode => (
              <button key={mode} onClick={() => setShowDollar(mode === "$")}
                style={{ padding: "4px 12px", borderRadius: "999px", background: (mode === "$") === showDollar ? C.text : "transparent", color: (mode === "$") === showDollar ? C.bg : C.muted, border: "none", cursor: "pointer", fontFamily: MONO, fontSize: "9px", fontWeight: 600, letterSpacing: "0.1em", transition: "all 0.15s" }}>
                {mode}
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", borderBottom: `1px solid ${C.border}`, paddingBottom: "10px" }}>
        <button onClick={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }} style={navBtn}>‹</button>
        <span style={{ fontSize: "11px", color: C.text, fontFamily: MONO, letterSpacing: "0.12em", textTransform: "uppercase" }}>{fmtMonth(year, month)}</span>
        <button onClick={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }} style={navBtn}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "2px", marginBottom: "4px" }}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i} style={{ textAlign: "center", fontSize: "11px", color: C.muted, padding: "4px 0", fontFamily: MONO, letterSpacing: "0.08em" }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "2px" }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const data = dayPnL[key];
          const isToday = key === new Date().toISOString().split("T")[0];
          const textCol = data ? (data.pnl > 0 ? C.green : data.pnl < 0 ? C.red : C.muted) : C.muted;
          const displayVal = (showDollar && hasDollar ? data?.pnlDollar : data?.pnl) ?? 0;
          const displayStr = data ? (showDollar && hasDollar
            ? `${displayVal >= 0 ? "+" : ""}$${Math.abs(displayVal).toFixed(0)}`
            : `${displayVal >= 0 ? "+" : ""}${displayVal.toFixed(1)}`) : "";
          return (
            <div key={i} onClick={() => data && onDayClick(key)}
              style={{ border: `1px solid ${isToday ? C.text : C.border}`, padding: "6px 3px", textAlign: "center", cursor: data ? "pointer" : "default", minHeight: "44px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: "2px", background: "transparent" }}>
              <div style={{ fontSize: "11px", color: isToday ? C.text : C.text2, fontFamily: MONO }}>{d}</div>
              {data && <div style={{ fontSize: "10px", color: textCol, fontFamily: MONO, letterSpacing: "0.04em" }}>{displayStr}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── DRAWDOWN CURVE ──────────────────────────────────────────────────────────
export function DrawdownCurve({ trades, C }: ChartProps) {
  if (!trades || trades.length === 0) return null;
  const sorted = [...trades].sort((a, b) => a.date > b.date ? 1 : -1);
  const dailyMap: Record<string, number> = {};
  sorted.forEach(t => {
    const d = t.date; const v = parseFloat(t.pnl) || 0;
    dailyMap[d] = (dailyMap[d] || 0) + v;
  });
  const days = Object.keys(dailyMap).sort();
  let cum = 0, peak = 0;
  const points = days.map(d => {
    cum += dailyMap[d];
    if (cum > peak) peak = cum;
    const dd = peak > 0 ? ((cum - peak) / Math.max(Math.abs(peak), 0.01)) * 100 : 0;
    return { d, dd: Math.min(0, dd) };
  });
  if (points.length < 2) return null;
  const minDD = Math.min(...points.map(p => p.dd));
  const maxY = 0; const minY = Math.min(minDD * 1.2, -0.5);
  const W = 320; const H = 140; const PAD = 28;
  const xScale = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2);
  const yScale = (v: number) => PAD + ((maxY - v) / (maxY - minY)) * (H - PAD * 2);
  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${xScale(i).toFixed(1)},${yScale(p.dd).toFixed(1)}`).join(" ");
  const fillD = `${pathD} L${xScale(points.length - 1).toFixed(1)},${yScale(0).toFixed(1)} L${xScale(0).toFixed(1)},${yScale(0).toFixed(1)} Z`;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
        <defs>
          <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF3D00" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#FF3D00" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <line x1={PAD} y1={yScale(0)} x2={W - PAD} y2={yScale(0)} stroke={C.border2} strokeWidth="0.5" strokeDasharray="3 3" />
        <path d={fillD} fill="url(#ddGrad)" />
        <path d={pathD} fill="none" stroke="#FF3D00" strokeWidth="1.5" strokeLinejoin="round" />
        {minDD < -0.5 && (
          <text x={PAD + 4} y={yScale(minDD) - 4} fontSize="9" fill={C.red || "#FF3D00"} fontFamily="monospace">
            {minDD.toFixed(1)}%
          </text>
        )}
        <text x={PAD} y={H - 6} fontSize="8" fill={C.muted} fontFamily="monospace">{points[0]?.d?.slice(5)}</text>
        <text x={W - PAD} y={H - 6} fontSize="8" fill={C.muted} fontFamily="monospace" textAnchor="end">{points[points.length - 1]?.d?.slice(5)}</text>
      </svg>
      <div style={{ display: "flex", gap: "20px", marginTop: "8px" }}>
        <div>
          <div style={{ fontFamily: "monospace", fontSize: "9px", color: C.muted, letterSpacing: "0.1em" }}>MAX DRAWDOWN</div>
          <div style={{ fontFamily: "Georgia, serif", fontSize: "20px", color: "#FF3D00" }}>{minDD.toFixed(1)}%</div>
        </div>
        <div>
          <div style={{ fontFamily: "monospace", fontSize: "9px", color: C.muted, letterSpacing: "0.1em" }}>DAYS TRACKED</div>
          <div style={{ fontFamily: "Georgia, serif", fontSize: "20px", color: C.text }}>{points.length}</div>
        </div>
      </div>
    </div>
  );
}

// ─── SESSION HEATMAP ─────────────────────────────────────────────────────────
export function SessionHeatmap({ trades, C }: ChartProps) {
  const sessions = ["London", "New York", "Asian", "London/NY"];
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  type Cell = { pnl: number; count: number };
  const grid: Record<string, Record<string, Cell>> = {};
  sessions.forEach(s => { grid[s] = {}; days.forEach(d => { grid[s][d] = { pnl: 0, count: 0 }; }); });
  trades.forEach(t => {
    if (!t.date || !t.session) return;
    const dow = new Date(t.date + "T12:00:00").getDay();
    if (dow === 0 || dow === 6) return;
    const dayLabel = days[dow - 1];
    const sess = sessions.find(s => t.session?.toLowerCase().includes(s.toLowerCase().split("/")[0].toLowerCase()));
    if (!sess) return;
    grid[sess][dayLabel].pnl += parseFloat(t.pnl) || 0;
    grid[sess][dayLabel].count += 1;
  });
  const allPnls = sessions.flatMap(s => days.map(d => grid[s][d].pnl)).filter(v => v !== 0);
  const maxAbs = allPnls.length ? Math.max(...allPnls.map(Math.abs)) : 1;
  function cellColor(pnl: number, count: number) {
    if (count === 0) return C.border;
    const intensity = Math.min(Math.abs(pnl) / maxAbs, 1);
    if (pnl > 0) return `rgba(0,201,107,${0.1 + intensity * 0.7})`;
    return `rgba(255,61,0,${0.1 + intensity * 0.7})`;
  }
  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: `80px repeat(${days.length}, 1fr)`, gap: "3px", minWidth: "320px" }}>
        <div style={{ fontFamily: "monospace", fontSize: "9px", color: C.muted, letterSpacing: "0.08em", alignSelf: "end", paddingBottom: "4px" }} />
        {days.map(d => (
          <div key={d} style={{ fontFamily: "monospace", fontSize: "9px", color: C.muted, letterSpacing: "0.1em", textAlign: "center", paddingBottom: "4px" }}>{d.toUpperCase()}</div>
        ))}
        {sessions.map(sess => (
          <>
            <div key={sess + "label"} style={{ fontFamily: "monospace", fontSize: "9px", color: C.text2, letterSpacing: "0.06em", alignSelf: "center", paddingRight: "8px" }}>{sess.toUpperCase().slice(0, 8)}</div>
            {days.map(d => {
              const cell = grid[sess][d];
              return (
                <div key={sess + d} title={`${sess} ${d}: ${cell.count} trades, ${cell.pnl >= 0 ? "+" : ""}${cell.pnl.toFixed(2)}R`}
                  style={{ background: cellColor(cell.pnl, cell.count), borderRadius: "4px", height: "36px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  {cell.count > 0 && <>
                    <div style={{ fontFamily: "monospace", fontSize: "8px", color: cell.pnl >= 0 ? "#00C96B" : "#FF3D00", fontWeight: 600 }}>
                      {cell.pnl >= 0 ? "+" : ""}{cell.pnl.toFixed(1)}R
                    </div>
                    <div style={{ fontFamily: "monospace", fontSize: "7px", color: C.muted }}>{cell.count}t</div>
                  </>}
                </div>
              );
            })}
          </>
        ))}
      </div>
    </div>
  );
}

// ─── TIME OF DAY CHART ───────────────────────────────────────────────────────
export function TimeOfDayChart({ trades, C }: ChartProps) {
  const BUCKETS = ["00","02","04","06","08","10","12","14","16","18","20","22"];
  const LABELS  = ["12a","2a","4a","6a","8a","10a","12p","2p","4p","6p","8p","10p"];
  type Bucket = { pnl: number; wins: number; total: number };
  const data: Bucket[] = BUCKETS.map(() => ({ pnl: 0, wins: 0, total: 0 }));

  trades.forEach(t => {
    if (!t.entryTime) return;
    const hour = parseInt(t.entryTime.split(":")[0], 10);
    if (isNaN(hour)) return;
    const idx = Math.floor(hour / 2);
    data[idx].pnl   += parseFloat(t.pnl) || 0;
    data[idx].total += 1;
    if (t.outcome === "Win") data[idx].wins += 1;
  });

  const active = data.filter(b => b.total > 0);
  if (!active.length) return (
    <div style={{ textAlign:"center", padding:"40px 0", color:C.muted, fontSize:"12px", fontStyle:"italic" }}>
      Log trades with an entry time to see time-of-day patterns.
    </div>
  );

  const maxAbs = Math.max(...data.map(b => Math.abs(b.pnl)), 0.1);

  return (
    <div>
      <div style={{ overflowX:"auto" }}>
        <div style={{ display:"flex", alignItems:"flex-end", gap:"4px", height:"80px", minWidth:"320px" }}>
          {data.map((b, i) => {
            if (b.total === 0) return (
              <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:"3px" }}>
                <div style={{ flex:1, background:C.border, borderRadius:"3px", width:"100%", opacity:0.3 }} />
                <div style={{ fontFamily:"monospace", fontSize:"7px", color:C.muted, letterSpacing:"0.05em" }}>{LABELS[i]}</div>
              </div>
            );
            const ht = Math.max(Math.abs(b.pnl) / maxAbs * 64, 6);
            const col = b.pnl >= 0 ? "#00C96B" : "#FF3D00";
            const wr  = Math.round((b.wins / b.total) * 100);
            return (
              <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:"3px" }}
                title={`${LABELS[i]}–${LABELS[(i+1)%12]}: ${b.total}t · ${b.pnl>=0?"+":""}${b.pnl.toFixed(1)}R · ${wr}%WR`}>
                <div style={{ flex:1, width:"100%", display:"flex", alignItems:"flex-end" }}>
                  <div style={{ width:"100%", height:`${ht}px`, background:col, borderRadius:"3px 3px 0 0", opacity:0.85 }} />
                </div>
                <div style={{ fontFamily:"monospace", fontSize:"7px", color:C.muted, letterSpacing:"0.05em" }}>{LABELS[i]}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ marginTop:"16px", display:"flex", gap:"16px", flexWrap:"wrap" }}>
        {[
          { label:"BEST HOUR", fn: (d: Bucket[]) => d.reduce((best, b, i) => b.pnl > best.pnl ? { ...b, i } : best, { pnl:-Infinity, total:0, wins:0, i:0 }) },
          { label:"WORST HOUR", fn: (d: Bucket[]) => d.reduce((worst, b, i) => b.total > 0 && b.pnl < worst.pnl ? { ...b, i } : worst, { pnl:Infinity, total:0, wins:0, i:0 }) },
        ].map(({ label, fn }) => {
          const b = fn(data) as Bucket & { i: number };
          if (!b || b.total === 0 || !isFinite(b.pnl)) return null;
          return (
            <div key={label} style={{ flex:1, minWidth:"120px", padding:"10px 12px", border:`1px solid ${C.border}`, borderRadius:"8px" }}>
              <div style={{ fontFamily:"monospace", fontSize:"9px", color:C.muted, letterSpacing:"0.1em", marginBottom:"4px" }}>{label}</div>
              <div style={{ fontFamily:"monospace", fontSize:"14px", fontWeight:600, color: b.pnl >= 0 ? C.green : C.red }}>
                {LABELS[b.i]}
              </div>
              <div style={{ fontFamily:"monospace", fontSize:"9px", color:C.muted, marginTop:"2px" }}>
                {b.pnl >= 0 ? "+" : ""}{b.pnl.toFixed(1)}R · {b.total}t
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── DAY OF WEEK CHART ────────────────────────────────────────────────────────
export function DayOfWeekChart({ trades, C }: ChartProps) {
  const DAYS = ["Mon","Tue","Wed","Thu","Fri"];
  type DayBucket = { pnl: number; wins: number; total: number };
  const data: DayBucket[] = DAYS.map(() => ({ pnl:0, wins:0, total:0 }));

  trades.forEach(t => {
    if (!t.date) return;
    const dow = new Date(t.date + "T12:00:00").getDay();
    if (dow === 0 || dow === 6) return;
    const idx = dow - 1;
    data[idx].pnl   += parseFloat(t.pnl) || 0;
    data[idx].total += 1;
    if (t.outcome === "Win") data[idx].wins += 1;
  });

  if (data.every(b => b.total === 0)) return null;
  const maxAbs = Math.max(...data.map(b => Math.abs(b.pnl)), 0.1);

  return (
    <div>
      <div style={{ display:"flex", alignItems:"flex-end", gap:"8px", height:"80px" }}>
        {data.map((b, i) => {
          const ht = b.total ? Math.max(Math.abs(b.pnl) / maxAbs * 64, 6) : 0;
          const col = b.pnl >= 0 ? "#00C96B" : "#FF3D00";
          const wr  = b.total ? Math.round((b.wins / b.total) * 100) : 0;
          return (
            <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:"4px" }}
              title={`${DAYS[i]}: ${b.total}t · ${b.pnl>=0?"+":""}${b.pnl.toFixed(1)}R · ${wr}%WR`}>
              <div style={{ flex:1, width:"100%", display:"flex", alignItems:"flex-end" }}>
                {b.total > 0
                  ? <div style={{ width:"100%", height:`${ht}px`, background:col, borderRadius:"4px 4px 0 0", opacity:0.85 }} />
                  : <div style={{ width:"100%", height:"6px", background:C.border, borderRadius:"4px", opacity:0.3 }} />
                }
              </div>
              <div style={{ fontFamily:"monospace", fontSize:"9px", color:C.muted, letterSpacing:"0.08em" }}>{DAYS[i].toUpperCase()}</div>
              {b.total > 0 && (
                <div style={{ fontFamily:"monospace", fontSize:"8px", color:col, fontWeight:600 }}>
                  {b.pnl >= 0 ? "+" : ""}{b.pnl.toFixed(1)}R
                </div>
              )}
              {b.total > 0 && (
                <div style={{ fontFamily:"monospace", fontSize:"7px", color:C.muted }}>{wr}%</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── MAE/MFE SCATTER CHART ────────────────────────────────────────────────────
export function MAEMFEChart({ trades, C }: ChartProps) {
  const pts = trades.filter(t => t.mae && t.mfe).map(t => ({
    mae: parseFloat(t.mae) || 0,
    mfe: parseFloat(t.mfe) || 0,
    pnl: parseFloat(t.pnl) || 0,
    outcome: t.outcome,
    pair: t.pair,
  }));
  if (pts.length < 3) return (
    <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontSize: "13px", fontStyle: "italic", fontFamily: "sans-serif" }}>
      Log MAE & MFE on {Math.max(0, 3 - pts.length)} more trade{3 - pts.length !== 1 ? "s" : ""} to see the scatter.
    </div>
  );
  const maxMAE = Math.max(...pts.map(p => p.mae), 1);
  const maxMFE = Math.max(...pts.map(p => p.mfe), 1);
  const W = 300; const H = 200; const PAD = 32;
  const xS = (v: number) => PAD + (v / maxMAE) * (W - PAD * 2);
  const yS = (v: number) => H - PAD - (v / maxMFE) * (H - PAD * 2);
  const avgEff = pts.length ? pts.reduce((a, p) => a + (p.mfe > 0 ? Math.min(p.pnl / p.mfe, 1) : 0), 0) / pts.length * 100 : 0;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke={C.border2} strokeWidth="0.5" />
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke={C.border2} strokeWidth="0.5" />
        <text x={W / 2} y={H - 4} textAnchor="middle" fontSize="9" fill={C.muted} fontFamily="monospace">MAE (R)</text>
        <text x={10} y={H / 2} textAnchor="middle" fontSize="9" fill={C.muted} fontFamily="monospace" transform={`rotate(-90, 10, ${H / 2})`}>MFE (R)</text>
        {pts.map((p, i) => (
          <circle key={i} cx={xS(p.mae)} cy={yS(p.mfe)} r="5"
            fill={p.outcome === "Win" ? "#00C96B" : p.outcome === "Loss" ? "#FF3D00" : "#BCBCB4"}
            fillOpacity="0.7" stroke="none" />
        ))}
      </svg>
      <div style={{ display: "flex", gap: "20px", marginTop: "8px" }}>
        <div>
          <div style={{ fontFamily: "monospace", fontSize: "9px", color: C.muted, letterSpacing: "0.1em" }}>AVG CAPTURE EFF</div>
          <div style={{ fontFamily: "Georgia, serif", fontSize: "20px", color: avgEff >= 60 ? "#00C96B" : "#BCBCB4" }}>{avgEff.toFixed(0)}%</div>
        </div>
        <div>
          <div style={{ fontFamily: "monospace", fontSize: "9px", color: C.muted, letterSpacing: "0.1em" }}>TRADES WITH DATA</div>
          <div style={{ fontFamily: "Georgia, serif", fontSize: "20px", color: C.text }}>{pts.length}</div>
        </div>
      </div>
    </div>
  );
}
