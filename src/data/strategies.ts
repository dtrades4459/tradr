// ─── strategies.ts ───────────────────────────────────────────────────────────
// Single source of truth for all built-in strategy definitions.
// Custom user-defined strategies are merged at runtime via addExtraStrategy().
// ─────────────────────────────────────────────────────────────────────────────

import type { StrategyDef } from "../types";
import { setSharedStrategiesMap } from "../shared";

export const STRATEGIES: Record<string, StrategyDef> = {
  "ICT / Smart Money": {
    code: "ICT",
    setups: ["OTE (Optimal Trade Entry)","FVG (Fair Value Gap)","Order Block","Breaker Block","Liquidity Sweep","SIBI / BISI","Silver Bullet","Judas Swing","Power of 3","MSS (Market Structure Shift)","Other"],
    checklist: ["HTF bias confirmed (Daily / 4H)","Trading in correct session window","Liquidity swept before entry","POI identified (OB / FVG / BB)","LTF confirmation at POI","Stop loss below / above structure","Minimum R:R met (2R+)","No high-impact news in window"],
    rules: ["Only trade with HTF narrative — never against it","Wait for liquidity to be taken before entry","Enter only on LTF displacement into a POI","No trades in the first 15 min of session open","Avoid trading 30 min before/after red folder news","Maximum 2 trades per session","Never move SL to breakeven before 1R is hit","If you miss the entry, let it go — no chasing"],
  },
  "Supply & Demand": {
    code: "S&D",
    setups: ["Fresh Supply Zone","Fresh Demand Zone","Rally Base Rally (RBR)","Drop Base Drop (DBD)","Rally Base Drop (RBD)","Drop Base Rally (DBR)","Zone Retest Entry","Proximal Line Touch","Distal Line Break","Engulfing at Zone","Other"],
    checklist: ["HTF trend direction identified","Zone is fresh (untested)","Strong impulsive move from zone confirmed","Proximal line clearly defined","Entry near proximal, SL beyond distal","No major S/R levels inside the zone","Minimum 3:1 R:R to next opposing zone","No news events during trade window"],
    rules: ["Only trade fresh, untested zones","The stronger the departure candle, the better the zone","Avoid zones with too many candles in the base","HTF zones take priority over LTF zones","Never enter mid-zone — wait for proximal line","If price spends too long in a zone, it's weakened","Always check what's on the other side of the zone","Scale out at 2R, let runners go to next zone"],
  },
  "Wyckoff / VSA": {
    code: "WYC",
    setups: ["Accumulation Schematic","Distribution Schematic","Spring (Phase C)","Upthrust (UT / UTAD)","Sign of Strength (SOS)","Sign of Weakness (SOW)","Last Point of Support (LPS)","Last Supply Point (LPSY)","Shakeout","Creek Break / Jump","Other"],
    checklist: ["Identified correct Wyckoff phase (A–E)","Volume confirms price action at key point","Composite Operator narrative is clear","Spring or Upthrust tested (Phase C confirmed)","No supply/demand present at entry bar (VSA)","Price above/below key creek or ice level","SOS or SOW bar confirmed on LTF","Trade aligns with higher phase structure"],
    rules: ["Never trade against the Composite Operator","Volume is king — price action without volume means nothing","Wait for Phase C confirmation before entering","A Spring must close back inside the range","High-volume narrow-spread bars signal absorption","No Demand / No Supply bars are your entry triggers","Always mark your creek/ice before the session","If you can't label the phase, stay out"],
  },
  "ORB (Opening Range Breakout)": {
    code: "ORB",
    setups: ["5-min ORB","15-min ORB","30-min ORB","1-hour ORB","Breakout + Retest","False Breakout Fade","Gap & Go","VWAP Reclaim after ORB","Pre-market High/Low Break","Other"],
    checklist: ["Opening range clearly defined (high & low marked)","Pre-market trend / gap direction noted","Volume spike on breakout candle confirmed","Price closed outside the range (no wick-only break)","VWAP alignment with breakout direction","No major news in first 30 min of session","First pullback/retest entry identified","Stop placed inside opening range"],
    rules: ["Define the opening range before the session starts","Only trade confirmed closes outside the range","Volume must expand on the breakout bar","The best ORBs have a pre-market bias — align with it","Fade false breakouts only after a full close back inside","Avoid ORBs on choppy, low-volume pre-market days","Take partial profits at 1R, trail the rest","No ORB trades after the first 90 min of the session"],
  },
};

export const STRATEGY_NAMES = Object.keys(STRATEGIES);

// ── Runtime extras (custom user-defined strategies) ───────────────────────────
// loadAll() and saveCustomStrategies() in Koda.tsx write here at runtime.
// STRATEGIES itself stays immutable.

let _extraStrategies: Record<string, StrategyDef> = {};

export function getAllStrategiesMap(): Record<string, StrategyDef> {
  return { ...STRATEGIES, ..._extraStrategies };
}

export function addExtraStrategies(extras: Record<string, StrategyDef>): void {
  _extraStrategies = extras;
  setSharedStrategiesMap(getAllStrategiesMap());
}

// Seed shared.tsx's stratCode lookup with built-in strategies on module load.
// Extra strategies are added later by loadAll() / saveCustomStrategies().
setSharedStrategiesMap(getAllStrategiesMap());
