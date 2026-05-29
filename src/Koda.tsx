import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "./lib/supabase";
import type { User } from "@supabase/supabase-js";
import { onStorageError, storage } from "./lib/storage";
import { calcRR, calcWinRate, calcStreak, calcWeeklyPnL, calcTotalPnL } from "./lib/stats";
import { log } from "./lib/log";
import { isFlagOn } from "./lib/flags";
import { useFollows } from "./hooks/useFollows";
import { useFeed } from "./hooks/useFeed";
import { useCircles } from "./hooks/useCircles";
import type { CircleStats } from "./hooks/useCircles";
import { getProfile, upsertProfile } from "./data/profile";
import { upsertTrade as upsertTradeV2, deleteTradeByClientId as deleteTradeV2ByClientId } from "./data/trades";
import { shareTrade } from "./data/circlesSharedTrades";
import { KODA_GLOBAL_CODE } from "./hooks/useCircles";
import { STRATEGIES, STRATEGY_NAMES, getAllStrategiesMap, addExtraStrategies } from "./data/strategies";
import { useTradovate } from "./hooks/useTradovate";

import type { TradeComment, ReactionMap, Trade, Profile, CircleMember, Circle, Insight, StrategyDef } from "./types";
import { AvatarCircle, Badge, SectionKicker, StrategyPill, StrategySelect, SubNavDropdown, GearButton, Toast, ToastStack, KodaMarkFilled, KodaMark, CrownIcon, GlassOrb, CornerGlow, GhostWord, TickMotif, TealArrowBtn, Pill, Card, Kicker, Delta, ScreenHeader, IconButton, FloatingInput, EmptyState, outcomeColor, outcomeLetter, stratCode, stratShort, compressImage, MONO, BODY, DISPLAY, EmptyTradesState, ErrorOfflineState, CelebrationOverlay } from "./shared";
import type { ToastKind, ToastItem } from "./shared";
import { TradingCircles } from "./TradingCircles";
import { FriendsFeed } from "./FriendsFeed";
import { MiniSparkline, PnLChart, MonthlyPnLChart, WinRateChart, TradeDurationChart, NetDailyPnLChart, DailyCumulativePnLChart, TradeStatCards, AvgStatsCards, DailyInsights, CalendarView, DrawdownCurve, SessionHeatmap, TimeOfDayChart, DayOfWeekChart, MAEMFEChart, generateInsights } from "./charts";
import { CsvImportPanel } from "./CsvImportPanel";
import { DataSourcesScreen } from "./DataSourcesScreen";
import { ProfileModal } from "./ProfileModal";
import { SettingsScreen } from "./SettingsScreen";
import { LogTradeScreen } from "./LogTradeScreen";
import { ReviewInboxScreen } from "./ReviewInboxScreen";
import { SESSIONS, BIAS, EMOTION_TAGS, getEmotionTags, EMPTY_TRADE } from "./tradeConstants";
import { TourOverlay, OnboardingFlow } from "./OnboardingFlow";
import type { OnboardingData } from "./OnboardingFlow";
import { UpgradeModal } from "./UpgradeModal";
import { LotSizeCalculator } from "./LotSizeCalculator";
import { phIdentify, phCapture, phReset } from "./lib/posthog";
import EvalAccountScreen from "./EvalAccountScreen";
import WeeklyReportCard from "./WeeklyReportCard";
import NotificationsDrawer from "./NotificationsDrawer";
import { DARK, LIGHT, makeStyles } from "./theme";
import { useIsDesktop, useViewport } from "./hooks/useViewport";
import { EditInline } from "./components/EditInline";
import { ProLock } from "./components/ProLock";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

/** The Kōda Global circle — every new user auto-joins on onboarding completion. */
const LEGACY_GLOBAL_CODE = "TRADRG-HB1U";

// STRATEGIES, STRATEGY_NAMES, getAllStrategiesMap → src/data/strategies.ts

// ─── DEFAULT PROFILE ─────────────────────────────────────────────────────────
const DEF_PROFILE: Profile = {
  name: "Trader",
  handle: "@trader",
  bio: "Multi-strategy trader | Consistency over everything",
  avatar: "",
  broker: "",
  timezone: "London (GMT)",
  startDate: new Date().toISOString().split("T")[0],
  targetRR: "2",
  maxTradesPerDay: "2",
  onboarded: false,
  publicTrades: false,
  instruments: [],
  socialLinks: {},
  plan: "free",
};
const OUTCOMES = ["Win","Loss","Breakeven"];
const REACTIONS = ["FIRE","GEM","UP","TARGET","PAIN","MIND"];
const TABS = ["home","log","stats","history","circles"];
const STREAK_MILESTONES = [3, 7, 14, 30, 100];
const STREAK_FLAVOUR: Record<number, string> = {
  3: "Three days of discipline.",
  7: "One week of consistent execution.",
  14: "Two weeks in. The habit is forming.",
  30: "A full month. This is who you are now.",
  100: "One hundred days. Exceptional.",
};


// ─── THEME ────────────────────────────────────────────────────────────────────
// DARK + LIGHT theme tokens live in src/theme.ts

// calcRR, calcWinRate, calcStreak, calcWeeklyPnL, calcTotalPnL imported from ./lib/stats


// ─── Strategy Editor ─────────────────────────────────────────────────────────
// Modal-style card rendered inside the Checklist view when the user clicks
// "+ New" or "Edit". Handles name, code abbreviation, and optional setups list.
// Checklist items and rules are managed separately in the checklist tab itself.
function StrategyEditor({ draft, setDraft, onSave, onCancel, isEdit, C, inp, lbl }: {
  draft: StrategyDef & { name: string };
  setDraft: React.Dispatch<React.SetStateAction<StrategyDef & { name: string }>>;
  onSave: () => void;
  onCancel: () => void;
  isEdit: boolean;
  C: typeof DARK;
  inp: React.CSSProperties;
  lbl: React.CSSProperties;
}) {
  const [newSetup, setNewSetup] = useState("");
  const canSave = !!(draft.name || "").trim();
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "20px 16px", display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase" }}>
        {isEdit ? "Edit Strategy" : "New Strategy"}
      </div>

      {/* Name */}
      <div>
        <label style={lbl}>Strategy Name *</label>
        <input
          autoFocus
          value={draft.name}
          onChange={e => setDraft((d) => ({ ...d, name: e.target.value }))}
          onKeyDown={e => { if (e.key === "Enter" && canSave) onSave(); if (e.key === "Escape") onCancel(); }}
          placeholder="e.g. Opening Range Breakout"
          style={{ ...inp }}
        />
      </div>

      {/* Code */}
      <div>
        <label style={lbl}>Code (up to 4 chars · auto-derived if blank)</label>
        <input
          value={draft.code}
          onChange={e => setDraft((d) => ({ ...d, code: e.target.value.replace(/[^A-Z0-9&]/gi, "").slice(0, 4).toUpperCase() }))}
          placeholder={draft.name ? (draft.name.replace(/[^A-Z0-9]/gi, "").slice(0, 4).toUpperCase() || "CODE") : "CODE"}
          maxLength={4}
          style={{ ...inp, fontFamily: MONO, letterSpacing: "0.14em", textTransform: "uppercase" }}
        />
      </div>

      {/* Setups */}
      <div>
        <label style={lbl}>Setups (optional — used when tagging trades)</label>
        {(draft.setups || []).length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
            {(draft.setups || []).map((s: string, i: number) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: C.panel2 ?? C.bg, border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "4px 10px 4px 12px", fontFamily: MONO, fontSize: "10px", color: C.text2 ?? C.muted, letterSpacing: "0.06em" }}>
                {s}
                <button
                  aria-label={`Remove setup ${s}`}
                  onClick={() => setDraft((d) => ({ ...d, setups: d.setups.filter((_: string, j: number) => j !== i) }))}
                  style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, padding: 0, fontSize: "13px", lineHeight: 1, display: "flex", alignItems: "center" }}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <input
            value={newSetup}
            onChange={e => setNewSetup(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && newSetup.trim()) {
                setDraft((d) => ({ ...d, setups: [...(d.setups || []), newSetup.trim()] }));
                setNewSetup("");
              }
              if (e.key === "Escape") setNewSetup("");
            }}
            placeholder="Type a setup name, press Enter to add"
            style={{ ...inp, flex: 1 }}
          />
          {newSetup.trim() && (
            <button
              onClick={() => { setDraft((d) => ({ ...d, setups: [...(d.setups || []), newSetup.trim()] })); setNewSetup(""); }}
              style={{ background: C.text, color: C.bg, border: "none", borderRadius: "999px", padding: "8px 14px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase", flexShrink: 0 }}>
              Add
            </button>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "10px" }}>
        <button
          onClick={onSave}
          disabled={!canSave}
          style={{ flex: 1, background: canSave ? C.text : "transparent", color: canSave ? C.bg : C.muted, border: canSave ? "none" : `1px solid ${C.border2}`, borderRadius: "999px", padding: "13px 20px", fontSize: "13px", cursor: canSave ? "pointer" : "not-allowed", fontFamily: BODY, letterSpacing: "0.02em", transition: "opacity 0.15s" }}>
          {isEdit ? "Save Changes" : "Add Strategy"}
        </button>
        <button
          onClick={onCancel}
          style={{ background: "transparent", color: C.muted, border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "13px 18px", fontSize: "12px", cursor: "pointer", fontFamily: MONO, letterSpacing: "0.06em", textTransform: "uppercase", flexShrink: 0 }}>
          Cancel
        </button>
      </div>
    </div>
  );
}


export default function Koda({ user, jwtPlan }: { user?: User; jwtPlan?: "free" | "pro" | "elite" } = {}) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [draftCount, setDraftCount] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [view, setView] = useState("home");
  const [viewHistory, setViewHistory] = useState<string[]>([]);

  // navigateTo — push current view to history, then switch
  function navigateTo(v: string) {
    setViewHistory(h => [...h, view]);
    setView(v);
  }
  // goBack — pop history stack
  function goBack() {
    setViewHistory(h => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setView(prev);
      return h.slice(0, -1);
    });
  }
  // primaryNav — top-level tab switches clear history
  function primaryNav(v: string) {
    setViewHistory([]);
    setView(v);
  }
  // ── Circles state + actions managed by useCircles (wired below after stats) ─
  const [darkMode, setDarkMode] = useState(true);
  const isDesktop = useIsDesktop(900);
  const viewport = useViewport();
  const C = (darkMode ? DARK : LIGHT) as typeof DARK;
  const [form, setForm] = useState<Partial<Trade>>(EMPTY_TRADE);
  const [editId, setEditId] = useState<number | null>(null);
  const [filter, setFilter] = useState<{ outcome: string; setup: string; pair: string; strategy: string; dateFrom: string; dateTo: string }>({ outcome: "", setup: "", pair: "", strategy: "", dateFrom: "", dateTo: "" });
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setIsOnline(true);
    const dn = () => setIsOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", dn);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", dn); };
  }, []);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [tradeToShare, setTradeToShare] = useState<Trade | null>(null);
  const [sharingToCircle, setSharingToCircle] = useState<string | null>(null);
  // jwtPlan comes from the Supabase JWT app_metadata claim — server-verified,
  // not forgeable from the client. Use it as the authoritative starting plan so
  // the paywall check is correct before loadAll() finishes.
  const [profile, setProfile] = useState<Profile>({ ...DEF_PROFILE, plan: jwtPlan ?? "free" });
  const isPro = profile.plan === "pro" || profile.plan === "elite";
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState<Profile>(DEF_PROFILE);
  const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
  const [pnlMode, setPnlMode] = useState<"r" | "$">("$");
  const [timeMode, setTimeMode] = useState<"week" | "all">("week");
  // Follow system — state + sync managed by useFollows (wired below after getMyCode).
  const [viewProfile, setViewProfile] = useState<string | null>(null);
  function openProfile(handle: string) { if (handle) setViewProfile(handle.replace(/^@/, "")); }
  // Tour: shown once to new users after onboarding. Skipped if localStorage flag already set.
  const [showTour, setShowTour] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // ── Toast v2 (stacked, 4 kinds) ──
  const [toastsV2, setToastsV2] = useState<ToastItem[]>([]);
  const toastIdRef = useRef(0);
  const [celebration, setCelebration] = useState<{ kind: "trade" | "streak" | "pro" | "loss" | "streak-loss"; streakCount?: number; tradeStats?: { winRate: number; avgR: number; streak: number } } | null>(null);
  const [streakBanner, setStreakBanner] = useState<{ streakCount: number } | null>(null);
  const showToastV2 = useCallback((kind: ToastKind, title: string, body?: string) => {
    const id = ++toastIdRef.current;
    setToastsV2(prev => [...prev, { id, kind, title, body, ts: Date.now() }]);
    setTimeout(() => setToastsV2(prev => prev.filter(t => t.id !== id)), 6000);
  }, []);
  const dismissToast = useCallback((id: number) => {
    setToastsV2(prev => prev.filter(t => t.id !== id));
  }, []);
  const [homeSection, setHomeSection] = useState("feed");
  const [autoOpenCsv, setAutoOpenCsv] = useState(false);
  // Supabase JWT access token — used by DataSourcesScreen for broker API calls.
  const [accessToken, setAccessToken] = useState("");
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? ""));
    const { data: { subscription: _atSub } } = supabase.auth.onAuthStateChange((_, sess) =>
      setAccessToken(sess?.access_token ?? "")
    );
    return () => _atSub.unsubscribe();
  }, []);
  const [activeStrategy, setActiveStrategy] = useState(STRATEGY_NAMES[0]);
  type CheckItem = { id: number; text: string };
  const [stratChecklists, setStratChecklists] = useState<Record<string, CheckItem[]>>(() => Object.fromEntries(STRATEGY_NAMES.map(s => [s, STRATEGIES[s].checklist.map((t: string, i: number) => ({ id: i + 1, text: t }))])));
  const [stratRules, setStratRules] = useState<Record<string, CheckItem[]>>(() => Object.fromEntries(STRATEGY_NAMES.map(s => [s, STRATEGIES[s].rules.map((t: string, i: number) => ({ id: i + 1, text: t }))])));
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [checklistTab, setChecklistTab] = useState("pretrade");
  const [editingCheckItem, setEditingCheckItem] = useState<CheckItem | null>(null);
  const [editingRule, setEditingRule] = useState<CheckItem | null>(null);
  const [newCheckText, setNewCheckText] = useState("");
  const [newRuleText, setNewRuleText] = useState("");
  const [addingCheck, setAddingCheck] = useState(false);
  const [addingRule, setAddingRule] = useState(false);
  const [calDayTrades, setCalDayTrades] = useState<Trade[] | null>(null);
  const [statsTab, setStatsTab] = useState("overview");
  const [setupPeriod, setSetupPeriod] = useState<"month" | "all">("month");
  const [setupMetric, setSetupMetric] = useState<"pnl" | "winrate" | "trades">("pnl");
  const [setupDollar, setSetupDollar] = useState(false);
  const [perfPnlMode, setPerfPnlMode] = useState<"r" | "$">("$");

  const setupRows = useMemo(() => {
    const now = new Date();
    const filtered = setupPeriod === "month"
      ? trades.filter((t: Trade) => { const d = new Date(t.date + "T12:00:00"); return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(); })
      : trades;
    const stats: Record<string, { pnl: number; dollar: number; wins: number; total: number }> = {};
    filtered.forEach((t: Trade) => {
      if (!t.strategy) return;
      if (!stats[t.strategy]) stats[t.strategy] = { pnl: 0, dollar: 0, wins: 0, total: 0 };
      stats[t.strategy].pnl += parseFloat(t.pnl) || 0;
      stats[t.strategy].dollar += parseFloat(t.pnlDollar) || 0;
      stats[t.strategy].wins += t.outcome === "Win" ? 1 : 0;
      stats[t.strategy].total++;
    });
    return Object.entries(stats).map(([name, s]) => ({
      name,
      pnl: s.pnl,
      dollar: s.dollar,
      winRate: s.total > 0 ? (s.wins / s.total) * 100 : 0,
      trades: s.total,
    }));
  }, [trades, setupPeriod]);
  const [savingTrade, setSavingTrade] = useState(false);

  // Custom strategies: user-defined, same shape as built-ins (name, code, setups, checklist, rules).
  // Merged into STRATEGIES global on load so stratCode/stratShort keep working unchanged.
  const [customStrategies, setCustomStrategies] = useState<StrategyDef[]>([]);
  const allStrategyNames = [...STRATEGY_NAMES, ...customStrategies.map((s: StrategyDef & { name: string }) => s.name)];
  // Custom-strategy editor state
  const [showStrategyEditor, setShowStrategyEditor] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<string | null>(null);
  const [strategyDraft, setStrategyDraft] = useState<Required<StrategyDef>>({ name: "", code: "", setups: [], checklist: [], rules: [] });

  // CSV import panel state
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [mandatoryUpgrade, setMandatoryUpgrade] = useState(false);
  const [showCalc,    setShowCalc]    = useState(false);

  const [showLiveModal, setShowLiveModal] = useState(false);
  const [fontScale, setFontScale] = useState<number>(() => {
    try { return parseFloat(localStorage.getItem("koda_font_scale") ?? "1") || 1; } catch { return 1; }
  });

  // Tradovate — state + handlers managed by useTradovate (wired below after saveTrades).

  // Swipe — non-passive listener so preventDefault() stops browser chrome from shifting
  const swipeRef = useRef<HTMLDivElement | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); }, []);
  const dismissCelebration = useCallback(() => setCelebration(null), []);

  // ── Surface Supabase write failures as user-visible toasts ───────────────────
  // storage.ts calls this callback instead of silently logging to the console.
  useEffect(() => {
    onStorageError((_key, _err) => {
      showToast("Save failed — check your connection");
    });
  }, [showToast]);

  const [stratThresholds, setStratThresholds] = useState<Record<string, { minCount: number; required: string[] }>>(() =>
    Object.fromEntries(STRATEGY_NAMES.map(s => [s, { minCount: Math.ceil(STRATEGIES[s].checklist.length * 0.75), required: [] }]))
  );

  const _loadedRef = useRef(false);
  useEffect(() => {
    if (_loadedRef.current) return;
    _loadedRef.current = true;
    void loadAll();
  }, []);

  useEffect(() => {
    // Use fontSize instead of zoom — zoom is non-standard and causes the
    // browser to shift fixed-position elements (including the bottom nav).
    document.documentElement.style.fontSize = `${fontScale * 100}%`;
    try { localStorage.setItem("koda_font_scale", String(fontScale)); } catch {}
  }, [fontScale]);

  const _stripeHandledRef = useRef(false);
  const _upgradedRef = useRef(false);
  useEffect(() => {
    if (_stripeHandledRef.current) return;
    _stripeHandledRef.current = true;
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgraded") === "1") {
      _upgradedRef.current = true;
      const cid = params.get("cid") ?? "";
      setProfile(p => ({ ...p, plan: "pro" as const, ...(cid ? { stripeCustomerId: cid } : {}) }));
      setCelebration({ kind: "pro" });
      window.history.replaceState({}, "", window.location.pathname);
      // Refresh JWT after 2s so the webhook's app_metadata update is reflected immediately,
      // then reload profile from KV so plan-gated features unlock without a manual refresh.
      setTimeout(() => {
        supabase.auth.refreshSession().then(({ data }) => {
          if (data?.session) { void loadAll(); }
        }).catch(() => {});
      }, 2000);
    }
    if (params.get("cancelled") === "1") {
      showToast("No worries — you're still on the free plan.");
      window.history.replaceState({}, "", window.location.pathname);
    }
    // Also handle generic Stripe return URLs (?return=settings or ?session_id=…)
    // Guard: skip if the upgraded flow already handled it to avoid a double loadAll() race.
    if (!_upgradedRef.current && (params.get("return") === "settings" || params.get("session_id"))) {
      window.history.replaceState({}, "", window.location.pathname);
      supabase.auth.refreshSession().then(({ data }) => {
        if (data?.session) { void loadAll(); }
      }).catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── ?join= deep-link handler ────────────────────────────────────────────────
  // kodatrade.co.uk/?join=KODA-XXXX → open join flow pre-filled
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const joinCode = params.get("join");
      if (joinCode) {
        setCircleJoinCode(joinCode.toUpperCase());
        setView("circles");
        setCirclesView("join");
        // Clean URL so refreshing doesn't re-trigger
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch {}
  }, []);

  // ── Stats fingerprint — cheap memo so auto-publish only fires when the
  //    numbers actually change, not on every render triggered by unrelated state.
  const statsFingerprint = useMemo(() => {
    const w    = trades.filter(t => t.outcome === "Win").length;
    const l    = trades.filter(t => t.outcome === "Loss").length;
    const pnl  = trades.reduce((a, t) => a + (parseFloat(t.pnl) || 0), 0);
    const rrTs = trades.filter(t => t.rr);
    const avgRR = rrTs.length
      ? (rrTs.reduce((a, t) => a + parseFloat(t.rr), 0) / rrTs.length).toFixed(2)
      : "0";
    return `${w}:${l}:${pnl.toFixed(2)}:${avgRR}`;
  }, [trades]);


  // ── Follows sync (every 2 min) ───────────────────────────────────
  // Load my follow lists from shared_kv and refresh periodically so counts


  // Load draft trade count for inbox badge.
  // Refetches on initial load and whenever the user navigates to log or inbox
  // so the badge stays current as the broker-sync cron deposits new drafts.
  const refreshDraftCount = useCallback(() => {
    if (!profile.uid) return;
    supabase
      .from("trades")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.uid)
      .eq("review_status", "draft")
      .then(({ count }) => setDraftCount(count ?? 0), () => {});
  }, [profile.uid]);

  useEffect(() => {
    if (loading) return;
    refreshDraftCount();
  }, [loading, refreshDraftCount]);

  useEffect(() => {
    if (loading) return;
    if (view === "log" || view === "inbox") refreshDraftCount();
  }, [view, loading, refreshDraftCount]);

  async function loadAll() {
    const store = storage;
    const LOAD_KEYS = ["koda_trades","koda_profile","koda_checklists","koda_rules","koda_dark","koda_circles","koda_thresholds","koda_custom_strategies"] as const;
    const [kv, v2ProfileRes] = await Promise.all([
      store.getMany([...LOAD_KEYS]).catch(() => new Map()),
      (isFlagOn("newProfile") && user?.id)
        ? getProfile(user.id).catch(() => null)
        : Promise.resolve(null),
    ]);
    const [t, pr, sc, sr, dm, ci, st, cs] = LOAD_KEYS.map(k => kv.get(k) ?? null);

    // Trades
    try {
      const parsed = t ? JSON.parse(t.value) : null;
      const loadedTrades: Trade[] = Array.isArray(parsed) ? parsed : [];
      setTrades(loadedTrades);
      // Lazy migration: migrate any base64 screenshots to Supabase Storage
      // Fire-and-forget — does not block the rest of loadAll.
      const uid = user?.id;
      if (uid) {
        const toMigrate = loadedTrades.filter(tr =>
          typeof tr.screenshot === "string" && tr.screenshot.startsWith("data:")
        );
        if (toMigrate.length > 0) {
          let migrationAlive = true;
          (async () => {
            let updated = [...loadedTrades];
            let changed = false;
            for (const tr of toMigrate) {
              if (!migrationAlive) break;
              try {
                const res = await fetch(tr.screenshot!);
                const blob = await res.blob();
                const storagePath = `${uid}/${Date.now()}_migrate_${tr.id}.jpg`;
                const { error } = await supabase.storage
                  .from("trade-screenshots")
                  .upload(storagePath, blob, { contentType: "image/jpeg", upsert: false });
                if (error) continue;
                const { data: urlData } = supabase.storage
                  .from("trade-screenshots")
                  .getPublicUrl(storagePath);
                updated = updated.map(x => x.id === tr.id ? { ...x, screenshot: urlData.publicUrl } : x);
                changed = true;
              } catch { /* skip — will retry next session */ }
            }
            if (changed && migrationAlive) {
              setTrades(updated);
              await storage.set("koda_trades", JSON.stringify(updated));
            }
          })();
          // Signal the IIFE to stop if the component unmounts before it finishes
          if (_loadedRef.current) { migrationAlive = true; }
        }
      }
    } catch (e) { log.error("loadAll.trades", e); setTrades([]); }

    // Profile (v2 → KV fallback)
    try {
      let p: Profile | null = null;
      if (v2ProfileRes) {
        const v2 = v2ProfileRes;
        p = {
          ...DEF_PROFILE,
          ...(v2.prefs || {}),
          uid: v2.userId,
          handle: v2.handle ? `@${v2.handle}` : "",
          name: v2.name ?? DEF_PROFILE.name,
          avatar: v2.avatar ?? DEF_PROFILE.avatar,
          bio: v2.bio ?? DEF_PROFILE.bio,
          broker: v2.broker ?? DEF_PROFILE.broker,
          timezone: v2.timezone ?? DEF_PROFILE.timezone,
          onboarded: v2.onboarded,
          publicTrades: v2.publicTrades,
        } as Profile;
      }
      if (!p) {
        p = pr ? (JSON.parse(pr.value) as Profile | null) : { ...DEF_PROFILE };
      }
      if (!p) p = { ...DEF_PROFILE };
      if (user?.id && p.uid !== user.id) {
        p = { ...p, uid: user.id } as Profile;
        try { await store.set("koda_profile", JSON.stringify(p)); }
        catch (e) { log.error("loadAll.profile.uidStamp", e); }
      }
      // Take the highest-tier plan from: KV blob, JWT claim, and the ?upgraded=1
      // signal (covers the window between checkout redirect and webhook settling).
      // JWT is signed server-side and cannot be forged; KV converges on next save.
      const _planPriority: Record<string, number> = { elite: 3, pro: 2, free: 1 };
      const _bestPlan = [p.plan ?? "free", jwtPlan ?? "free", _upgradedRef.current ? "pro" : "free"]
        .reduce((best, curr) => (_planPriority[curr] ?? 0) > (_planPriority[best] ?? 0) ? curr : best);
      if (_bestPlan !== "free") {
        p = { ...p, plan: _bestPlan as "pro" | "elite" } as Profile;
      }
      setProfile(p); setProfileDraft(p);
      // Identify user in PostHog so all events link to their account
      if (p.uid) phIdentify(p.uid, { handle: p.handle, plan: p.plan ?? "free" });
    } catch (e) { log.error("loadAll.profile", e); }

    try { if (sc) setStratChecklists(JSON.parse(sc.value)); }
    catch (e) { log.error("loadAll.checklists", e); }
    try { if (sr) setStratRules(JSON.parse(sr.value)); }
    catch (e) { log.error("loadAll.rules", e); }
    try { if (dm) setDarkMode(JSON.parse(dm.value)); }
    catch (e) { log.error("loadAll.dark", e); }
    try { if (ci) setMyCircles(JSON.parse(ci.value)); }
    catch (e) { log.error("loadAll.circles", e); }
    try { if (st) setStratThresholds(JSON.parse(st.value)); }
    catch (e) { log.error("loadAll.thresholds", e); }
    try {
      if (cs) {
        const parsed = JSON.parse(cs.value);
        setCustomStrategies(parsed);
        addExtraStrategies(Object.fromEntries(parsed.map((s: StrategyDef & { name: string }) => [s.name, s as StrategyDef])));
        
      }
    } catch (e) { log.error("loadAll.customStrategies", e); }
    // Tradovate session loaded by useTradovate hook after loading completes.

    // Load Stripe customer ID
    try {
      const store = storage;
      const stripeKv = await store.get("koda_stripe_customer").catch(() => null);
      if (stripeKv?.value) {
        const { customerId } = JSON.parse(stripeKv.value);
        if (customerId) setProfile(p => ({ ...p, stripeCustomerId: customerId }));
      }
    } catch (e) { log.error("loadAll.stripe", e); }

    // Stamp email from auth session onto profile state (not persisted)
    if (user?.email) {
      setProfile(p => ({ ...p, email: user.email }));
    }

    setLoading(false);
  }

  async function saveCustomStrategies(u: Array<StrategyDef & { name: string }>) {
    // Rebuild extra strategies from the new set (replaces stale entries).
    addExtraStrategies(Object.fromEntries(u.map((s) => [s.name, s as StrategyDef])));
    setCustomStrategies(u);
    await storage.set("koda_custom_strategies", JSON.stringify(u));
  }

  function openNewStrategy() {
    setEditingStrategy(null);
    setStrategyDraft({ name: "", code: "", setups: [], checklist: [], rules: [] });
    setShowStrategyEditor(true);
  }
  function openEditStrategy(s: StrategyDef & { name: string }) {
    setEditingStrategy(s.name);
    setStrategyDraft({ ...s, setups: [...(s.setups || [])], checklist: [...(s.checklist || [])], rules: [...(s.rules || [])] });
    setShowStrategyEditor(true);
  }
  async function saveStrategyDraft() {
    const d = strategyDraft;
    if (!d.name.trim()) { showToast("Name required"); return; }
    const code = (d.code || d.name).replace(/[^A-Z0-9]/gi, "").slice(0, 4).toUpperCase() || "NEW";
    const clean = { name: d.name.trim(), code, setups: d.setups.filter((x: string) => x?.trim()), checklist: d.checklist.filter((x: { text?: string }) => x?.text?.trim()), rules: d.rules.filter((x: { text?: string }) => x?.text?.trim()) };
    // Block overwriting a built-in.
    if (STRATEGY_NAMES.includes(clean.name) && editingStrategy !== clean.name) { showToast("Name clashes with a built-in"); return; }
    let u;
    if (editingStrategy) u = customStrategies.map((s: StrategyDef & { name: string }) => s.name === editingStrategy ? clean : s);
    else u = [...customStrategies, clean];
    await saveCustomStrategies(u);
    // Seed checklist/rules state so the Check tab can render the new strategy immediately.
    if (!stratChecklists[clean.name]) {
      const cl = clean.checklist.length ? clean.checklist : [];
      await saveStratChecklists({ ...stratChecklists, [clean.name]: cl });
    }
    if (!stratRules[clean.name]) {
      const rl = clean.rules.length ? clean.rules : [];
      await saveStratRules({ ...stratRules, [clean.name]: rl });
    }
    setShowStrategyEditor(false);
    showToast(editingStrategy ? "Strategy updated" : "Strategy added");
  }
  async function deleteCustomStrategy(name: string) {
    const u = customStrategies.filter((s: StrategyDef & { name: string }) => s.name !== name);
    await saveCustomStrategies(u);
    const cl = { ...stratChecklists }; delete cl[name]; await saveStratChecklists(cl);
    const rl = { ...stratRules }; delete rl[name]; await saveStratRules(rl);
    if (activeStrategy === name) setActiveStrategy(STRATEGY_NAMES[0]);
    showToast("Strategy deleted");
  }

  // Convert app Trade (strings, single screenshot) → v2 upsert shape
  function appTradeToV2Payload(t: Trade, uid: string) {
    const parseNum = (v: string | undefined) => { const n = parseFloat(v ?? ""); return isFinite(n) ? n : undefined; };
    const outcome = t.outcome === "win" || t.outcome === "loss" || t.outcome === "be" ? t.outcome : "be";
    return {
      userId: uid,
      clientId: String(t.id),
      pair: t.pair,
      side: t.direction ?? undefined,
      date: t.date,
      session: t.session ?? undefined,
      strategy: t.strategy,
      setup: t.setup ?? undefined,
      outcome: outcome as "win" | "loss" | "be",
      entryPrice: parseNum(t.entryPrice),
      slPrice: parseNum(t.slPrice),
      tpPrice: parseNum(t.tpPrice),
      pnl: parseNum(t.pnl) ?? 0,
      rr: parseNum(t.rr),
      notes: t.notes ?? undefined,
      screenshots: t.screenshot ? [t.screenshot] : [],
      reactions: t.reactions ?? {},
    };
  }

  async function saveTrades(u: Trade[]) {
    setTrades(u);
    // Always write KV — safety net + fast reads during migration window
    try {
      await storage.set("koda_trades", JSON.stringify(u));
    } catch (e) {
      log.error("saveTrades.kv", e);
    }
    // Dual-write to v2 public.trades when flag is on
    if (isFlagOn("newTrades") && user?.id) {
      const uid = user.id;
      // Fire-and-forget parallel upserts — do not block KV write
      Promise.all(u.map(t => upsertTradeV2(appTradeToV2Payload(t, uid))))
        .catch(e => log.error("saveTrades.v2", e));
    }
  }
  // ── Tradovate ─────────────────────────────────────────────────────────────
  // Placed here because saveTrades (defined above) must exist before the hook.
  const {
    tradovateSession, tradovatePositions,
    tradovateConnecting, tradovateSyncing,
    tradovateError, tradovateForm,
    setTradovateSession, setTradovateForm, setTradovateError,
    connectTradovate, refreshTradovatePositions,
    syncTradovateFills, disconnectTradovate,
  } = useTradovate({ loading, trades, saveTrades, showToast });

  // ── Circles ───────────────────────────────────────────────────────────────
  // circleStats is a memo so it can be computed here (before loadAll / the
  // main render-body stats block) without duplicating the render-path consts.
  // The hook stores it in a ref so publishToCircle always reads the latest
  // snapshot, even though the hook is called before the render-body stats.
  const circleStats = useMemo((): CircleStats => {
    const w = trades.filter(t => t.outcome === "Win").length;
    const l = trades.filter(t => t.outcome === "Loss").length;
    const total = trades.length;
    const winRate = total ? ((w / total) * 100).toFixed(1) : 0;
    const totalPnL = trades.reduce((a, t) => a + (parseFloat(t.pnl) || 0), 0).toFixed(2);
    const totalPnlDollar = trades.reduce((a, t) => a + (parseFloat(t.pnlDollar) || 0), 0);
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);
    const weekPnL = trades.filter(t => new Date(t.date) >= weekStart).reduce((a, t) => a + (parseFloat(t.pnl) || 0), 0);
    const rrTs = trades.filter(t => t.rr);
    const avgRR = rrTs.length ? (rrTs.reduce((a, t) => a + parseFloat(t.rr), 0) / rrTs.length).toFixed(2) : "—";
    const streak = (() => {
      if (!trades.length) return { type: null as string | null, count: 0 };
      let count = 0, type: string | null = null;
      for (const t of trades) {
        if (t.outcome === "Win" || t.outcome === "Loss") {
          if (type === null) { type = t.outcome; count = 1; }
          else if (t.outcome === type) count++;
          else break;
        }
      }
      return { type, count };
    })();
    const stratStats = trades.reduce((acc: Record<string, { w: number; l: number; be: number; pnl: number; count: number }>, t) => {
      if (t.strategy) {
        if (!acc[t.strategy]) acc[t.strategy] = { w: 0, l: 0, be: 0, pnl: 0, count: 0 };
        acc[t.strategy].count++;
        if (t.outcome === "Win") acc[t.strategy].w++;
        if (t.outcome === "Loss") acc[t.strategy].l++;
        if (t.outcome === "Breakeven") acc[t.strategy].be++;
        acc[t.strategy].pnl += parseFloat(t.pnl) || 0;
      }
      return acc;
    }, {});
    return { wins: w, losses: l, total, winRate, totalPnL, totalPnlDollar, weekPnL, avgRR, streak, stratStats };
  }, [trades]);

  const {
    myCircles, setMyCircles,
    circlesView, setCirclesView,
    activeCircle, setActiveCircle,
    circleForm, setCircleForm,
    circleJoinCode, setCircleJoinCode,
    circleMsg, setCircleMsg,
    circleLatestMsgs,
    isCreatingCircle, isJoiningCircle,
    saveMyCircles, myMemberRecord, readCircleMembers,
    createCircle, joinCircle, joinCircleByCode, kickMember, leaveCircle,
    publishToCircle, fetchCircleLeaderboard,
  } = useCircles({
    loading,
    uid: profile.uid,
    profile,
    getMyCode,
    homeSection,
    stats: circleStats,
    statsFingerprint,
    showToast,
  });

  // Backfill: every user gets auto-joined to Kōda Global. The onboarding flow
  // already does this for new users; this effect covers existing users who
  // onboarded before the auto-join was added.
  //
  // Race guard: joinCircleByCode is async. Without a ref the effect can fire
  // repeatedly while the first join is in-flight, producing duplicate
  // KODA_GLOBAL_CODE entries in myCircles. The ref ensures we only attempt
  // once per uid.
  //
  // Heal: if duplicates already exist on disk (from earlier broken backfills),
  // dedupe them in a single saveMyCircles pass.
  const kodaGlobalBackfillRef = useRef<string | null>(null);
  useEffect(() => {
    if (loading || !profile.uid) return;
    const globalEntries = myCircles.filter((c: Circle) => c.code === KODA_GLOBAL_CODE);

    if (globalEntries.length > 1) {
      const seen = new Set<string>();
      const deduped = myCircles.filter((c: Circle) => {
        if (c.code !== KODA_GLOBAL_CODE) return true;
        if (seen.has(c.code)) return false;
        seen.add(c.code);
        return true;
      });
      saveMyCircles(deduped).catch(() => {});
      kodaGlobalBackfillRef.current = profile.uid;
      return;
    }

    if (kodaGlobalBackfillRef.current === profile.uid) return;
    if (globalEntries.length === 1) {
      kodaGlobalBackfillRef.current = profile.uid;
      return;
    }
    kodaGlobalBackfillRef.current = profile.uid;
    joinCircleByCode(KODA_GLOBAL_CODE).catch(() => {});
  }, [loading, profile.uid, myCircles, joinCircleByCode, saveMyCircles]);

  async function handleCsvImport(newTrades: Trade[]) {
    if (!newTrades.length) { setShowCsvImport(false); return; }
    setIsImportingCsv(true);
    try {
      const merged = [...newTrades, ...trades];
      await saveTrades(merged);
      phCapture("csv_imported", { count: newTrades.length });
      setShowCsvImport(false);
      showToast(`Imported ${newTrades.length} trade${newTrades.length === 1 ? "" : "s"}`);
    } finally {
      setIsImportingCsv(false);
    }
  }
  async function saveProfile(u: Profile) {
    setProfile(u);
    // ── Legacy KV write (always — keeps live app working until v2 cutover) ──
    await storage.set("koda_profile", JSON.stringify(u));
    if (u.handle) {
      registerHandle(u.handle, profile.handle || null);
      // Write public profile so other traders can view it
      const norm = u.handle.replace(/^@/, "").toLowerCase();
      try {
        await storage.set(
          `koda_profile_pub_${norm}`,
          JSON.stringify({ name: u.name || "Trader", handle: norm, avatar: u.avatar || "", bio: u.bio || "", publicTrades: u.publicTrades || false }),
          true
        );
      } catch (e) { log.error("saveProfile.publicProfile", e, { handle: norm }); }
    }
    // ── V2 dual-write (only when flag on; failures are logged but never throw) ──
    if (isFlagOn("newProfile") && user?.id) {
      const norm = u.handle ? u.handle.replace(/^@/, "").toLowerCase() : "";
      // Pack everything that doesn't have a typed column into prefs so we
      // round-trip 100% of the legacy Profile shape.
      const { uid: _uid, handle: _h, name: _n, avatar: _a, bio: _b, broker: _br, timezone: _tz, onboarded: _o, publicTrades: _pt, ...prefs } = u as any;
      try {
        await upsertProfile({
          userId: user.id,
          handle: norm || `user_${user.id.slice(0, 8)}`,
          name: u.name || "",
          avatar: u.avatar || "",
          bio: u.bio || "",
          broker: u.broker || "",
          timezone: u.timezone || "UTC",
          memberCode: getMyCode(),
          isPublic: !!norm,
          publicTrades: !!u.publicTrades,
          onboarded: !!u.onboarded,
          prefs,
        });
      } catch (e) { log.error("saveProfile.v2", e, { userId: user.id }); }
    }
  }
  async function saveStratChecklists(u: Record<string, { id: number; text: string }[]>) { setStratChecklists(u); await storage.set("koda_checklists", JSON.stringify(u)); }

  async function saveStratThresholds(u: Record<string, { minCount: number; required: string[] }>) { setStratThresholds(u); await storage.set("koda_thresholds", JSON.stringify(u)); }
  async function saveStratRules(u: Record<string, { id: number; text: string }[]>) { setStratRules(u); await storage.set("koda_rules", JSON.stringify(u)); }
  async function toggleDark() { const nd = !darkMode; setDarkMode(nd); await storage.set("koda_dark", JSON.stringify(nd)); }

  // Swipe — wired via useEffect so we can pass { passive: false } and call
  // preventDefault(), which prevents the browser from interpreting a horizontal
  // swipe as a scroll and shifting its bottom chrome up/down.
  useEffect(() => {
    const el = swipeRef.current;
    if (!el) return;
    function handleTouchStart(e: TouchEvent) {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    }
    function handleTouchEnd(e: TouchEvent) {
      if (touchStartX.current === null || touchStartY.current === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      const dy = e.changedTouches[0].clientY - touchStartY.current;
      touchStartX.current = null;
      touchStartY.current = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        e.preventDefault();
        setView(v => {
          const idx = TABS.indexOf(v);
          if (dx < 0 && idx < TABS.length - 1) return TABS[idx + 1];
          if (dx > 0 && idx > 0) return TABS[idx - 1];
          return v;
        });
      }
    }
    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: false });
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    const u = { ...form, [name]: value } as Partial<Trade>;
    if (["entryPrice", "slPrice", "tpPrice"].includes(name)) u.rr = calcRR(name === "entryPrice" ? value : (u.entryPrice ?? ""), name === "slPrice" ? value : (u.slPrice ?? ""), name === "tpPrice" ? value : (u.tpPrice ?? ""));
    if (name === "strategy") u.setup = "";
    setForm(u);
  }

  async function submitTrade() {
    if (!form.pair || !form.date || !form.outcome || savingTrade) return;
    setSavingTrade(true);
    const now = new Date().toISOString();
    const base = { comments: [], reactions: {}, ...form, updatedAt: now };
    let u: Trade[];
    if (editId) {
      // Preserve original createdAt; stamp new updatedAt.
      u = trades.map(t => t.id === editId ? { ...base, id: editId, createdAt: t.createdAt ?? now } as Trade : t);
      setEditId(null);
    } else {
      u = [{ ...base, id: Date.now(), createdAt: now } as Trade, ...trades];
    }
    await saveTrades(u); setForm(EMPTY_TRADE);
    phCapture(editId ? "trade_edited" : "trade_logged", { outcome: base.outcome, pair: base.pair, total_trades: u.length });
    showToast("Trade saved");
    const totalSaved = u.length;
    const winsSaved = u.filter((t: Trade) => t.outcome === "Win").length;
    const wrSaved = Math.round(winsSaved / Math.max(totalSaved, 1) * 100);
    const avgRSaved = parseFloat((u.reduce((s: number, t: Trade) => s + (parseFloat(t.rr) || 0), 0) / Math.max(totalSaved, 1)).toFixed(1));
    const newLossStreak = (() => { let n = 0; for (const t of u) { if (t.outcome === "Loss") { n++; } else { break; } } return n; })();
    if (base.outcome === "Loss") {
      setCelebration({ kind: newLossStreak >= 3 ? "streak-loss" : "loss", streakCount: newLossStreak, tradeStats: { winRate: wrSaved, avgR: avgRSaved, streak: calcStreak(u).count } });
    } else {
      const newStreak = calcStreak(u).count;
      // Check for milestone (3/7/14/30/100) — deduplicated via user_kv
      const hitMilestone = STREAK_MILESTONES.find(m => m === newStreak);
      if (hitMilestone) {
        try {
          const raw = await (window as any).storage.get("koda_streak_milestones");
          const parsed = raw ? JSON.parse(raw) : [];
          const shown: number[] = Array.isArray(parsed) ? parsed : [];
          if (!shown.includes(hitMilestone)) {
            await (window as any).storage.set("koda_streak_milestones", JSON.stringify([...shown, hitMilestone]));
            setStreakBanner({ streakCount: hitMilestone });
          }
        } catch {
          // KV error — skip banner, don't block trade save
        }
      }
      setCelebration({ kind: "trade", tradeStats: { winRate: wrSaved, avgR: avgRSaved, streak: newStreak } });
    }
    setTimeout(() => setSavingTrade(false), 1500);
    // Go back if we have history, otherwise land on journal
    setViewHistory(h => { if (h.length > 0) { setView(h[h.length - 1]); return h.slice(0, -1); } setView("history"); return h; });
  }

  function editTrade(t: Trade) { setForm(t); setEditId(t.id); navigateTo("log"); }
  async function deleteTrade(id: number) {
    await saveTrades(trades.filter(t => t.id !== id));
    // Also remove from v2 when flag is on
    if (isFlagOn("newTrades") && user?.id) {
      deleteTradeV2ByClientId(user.id, String(id)).catch(e => log.error("deleteTrade.v2", e));
    }
    setConfirmDelete(null);
    showToast("Trade deleted");
  }
  async function toggleReaction(tid: number, reaction: string) {
    const myCode = getMyCode();
    const u = trades.map((t: Trade) => {
      if (t.id !== tid) return t;
      const r: ReactionMap = { ...(t.reactions || {}) };
      const current = r[reaction];
      if (!Array.isArray(current)) {
        // Migration: old format was a count number. Treat it as having no known reactors
        // and seed with the current user so they can toggle off next time.
        r[reaction] = [myCode];
      } else if (current.includes(myCode)) {
        // Already reacted — remove (toggle off).
        const next = current.filter((c: string) => c !== myCode);
        if (next.length === 0) delete r[reaction];
        else r[reaction] = next;
      } else {
        // Add reaction.
        r[reaction] = [...current, myCode];
      }
      return { ...t, reactions: r };
    });
    await saveTrades(u);
  }
  async function addComment(tid: number) {
    const text = (commentInputs[tid] || "").trim();
    if (!text) return;
    const c = { id: Date.now(), author: profile.name || "You", text, ts: new Date().toLocaleString() };
    const u = trades.map(t => t.id === tid ? { ...t, comments: [...(t.comments || []), c] } : t);
    await saveTrades(u);
    setCommentInputs((p: Record<number, string>) => ({ ...p, [tid]: "" }));
  }
  async function deleteComment(tid: number, cid: number) {
    const myName = profile.name || "You";
    // Guard: only let the comment author delete their own comment.
    const trade = trades.find((t: Trade) => t.id === tid);
    const comment = (trade?.comments || []).find((c: TradeComment) => c.id === cid);
    if (!comment) return;
    const isAuthor = comment.author === myName || comment.author === "You";
    if (!isAuthor) { showToast("Can't delete someone else's comment"); return; }
    const u = trades.map((t: Trade) => t.id === tid ? { ...t, comments: (t.comments || []).filter((c: TradeComment) => c.id !== cid) } : t);
    await saveTrades(u);
  }

  // Screenshot upload
  async function handleScreenshotUpload(e: React.ChangeEvent<HTMLInputElement>, tradeId: number | null) {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 15 * 1024 * 1024) { showToast("Image too large — max 15MB"); return; }
    if (!file.type.startsWith("image/")) { showToast("File must be an image"); return; }
    showToast("Uploading screenshot\u2026");
    try {
      const dataUri = await compressImage(file, 800);
      const res = await fetch(dataUri);
      const blob = await res.blob();
      const uid = profile?.uid || "anon";
      const path = `${uid}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
      const { error } = await supabase.storage.from("trade-screenshots").upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("trade-screenshots").getPublicUrl(path);
      const screenshotUrl = urlData.publicUrl;
      if (tradeId) { const u = trades.map(t => t.id === tradeId ? { ...t, screenshot: screenshotUrl } : t); await saveTrades(u); }
      else setForm((f) => ({ ...f, screenshot: screenshotUrl }));
      showToast("Screenshot saved");
    } catch (err) {
      log.error("screenshot.upload", err);
      const compressed = await compressImage(file, 800);
      if (tradeId) { const u = trades.map(t => t.id === tradeId ? { ...t, screenshot: compressed } : t); await saveTrades(u); }
      else setForm((f) => ({ ...f, screenshot: compressed }));
      showToast("Saved locally (Storage unavailable)");
    }
  }
  async function removeScreenshot(tradeId: number | null) {
    const existing = tradeId ? trades.find((t: Trade) => t.id === tradeId)?.screenshot : (form as any)?.screenshot;
    if (existing && typeof existing === "string" && existing.includes("trade-screenshots")) {
      try {
        const url = new URL(existing);
        const marker = "/object/public/trade-screenshots/";
        const idx = url.pathname.indexOf(marker);
        if (idx >= 0) {
          const storagePath = decodeURIComponent(url.pathname.slice(idx + marker.length));
          await supabase.storage.from("trade-screenshots").remove([storagePath]);
        }
      } catch { /* non-fatal */ }
    }
    if (tradeId) { const u = trades.map(t => t.id === tradeId ? { ...t, screenshot: "" } : t); await saveTrades(u); }
    else setForm((f) => ({ ...f, screenshot: "" }));
  }

  // Avatar upload
  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast("Avatar too large — max 5MB"); return; }
    if (!file.type.startsWith("image/")) { showToast("File must be an image"); return; }
    showToast("Uploading avatar…");
    try {
      const compressed = await compressImage(file, 300);
      const res = await fetch(compressed);
      const blob = await res.blob();
      const uid = profile?.uid || user?.id || "anon";
      const path = `${uid}/avatars/avatar_${Date.now()}.jpg`;
      const { error } = await supabase.storage.from("trade-screenshots").upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("trade-screenshots").getPublicUrl(path);
      setProfileDraft((d) => ({ ...d, avatar: urlData.publicUrl }));
      showToast("Avatar updated");
    } catch (err) {
      log.error("avatar.upload", err);
      // Fall back to base64 so the user still sees their new avatar
      const compressed = await compressImage(file, 300);
      setProfileDraft((d) => ({ ...d, avatar: compressed }));
      showToast("Saved locally (Storage unavailable)");
    }
  }

  // Checklist helpers
  const checkItems = stratChecklists[activeStrategy] || [];
  const ruleItems = stratRules[activeStrategy] || [];
  function toggleCheck(id: number) { setChecked((p: Record<string, boolean>) => ({ ...p, [`${activeStrategy}-${id}`]: !p[`${activeStrategy}-${id}`] })); }
  function isChecked(id: number) { return !!checked[`${activeStrategy}-${id}`]; }
  function resetChecklist() { const n = { ...checked }; checkItems.forEach((i: { id: number; text: string }) => { delete n[`${activeStrategy}-${i.id}`]; }); setChecked(n); }
  async function addCheckItem() { if (!newCheckText.trim()) return; const u = { ...stratChecklists, [activeStrategy]: [...checkItems, { id: Date.now(), text: newCheckText.trim() }] }; await saveStratChecklists(u); setNewCheckText(""); setAddingCheck(false); }
  async function deleteCheckItem(id: number) { const u = { ...stratChecklists, [activeStrategy]: checkItems.filter((i: { id: number; text: string }) => i.id !== id) }; await saveStratChecklists(u); }
  async function saveEditCheck(id: number, text: string) { const u = { ...stratChecklists, [activeStrategy]: checkItems.map((i: { id: number; text: string }) => i.id === id ? { ...i, text } : i) }; await saveStratChecklists(u); setEditingCheckItem(null); }
  async function addRule() { if (!newRuleText.trim()) return; const u = { ...stratRules, [activeStrategy]: [...ruleItems, { id: Date.now(), text: newRuleText.trim() }] }; await saveStratRules(u); setNewRuleText(""); setAddingRule(false); }
  async function deleteRule(id: number) { const u = { ...stratRules, [activeStrategy]: ruleItems.filter((r: { id: number; text: string }) => r.id !== id) }; await saveStratRules(u); }
  async function saveEditRule(id: number, text: string) { const u = { ...stratRules, [activeStrategy]: ruleItems.map((r: { id: number; text: string }) => r.id === id ? { ...r, text } : r) }; await saveStratRules(u); setEditingRule(null); }

  // Friends
  // ── Stable user code (rename-safe) ──────────────────────────────
  // Once a user has a code, it is LOCKED to their profile.code field. Renaming
  // (changing profile.name) does not change their code — followers and circle
  // entries keyed to the old code keep working. Only on first call do we
  // synthesize one from the auth uid (or a random fallback for offline users)
  // and persist it. This is the fix for BETA-SMOKE-TEST.md Phase 0.2.
  function getMyCode() {
    if ((profile as any).code) return (profile as any).code;
    const authUid = (user as any)?.id;
    const uid: string = profile.uid || authUid || Math.random().toString(36).slice(2, 10).toUpperCase();
    const namePart = (profile.name || "").toUpperCase().replace(/\s+/g, "").slice(0, 6);
    // FNV-1a 32-bit hash for short, stable codes when we have no name.
    let h = 0x811c9dc5;
    for (let i = 0; i < uid.length; i++) {
      h ^= uid.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    const fallback = "T-" + h.toString(16).padStart(8, "0").toUpperCase();
    const code = namePart ? `${namePart}-${uid}` : fallback;
    // Persist the code AND the uid so future calls hit the early-return above.
    saveProfile({ ...profile, uid, code });
    return code;
  }

  // ── Follow system ───────────────────────────────────────────────────────
  const { following, followers, followerProfiles, followUser, unfollowUser } = useFollows({
    loading,
    getMyCode,
    uid: profile.uid,
    showToast,
  });

  // ── Handle registry ────────────────────────────────────────────
  // Maps @handle → { code, name } in shared_kv. Owner = the handle's user,
  // so only they can update/delete their own handle row (RLS-safe).
  // Key: `koda_handle_${normalised}` where normalised = lowercase, no @.
  function normaliseHandle(h: string): string {
    return h.replace(/^@/, "").toLowerCase().replace(/[^a-z0-9_]/g, "");
  }
  async function resolveHandle(handle: string): Promise<{ code: string; name: string } | null> {
    try {
      const key = `koda_handle_${normaliseHandle(handle)}`;
      const r = await storage.get(key, true);
      if (!r) return null;
      return JSON.parse(r.value);
    } catch { return null; }
  }
  // ── Feed system (friends, feed, reactions, follow-by-handle) ─────────────
  const {
    friends, friendFeed, myFeedReactions,
    showAddFriend, setShowAddFriend,
    friendCodeInput, setFriendCodeInput, friendMsg, addFriend, removeFriend, saveFriends,
    followHandleInput, setFollowHandleInput, followHandleMsg, followHandleLoading, followByHandle,
    publishFeed, refreshFeed, reactToFeed,
  } = useFeed({ loading, trades, profile, following, followUser, getMyCode, resolveHandle });

  async function registerHandle(handle: string, oldHandle: string | null): Promise<void> {
    const mc = getMyCode();
    const norm = normaliseHandle(handle);
    if (!norm) return;
    // Clean up old handle row if the handle changed (we own it, RLS allows delete).
    if (oldHandle && normaliseHandle(oldHandle) !== norm) {
      try { await storage.del(`koda_handle_${normaliseHandle(oldHandle)}`, true); } catch {}
    }
    await storage.set(
      `koda_handle_${norm}`,
      JSON.stringify({ code: mc, name: profile.name || "Trader" }),
      true
    );
  }
  async function isHandleTaken(handle: string): Promise<boolean> {
    const existing = await resolveHandle(handle);
    if (!existing) return false;
    // It's taken only if owned by someone else.
    return existing.code !== getMyCode();
  }

  // ── Follow system (per-row edges, one-way) ─────────────────────
  // ── Data export ──────────────────────────────────────────────────────────
  function exportData() {
    const data = {
      exportedAt: new Date().toISOString(),
      profile: { name: profile.name, handle: profile.handle, bio: profile.bio, broker: profile.broker, timezone: profile.timezone },
      trades: trades.map(t => ({
        date: t.date, pair: t.pair, session: t.session, bias: t.bias, strategy: t.strategy,
        setup: t.setup, entryPrice: t.entryPrice, slPrice: t.slPrice, tpPrice: t.tpPrice,
        rr: t.rr, outcome: t.outcome, pnl: t.pnl, pnlDollar: t.pnlDollar,
        notes: t.notes, emotions: t.emotions,
      })),
      tradeCount: trades.length,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `koda-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Export downloaded");
  }

  function exportCSV() {
    const headers = ["Date","Pair","Session","Bias","Strategy","Setup","Entry","SL","TP","R:R","Outcome","P&L (R)","P&L ($)","Notes","Emotions"];
    const rows = trades.map(t => [
      t.date, t.pair, t.session, t.bias, t.strategy, t.setup,
      t.entryPrice, t.slPrice, t.tpPrice, t.rr, t.outcome, t.pnl, t.pnlDollar,
      `"${(t.notes || "").replace(/"/g, '""')}"`,
      `"${(Array.isArray(t.emotions) ? t.emotions.join(", ") : t.emotions || "").replace(/"/g, '""')}"`
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `koda-trades-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("CSV downloaded");
  }

  async function submitFeedback() {
    if (!feedbackText.trim() || feedbackSending || feedbackSent) return;
    setFeedbackSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ feedback: feedbackText.trim(), name: profile.name, handle: profile.handle }),
      });
      if (res.ok) {
        setFeedbackSent(true);
        setFeedbackSending(false);
        setTimeout(() => {
          setFeedbackOpen(false);
          setFeedbackText("");
          setFeedbackSent(false);
        }, 1500);
        return;
      } else {
        showToast("Failed to send — try again");
      }
    } catch (e) {
      log.error("feedback.send", e);
      showToast("Failed to send — try again");
    }
    setFeedbackSending(false);
  }

  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  async function deleteAccount() {
    if (deleteConfirm.toUpperCase() !== "DELETE") { showToast("Type DELETE to confirm"); return; }
    setDeletingAccount(true);
    try {
      // Call the service-role endpoint. The browser session can't delete from
      // public.trades / broker_connections / sync_events / auth.users, so the
      // legacy client-side wipe was incomplete. The endpoint does:
      //   broker tokens → sync audit → trades → profiles → user_kv → shared_kv
      //   → Stripe subscription cancel → auth.users delete
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not signed in");

      const res = await fetch("/api/delete-account", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Delete failed (${res.status})`);
      }

      phReset();
      // The auth.users row is already gone server-side; this clears any
      // local Supabase session state.
      await supabase.auth.signOut().catch(() => {});
      showToast("Account deleted. Goodbye.");
    } catch (e) {
      log.error("deleteAccount", e);
      showToast(e instanceof Error ? e.message : "Error deleting account. Please contact support.");
    } finally {
      setDeletingAccount(false);
    }
  }

  // Friends = mutual follows (I follow them + they follow me).
  const friendCodes = following.filter(c => followers.includes(c));

  // Stats — memoised so derived values only recompute when `trades` changes.
  const { wins, losses, bes, total, winRate, totalPnL } = useMemo(() => {
    const wins    = trades.filter(t => t.outcome === "Win").length;
    const losses  = trades.filter(t => t.outcome === "Loss").length;
    const bes     = trades.filter(t => t.outcome === "Breakeven").length;
    const total   = trades.length;
    const winRate = total ? ((wins / total) * 100).toFixed(1) : 0;
    const totalPnL = trades.reduce((a, t) => a + (parseFloat(t.pnl) || 0), 0).toFixed(2);
    return { wins, losses, bes, total, winRate, totalPnL };
  }, [trades]);

  const pnlPos = parseFloat(totalPnL) >= 0;

  // ── Trade-derived stats — all memoised on [trades] ───────────────────────
  const {
    weekTrades, weekPnL, weekPnLStr, weekPnLPos,
    hasDollarData, totalPnlDollar, weekPnlDollar,
    rrTrades, avgRR, streak, stratStats, sessionStats, pairStats,
  } = useMemo(() => {
    const now = new Date();
    const day = now.getDay();
    const msSinceMonday = ((day === 0 ? 6 : day - 1)) * 86400000
      + now.getHours() * 3600000 + now.getMinutes() * 60000 + now.getSeconds() * 1000;
    const weekStart = new Date(now.getTime() - msSinceMonday);
    weekStart.setHours(0, 0, 0, 0);
    const weekStartStr = weekStart.toISOString().split("T")[0];
    const weekTrades = trades.filter(t => t.date >= weekStartStr);
    const weekPnL = weekTrades.reduce((a, t) => a + (parseFloat(t.pnl) || 0), 0);
    const hasDollarData = trades.some(t => t.pnlDollar && t.pnlDollar !== "");
    const totalPnlDollar = trades.reduce((a, t) => a + (parseFloat(t.pnlDollar) || 0), 0);
    const weekPnlDollar = weekTrades.reduce((a, t) => a + (parseFloat(t.pnlDollar) || 0), 0);
    const rrTrades = trades.filter(t => t.rr);
    const avgRR = rrTrades.length ? (rrTrades.reduce((a, t) => a + parseFloat(t.rr), 0) / rrTrades.length).toFixed(2) : "—";
    const stratStats = trades.reduce((acc: Record<string, { w: number; l: number; be: number; pnl: number; count: number }>, t: Trade) => {
      if (t.strategy) {
        if (!acc[t.strategy]) acc[t.strategy] = { w: 0, l: 0, be: 0, pnl: 0, count: 0 };
        acc[t.strategy].count++;
        if (t.outcome === "Win") acc[t.strategy].w++;
        if (t.outcome === "Loss") acc[t.strategy].l++;
        if (t.outcome === "Breakeven") acc[t.strategy].be++;
        acc[t.strategy].pnl += parseFloat(t.pnl) || 0;
      }
      return acc;
    }, {});
    const sessionStats = trades.reduce((acc: Record<string, { w: number; l: number; pnl: number }>, t: Trade) => {
      if (t.session) {
        if (!acc[t.session]) acc[t.session] = { w: 0, l: 0, pnl: 0 };
        if (t.outcome === "Win") acc[t.session].w++;
        if (t.outcome === "Loss") acc[t.session].l++;
        acc[t.session].pnl += parseFloat(t.pnl) || 0;
      }
      return acc;
    }, {});
    const pairStats = trades.reduce((acc: Record<string, { w: number; l: number; pnl: number }>, t: Trade) => {
      if (t.pair) {
        if (!acc[t.pair]) acc[t.pair] = { w: 0, l: 0, pnl: 0 };
        if (t.outcome === "Win") acc[t.pair].w++;
        if (t.outcome === "Loss") acc[t.pair].l++;
        acc[t.pair].pnl += parseFloat(t.pnl) || 0;
      }
      return acc;
    }, {});
    return {
      weekTrades, weekPnL, weekPnLStr: weekPnL.toFixed(2), weekPnLPos: weekPnL >= 0,
      hasDollarData, totalPnlDollar, weekPnlDollar,
      rrTrades, avgRR, streak: calcStreak(trades), stratStats, sessionStats, pairStats,
    };
  }, [trades]);
  const filteredTrades = useMemo(() => trades.filter(t => {
    if (filter.outcome && t.outcome !== filter.outcome) return false;
    if (filter.setup && t.setup !== filter.setup) return false;
    if (filter.pair && !t.pair.toLowerCase().includes(filter.pair.toLowerCase())) return false;
    if (filter.strategy && t.strategy !== filter.strategy) return false;
    if (filter.dateFrom && t.date < filter.dateFrom) return false;
    if (filter.dateTo && t.date > filter.dateTo) return false;
    return true;
  }), [trades, filter]);

  const checkedCount = checkItems.filter((i: { id: number; text: string }) => isChecked(i.id)).length;
  const totalItems = checkItems.length;
  const scorePct = totalItems ? Math.round((checkedCount / totalItems) * 100) : 0;
  const insights = useMemo(() => generateInsights(trades), [trades]);
  const _allStratMap = useMemo(() => getAllStrategiesMap(), [customStrategies]);
  const allSetups = useMemo(
    () => allStrategyNames.flatMap((s: string) => _allStratMap[s]?.setups || []).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i),
    [allStrategyNames, _allStratMap]
  );

  // ─── SHARED STYLES — generated from theme.ts ─────────────────────────────
  const { inp, sel, lbl, pillPrimary, pillGhost } = makeStyles(C);

  const NAV_TABS = [
    { id: "home",    label: "Home",    path: "M3 10l7-7 7 7v8a1 1 0 01-1 1H4a1 1 0 01-1-1z" },
    { id: "log",     label: "Log",     path: "M5 4h10v12H5zM7 7h6M7 10.5h6M7 14h4" },
    { id: "stats",   label: "Stats",   path: "M3 16V9M9 16V3M15 16v-5M18 16H2" },
    { id: "history", label: "Journal", path: "M4 4h12v12H4zM7 8h6M7 11h6M7 14h3" },
    { id: "circles", label: "Circles", path: "M5 8a3 3 0 1 1 6 0 3 3 0 0 1-6 0zM12.5 11a3 3 0 0 1 4.5 2.5M3 17c0-2.5 2-3.8 5-3.8s5 1.3 5 3.8" },
  ];

  // Sub-section config per main view — fed to the desktop SubNavDropdown so
  // main-nav + sub-nav fit on one row instead of stacking into two.
  const HOME_SECTIONS = [
    { id: "feed", label: "Overview" },
    { id: "circles", label: "Circles" },
    { id: "ai", label: "Execution" },
    { id: "analytics", label: "Analytics" },
    { id: "rules", label: "Rules" },
    { id: "checklist", label: "Checklist" },
    { id: "sync", label: "Sync" },
    ...(profile.propFirmMode ? [{ id: "eval", label: "Eval" }] : []),
  ];
  const STATS_SECTIONS = [
    { id: "overview", label: "Overview" },
    { id: "performance", label: "Performance" },
    { id: "strategies", label: "Strategies" },
    { id: "calendar", label: "Calendar" },
    { id: "weekly", label: "Weekly" },
    { id: "psychology", label: "Psychology" },
    { id: "heatmap", label: "Heatmap" },
    { id: "maemfe", label: "MAE/MFE" },
  ];

  const openExportPdf = () => {
    const norm = (profile.handle || "").replace(/^@/, "").toLowerCase();
    const today = new Date().toISOString().split("T")[0];
    const wr = total > 0 ? Math.round((wins / total) * 100) : 0;
    const avgR = total > 0 ? (parseFloat(totalPnL) / total).toFixed(2) : "0";
    const recentTrades = [...trades].sort((a, b) => b.date > a.date ? 1 : -1).slice(0, 15);
    const stratMap: Record<string, {w:number;l:number;pnl:number}> = {};
    trades.forEach((t: Trade) => {
      if (!t.strategy) return;
      if (!stratMap[t.strategy]) stratMap[t.strategy] = {w:0,l:0,pnl:0};
      if (t.outcome === "Win") stratMap[t.strategy].w++;
      else if (t.outcome === "Loss") stratMap[t.strategy].l++;
      stratMap[t.strategy].pnl += parseFloat(t.pnl)||0;
    });
    const topStrats = Object.entries(stratMap).sort((a,b)=>b[1].pnl-a[1].pnl).slice(0,5);
    const css = "*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#fff;color:#111;padding:40px;max-width:800px;margin:0 auto}h1{font-size:28px;font-weight:600;letter-spacing:-0.02em;margin-bottom:4px}.meta{font-size:12px;color:#888;font-family:monospace;letter-spacing:0.08em;margin-bottom:40px}h2{font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#888;margin:32px 0 12px;padding-top:24px;border-top:1px solid #eee}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:8px}.card{background:#f8f8f7;border-radius:8px;padding:14px;text-align:center}.card-n{font-size:28px;font-weight:500;letter-spacing:-0.02em}.card-l{font-size:10px;color:#888;margin-top:2px;letter-spacing:0.08em;text-transform:uppercase}.green{color:#15803d}.red{color:#dc2626}table{width:100%;border-collapse:collapse;font-size:12px}th{text-align:left;padding:8px 0;border-bottom:2px solid #eee;font-family:monospace;font-size:10px;letter-spacing:0.1em;color:#888}td{padding:8px 0;border-bottom:1px solid #f0f0f0}.footer{margin-top:48px;font-size:11px;color:#aaa;font-family:monospace;letter-spacing:0.08em;border-top:1px solid #eee;padding-top:16px}@media print{body{padding:20px}.no-print{display:none}}";
    const stratRows = topStrats.map(([name,s]) => "<tr><td>" + name + "</td><td>" + s.w + "</td><td>" + s.l + "</td><td>" + (s.w+s.l>0?Math.round(s.w/(s.w+s.l)*100):0) + "%</td><td class=\"" + (s.pnl>=0?"green":"red") + "\">" + (s.pnl>=0?"+":"") + s.pnl.toFixed(2) + "R</td></tr>").join("");
    const tradeRows = recentTrades.map(t => "<tr><td>" + t.date + "</td><td>" + (t.pair||"—") + "</td><td>" + (t.strategy||"—") + "</td><td>" + (t.session||"—") + "</td><td class=\"" + (t.outcome==="Win"?"green":t.outcome==="Loss"?"red":"") + "\">" + (t.outcome||"—") + "</td><td class=\"" + (parseFloat(t.pnl)>=0?"green":"red") + "\">" + (parseFloat(t.pnl)>=0?"+":"") + (t.pnl||0) + "R</td></tr>").join("");
    const pnlClass = parseFloat(totalPnL)>=0?"green":"red";
    const wrClass = wr>=50?"green":"red";
    const avgRClass = parseFloat(avgR)>=0?"green":"red";
    const html = "<!DOCTYPE html><html><head><meta charset=\"UTF-8\"><title>Kōda Report — " + (profile.name||"Trader") + " — " + today + "</title><style>" + css + "</style></head><body>"
      + "<button class=\"no-print\" onclick=\"window.print()\" style=\"margin-bottom:24px;padding:10px 20px;background:#111;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-family:monospace;letter-spacing:0.08em\">Print / Save as PDF</button>"
      + "<h1>" + (profile.name||"Trader") + "</h1>"
      + "<div class=\"meta\">@" + norm + " &nbsp;·&nbsp; KŌDA PERFORMANCE REPORT &nbsp;·&nbsp; " + today + "</div>"
      + "<div class=\"grid\">"
      + "<div class=\"card\"><div class=\"card-n\">" + total + "</div><div class=\"card-l\">Trades</div></div>"
      + "<div class=\"card\"><div class=\"card-n " + wrClass + "\">" + wr + "%</div><div class=\"card-l\">Win Rate</div></div>"
      + "<div class=\"card\"><div class=\"card-n " + avgRClass + "\">" + (parseFloat(avgR)>=0?"+":"") + avgR + "R</div><div class=\"card-l\">Avg R / Trade</div></div>"
      + "<div class=\"card\"><div class=\"card-n " + pnlClass + "\">" + (parseFloat(totalPnL)>=0?"+":"") + parseFloat(totalPnL).toFixed(1) + "R</div><div class=\"card-l\">Total P&L</div></div>"
      + "</div>"
      + "<h2>Top Strategies</h2>"
      + "<table><tr><th>Strategy</th><th>W</th><th>L</th><th>Win %</th><th>Total P&amp;L</th></tr>" + stratRows + "</table>"
      + "<h2>Recent Trades</h2>"
      + "<table><tr><th>Date</th><th>Pair</th><th>Strategy</th><th>Session</th><th>Outcome</th><th>P&amp;L</th></tr>" + tradeRows + "</table>"
      + "<div class=\"footer\">Generated by Kōda · kodatrade.co.uk · " + today + "</div>"
      + "</body></html>";
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };
  const CHECKLIST_SECTIONS = [
    { id: "pretrade", label: "Pre-trade" },
    { id: "rules", label: "Rules" },
  ];
  const subNavFor = (v: string) => {
    if (v === "home") return { sections: HOME_SECTIONS, value: homeSection, onChange: (s: string) => { if (s === "checklist") navigateTo("checklist"); else setHomeSection(s); } };
    if (v === "stats") return { sections: STATS_SECTIONS, value: statsTab, onChange: setStatsTab };
    if (v === "checklist") return { sections: CHECKLIST_SECTIONS, value: checklistTab, onChange: setChecklistTab };
    return null;
  };

  if (loading) return (
    <div style={{ minHeight: "100dvh", background: DARK.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "20px" }}>
      <style>{`
        @keyframes splashPulse{0%,100%{transform:scale(1);opacity:0.18}50%{transform:scale(1.55);opacity:0}}
        @keyframes splashBreath{0%,100%{opacity:0.3;transform:scale(0.92)}50%{opacity:1;transform:scale(1)}}
        @keyframes splashDot{0%,80%,100%{opacity:0.2;transform:scale(0.7)}40%{opacity:1;transform:scale(1)}}
      `}</style>
      {/* Pulse ring behind logo */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", width: "96px", height: "96px", borderRadius: "50%", border: `1.5px solid ${DARK.text}`, animation: "splashPulse 2s ease-in-out infinite" }} />
        <div style={{ animation: "splashBreath 2.4s ease-in-out infinite" }}>
          <KodaMarkFilled size={64} bg={DARK.panel} />
        </div>
      </div>
      {/* Wordmark */}
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
        <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: "18px", letterSpacing: "0.22em", color: DARK.text }}>Kōda</span>
        <span style={{ fontFamily: MONO, fontWeight: 500, fontSize: "9px", letterSpacing: "0.16em", color: DARK.text2, padding: "2px 5px", borderRadius: "4px", border: `1px solid ${DARK.border2}`, lineHeight: 1 }}>OS</span>
      </div>
      {/* Breathing dots */}
      <div style={{ display: "flex", gap: "6px" }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{ width: "5px", height: "5px", borderRadius: "50%", background: DARK.text, display: "inline-block", animation: `splashDot 1.2s ease-in-out infinite`, animationDelay: `${i * 0.2}s` }} />
        ))}
      </div>
    </div>
  );

  // Show onboarding for new users who haven't completed the flow yet.
  // Also check localStorage as a backup in case the Supabase write failed mid-onboarding.
  const _localOnboarded = typeof window !== "undefined" && localStorage.getItem("koda_onboarded") === "1";
  if (!profile.onboarded && !_localOnboarded) {
    return (
      <OnboardingFlow
        C={C}
        allStrategyNames={allStrategyNames}
        onComplete={async ({ name, handle, avatar, bio, twitter, instruments, strategy }: OnboardingData) => {
          // Set localStorage immediately so a refresh won't re-show onboarding
          // even if the Supabase write hasn't completed yet.
          try { localStorage.setItem("koda_onboarded", "1"); } catch {}
          const cleanHandle = handle.trim() || `@${name.trim().toLowerCase().replace(/\s+/g, "")}`;
          const updated: Profile = {
            ...profile,
            name: name.trim(),
            handle: cleanHandle,
            avatar: avatar || profile.avatar,
            bio: bio.trim() || profile.bio,
            broker: profile.broker,
            timezone: profile.timezone,
            startDate: profile.startDate,
            targetRR: profile.targetRR,
            maxTradesPerDay: profile.maxTradesPerDay,
            onboarded: true,
            instruments: instruments.length > 0 ? instruments : profile.instruments,
            socialLinks: twitter.trim() ? { twitter: twitter.trim() } : profile.socialLinks,
          };
          await saveProfile(updated);
          // Auto-join Kōda Global circle for every new user (silent — no error on failure).
          // Using KODA_GLOBAL_CODE; joinCircleByCode auto-creates the global record if absent.
          if (!myCircles.find((c: Circle) => c.code === KODA_GLOBAL_CODE)) {
            try { await joinCircleByCode(KODA_GLOBAL_CODE); } catch { /* silently ignore */ }
          }
          setView("log");
          // Show the first-run tour unless they've already seen it
          if (!localStorage.getItem("koda_tour_done")) setShowTour(true);
        }}
      />
    );
  }

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, color: C.text, fontFamily: BODY, transition: "background 0.2s, color 0.2s" }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        html,body{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;}
        ::-webkit-scrollbar{width:3px;}::-webkit-scrollbar-thumb{background:${C.border2};border-radius:2px;}
        input::placeholder,textarea::placeholder{color:${C.dim};font-weight:400;}
        input:focus,textarea:focus,select:focus{border-bottom-color:${C.text}!important;}
        .koda-app input[type=date]::-webkit-calendar-picker-indicator{filter:${darkMode ? "invert(0.7)" : "invert(0.3)"};}
        .koda-app select option{background:${C.panel};color:${C.text};}
        .koda-app button:hover:not(:disabled){opacity:0.88;}
        .koda-app button:active:not(:disabled){transform:scale(0.98);}
        .row-hvr{cursor:pointer;transition:background 0.15s,opacity 0.15s;}
        .row-hvr:hover{opacity:0.75;}
        .check-row:hover .ca{opacity:1!important;}
        @media(hover:none){.ca{opacity:1!important;}}
        @keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes livePulse{0%,100%{transform:scale(1);opacity:0.4}50%{transform:scale(2.2);opacity:0}}
        @keyframes orbDrift{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(10px,-8px) scale(1.06)}66%{transform:translate(-8px,5px) scale(0.95)}}
        @keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
        @keyframes checkPop{0%{transform:scale(1)}40%{transform:scale(1.18)}70%{transform:scale(0.94)}100%{transform:scale(1)}}
        @keyframes fadeSlideUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
        .fade-in{animation:rise 0.25s ease;}
        .stagger-item:nth-child(1){animation:fadeSlideUp 0.32s ease both;animation-delay:0.04s}
        .stagger-item:nth-child(2){animation:fadeSlideUp 0.32s ease both;animation-delay:0.09s}
        .stagger-item:nth-child(3){animation:fadeSlideUp 0.32s ease both;animation-delay:0.14s}
        .stagger-item:nth-child(4){animation:fadeSlideUp 0.32s ease both;animation-delay:0.19s}
        .stagger-item:nth-child(5){animation:fadeSlideUp 0.32s ease both;animation-delay:0.24s}
        .stagger-item:nth-child(n+6){animation:fadeSlideUp 0.32s ease both;animation-delay:0.28s}
        input[type=file]{display:none;}
      `}</style>

      {/* ── PAGE FRAME (responsive: 4-tier viewport scaling) ── */}
      <div className="koda-app" ref={swipeRef}
        style={{
          width: "100%",
          maxWidth: viewport === "phone" || viewport === "desktop" || viewport === "wide" ? "none" : "720px",
          margin: "0 auto",
          paddingLeft: "clamp(16px, 4vw, 48px)",
          paddingRight: "clamp(16px, 4vw, 48px)",
          paddingBottom: viewport === "phone" || viewport === "tablet" ? "96px" : "32px",
          minHeight: "100dvh",
          background: C.bg,
          borderLeft: "none",
          borderRight: "none",
        }}>

        {/* ── MASTHEAD ── */}
        <header style={{ padding: isDesktop ? "calc(16px + env(safe-area-inset-top)) 40px 0" : "calc(8px + env(safe-area-inset-top)) 22px 6px", position: "sticky", top: 0, background: C.bg, zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingBottom: isDesktop ? "14px" : 0 }}>
            {/* Left: back button when history exists, otherwise logo */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {viewHistory.length > 0 ? (
                <button onClick={goBack} style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  background: "transparent", border: "none",
                  color: C.text, cursor: "pointer", padding: "4px 0",
                  fontFamily: MONO, fontSize: "11px", letterSpacing: "0.06em",
                  minHeight: "34px",
                }}>
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 4l-6 6 6 6"/>
                  </svg>
                  <span style={{ textTransform: "uppercase", letterSpacing: "0.1em", fontSize: "10px" }}>Back</span>
                </button>
              ) : (
                <>
                  <KodaMark size={isDesktop ? 24 : 22} color={C.text} />
                  <span style={{ fontFamily: DISPLAY, fontSize: isDesktop ? "15px" : "14px", fontWeight: 600, letterSpacing: "0.22em", color: C.text, lineHeight: 1 }}>Kōda</span>
                  <span style={{ fontFamily: MONO, fontWeight: 500, fontSize: "9px", letterSpacing: "0.16em", color: C.text2, padding: "2px 5px", borderRadius: "4px", border: `1px solid ${C.border2}`, lineHeight: 1 }}>OS</span>
                </>
              )}
            </div>
            {/* Right: bell + avatar (design spec) */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <div style={{ position: "relative" }}>
                <IconButton C={C} icon="bell" onClick={() => setNotificationsOpen(o => !o)} label="Notifications" />
                {draftCount > 0 && (
                  <span aria-hidden style={{
                    position: "absolute", top: 6, right: 6, width: 9, height: 9, borderRadius: 999,
                    background: C.green ?? "#22c55e", border: `2px solid ${C.bg}`, pointerEvents: "none",
                  }} />
                )}
              </div>
              <button
                onClick={() => { setView("home"); setHomeSection("settings"); }}
                style={{ width: 36, height: 36, borderRadius: 999, background: `linear-gradient(135deg, ${C.orb1}, ${C.orb2})`, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: DISPLAY, fontWeight: 600, fontSize: 12, letterSpacing: "0.04em", cursor: "pointer", padding: 0 }}
                title="Settings"
              >
                {(profile.name || "T").slice(0, 2).toUpperCase()}
              </button>
            </div>
          </div>
          {/* Desktop nav is in the sidebar — masthead just shows the logo/handle */}
          {/* Desktop nav hidden — preserved for future reference */}
        </header>

        {/* ── CONTENT — desktop: sidebar+main grid; mobile: single column ── */}
        <div style={{ display:isDesktop?"grid":"block", gridTemplateColumns: viewport === "wide" ? "260px 1fr" : isDesktop ? "220px 1fr" : undefined }} className="fade-in" key={view}>
          {isDesktop && (
            <aside style={{ borderRight:`1px solid ${C.border}`, padding:"24px 0 32px", position:"sticky", top:"64px", height:"calc(100dvh - 64px)", overflowY:"auto", display:"flex", flexDirection:"column" }}>
              <div style={{ flex:1 }}>
                {NAV_TABS.map(tab => {
                  const sn = subNavFor(tab.id); const ia = view === tab.id;
                  return (
                    <div key={tab.id}>
                      <button onClick={()=>primaryNav(tab.id)} style={{ display:"flex", alignItems:"center", gap:"10px", width:"100%", background:ia?C.panel:"transparent", border:"none", borderLeft:ia?`2px solid ${C.text}`:"2px solid transparent", padding:"10px 22px", cursor:"pointer", fontFamily:MONO, fontSize:"11px", letterSpacing:"0.1em", textTransform:"uppercase", color:ia?C.text:C.dim, textAlign:"left", transition:"all 0.12s ease" }}>
                        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ opacity: ia ? 1 : 0.55, flexShrink: 0 }}>
                          <path d={(tab as any).path} stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        {tab.label}
                      </button>
                      {ia && sn && (
                        <div style={{ paddingLeft:"28px", paddingBottom:"4px" }}>
                          {sn.sections.map((sec: { id: string; label: string })=>(
                            <button key={sec.id} onClick={()=>sn.onChange(sec.id)} style={{ display:"block", width:"100%", background:"none", border:"none", padding:"6px 0", cursor:"pointer", fontFamily:MONO, fontSize:"10px", letterSpacing:"0.07em", color:sn.value===sec.id?C.text:C.muted, textAlign:"left", textTransform:"uppercase", transition:"color 0.12s" }}>
                              {sec.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ padding:"20px 22px 0", borderTop:`1px solid ${C.border}`, display:"flex", flexDirection:"column", gap:"10px" }}>
              </div>
            </aside>
          )}
          <div style={{ padding:isDesktop?"32px 48px 0":"24px 22px 0", minWidth:0 }}>

          {/* ══════════════════════════ HOME ══════════════════════════ */}
          {view === "home" && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {/* Section sub-nav dropdown — mobile only; desktop uses the dropdown in the top-nav */}
              {!isDesktop && (
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "8px", paddingBottom: "10px", borderBottom: `0.5px solid ${C.border}` }}>
                  <SubNavDropdown sections={HOME_SECTIONS} value={homeSection} onChange={(s: string) => { if (s === "checklist") navigateTo("checklist"); else setHomeSection(s); }} C={C} />
                  <GearButton onClick={() => setHomeSection("settings")} active={homeSection === "settings"} C={C} />
                </div>
              )}

              {/* FEED */}
              {homeSection === "feed" && (
                <div>
                  {streakBanner && (
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", background: C.panel, border: `1px solid ${C.green}44`, borderLeft: `3px solid ${C.green}`, borderRadius: "12px", padding: "12px 14px", marginBottom: "20px" }}>
                      <span style={{ fontSize: "20px" }}>🔥</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: MONO, fontSize: "9px", color: C.green, letterSpacing: "0.14em", textTransform: "uppercase" as const, marginBottom: "2px" }}>{streakBanner.streakCount}-Day Streak Milestone</div>
                        <div style={{ fontFamily: BODY, fontSize: "13px", color: C.text }}>{STREAK_FLAVOUR[streakBanner.streakCount] ?? "Keep going."}</div>
                      </div>
                      <button onClick={() => setStreakBanner(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: "16px", padding: "4px", lineHeight: 1 }}>×</button>
                    </div>
                  )}
                  {/* Glass hero card */}
                  {(() => {
                    const isWeek = timeMode === "week";
                    const isDollar = pnlMode === "$" && hasDollarData;
                    const val = isWeek
                      ? (isDollar ? weekPnlDollar : weekPnL)
                      : (isDollar ? totalPnlDollar : parseFloat(totalPnL));
                    const valPos = val >= 0;
                    const valStr = isDollar
                      ? `${valPos ? "+" : "−"}$${Math.abs(val).toFixed(2)}`
                      : `${valPos ? "+" : ""}${val.toFixed(2)}`;
                    const tradeCount = isWeek ? weekTrades.length : total;
                    const { live, orb1, orb2, orb3 } = C;
                    return (
                      <section style={{ marginTop: "clamp(16px, 4vw, 28px)", position: "relative" }}>
                        {/* Page-level ambient orbs — behind everything */}
                        <GlassOrb C={C} top={-40} left={-80} size={420} color={orb1} opacity={darkMode ? 0.55 : 0.35} />
                        <GlassOrb C={C} top={120} right={-100} size={300} color={orb2} opacity={darkMode ? 0.35 : 0.25} />

                        {/* Greeting (design spec) */}
                        <div style={{ padding: "0 6px 14px", position: "relative", zIndex: 2 }}>
                          <Kicker C={C}>{new Date().toLocaleDateString("en-US", { weekday: "short" })} &middot; {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}</Kicker>
                          <div style={{ fontFamily: DISPLAY, fontSize: 26, fontWeight: 500, letterSpacing: "-0.02em", marginTop: 4, color: C.text }}>
                            Welcome back, <span style={{ fontWeight: 600 }}>{(profile.name || "Trader").split(" ")[0]}</span>
                          </div>
                          {streak.count >= 2 && streak.type === "Win" && (
                            <div style={{ fontSize: 13, color: C.text2, marginTop: 2 }}>You&apos;re on a {streak.count}-day green streak.</div>
                          )}
                        </div>

                        {/* Hero card */}
                        <div style={{
                          position: "relative", borderRadius: "24px", padding: "22px 22px 20px",
                          background: C.surfaceGlass,
                          backdropFilter: "blur(20px) saturate(160%)",
                          WebkitBackdropFilter: "blur(20px) saturate(160%)",
                          border: `1px solid ${C.border2}`, overflow: "hidden", zIndex: 1,
                        }}>
                          {/* Iridescent corner glow — animated */}
                          <div style={{
                            position: "absolute", top: -70, left: -70, width: 220, height: 220,
                            borderRadius: "50%", pointerEvents: "none",
                            background: `conic-gradient(from 200deg at 50% 50%, ${orb3}, ${orb1}, ${orb2}, ${orb3})`,
                            filter: "blur(40px)", opacity: 0.5, zIndex: 0,
                            animation: "orbDrift 10s ease-in-out infinite",
                          }}/>
                          {/* Ghost "EDGE" stencil */}
                          <div style={{
                            position: "absolute", bottom: -16, right: -8, pointerEvents: "none", zIndex: 0,
                            fontFamily: DISPLAY, fontWeight: 700, fontSize: "110px", lineHeight: 0.85, letterSpacing: "-0.05em",
                            background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.01))",
                            WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent",
                            WebkitTextStroke: "1px rgba(255,255,255,0.04)",
                          }}>EDGE</div>

                          {/* Content */}
                          <div style={{ position: "relative", zIndex: 1 }}>
                            {/* Header: live dot + kicker + period toggles */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                              <div>
                                <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ width: 6, height: 6, borderRadius: 999, background: live, boxShadow: `0 0 8px ${live}` }} />
                                  <Kicker C={C}>Net P&amp;L &middot; {new Date().toLocaleDateString("en-US", { month: "short" })}</Kicker>
                                </div>
                                {/* Big number */}
                                <div style={{ fontFamily: DISPLAY, fontSize: "clamp(40px, 11vw, 44px)", fontWeight: 600, letterSpacing: "-0.03em", marginTop: 8, color: C.text, fontVariantNumeric: "tabular-nums" }}>
                                  {valStr}{!isDollar && <span style={{ color: C.text2, fontSize: "0.65em" }}>R</span>}
                                </div>
                                {/* Subtitle */}
                                <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                                  {tradeCount > 0 && <Delta C={C} value={valPos ? Math.abs(val) : -Math.abs(val)} />}
                                  <span style={{ fontSize: 11, color: C.muted, fontFamily: MONO }}>{tradeCount} trade{tradeCount !== 1 ? "s" : ""} {isWeek ? "this week" : "all time"}</span>
                                </div>
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                                {(["week", "all"] as const).map(m => (
                                  <Pill key={m} C={C} size="sm" active={timeMode === m} onClick={() => setTimeMode(m)}>
                                    {m === "week" ? "1W" : "All"}
                                  </Pill>
                                ))}
                              </div>
                            </div>

                            {/* Stats triplet — only meaningful once there are trades */}
                            {total > 0 && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0", marginTop: "18px", borderTop: `1px solid ${C.border}` }}>
                              {[
                                { label: "WIN RATE", value: `${winRate}%`, color: null },
                                { label: "AVG R:R", value: avgRR === "—" ? "—" : `${avgRR}R`, color: null },
                                { label: "STREAK", value: streak.count > 0 ? `${streak.count}${streak.type === "Win" ? "W" : "L"}` : "—", color: streak.count >= 2 ? (streak.type === "Win" ? C.green : C.red) : null },
                              ].map((s, i) => (
                                <div key={s.label} style={{ padding: "14px 10px 0", borderLeft: i === 0 ? "none" : `1px solid ${C.border}` }}>
                                  <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.12em", marginBottom: "5px" }}>{s.label}</div>
                                  <div style={{ fontFamily: DISPLAY, fontSize: "22px", fontWeight: 600, color: s.color ?? C.text, letterSpacing: "-0.02em", lineHeight: 1 }}>{s.value}</div>
                                  {s.label === "STREAK" && streak.count >= 3 && (
                                    <div style={{ fontFamily: MONO, fontSize: "8px", letterSpacing: "0.1em", color: streak.type === "Win" ? C.green : C.red, marginTop: "3px", opacity: 0.8 }}>
                                      {streak.type === "Win" ? "ON FIRE" : "STAY SHARP"}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>}

                            {/* Record line */}
                            {total > 0 && (
                              <div style={{ marginTop: "12px", display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", color: C.muted, textTransform: "uppercase" }}>
                                <span>{wins}W · {losses}L · {bes}BE</span>
                                <span>{total} total</span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* QuickAction card row (design: 4 vertical cards) */}
                        <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                          {[
                            { label: "Log", icon: "M5 4h10v12H5zM7 7h6M7 10h6M7 13h4", action: () => navigateTo("log"), primary: true },
                            { label: "Import", icon: "M10 3v10M6 9l4 4 4-4M3 16h14", action: () => { setView("home"); setHomeSection("sync"); }, primary: false },
                            { label: "Insights", icon: "M5 4l1.5 3L10 8l-3.5 1L5 12l-1.5-3L0 8l3.5-1zM14 9l1 2 2 1-2 1-1 2-1-2-2-1 2-1z", action: () => { setView("home"); setHomeSection("ai"); }, primary: false },
                            { label: "Rules", icon: "M4 4h12v12H4zM7 8h6M7 11h6M7 14h3", action: () => { setView("home"); setHomeSection("rules"); }, primary: false },
                          ].map(chip => (
                            <button key={chip.label} onClick={chip.action} style={{
                              position: "relative", flex: 1,
                              display: "flex", flexDirection: "column", alignItems: "center", gap: "6px",
                              background: chip.primary ? C.text : C.panel,
                              border: `1px solid ${chip.primary ? C.text : C.border}`,
                              borderRadius: "16px", padding: "12px 8px",
                              cursor: "pointer", fontFamily: BODY, fontSize: "11px",
                              fontWeight: 500, letterSpacing: "0.02em",
                              color: chip.primary ? C.bg : C.text,
                              transition: "opacity 0.15s, transform 0.15s",
                            }}>
                              <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                                <path d={chip.icon} stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              {chip.label}
                              {chip.primary && (
                                <span style={{ position: "absolute", top: 8, right: 8, width: 6, height: 6, borderRadius: "50%", background: live, boxShadow: `0 0 8px ${live}` }} />
                              )}
                            </button>
                          ))}
                        </div>
                        {/* Stat strip — separate cards below quick actions (design spec) */}
                        {total > 0 && (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 14 }}>
                            {[
                              { label: "Win rate", value: `${winRate}`, unit: "%", delta: null as number | null },
                              { label: "Avg R", value: avgRR === "—" ? "0" : `${avgRR.startsWith("-") ? avgRR : `+${avgRR}`}`, unit: "R", delta: null as number | null },
                              { label: "Streak", value: streak.count > 0 ? `${streak.count}` : "0", unit: streak.type === "Win" ? "W" : "L", delta: null as number | null },
                            ].map(s => (
                              <Card key={s.label} C={C} pad={14}>
                                <Kicker C={C}>{s.label}</Kicker>
                                <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 3 }}>
                                  <span style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, color: C.text, letterSpacing: "-0.02em" }}>{s.value}</span>
                                  <span style={{ fontFamily: MONO, fontSize: 11, color: C.text2 }}>{s.unit}</span>
                                </div>
                              </Card>
                            ))}
                          </div>
                        )}
                      </section>
                    );
                  })()}

                  {/* Daily risk dashboard + kill switch */}
                  {(() => {
                    const today = new Date().toISOString().split("T")[0];
                    const todayTrades = trades.filter(t => t.date === today);
                    const maxTrades = parseInt(profile.maxTradesPerDay) || 0;
                    const todayPnl = todayTrades.reduce((a, t) => a + (parseFloat(t.pnl as string) || 0), 0);
                    const targetRR = parseFloat(profile.targetRR) || 0;
                    const maxLoss = parseFloat(profile.maxDailyLoss || "0") || 0;
                    const atLimit = maxTrades > 0 && todayTrades.length >= maxTrades;
                    const nearLimit = maxTrades > 0 && todayTrades.length === maxTrades - 1;
                    const killSwitchTripped = maxLoss > 0 && todayPnl <= -maxLoss;
                    if (todayTrades.length === 0 && maxTrades === 0 && maxLoss === 0) return null;

                    if (killSwitchTripped) return (
                      <section style={{ marginTop: "28px", padding: "20px 16px", border: `1px solid ${C.red}`, borderRadius: "10px", background: C.red + "12" }}>
                        <div style={{ fontFamily: MONO, fontSize: "9px", color: C.red, letterSpacing: "0.18em", marginBottom: "10px" }}>KILL SWITCH ACTIVE</div>
                        <div style={{ fontFamily: DISPLAY, fontSize: "22px", fontWeight: 500, color: C.red, marginBottom: "8px" }}>
                          Daily halt — {todayPnl.toFixed(2)}R
                        </div>
                        <div style={{ fontFamily: BODY, fontSize: "13px", color: C.text2, lineHeight: 1.6, marginBottom: "14px" }}>
                          You've hit your max daily loss of {maxLoss}R. Step away, review your trades, and come back tomorrow.
                        </div>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          <button onClick={() => navigateTo("stats")}
                            style={{ background: "transparent", border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "8px 16px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: C.text2 }}>
                            Review Today
                          </button>
                          <button onClick={() => { if (confirm("Override kill switch? Only do this if this was a data entry error.")) saveProfile({ ...profile, maxDailyLoss: "" }); }}
                            style={{ background: "transparent", border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "8px 16px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted }}>
                            Override
                          </button>
                        </div>
                      </section>
                    );

                    return (
                      <section style={{ marginTop: "28px", padding: "16px", border: `1px solid ${atLimit ? C.red + "66" : C.border}`, borderRadius: "10px", background: atLimit ? C.red + "08" : "transparent" }}>
                        <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.14em", marginBottom: "14px" }}>TODAY</div>
                        <div style={{ display: "grid", gridTemplateColumns: maxLoss > 0 ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr", gap: "8px" }}>
                          <div>
                            <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "4px" }}>TRADES</div>
                            <div style={{ fontFamily: DISPLAY, fontSize: "22px", fontWeight: 500, color: atLimit ? C.red : nearLimit ? C.text2 : C.text }}>
                              {todayTrades.length}{maxTrades > 0 ? `/${maxTrades}` : ""}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "4px" }}>P&L TODAY</div>
                            <div style={{ fontFamily: DISPLAY, fontSize: "22px", fontWeight: 500, color: todayPnl >= 0 ? C.green : C.red }}>
                              {todayPnl >= 0 ? "+" : ""}{todayPnl.toFixed(2)}R
                            </div>
                          </div>
                          {targetRR > 0 && (
                            <div>
                              <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "4px" }}>TARGET</div>
                              <div style={{ fontFamily: DISPLAY, fontSize: "22px", fontWeight: 500, color: todayPnl >= targetRR ? C.green : C.muted }}>
                                {targetRR}R
                              </div>
                            </div>
                          )}
                          {maxLoss > 0 && (
                            <div>
                              <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "4px" }}>MAX LOSS</div>
                              <div style={{ fontFamily: DISPLAY, fontSize: "22px", fontWeight: 500, color: todayPnl <= -(maxLoss * 0.75) ? C.red : C.muted }}>
                                -{maxLoss}R
                              </div>
                            </div>
                          )}
                        </div>
                        {atLimit && (
                          <div style={{ marginTop: "12px", fontFamily: MONO, fontSize: "10px", color: C.red, letterSpacing: "0.08em" }}>
                            Daily trade limit reached. Step back and review.
                          </div>
                        )}
                        {maxLoss > 0 && !killSwitchTripped && todayPnl <= -(maxLoss * 0.75) && (
                          <div style={{ marginTop: "12px", fontFamily: MONO, fontSize: "10px", color: C.red, letterSpacing: "0.08em" }}>
                            Approaching max daily loss ({Math.abs(todayPnl).toFixed(2)}R of {maxLoss}R limit).
                          </div>
                        )}
                      </section>
                    );
                  })()}

                  {/* Live positions — hidden until broker API is ready */}
                  {isFlagOn("livePositions") && <section style={{ marginTop: "clamp(40px, 6vw, 56px)" }}>
                    {/* Section label */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.14em" }}>LIVE POSITIONS</span>
                        {tradovateSession && (
                          <span style={{ position: "relative", display: "inline-flex", width: "7px", height: "7px" }}>
                            <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: C.green, opacity: 0.3, animation: "livePulse 2.4s ease-in-out infinite" }} />
                            <span style={{ position: "relative", display: "inline-block", width: "7px", height: "7px", borderRadius: "50%", background: C.green }} />
                          </span>
                        )}
                      </div>
                      {tradovateSession && (
                        <button onClick={() => setShowLiveModal(true)}
                          style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "9px", letterSpacing: "0.1em", textTransform: "uppercase", padding: 0 }}>
                          Manage →
                        </button>
                      )}
                    </div>

                    {tradovateSession ? (
                      /* ── Connected: show positions ── */
                      <div style={{ border: `1px solid ${C.border}`, borderRadius: "10px", overflow: "hidden" }}>
                        {/* Account bar */}
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderBottom: `1px solid ${C.border}`, background: C.panel ?? "transparent" }}>
                          <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: C.green, flexShrink: 0 }} />
                          <span style={{ fontFamily: MONO, fontSize: "11px", color: C.text2, letterSpacing: "0.06em" }}>
                            {tradovateSession.accountName ?? "Tradovate"}
                          </span>
                          <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.06em" }}>
                            · {tradovateSession.env.toUpperCase()}
                          </span>
                          {tradovateSession.lastSyncTime && (
                            <span style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.04em", marginLeft: "auto" }}>
                              synced {new Date(tradovateSession.lastSyncTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                        {tradovatePositions.length === 0 ? (
                          <div style={{ padding: "28px 14px", fontFamily: BODY, fontSize: "13px", color: C.muted, textAlign: "center" }}>
                            No open positions right now
                          </div>
                        ) : (
                          tradovatePositions.map((pos, idx) => (
                            <div key={pos.contractId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 14px", borderBottom: idx < tradovatePositions.length - 1 ? `1px solid ${C.border}` : "none" }}>
                              <div>
                                <div style={{ fontFamily: MONO, fontSize: "13px", color: C.text, letterSpacing: "0.04em" }}>{pos.symbol}</div>
                                <div style={{ fontFamily: MONO, fontSize: "10px", color: pos.netPos > 0 ? C.green : C.red, marginTop: "3px", letterSpacing: "0.04em" }}>
                                  {pos.netPos > 0 ? "▲ Long" : "▼ Short"} {Math.abs(pos.netPos)} ct · avg {pos.netPrice.toFixed(2)}
                                </div>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontFamily: DISPLAY, fontSize: "17px", fontWeight: 600, color: pos.openPnl >= 0 ? C.green : C.red, letterSpacing: "-0.01em" }}>
                                  {pos.openPnlStr}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    ) : (
                      /* ── Not connected: styled connect card ── */
                      <button onClick={() => setShowLiveModal(true)}
                        style={{ width: "100%", background: "transparent", border: `1px solid ${C.border}`, borderRadius: "10px", padding: "0", cursor: "pointer", textAlign: "left", display: "block" }}>
                        <div style={{ padding: "18px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                            {/* Icon */}
                            <div style={{ width: "38px", height: "38px", borderRadius: "8px", border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>
                              </svg>
                            </div>
                            <div>
                              <div style={{ fontFamily: BODY, fontSize: "14px", fontWeight: 600, color: C.text, marginBottom: "3px" }}>Connect Tradovate</div>
                              <div style={{ fontFamily: BODY, fontSize: "12px", color: C.muted, lineHeight: 1.4 }}>
                                Live positions · Auto-import fills
                              </div>
                            </div>
                          </div>
                          <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.1em", flexShrink: 0 }}>Set up →</span>
                        </div>
                      </button>
                    )}
                  </section>}

                  {/* Zero-state CTA — shown instead of charts when user has no trades */}
                  {trades.length === 0 && (
                    <section style={{ marginTop: "clamp(32px, 6vw, 48px)", textAlign: "center", padding: "0 8px" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "40px 24px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: "16px" }}>
                        <KodaMarkFilled size={52} bg={C.bg} />
                        <div>
                          <p style={{ fontFamily: DISPLAY, fontSize: "20px", fontWeight: 700, color: C.text, letterSpacing: "-0.02em", marginBottom: "8px" }}>Your edge starts here</p>
                          <p style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, lineHeight: 1.6, maxWidth: "260px", margin: "0 auto" }}>
                            Log your first trade and Kōda will start tracking your P&amp;L, win rate, and patterns.
                          </p>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%", maxWidth: "240px" }}>
                          <button onClick={() => navigateTo("log")} style={{ background: C.text, color: C.bg, border: "none", borderRadius: "999px", padding: "13px 24px", fontFamily: MONO, fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 700, cursor: "pointer" }}>
                            Log your first trade →
                          </button>
                          <button onClick={() => { setAutoOpenCsv(true); navigateTo("sync"); }} style={{ background: "transparent", color: C.muted, border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "11px 24px", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>
                            Or sync trades
                          </button>
                        </div>
                      </div>
                    </section>
                  )}

                  {/* Equity curve */}
                  {trades.length > 1 && (
                    <section style={{ marginTop: "clamp(40px, 6vw, 56px)" }}>
                      <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.14em", marginBottom: "16px", display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ flex: "0 0 24px", height: "1px", background: C.border2 }} />
                        EQUITY CURVE
                      </div>
                      <PnLChart trades={trades} C={C} />
                    </section>
                  )}

                  {/* Strategy breakdown */}
                  {Object.keys(stratStats).length > 0 && (
                    <section style={{ marginTop: "clamp(40px, 6vw, 56px)" }}>
                      <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.14em", marginBottom: "20px", display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ flex: "0 0 24px", height: "1px", background: C.border2 }} />
                        BY STRATEGY
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                        {Object.entries(stratStats).map(([s, v], idx) => {
                          const wr = v.w + v.l > 0 ? v.w / (v.w + v.l) : 0;
                          return (
                            <div key={s}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
                                <div style={{ display: "flex", gap: "10px", alignItems: "baseline" }}>
                                  <span style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.08em" }}>{String(idx + 1).padStart(2, "0")}</span>
                                  <span style={{ fontFamily: MONO, fontSize: "12px", color: C.text, letterSpacing: "0.06em" }}>{stratCode(s)}</span>
                                  <span style={{ fontFamily: BODY, fontSize: "13px", color: C.text2 }}>{stratShort(s)}</span>
                                </div>
                                <div style={{ fontFamily: MONO, fontSize: "11px", letterSpacing: "0.06em", color: C.text }}>
                                  {(wr * 100).toFixed(0)}% <span style={{ color: C.muted }}>· {v.count}T · </span>
                                  <span style={{ color: v.pnl >= 0 ? C.green : C.red }}>{v.pnl >= 0 ? "+" : ""}{v.pnl.toFixed(1)}R</span>
                                </div>
                              </div>
                              <div style={{ height: "1px", background: C.border, width: "100%" }}>
                                <div style={{ height: "1px", background: C.text, width: `${wr * 100}%`, transition: "width 0.6s ease" }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {/* Recent trades (design spec: Card with TradeRow) */}
                  {trades.length > 0 && (
                    <section style={{ marginTop: 20 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0 6px 10px" }}>
                        <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 600, color: C.text, letterSpacing: "-0.01em" }}>Recent trades</div>
                        {trades.length > 5 && (
                          <button onClick={() => navigateTo("history")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: C.text2, fontFamily: MONO, letterSpacing: "0.08em", padding: 0 }}>SEE ALL &rarr;</button>
                        )}
                      </div>
                      <Card C={C} pad={4}>
                        {trades.slice(0, 5).map((t, i) => {
                          const win = t.outcome === "Win";
                          const loss = t.outcome === "Loss";
                          const pnlVal = parseFloat(t.pnl as string) || 0;
                          const pnlPos = pnlVal >= 0;
                          const oc = win ? C.green : loss ? C.red : C.text2;
                          return (
                            <div key={t.id} className="row-hvr stagger-item" onClick={() => editTrade(t)}
                              style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 14px", borderBottom: i === Math.min(trades.length, 5) - 1 ? "none" : `1px solid ${C.border}`, cursor: "pointer" }}>
                              <div style={{
                                width: 38, height: 38, borderRadius: 12,
                                background: `color-mix(in oklch, ${oc} 14%, transparent)`,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontFamily: MONO, fontSize: 11, fontWeight: 600, color: oc,
                                border: `1px solid color-mix(in oklch, ${oc} 25%, transparent)`,
                              }}>{(t.pair || "—").slice(0, 3)}</div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 600, color: C.text }}>{t.pair || "—"}</span>
                                  {t.direction && <span style={{
                                    padding: "1px 6px", borderRadius: 4, fontSize: 9, letterSpacing: "0.1em",
                                    fontFamily: MONO, fontWeight: 600,
                                    background: t.direction === "Long" ? `color-mix(in oklch, ${C.green} 14%, transparent)` : `color-mix(in oklch, ${C.red} 14%, transparent)`,
                                    color: t.direction === "Long" ? C.green : C.red,
                                  }}>{t.direction === "Long" ? "LONG" : "SHORT"}</span>}
                                </div>
                                <div style={{ fontSize: 11, color: C.text2, marginTop: 2, fontFamily: MONO }}>{t.strategy ? stratCode(t.strategy) : ""}{t.entryTime ? ` · ${t.entryTime}` : ""}</div>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 600, color: oc }}>
                                  {t.pnlDollar ? `${pnlPos ? "+" : ""}$${Math.abs(parseFloat(t.pnlDollar as string) || 0).toFixed(0)}` : (t.pnl ? `${pnlPos ? "+" : ""}${pnlVal.toFixed(1)}R` : "—")}
                                </div>
                                {t.rr && <div style={{ fontFamily: MONO, fontSize: 10, color: C.text2, marginTop: 2 }}>{pnlPos ? "+" : ""}{t.rr}R</div>}
                              </div>
                            </div>
                          );
                        })}
                      </Card>
                    </section>
                  )}

                  {/* Friends feed — hidden behind flag until social is polished */}
                  {isFlagOn("socialFeed") && (() => {
                    if (!friendFeed.length) return null;
                    const now = new Date();
                    const day = now.getDay();
                    const msSinceMonday = ((day === 0 ? 6 : day - 1)) * 86400000;
                    const weekStart = new Date(now.getTime() - msSinceMonday);
                    weekStart.setHours(0, 0, 0, 0);
                    const weekStartStr = weekStart.toISOString().split("T")[0];
                    const thisWeekItems = friendFeed.filter((item) => item.date >= weekStartStr);
                    if (!thisWeekItems.length) return null;
                    const counted = thisWeekItems.map((item) => {
                      const total = Object.values(item.reactions || {}).reduce((s: number, v) =>
                        s + (typeof v === "number" ? v : Array.isArray(v) ? v.length : 0), 0);
                      return { ...item, _rxTotal: total };
                    });
                    const top = counted.reduce((best, item) => item._rxTotal > best._rxTotal ? item : best);
                    if (top._rxTotal === 0) return null;
                    const topPnLPos = parseFloat(top.pnl) >= 0;
                    return (
                      <section style={{ marginTop: "clamp(40px, 6vw, 56px)" }}>
                        <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.14em", marginBottom: "16px", display: "flex", alignItems: "center", gap: "12px" }}>
                          <span style={{ flex: "0 0 24px", height: "1px", background: C.border2 }} />
                          TRADE OF THE WEEK
                        </div>
                        <div style={{ border: `1px solid ${C.border}`, borderRadius: "4px", padding: "20px 20px 16px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                            <div>
                              <div style={{ fontFamily: MONO, fontSize: "12px", color: C.text, letterSpacing: "0.06em" }}>{top.authorName}</div>
                              <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginTop: "2px", letterSpacing: "0.04em" }}>
                                {top.authorHandle ? `@${top.authorHandle.replace(/^@/, "")}` : ""}{top.date ? ` · ${top.date}` : ""}
                              </div>
                            </div>
                            <span style={{ fontSize: "22px", lineHeight: 1 }}>🏆</span>
                          </div>
                          <div style={{ display: "flex", gap: "14px", alignItems: "baseline", marginBottom: "14px" }}>
                            <span style={{ fontFamily: DISPLAY, fontSize: "26px", fontWeight: 600, color: C.text, letterSpacing: "-0.02em" }}>{top.pair || "—"}</span>
                            {top.rr && <span style={{ fontFamily: MONO, fontSize: "12px", color: C.text2, letterSpacing: "0.04em" }}>{top.rr}R</span>}
                            {top.pnl && <span style={{ fontFamily: MONO, fontSize: "13px", letterSpacing: "0.04em", color: topPnLPos ? C.green : C.red }}>{topPnLPos ? "+" : ""}{top.pnl}R</span>}
                          </div>
                          {top.notes && (
                            <div style={{ fontFamily: BODY, fontSize: "13px", color: C.text2, lineHeight: 1.6, marginBottom: "14px", borderLeft: `1px solid ${C.border2}`, paddingLeft: "12px" }}>
                              {top.notes.slice(0, 120)}{top.notes.length > 120 ? "…" : ""}
                            </div>
                          )}
                          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                            {Object.entries(top.reactions || {}).map(([rx, v]) => {
                              const count = typeof v === "number" ? v : Array.isArray(v) ? v.length : 0;
                              if (count === 0) return null;
                              return <span key={rx} style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, background: C.panel, border: `1px solid ${C.border}`, borderRadius: "999px", padding: "4px 10px", letterSpacing: "0.04em" }}>{rx} {count}</span>;
                            })}
                            <span style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", alignSelf: "center", marginLeft: "auto" }}>{top._rxTotal} REACTIONS</span>
                          </div>
                        </div>
                      </section>
                    );
                  })()}

                  {/* Monthly report card */}
                  {(() => {
                    const now = new Date();
                    const monthKey = now.toISOString().slice(0, 7);
                    const monthName = now.toLocaleString("default", { month: "long" });
                    const monthTrades = trades.filter(t => t.date?.startsWith(monthKey));
                    if (monthTrades.length < 2) return null;
                    const mWins = monthTrades.filter(t => t.outcome === "Win").length;
                    const mTotal = monthTrades.length;
                    const mPnl = monthTrades.reduce((a, t) => a + (parseFloat(t.pnl as string) || 0), 0);
                    const mWr = Math.round((mWins / mTotal) * 100);
                    const byDay: Record<string, number> = {};
                    monthTrades.forEach(t => { byDay[t.date] = (byDay[t.date] || 0) + (parseFloat(t.pnl as string) || 0); });
                    const days = Object.entries(byDay);
                    const bestDay = days.reduce((a, b) => b[1] > a[1] ? b : a, ["—", -Infinity]);
                    const worstDay = days.reduce((a, b) => b[1] < a[1] ? b : a, ["—", Infinity]);
                    const stratPnl: Record<string, number> = {};
                    monthTrades.forEach(t => { if (t.strategy) stratPnl[t.strategy] = (stratPnl[t.strategy] || 0) + (parseFloat(t.pnl as string) || 0); });
                    const bestStrat = Object.entries(stratPnl).sort((a, b) => b[1] - a[1])[0];
                    return (
                      <section style={{ marginTop: "clamp(40px, 6vw, 56px)", padding: "20px", border: `1px solid ${C.border}`, borderRadius: "12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "18px" }}>
                          <SectionKicker label={`${monthName.toUpperCase()} REPORT`} C={C} />
                          <span style={{ fontFamily: DISPLAY, fontSize: "28px", fontWeight: 700, color: mPnl >= 0 ? C.green : C.red, letterSpacing: "-0.02em" }}>{mPnl >= 0 ? "+" : ""}{mPnl.toFixed(2)}R</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                          <div style={{ padding: "12px", border: `1px solid ${C.border}`, borderRadius: "8px" }}>
                            <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "4px" }}>WIN RATE</div>
                            <div style={{ fontFamily: DISPLAY, fontSize: "20px", fontWeight: 500, color: mWr >= 50 ? C.green : C.red }}>{mWr}%</div>
                            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginTop: "2px" }}>{mTotal} trades</div>
                          </div>
                          <div style={{ padding: "12px", border: `1px solid ${C.border}`, borderRadius: "8px" }}>
                            <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "4px" }}>BEST DAY</div>
                            <div style={{ fontFamily: DISPLAY, fontSize: "20px", fontWeight: 500, color: C.green }}>{bestDay[1] !== -Infinity ? `+${(bestDay[1] as number).toFixed(2)}R` : "—"}</div>
                            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginTop: "2px" }}>{String(bestDay[0])}</div>
                          </div>
                          <div style={{ padding: "12px", border: `1px solid ${C.border}`, borderRadius: "8px" }}>
                            <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "4px" }}>WORST DAY</div>
                            <div style={{ fontFamily: DISPLAY, fontSize: "20px", fontWeight: 500, color: C.red }}>{worstDay[1] !== Infinity ? `${(worstDay[1] as number).toFixed(2)}R` : "—"}</div>
                            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginTop: "2px" }}>{String(worstDay[0])}</div>
                          </div>
                          {bestStrat && (
                            <div style={{ padding: "12px", border: `1px solid ${C.border}`, borderRadius: "8px" }}>
                              <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "4px" }}>TOP STRATEGY</div>
                              <div style={{ fontFamily: DISPLAY, fontSize: "16px", fontWeight: 500, color: C.text, lineHeight: 1.2 }}>{stratShort(bestStrat[0])}</div>
                              <div style={{ fontFamily: MONO, fontSize: "10px", color: bestStrat[1] >= 0 ? C.green : C.red, marginTop: "2px" }}>{bestStrat[1] >= 0 ? "+" : ""}{bestStrat[1].toFixed(2)}R</div>
                            </div>
                          )}
                        </div>
                      </section>
                    );
                  })()}

                  {isFlagOn("socialFeed") && (
                  <section style={{ marginTop: "clamp(40px, 6vw, 56px)", paddingTop: "32px", borderTop: `1px solid ${C.border}` }}>
                    <FriendsFeed
                      friends={friends} friendFeed={friendFeed as any} showAddFriend={showAddFriend} setShowAddFriend={setShowAddFriend}
                      followHandleInput={followHandleInput} setFollowHandleInput={setFollowHandleInput}
                      followHandleMsg={followHandleMsg} followHandleLoading={followHandleLoading}
                      followByHandle={followByHandle}
                      unfollowUser={unfollowUser}
                      following={following} followers={followers} followerProfiles={followerProfiles}
                      publishFeed={publishFeed} refreshFeed={refreshFeed} reactToFeed={reactToFeed as any}
                      myFeedReactions={myFeedReactions}
                      profile={profile} C={C as any} inp={inp} pillPrimary={pillPrimary}
                      openProfile={openProfile}
                    />
                  </section>
                  )}
                  {/* Plan row */}
                  <section style={{ paddingTop: "28px", borderTop: `1px solid ${C.border}` }}>
                    {!isPro ? (
                      <button
                        onClick={() => setShowUpgrade(true)}
                        style={{
                          width: "100%", padding: "13px 18px", background: C.liveSoft,
                          border: `1px solid ${C.live}`, borderRadius: "14px", cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: C.live, boxShadow: `0 0 8px ${C.live}`, flexShrink: 0 }}/>
                          <div style={{ textAlign: "left" }}>
                            <div style={{ fontSize: "13px", fontWeight: 600, color: C.live, fontFamily: DISPLAY }}>Upgrade to Pro</div>
                            <div style={{ fontSize: "11px", color: C.muted, marginTop: "1px", fontFamily: MONO }}>Unlimited imports · Advanced analytics</div>
                          </div>
                        </div>
                        <span style={{ fontFamily: MONO, fontSize: "11px", color: C.live }}>£24.99/mo →</span>
                      </button>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ fontSize: "15px" }}>⚡</span>
                          <div>
                            <span style={{ fontSize: "13px", fontWeight: 600, color: C.text }}>Kōda Pro</span>
                            <span style={{ fontFamily: MONO, fontSize: "10px", color: C.green, marginLeft: "8px", letterSpacing: "0.06em" }}>ACTIVE</span>
                          </div>
                        </div>
                        {profile.stripeCustomerId && (
                          <button
                            onClick={async () => {
                              try {
                                const { data: { session: _sess } } = await supabase.auth.getSession();
                                if (!_sess?.access_token) throw new Error("Not signed in");
                                const r = await fetch("/api/stripe-portal", {
                                  method: "POST",
                                  headers: {
                                    "Content-Type": "application/json",
                                    "Authorization": `Bearer ${_sess.access_token}`,
                                  },
                                  body: JSON.stringify({ stripeCustomerId: profile.stripeCustomerId }),
                                });
                                const { url } = await r.json();
                                window.location.href = url;
                              } catch { showToast("Could not open billing portal — try again."); }
                            }}
                            style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "6px", padding: "5px 10px", fontSize: "11px", color: C.muted, cursor: "pointer", fontFamily: MONO, letterSpacing: "0.06em" }}
                          >Manage →</button>
                        )}
                      </div>
                    )}
                  </section>

                  {/* Data export */}
                  <section style={{ paddingTop: "28px", borderTop: `1px solid ${C.border}` }}>
                    <SectionKicker label="YOUR DATA" C={C} />
                    <div style={{ marginTop: "14px", display: "flex", gap: "10px" }}>
                      <button onClick={() => {
                          if (!isPro) { setShowUpgrade(true); return; }
                          exportCSV();
                        }}
                        style={{ flex: 1, padding: "11px", border: `1px solid ${C.border2}`, borderRadius: "8px", background: "transparent", color: C.text, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                        Export CSV
                      </button>
                      <button onClick={exportData}
                        style={{ flex: 1, padding: "11px", border: `1px solid ${C.border2}`, borderRadius: "8px", background: "transparent", color: C.text, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                        Export JSON
                      </button>
                    </div>
                  </section>

                  {/* Legal footer */}
                  <div style={{ paddingTop: "32px", display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "center" }}>
                    <a href="/privacy.html" target="_blank" rel="noopener"
                      style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.08em", textDecoration: "none" }}>
                      Privacy
                    </a>
                    <a href="/terms.html" target="_blank" rel="noopener"
                      style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.08em", textDecoration: "none" }}>
                      Terms
                    </a>
                    <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.06em", marginLeft: "auto" }}>
                      Kōda © {new Date().getFullYear()}
                    </span>
                  </div>
                </div>
              )}

              {/* ANALYTICS */}
              {homeSection === "analytics" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "clamp(40px, 6vw, 56px)", marginTop: "clamp(24px, 5vw, 40px)" }}>
                  {/* P&L BY SETUP */}
                  <section>
                    <SectionKicker label="P&L BY SETUP" C={C} />
                    {(() => {
                      const rows = [...setupRows].sort((a, b) => {
                        if (setupMetric === "pnl") return (setupDollar ? b.dollar : b.pnl) - (setupDollar ? a.dollar : a.pnl);
                        if (setupMetric === "winrate") return b.winRate - a.winRate;
                        return b.trades - a.trades;
                      });
                      const maxAbs = Math.max(...rows.map(r => {
                        if (setupMetric === "pnl") return Math.abs(setupDollar ? r.dollar : r.pnl);
                        if (setupMetric === "winrate") return r.winRate;
                        return r.trades;
                      }), 1);
                      return (
                        <div style={{ marginTop: "16px" }}>
                          {/* Controls */}
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" as const, marginBottom: "20px" }}>
                            {/* Period toggle */}
                            {(["month", "all"] as const).map(p => (
                              <button key={p} onClick={() => setSetupPeriod(p)} style={{ fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", padding: "5px 12px", borderRadius: "999px", border: `1px solid ${setupPeriod === p ? C.text : C.border}`, background: setupPeriod === p ? C.text : "transparent", color: setupPeriod === p ? C.bg : C.muted, cursor: "pointer" }}>
                                {p === "month" ? "THIS MONTH" : "ALL TIME"}
                              </button>
                            ))}
                            <div style={{ width: "1px", background: C.border, margin: "0 2px" }} />
                            {/* Metric toggle */}
                            {(["pnl", "winrate", "trades"] as const).map(m => (
                              <button key={m} onClick={() => { setSetupMetric(m); if (m !== "pnl") setSetupDollar(false); }} style={{ fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", padding: "5px 12px", borderRadius: "999px", border: `1px solid ${setupMetric === m ? C.text : C.border}`, background: setupMetric === m ? C.text : "transparent", color: setupMetric === m ? C.bg : C.muted, cursor: "pointer" }}>
                                {m === "pnl" ? "P&L" : m === "winrate" ? "WIN RATE" : "TRADES"}
                              </button>
                            ))}
                            {/* R/$ toggle — only when metric = P&L and dollar data exists */}
                            {setupMetric === "pnl" && hasDollarData && (
                              <>
                                <div style={{ width: "1px", background: C.border, margin: "0 2px" }} />
                                {(["R", "$"] as const).map(unit => (
                                  <button key={unit} onClick={() => setSetupDollar(unit === "$")} style={{ fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", padding: "5px 12px", borderRadius: "999px", border: `1px solid ${(unit === "$") === setupDollar ? C.text : C.border}`, background: (unit === "$") === setupDollar ? C.text : "transparent", color: (unit === "$") === setupDollar ? C.bg : C.muted, cursor: "pointer" }}>
                                    {unit}
                                  </button>
                                ))}
                              </>
                            )}
                          </div>
                          {/* Bar chart */}
                          {rows.length === 0
                            ? <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted }}>No trades with a strategy tagged in this period.</div>
                            : <div style={{ display: "flex", flexDirection: "column" as const, gap: "14px" }}>
                                {rows.map(r => {
                                  const val = setupMetric === "pnl" ? (setupDollar ? r.dollar : r.pnl) : setupMetric === "winrate" ? r.winRate : r.trades;
                                  const isPos = setupMetric !== "pnl" || val >= 0;
                                  const barPct = (Math.abs(val) / maxAbs) * 100;
                                  const label = setupMetric === "pnl"
                                    ? (setupDollar ? `${val >= 0 ? "+" : "-"}$${Math.abs(val).toFixed(0)}` : `${val >= 0 ? "+" : ""}${val.toFixed(1)}R`)
                                    : setupMetric === "winrate" ? `${val.toFixed(0)}%`
                                    : `${val}`;
                                  return (
                                    <div key={r.name}>
                                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "5px" }}>
                                        <span style={{ fontFamily: BODY, fontSize: "13px", color: C.text }}>{r.name}</span>
                                        <span style={{ fontFamily: MONO, fontSize: "11px", color: isPos ? C.green : C.red, letterSpacing: "0.04em" }}>{label}</span>
                                      </div>
                                      <div style={{ background: C.panel2, borderRadius: "3px", height: "6px" }}>
                                        <div style={{ width: `${barPct}%`, height: "100%", borderRadius: "3px", background: isPos ? C.green : C.red, transition: "width 0.3s ease" }} />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                          }
                        </div>
                      );
                    })()}
                  </section>
                  <section>
                    <SectionKicker label="WIN RATE BY STRATEGY" C={C} />
                    <div style={{ marginTop: "20px" }}><WinRateChart trades={trades} C={C} /></div>
                  </section>
                  <section>
                    <SectionKicker label="MONTHLY P&L" C={C} />
                    <div style={{ marginTop: "16px" }}>
                      {trades.length < 2
                        ? <div style={{ fontSize: "12px", color: C.muted, fontFamily: BODY }}>Log more trades to see monthly trends.</div>
                        : <MonthlyPnLChart trades={trades} C={C} />}
                    </div>
                  </section>
                  <section>
                    <SectionKicker label="SESSION PERFORMANCE" C={C} />
                    <div style={{ marginTop: "12px", borderTop: `1px solid ${C.border}` }}>
                      {(Object.entries(sessionStats) as [string, { w: number; l: number; pnl: number }][]).map(([session, v]) => {
                        const wr = v.w + v.l > 0 ? ((v.w / (v.w + v.l)) * 100).toFixed(0) : "0";
                        return (
                          <div key={session} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: "12px", alignItems: "baseline", padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
                            <span style={{ fontFamily: BODY, fontSize: "13px", color: C.text }}>{session}</span>
                            <span style={{ fontFamily: MONO, fontSize: "11px", color: C.text, letterSpacing: "0.04em" }}>{wr}%</span>
                            <span style={{ fontFamily: MONO, fontSize: "11px", color: v.pnl >= 0 ? C.green : C.red, letterSpacing: "0.04em", minWidth: "60px", textAlign: "right" }}>{v.pnl >= 0 ? "+" : ""}{v.pnl.toFixed(1)}R</span>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                  <section>
                    <SectionKicker label="P&L CALENDAR" C={C} />
                    <div style={{ marginTop: "20px" }}>
                      <CalendarView trades={trades} C={C} onDayClick={(key: string) => { const dt = trades.filter(t => t.date === key); setCalDayTrades({ key, trades: dt }); }} />
                      {calDayTrades && (
                        <div style={{ marginTop: "20px", borderTop: `1px solid ${C.border}`, paddingTop: "14px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "10px" }}>
                            <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.1em" }}>{calDayTrades.key} · {calDayTrades.trades.length} TRADE{calDayTrades.trades.length !== 1 ? "S" : ""}</span>
                            <button onClick={() => setCalDayTrades(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "12px" }}>close</button>
                          </div>
                          {calDayTrades.trades.map((t: Trade) => (
                            <div key={t.id} className="row-hvr" onClick={() => { navigateTo("history"); setExpandedId(t.id); }}
                              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                              <span style={{ fontFamily: MONO, fontSize: "12px", color: C.text }}>{t.pair}</span>
                              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                                {t.rr && <span style={{ fontFamily: MONO, fontSize: "11px", color: C.text2 }}>{t.rr}R</span>}
                                <span style={{ fontFamily: MONO, fontSize: "11px", color: outcomeColor(t.outcome, C), letterSpacing: "0.06em" }}>{outcomeLetter(t.outcome)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              )}

              {/* AI INSIGHTS */}
              {homeSection === "ai" && (
                isPro ? (
                  <div style={{ marginTop: "clamp(24px, 5vw, 40px)" }}>
                    <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.1em", marginBottom: "24px" }}>
                      EXECUTION PATTERNS — RULE-BASED ANALYSIS.
                    </div>
                    <div style={{ borderTop: `1px solid ${C.border}` }}>
                      {insights.map((ins: Insight, i: number) => {
                        const col = ins.type === "positive" ? C.green : ins.type === "warning" ? C.text2 : ins.type === "danger" ? C.red : C.muted;
                        return (
                          <div key={i} style={{ padding: "20px 0", borderBottom: `1px solid ${C.border}`, display: "flex", gap: "16px", alignItems: "baseline" }}>
                            <span style={{ fontFamily: MONO, fontSize: "11px", color: col, letterSpacing: "0.1em", minWidth: "48px" }}>{ins.kicker}</span>
                            <span style={{ fontFamily: BODY, fontSize: "14px", color: C.text, lineHeight: 1.55, flex: 1 }}>{ins.text}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <ProLock C={C} label="AI Insights — Pro Feature" description="Pattern detection, edge analysis, and discipline scoring." onUpgrade={() => setShowUpgrade(true)} />
                )
              )}

              {/* CIRCLES CHAT TAB */}
              {homeSection === "circles" && (
                <div style={{ marginTop: "clamp(24px, 5vw, 40px)" }}>
                  <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.1em", marginBottom: "20px" }}>
                    YOUR CIRCLES — TAP TO OPEN CHAT
                  </div>
                  {myCircles.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontSize: "13px" }}>
                      <div style={{ fontSize: "28px", marginBottom: "12px" }}>◆</div>
                      You haven't joined any circles yet.<br />
                      <span style={{ color: C.accent, cursor: "pointer" }} onClick={() => navigateTo("circles")}>Browse Circles →</span>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "2px", borderTop: `1px solid ${C.border}` }}>
                      {[...myCircles].sort((a: Circle, b: Circle) => {
                        const aT = circleLatestMsgs[a.code]?.created_at || "";
                        const bT = circleLatestMsgs[b.code]?.created_at || "";
                        return bT.localeCompare(aT);
                      }).map((circle: Circle) => {
                        const latest = circleLatestMsgs[circle.code];
                        return (
                          <div
                            key={circle.code}
                            onClick={() => { setActiveCircle(circle); setCirclesView("detail"); navigateTo("circles"); }}
                            style={{
                              display: "flex", alignItems: "center", gap: "14px",
                              padding: "16px 0", borderBottom: `1px solid ${C.border}`,
                              cursor: "pointer",
                            }}
                          >
                            <div style={{
                              width: "40px", height: "40px", borderRadius: "50%",
                              background: C.border2, display: "flex", alignItems: "center",
                              justifyContent: "center", fontSize: "18px", flexShrink: 0,
                            }}>
                              {circle.emoji || "◆"}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontFamily: MONO, fontSize: "12px", fontWeight: 700, color: C.text, marginBottom: "4px" }}>
                                {circle.name || circle.code}
                              </div>
                              {latest ? (
                                <div style={{ fontSize: "12px", color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  <span style={{ color: C.text2 }}>{latest.author_name}:</span> {latest.text}
                                </div>
                              ) : (
                                <div style={{ fontSize: "12px", color: C.muted, fontStyle: "italic" }}>No messages yet</div>
                              )}
                            </div>
                            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, flexShrink: 0 }}>›</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* RULES */}
              {homeSection === "rules" && (
                <div style={{ marginTop: "clamp(24px, 5vw, 40px)", display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                    <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                      Read before every {stratShort(activeStrategy)} session.
                    </div>
                    <StrategySelect strategies={allStrategyNames} value={activeStrategy} onChange={(s: string) => { setActiveStrategy(s); setEditingRule(null); }} C={C} align="right" />
                  </div>
                  <div style={{ borderTop: `1px solid ${C.border}` }}>
                    {ruleItems.map((rule: { id: number; text: string }, idx: number) => (
                      <div key={rule.id} className="check-row" style={{ minHeight: "52px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "14px", padding: "8px 0" }}>
                        <span style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.08em", minWidth: "24px" }}>{String(idx + 1).padStart(2, "0")}</span>
                        {editingRule === rule.id
                          ? <EditInline val={rule.text} onSave={(t: string) => saveEditRule(rule.id, t)} onCancel={() => setEditingRule(null)} C={C} />
                          : <>
                            <span style={{ flex: 1, fontSize: "14px", color: C.text, lineHeight: 1.55, fontFamily: BODY }}>{rule.text}</span>
                            <div className="ca" style={{ display: "flex", gap: "4px", opacity: 0, transition: "opacity 0.15s" }}>
                              <button onClick={() => setEditingRule(rule.id)} style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "6px", color: C.muted, fontSize: "10px", cursor: "pointer", fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase", padding: "8px 10px", minHeight: "44px" }}>edit</button>
                              <button onClick={() => deleteRule(rule.id)} style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "6px", color: C.red, fontSize: "10px", cursor: "pointer", fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase", padding: "8px 10px", minHeight: "44px" }}>rm</button>
                            </div>
                          </>}
                      </div>
                    ))}
                  </div>
                  {addingRule
                    ? <div style={{ display: "flex", gap: "10px", alignItems: "center", paddingTop: "8px" }}>
                      <input autoFocus value={newRuleText} onChange={e => setNewRuleText(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") addRule(); if (e.key === "Escape") { setAddingRule(false); setNewRuleText(""); } }}
                        placeholder="New rule..." style={{ ...inp, flex: 1 }} />
                      <button onClick={addRule} style={{ ...pillPrimary(!!newRuleText.trim()), width: "auto", padding: "10px 16px" }}>Add</button>
                      <button aria-label="Cancel" onClick={() => { setAddingRule(false); setNewRuleText(""); }} style={{ ...pillGhost, padding: "10px 14px" }}>X</button>
                    </div>
                    : <button onClick={() => setAddingRule(true)} style={{ ...pillGhost, alignSelf: "flex-start" }}>+ ADD RULE</button>
                  }
                </div>
              )}

              {/* SYNC / DATA SOURCES */}
              {homeSection === "sync" && (
                <DataSourcesScreen
                  C={C}
                  supabase={supabase}
                  userId={profile.uid ?? user?.id ?? ""}
                  accessToken={accessToken}
                  existingTrades={trades}
                  allStrategyNames={allStrategyNames}
                  onTradesImported={handleCsvImport}
                  showToast={showToast}
                  autoOpenCsv={autoOpenCsv}
                  onAutoOpenCsvDone={() => setAutoOpenCsv(false)}
                />
              )}

              {/* SETTINGS */}
              {homeSection === "eval" && profile.propFirmMode && (
                <EvalAccountScreen
                  profile={profile}
                  trades={trades}
                  C={C}
                  onEditTargets={() => setHomeSection("settings")}
                />
              )}

              {homeSection === "settings" && (
                <SettingsScreen
                  C={C}
                  profile={profile}
                  profileDraft={profileDraft}
                  setProfileDraft={setProfileDraft}
                  editingProfile={editingProfile}
                  setEditingProfile={setEditingProfile}
                  darkMode={darkMode}
                  toggleDark={toggleDark}
                  fontScale={fontScale}
                  setFontScale={setFontScale}
                  deleteConfirm={deleteConfirm}
                  setDeleteConfirm={setDeleteConfirm}
                  deletingAccount={deletingAccount}
                  handleAvatarUpload={handleAvatarUpload}
                  normaliseHandle={normaliseHandle}
                  isHandleTaken={isHandleTaken}
                  saveProfile={saveProfile}
                  showToast={showToast}
                  exportCSV={exportCSV}
                  deleteAccount={deleteAccount}
                  setShowUpgrade={setShowUpgrade}
                  setFeedbackOpen={setFeedbackOpen}
                  isFlagOn={isFlagOn}
                  onSignOut={async () => {
                    try {
                      await supabase.auth.signOut();
                    } catch (_) {}
                    phReset();
                  }}
                  onPlanRefreshed={() => { void loadAll(); }}
                />
              )}
            </div>
          )}

          {/* ══════════════════════════ REVIEW INBOX ══════════════════════ */}
          {view === "inbox" && (
            <ReviewInboxScreen
              userId={profile.uid ?? ""}
              trades={trades}
              saveTrades={saveTrades}
              onCountChange={setDraftCount}
              C={C as Record<string, string>}
              navigateTo={navigateTo}
            />
          )}

          {/* ══════════════════════════ LOG TRADE ══════════════════════════ */}
          {view === "log" && (
            <>
              {draftCount > 0 && (
                <div style={{ margin: "16px 20px 0", background: `color-mix(in oklch, ${C.green ?? "#22c55e"} 10%, ${C.panel})`, border: `1px solid color-mix(in oklch, ${C.green ?? "#22c55e"} 30%, transparent)`, borderRadius: "10px", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                  <div>
                    <span style={{ fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: C.green ?? "#22c55e", fontWeight: 700 }}>
                      {draftCount} trade{draftCount !== 1 ? "s" : ""} ready to review
                    </span>
                    <p style={{ fontFamily: BODY, fontSize: "12px", color: C.text2 ?? C.muted, marginTop: "2px" }}>
                      Auto-synced from your broker — publish to your journal
                    </p>
                  </div>
                  <button onClick={() => navigateTo("inbox")} style={{ flexShrink: 0, fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", background: C.green ?? "#22c55e", color: "#0A0A0A", border: "none", borderRadius: "999px", padding: "8px 14px", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" }}>
                    Review →
                  </button>
                </div>
              )}
            {(() => {
              const _today = new Date().toISOString().split("T")[0];
              const _todayTrades = trades.filter(t => t.date === _today);
              const _todayPnl = _todayTrades.reduce((a, t) => a + (parseFloat(t.pnl as string) || 0), 0);
              const _maxTpd = parseInt(profile.maxTradesPerDay) || 0;
              const _maxDl = parseFloat(profile.maxDailyLoss || "0") || 0;
              const _lossStreak = (() => {
                let count = 0;
                for (const t of trades) {
                  if (t.outcome === "Loss") { count++; } else { break; }
                }
                return count;
              })();
              return (
                <LogTradeScreen
                  C={C}
                  form={form} setForm={setForm as any}
                  editId={editId as any} setEditId={setEditId as any}
                  handleChange={handleChange}
                  handleScreenshotUpload={handleScreenshotUpload as any}
                  removeScreenshot={removeScreenshot as any}
                  submitTrade={submitTrade}
                  savingTrade={savingTrade}
                  allStrategyNames={allStrategyNames}
                  _allStratMap={_allStratMap}
                  allSetups={allSetups}
                  setView={navigateTo}
                  todayTradeCount={_todayTrades.length}
                  todayPnl={_todayPnl}
                  maxTradesPerDay={_maxTpd}
                  maxDailyLoss={_maxDl}
                  lossStreak={_lossStreak}
                  defaultAccountType={profile.propFirmMode ? "funded" : "personal"}
                />
              );
            })()}
            </>
          )}

          {/* ══════════════════════════ HISTORY ══════════════════════════ */}
          {view === "history" && (
            <div style={{ position: "relative" }}>
              {/* ambient orb */}
              <div style={{ position: "absolute", top: 100, right: -100, width: 320, height: 320, borderRadius: "50%", background: `radial-gradient(circle, ${C.orb2} 0%, transparent 65%)`, filter: "blur(60px)", opacity: darkMode ? 0.4 : 0.25, pointerEvents: "none", zIndex: 0 }} />
              {/* Title + summary */}
              <div style={{ padding: "12px 6px", position: "relative", zIndex: 2 }}>
                <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.16em", textTransform: "uppercase" }}>Trade history</div>
                <div style={{ fontFamily: DISPLAY, fontSize: "26px", fontWeight: 500, color: C.text, marginTop: "4px", letterSpacing: "-0.02em" }}>
                  <span style={{ fontWeight: 600 }}>{trades.length}</span> trades logged
                </div>
                {trades.length > 0 && (
                  <div style={{ marginTop: "8px", fontFamily: MONO, fontSize: "12px", color: C.text2 }}>
                    <span style={{ color: pnlPos ? C.green : C.red, fontWeight: 600 }}>{pnlPos ? "+" : ""}{totalPnL}R</span> lifetime · {winRate}% win rate
                  </div>
                )}
              </div>
              {/* Controls row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", position: "relative", zIndex: 2 }}>
                <div style={{ fontFamily: MONO, fontSize: "10px", fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", color: C.muted }}>{filteredTrades.length} trades</div>
                <button onClick={() => setShowCsvImport(v => !v)} style={{ background: showCsvImport ? C.text : "transparent", color: showCsvImport ? C.bg : C.text, border: `1px solid ${showCsvImport ? C.text : C.border2}`, borderRadius: "999px", padding: "6px 14px", cursor: "pointer", fontSize: "10px", fontFamily: MONO, letterSpacing: "0.12em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                  {showCsvImport ? "Close" : "Import CSV"}
                </button>
              </div>
              {showCsvImport && (
                <CsvImportPanel
                  existingTrades={trades}
                  onImport={handleCsvImport}
                  onClose={() => setShowCsvImport(false)}
                  allStrategyNames={allStrategyNames}
                  C={C}
                  inp={inp}
                  sel={sel}
                  lbl={lbl}
                  defaultAccountType={profile?.propFirmMode ? "funded" : "personal"}
                />
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginTop: "20px" }}>
                <input placeholder="Pair..." value={filter.pair} onChange={e => setFilter({ ...filter, pair: e.target.value })} style={inp} />
                <select value={filter.outcome} onChange={e => setFilter({ ...filter, outcome: e.target.value })} style={sel}><option value="">All outcomes</option>{OUTCOMES.map(o => <option key={o}>{o}</option>)}</select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginTop: "14px" }}>
                <select value={filter.strategy} onChange={e => setFilter({ ...filter, strategy: e.target.value, setup: "" })} style={sel}><option value="">All strategies</option>{allStrategyNames.map((s: string) => <option key={s}>{s}</option>)}</select>
                <select value={filter.setup} onChange={e => setFilter({ ...filter, setup: e.target.value })} style={sel}><option value="">All setups</option>{(filter.strategy ? _allStratMap[filter.strategy]?.setups || [] : allSetups).map((s: string) => <option key={s} value={s}>{s.split("(")[0].trim()}</option>)}</select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginTop: "14px", marginBottom: "20px" }}>
                <input type="date" value={filter.dateFrom} onChange={e => setFilter({ ...filter, dateFrom: e.target.value })} style={{ ...inp, colorScheme: darkMode ? "dark" : "light" }} />
                <input type="date" value={filter.dateTo} onChange={e => setFilter({ ...filter, dateTo: e.target.value })} style={{ ...inp, colorScheme: darkMode ? "dark" : "light" }} />
              </div>
              {(filter.pair || filter.outcome || filter.strategy || filter.setup || filter.dateFrom || filter.dateTo) && (
                <button onClick={() => setFilter({ outcome: "", setup: "", pair: "", strategy: "", dateFrom: "", dateTo: "" })}
                  style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", padding: "0 0 16px", textDecoration: "underline" }}>
                  Clear filters
                </button>
              )}
              {filteredTrades.length === 0 ? (
                trades.length === 0 ? (
                  // True empty — no trades at all yet
                  <EmptyTradesState C={C} onLog={() => navigateTo("log")} onSync={() => { setHomeSection("sync"); primaryNav("home"); }} />
                ) : (
                  // Filters active, nothing matches
                  <div style={{ textAlign: "center", padding: "60px 0", color: C.muted, fontSize: "13px", fontFamily: BODY, fontStyle: "italic" }}>
                    No trades match those filters.
                  </div>
                )
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px", position: "relative", zIndex: 2 }}>
                {(() => {
                  // Group trades by date for day headers
                  const groups: { date: string; trades: typeof filteredTrades }[] = [];
                  filteredTrades.forEach(t => {
                    const d = t.date || "Unknown";
                    const last = groups[groups.length - 1];
                    if (last && last.date === d) last.trades.push(t);
                    else groups.push({ date: d, trades: [t] });
                  });
                  return groups.map((g) => {
                    const dayNet = g.trades.reduce((s, t) => s + (parseFloat(t.pnlDollar as string) || parseFloat(t.pnl) || 0), 0);
                    const hasDollar = g.trades.some(t => t.pnlDollar);
                    return (
                      <div key={g.date}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0 8px 8px" }}>
                          <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase" }}>{g.date}</div>
                          <div style={{ fontFamily: MONO, fontSize: "12px", fontWeight: 600, color: dayNet >= 0 ? C.green : C.red }}>
                            {hasDollar ? `${dayNet >= 0 ? "+" : ""}$${Math.abs(dayNet).toFixed(0)}` : `${dayNet >= 0 ? "+" : ""}${dayNet.toFixed(1)}R`}
                          </div>
                        </div>
                        <div style={{ borderRadius: "18px", overflow: "hidden", border: `1px solid ${C.border}`, background: C.panel }}>
                  {g.trades.map((t, _ti) => {
                    const expanded = expandedId === t.id;
                    const commentText = commentInputs[t.id] || "";
                    return (
                      <div key={t.id} className="stagger-item" style={{ borderBottom: `1px solid ${C.border}` }}>
                        <div className="row-hvr" onClick={() => setExpandedId(expanded ? null : t.id)}
                          style={{ padding: "12px 14px", minHeight: "56px", cursor: "pointer", display: "flex", alignItems: "center", gap: "12px" }}>
                          {/* Instrument badge */}
                          <div style={{
                            width: "38px", height: "38px", borderRadius: "11px", flexShrink: 0,
                            background: t.outcome === "Win" ? `color-mix(in oklch, ${C.green} 14%, transparent)` : t.outcome === "Loss" ? `color-mix(in oklch, ${C.red} 14%, transparent)` : `rgba(255,255,255,0.06)`,
                            border: `1px solid ${t.outcome === "Win" ? `color-mix(in oklch, ${C.green} 28%, transparent)` : t.outcome === "Loss" ? `color-mix(in oklch, ${C.red} 28%, transparent)` : C.border2}`,
                            color: t.outcome === "Win" ? C.green : t.outcome === "Loss" ? C.red : C.muted,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontFamily: MONO, fontWeight: 600, fontSize: "10px", letterSpacing: "0.04em",
                          }}>{(t.pair || "—").slice(0, 3).toUpperCase()}</div>
                          {/* Middle: name + direction badge / date + strategy */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ fontFamily: DISPLAY, fontSize: "14px", fontWeight: 600, color: C.text, letterSpacing: "0.02em" }}>{t.pair || "—"}</span>
                              {t.direction && (
                                <span style={{
                                  padding: "1px 6px", borderRadius: "4px", fontSize: "8px", letterSpacing: "0.10em",
                                  fontFamily: MONO, fontWeight: 700, textTransform: "uppercase",
                                  background: t.direction === "Long" ? `color-mix(in oklch, ${C.green} 14%, transparent)` : `color-mix(in oklch, ${C.red} 14%, transparent)`,
                                  color: t.direction === "Long" ? C.green : C.red,
                                }}>{t.direction === "Long" ? "LONG" : "SHORT"}</span>
                              )}
                            </div>
                            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginTop: "2px" }}>
                              {t.date}{t.strategy ? ` · ${stratCode(t.strategy)}` : ""}{t.session ? ` · ${t.session}` : ""}
                            </div>
                          </div>
                          {/* Right: P&L + R */}
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            {t.pnlDollar ? (
                              <>
                                <div style={{ fontFamily: MONO, fontSize: "13px", fontWeight: 600, color: parseFloat(t.pnlDollar) >= 0 ? C.green : C.red, fontVariantNumeric: "tabular-nums" }}>
                                  {parseFloat(t.pnlDollar) >= 0 ? "+" : ""}${Math.abs(parseFloat(t.pnlDollar)).toFixed(0)}
                                </div>
                                <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, marginTop: "2px" }}>{t.rr ? `${t.rr}R` : outcomeLetter(t.outcome)}</div>
                              </>
                            ) : (
                              <>
                                <div style={{ fontFamily: DISPLAY, fontSize: "15px", fontWeight: 500, color: t.outcome === "Win" ? C.green : t.outcome === "Loss" ? C.red : C.muted, letterSpacing: "-0.01em" }}>{t.rr ? `${parseFloat(t.rr) >= 0 ? "+" : ""}${t.rr}R` : "—"}</div>
                                <div style={{ fontFamily: MONO, fontSize: "9px", color: outcomeColor(t.outcome, C), marginTop: "2px" }}>{outcomeLetter(t.outcome)}</div>
                              </>
                            )}
                          </div>
                        </div>
                        {expanded && (
                          <div style={{ padding: "8px 0 24px", display: "flex", flexDirection: "column", gap: "12px" }}>
                            {/* ── Glass hero card ── */}
                            <div style={{ margin: "0 2px", borderRadius: 24, padding: 22, position: "relative", overflow: "hidden", background: darkMode ? "rgba(20,20,26,0.6)" : "rgba(255,255,255,0.7)", backdropFilter: "blur(20px) saturate(160%)", border: `1px solid ${C.border2}` }}>
                              {/* corner glow */}
                              <div style={{ position: "absolute", top: -80, left: -80, width: 240, height: 240, borderRadius: "50%", background: `conic-gradient(from 200deg at 50% 50%, ${C.orb3}, ${C.accent}, ${C.orb2}, ${C.orb3})`, filter: "blur(50px)", opacity: darkMode ? 0.5 : 0.3, pointerEvents: "none" }} />
                              {/* ghost P&L watermark */}
                              {t.pnl && <div style={{ position: "absolute", bottom: -20, right: -10, fontFamily: DISPLAY, fontWeight: 700, fontSize: 130, color: parseFloat(t.pnl) >= 0 ? C.green : C.red, opacity: 0.07, letterSpacing: "-0.04em", lineHeight: 1, pointerEvents: "none" }}>{parseFloat(t.pnl) >= 0 ? "+" : ""}{t.pnl}R</div>}

                              <div style={{ display: "flex", alignItems: "flex-start", gap: 14, position: "relative", zIndex: 1 }}>
                                {/* 56px instrument badge */}
                                <div style={{ width: 56, height: 56, borderRadius: 16, flexShrink: 0, background: t.outcome === "Win" ? `color-mix(in oklch, ${C.green} 14%, transparent)` : t.outcome === "Loss" ? `color-mix(in oklch, ${C.red} 14%, transparent)` : `rgba(255,255,255,0.06)`, border: `1px solid ${t.outcome === "Win" ? `color-mix(in oklch, ${C.green} 30%, transparent)` : t.outcome === "Loss" ? `color-mix(in oklch, ${C.red} 30%, transparent)` : C.border2}`, color: t.outcome === "Win" ? C.green : t.outcome === "Loss" ? C.red : C.muted, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontWeight: 600, fontSize: 16, letterSpacing: "0.02em" }}>{(t.pair || "—").slice(0, 3).toUpperCase()}</div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 600, color: C.text }}>{t.pair || "—"}</span>
                                    {t.direction && <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 9, letterSpacing: "0.12em", fontFamily: MONO, fontWeight: 600, background: t.direction === "Long" ? `color-mix(in oklch, ${C.green} 14%, transparent)` : `color-mix(in oklch, ${C.red} 14%, transparent)`, color: t.direction === "Long" ? C.green : C.red }}>{t.direction === "Long" ? "LONG" : "SHORT"}</span>}
                                  </div>
                                  <div style={{ fontSize: 11, color: C.text2, marginTop: 4, fontFamily: MONO }}>{t.date}{t.strategy ? ` · ${stratCode(t.strategy)}` : ""}{t.session ? ` · ${t.session}` : ""}</div>
                                </div>
                              </div>

                              {/* Metrics grid */}
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 18, position: "relative", zIndex: 1 }}>
                                <div>
                                  <div style={{ fontFamily: MONO, fontSize: 9, color: C.muted, letterSpacing: "0.16em", textTransform: "uppercase" }}>R-Multi</div>
                                  <div style={{ fontFamily: DISPLAY, fontSize: 28, fontWeight: 600, color: t.pnl && parseFloat(t.pnl) >= 0 ? C.green : t.pnl ? C.red : C.text, marginTop: 4, letterSpacing: "-0.02em" }}>{t.pnl ? `${parseFloat(t.pnl) >= 0 ? "+" : ""}${t.pnl}R` : "—"}</div>
                                </div>
                                <div>
                                  <div style={{ fontFamily: MONO, fontSize: 9, color: C.muted, letterSpacing: "0.16em", textTransform: "uppercase" }}>Net P&L</div>
                                  <div style={{ fontFamily: DISPLAY, fontSize: 28, fontWeight: 600, color: C.text, marginTop: 4, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{t.pnlDollar ? `${parseFloat(t.pnlDollar) >= 0 ? "+" : ""}$${Math.abs(parseFloat(t.pnlDollar)).toFixed(0)}` : "—"}</div>
                                </div>
                                <div>
                                  <div style={{ fontFamily: MONO, fontSize: 9, color: C.muted, letterSpacing: "0.16em", textTransform: "uppercase" }}>Entry</div>
                                  <div style={{ fontFamily: DISPLAY, fontSize: 28, fontWeight: 600, color: C.text2, marginTop: 4, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{t.entryPrice || "—"}</div>
                                </div>
                              </div>
                            </div>

                            {/* ── Chart / screenshot card ── */}
                            <div style={{ margin: "0 2px" }}>
                              {t.screenshot ? (
                                <div style={{ borderRadius: 22, overflow: "hidden", background: C.panel, border: `1px solid ${C.border}`, position: "relative" }}>
                                  <img src={t.screenshot} alt="chart" loading="lazy" style={{ width: "100%", display: "block", maxHeight: 240, objectFit: "cover" }} />
                                  <div style={{ display: "flex", gap: 10, padding: "12px 18px", fontFamily: MONO, fontSize: 10 }}>
                                    {t.entryPrice && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.text2 }}><span style={{ width: 6, height: 6, borderRadius: 999, background: (C as any).live ?? C.accent }} />Entry {t.entryPrice}</span>}
                                    {t.slPrice && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.text2 }}><span style={{ width: 6, height: 6, borderRadius: 999, background: C.red }} />Stop {t.slPrice}</span>}
                                    {t.tpPrice && <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.text2 }}><span style={{ width: 6, height: 6, borderRadius: 999, background: C.green }} />Exit {t.tpPrice}</span>}
                                  </div>
                                  <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6 }}>
                                    <label htmlFor={`ss-${t.id}`} style={{ background: C.bg, border: `1px solid ${C.border2}`, borderRadius: 999, padding: "4px 10px", fontSize: 10, color: C.text, cursor: "pointer", fontFamily: MONO, letterSpacing: "0.08em" }}>REPLACE<input id={`ss-${t.id}`} type="file" accept="image/jpeg,image/png" style={{ display: "none" }} onChange={e => handleScreenshotUpload(e, t.id)} /></label>
                                    <button onClick={() => removeScreenshot(t.id)} style={{ background: C.bg, border: `1px solid ${C.border2}`, borderRadius: 999, color: C.text, padding: "4px 10px", fontSize: 10, cursor: "pointer", fontFamily: MONO, letterSpacing: "0.08em" }}>REMOVE</button>
                                  </div>
                                </div>
                              ) : (
                                <label htmlFor={`ss-${t.id}`} style={{ display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 22, border: `1px dashed ${C.border2}`, padding: 22, cursor: "pointer", color: C.muted, fontSize: 11, fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase", background: C.panel }}>
                                  + Add chart screenshot
                                  <input id={`ss-${t.id}`} type="file" accept="image/jpeg,image/png" style={{ display: "none" }} onChange={e => handleScreenshotUpload(e, t.id)} />
                                </label>
                              )}
                            </div>

                            {/* ── Prices card (SL/TP if not already shown) ── */}
                            {(t.slPrice || t.tpPrice) && !t.screenshot && (
                              <div style={{ margin: "0 2px", borderRadius: 22, padding: 18, background: C.panel, border: `1px solid ${C.border}` }}>
                                <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", color: C.muted, textTransform: "uppercase", marginBottom: 12 }}>Prices</div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                                  {[["ENTRY", t.entryPrice], ["SL", t.slPrice], ["TP", t.tpPrice]].map(([l2, v]) => v ? (
                                    <div key={l2 as string}>
                                      <div style={{ fontFamily: MONO, fontSize: 9, color: C.muted, letterSpacing: "0.12em", marginBottom: 4 }}>{l2}</div>
                                      <div style={{ fontFamily: MONO, fontSize: 13, color: C.text, letterSpacing: "0.02em" }}>{v}</div>
                                    </div>
                                  ) : null)}
                                </div>
                              </div>
                            )}

                            {/* ── Strategy card ── */}
                            {t.strategy && (
                              <div style={{ margin: "0 2px", borderRadius: 22, padding: 18, background: C.panel, border: `1px solid ${C.border}` }}>
                                <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", color: C.muted, textTransform: "uppercase" }}>Strategy</div>
                                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                                  <div style={{ width: 36, height: 36, borderRadius: 12, background: C.accentSoft, color: C.accent, border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontWeight: 600, fontSize: 10 }}>{stratCode(t.strategy)}</div>
                                  <div>
                                    <div style={{ fontFamily: DISPLAY, fontSize: 13, fontWeight: 600, color: C.text }}>{stratShort(t.strategy)}</div>
                                    {t.setup && <div style={{ fontFamily: MONO, fontSize: 10, color: C.text2, marginTop: 2 }}>{stratShort(t.setup)}{t.bias ? ` · ${t.bias}` : ""}</div>}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* ── Mistake + emotion tags ── */}
                            {(t.mistake && t.mistake !== "None" || getEmotionTags(t.emotions).length > 0) && (
                              <div style={{ margin: "0 2px", borderRadius: 22, padding: 18, background: C.panel, border: `1px solid ${C.border}` }}>
                                {t.mistake && t.mistake !== "None" && (
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: getEmotionTags(t.emotions).length > 0 ? 12 : 0 }}>
                                    <span style={{ fontFamily: MONO, fontSize: 10, color: C.muted, letterSpacing: "0.08em" }}>MISTAKE</span>
                                    <span style={{ background: `color-mix(in oklch, ${C.red} 14%, transparent)`, color: C.red, border: `1px solid color-mix(in oklch, ${C.red} 25%, transparent)`, borderRadius: 999, padding: "3px 10px", fontFamily: MONO, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" }}>{t.mistake}</span>
                                  </div>
                                )}
                                {getEmotionTags(t.emotions).length > 0 && (
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                    {getEmotionTags(t.emotions).map(id => {
                                      const tag = EMOTION_TAGS.find(e => e.id === id);
                                      if (!tag) return null;
                                      return <span key={id} style={{ background: `color-mix(in oklch, ${tag.color} 12%, transparent)`, color: tag.color, border: `1px solid color-mix(in oklch, ${tag.color} 25%, transparent)`, borderRadius: 999, padding: "3px 10px", fontFamily: MONO, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase" }}>{tag.label}</span>;
                                    })}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* ── Notes card ── */}
                            {t.notes && (
                              <div style={{ margin: "0 2px", borderRadius: 22, padding: 18, background: C.panel, border: `1px solid ${C.border}` }}>
                                <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", color: C.muted, textTransform: "uppercase" }}>Notes</div>
                                <div style={{ marginTop: 10, fontFamily: BODY, fontSize: 13, color: C.text, lineHeight: 1.55 }}>{t.notes}</div>
                              </div>
                            )}

                            {/* ── Reactions card ── */}
                            <div style={{ margin: "0 2px", borderRadius: 22, padding: 18, background: C.panel, border: `1px solid ${C.border}` }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", color: C.muted, textTransform: "uppercase" }}>Reactions</div>
                                {(() => { const total = REACTIONS.reduce((s, rx) => { const raw = (t.reactions || {})[rx]; return s + (Array.isArray(raw) ? raw.length : (raw || 0)); }, 0); return total > 0 ? <span style={{ fontFamily: MONO, fontSize: 11, color: C.text2 }}>{total}</span> : null; })()}
                              </div>
                              <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
                                {REACTIONS.map(rx => {
                                  const raw = (t.reactions || {})[rx];
                                  const reactors: string[] = Array.isArray(raw) ? raw : (raw > 0 ? [] : []);
                                  const count = Array.isArray(raw) ? raw.length : (raw || 0);
                                  const myCode = profile.code || "";
                                  const iMine = Array.isArray(raw) && raw.includes(myCode);
                                  const rxColor = rx === "FIRE" || rx === "PAIN" ? C.red : rx === "GEM" || rx === "UP" ? (C as any).live ?? C.accent : C.accent;
                                  return (
                                    <button key={rx} onClick={() => toggleReaction(t.id, rx)} aria-label={`React with ${rx}${count > 0 ? `, ${count}` : ""}`}
                                      style={{ background: iMine ? `color-mix(in oklch, ${rxColor} 18%, transparent)` : `color-mix(in oklch, ${rxColor} 8%, transparent)`, color: iMine ? rxColor : C.text2, border: `1px solid ${iMine ? `color-mix(in oklch, ${rxColor} 35%, transparent)` : `color-mix(in oklch, ${rxColor} 15%, transparent)`}`, borderRadius: 999, padding: "5px 10px", cursor: "pointer", fontSize: 10, fontFamily: MONO, fontWeight: 600, letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 5 }}>
                                      <span>{rx}</span>
                                      {count > 0 && <span>· {count}</span>}
                                    </button>
                                  );
                                  void reactors;
                                })}
                              </div>
                            </div>

                            {/* ── Comments card ── */}
                            <div style={{ margin: "0 2px", borderRadius: 22, padding: 18, background: C.panel, border: `1px solid ${C.border}` }}>
                              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", color: C.muted, textTransform: "uppercase", marginBottom: 10 }}>Notes {(t.comments || []).length > 0 && `(${(t.comments || []).length})`}</div>
                              {(t.comments || []).map((c: TradeComment) => (
                                <div key={c.id} style={{ padding: "10px 0", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, alignItems: "flex-start" }}>
                                  <AvatarCircle name={c.author} size={26} C={C} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                      <span style={{ fontFamily: MONO, fontSize: 11, color: C.text, letterSpacing: "0.04em" }}>{c.author}</span>
                                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                        <span style={{ fontFamily: MONO, fontSize: 9, color: C.dim, letterSpacing: "0.04em" }}>{c.ts}</span>
                                        {(c.author === profile.name || c.author === "You") && (
                                          <button aria-label="Delete comment" onClick={() => deleteComment(t.id, c.id)} style={{ background: "none", border: "none", color: C.dim, fontSize: 10, cursor: "pointer", fontFamily: MONO }}>x</button>
                                        )}
                                      </div>
                                    </div>
                                    <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.55, wordBreak: "break-word", fontFamily: BODY }}>{c.text}</div>
                                  </div>
                                </div>
                              ))}
                              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                                <AvatarCircle name={profile.name} avatar={profile.avatar} size={26} C={C} />
                                <input value={commentText} onChange={e => setCommentInputs((p: Record<number, string>) => ({ ...p, [t.id]: e.target.value }))}
                                  onKeyDown={e => { if (e.key === "Enter") addComment(t.id); }}
                                  placeholder="Add a note..." style={{ ...inp, fontSize: 13, flex: 1, padding: "6px 0" }} />
                                <button onClick={() => addComment(t.id)} style={{ ...pillPrimary(!!commentText.trim()), width: "auto", padding: "8px 16px", fontSize: 11 }}>Post</button>
                              </div>
                            </div>

                            {/* ── Actions ── */}
                            <div style={{ display: "flex", gap: 8, margin: "0 2px" }}>
                              <button onClick={() => editTrade(t)} style={{ ...pillGhost, padding: "8px 14px" }}>EDIT</button>
                              <button
                                title="Share to circle"
                                onClick={() => { setTradeToShare(t); setSharingToCircle(null); }}
                                style={{ ...pillGhost, padding: "8px 14px" }}
                              >
                                SHARE ↗
                              </button>
                              {confirmDelete === t.id ? (
                                <>
                                  <button onClick={() => deleteTrade(t.id)} style={{ ...pillGhost, padding: "8px 14px", color: C.red, borderColor: C.red }}>CONFIRM</button>
                                  <button onClick={() => setConfirmDelete(null)} style={{ ...pillGhost, padding: "8px 14px" }}>CANCEL</button>
                                </>
                              ) : (
                                <button onClick={() => setConfirmDelete(t.id)} style={{ ...pillGhost, padding: "8px 14px", color: C.red, borderColor: `${C.red}55` }}>DELETE</button>
                              )}
                              {t.screenshot && <a href={t.screenshot} target="_blank" rel="noreferrer" style={{ ...pillGhost, padding: "8px 14px", textDecoration: "none", display: "inline-flex", alignItems: "center" }}>CHART ↗</a>}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                        </div>
                      </div>
                    );
                  });
                })()}
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════ STATS ══════════════════════════ */}
          {view === "stats" && (
            <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: "12px" }}>
              {/* ambient orb */}
              <div style={{ position: "absolute", top: -60, right: -100, width: 380, height: 380, borderRadius: "50%", background: `radial-gradient(circle, ${C.orb1} 0%, transparent 65%)`, filter: "blur(60px)", opacity: darkMode ? 0.5 : 0.3, pointerEvents: "none", zIndex: 0 }} />
              {/* title + subtitle */}
              <div style={{ padding: "12px 6px 0", position: "relative", zIndex: 2 }}>
                <div style={{ fontFamily: MONO, fontSize: "10px", fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", color: C.muted }}>Edge analysis</div>
                <div style={{ fontFamily: DISPLAY, fontSize: "26px", fontWeight: 500, letterSpacing: "-0.02em", marginTop: "4px", color: C.text }}>
                  Your <span style={{ fontWeight: 600 }}>edge</span> this quarter
                </div>
              </div>
              {/* pill tabs + controls */}
              {!isDesktop && (<>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "0 6px", position: "relative", zIndex: 2, flexWrap: "wrap" }}>
                  <SubNavDropdown sections={STATS_SECTIONS} value={statsTab} onChange={setStatsTab} C={C} align="left" />
                  <button onClick={openExportPdf} style={{ background: "transparent", border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "6px 14px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", textTransform: "uppercase" as const, color: C.muted, whiteSpace: "nowrap" as const }}>
                    Export PDF ↗
                  </button>
                  </div>
                  <GearButton onClick={() => { setView("home"); setHomeSection("settings"); }} active={false} C={C} />
              </>)}

              {statsTab === "overview" && total === 0 && <EmptyState C={C} icon="&#128202;" headline="Your stats live here." body="Log your first trade and watch your edge emerge — win rate, R-multiples, streaks, and more." cta="Log a trade →" onCta={() => navigateTo("log")} />}

              {statsTab === "overview" && total > 0 && (
                <>
                  {/* ── Win Rate Ring card ── */}
                  <div style={{ borderRadius: "22px", padding: "22px", background: C.surfaceGlass, backdropFilter: "blur(20px) saturate(140%)", WebkitBackdropFilter: "blur(20px) saturate(140%)", border: `1px solid ${C.border}`, position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: -60, right: -60, width: 220, height: 220, borderRadius: "50%", pointerEvents: "none", background: `conic-gradient(from 200deg at 50% 50%, ${C.orb3}, ${C.accent}, ${C.orb2}, ${C.orb3})`, filter: "blur(40px)", opacity: 0.45, zIndex: 0 }} />
                    <div style={{ display: "flex", alignItems: "center", gap: "22px", position: "relative", zIndex: 1 }}>
                      {(() => {
                        const wr = parseFloat(winRate as any) || 0;
                        const r = 38, circ = 2 * Math.PI * r;
                        const dash = (wr / 100) * circ;
                        return (
                          <svg width="100" height="100" viewBox="0 0 100 100" style={{ flexShrink: 0 }}>
                            <circle cx="50" cy="50" r={r} fill="none" stroke={C.border2} strokeWidth="8"/>
                            <circle cx="50" cy="50" r={r} fill="none" stroke={C.accent} strokeWidth="8"
                              strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 50 50)"/>
                            <text x="50" y="50" textAnchor="middle" dy="0.35em"
                              fontFamily={DISPLAY} fontSize="22" fontWeight="600" fill={C.text}>{wr}</text>
                            <text x="50" y="64" textAnchor="middle" fontFamily={MONO} fontSize="9" fill={C.muted} letterSpacing="0.08em">PERCENT</text>
                          </svg>
                        );
                      })()}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: MONO, fontSize: "10px", fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", color: C.muted }}>Win rate · {total} trades</div>
                        <div style={{ fontFamily: DISPLAY, fontSize: "32px", fontWeight: 600, color: C.text, marginTop: "6px", letterSpacing: "-0.02em" }}>
                          {winRate}<span style={{ fontSize: "18px", color: C.muted }}>%</span>
                        </div>
                        <div style={{ display: "flex", gap: "12px", marginTop: "10px", flexWrap: "wrap" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 8px", borderRadius: "999px", background: `color-mix(in oklch, ${C.green} 14%, transparent)`, color: C.green, fontSize: "11px", fontWeight: 600, fontFamily: MONO }}>▲ {wins}W</span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 8px", borderRadius: "999px", background: `color-mix(in oklch, ${C.red} 14%, transparent)`, color: C.red, fontSize: "11px", fontWeight: 600, fontFamily: MONO }}>▼ {losses}L</span>
                          {avgRR !== "—" && <span style={{ fontFamily: MONO, fontSize: "11px", color: C.muted }}>Avg {avgRR}R</span>}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── Day-of-week bars ── */}
                  {(() => {
                    const dow = [{d:"M",v:0},{d:"T",v:0},{d:"W",v:0},{d:"T",v:0},{d:"F",v:0}];
                    trades.forEach((t: Trade) => {
                      if (!t.date) return;
                      const day = new Date(t.date + "T12:00:00").getDay();
                      if (day >= 1 && day <= 5) dow[day - 1].v += parseFloat(t.pnl) || 0;
                    });
                    const maxAbs = Math.max(...dow.map(d => Math.abs(d.v)), 0.1);
                    const best = dow.reduce((a, b) => b.v > a.v ? b : a);
                    const dayNames = ["Monday","Tuesday","Wednesday","Thursday","Friday"];
                    return (
                      <div style={{ borderRadius: "22px", padding: "20px", background: C.panel, border: `1px solid ${C.border}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "14px" }}>
                          <div style={{ fontFamily: MONO, fontSize: "10px", fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", color: C.muted }}>Net by weekday</div>
                          <div style={{ fontFamily: MONO, fontSize: "10px", color: C.dim, letterSpacing: "0.08em" }}>ALL TIME</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "flex-end", gap: "10px", height: "120px" }}>
                          {dow.map((d, i) => {
                            const h = (Math.abs(d.v) / maxAbs) * 90;
                            const pos = d.v >= 0;
                            return (
                              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                                <div style={{ fontFamily: MONO, fontSize: "9px", color: d.v !== 0 ? (pos ? C.green : C.red) : C.dim, fontWeight: 600 }}>
                                  {d.v !== 0 ? `${pos ? "+" : ""}${d.v.toFixed(1)}` : "—"}
                                </div>
                                <div style={{ width: "100%", borderRadius: "8px", border: `1px solid ${C.border2}`, height: `${Math.max(h, 4)}px`, minHeight: "4px", background: pos ? `linear-gradient(180deg, ${C.accent}, color-mix(in oklch, ${C.accent} 40%, transparent))` : `linear-gradient(180deg, ${C.red}, color-mix(in oklch, ${C.red} 30%, transparent))` }} />
                                <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted }}>{d.d}</div>
                              </div>
                            );
                          })}
                        </div>
                        {best.v > 0 && (
                          <div style={{ marginTop: "14px", padding: "10px 12px", borderRadius: "12px", background: C.accentSoft, border: `1px solid ${C.border2}`, fontSize: "11px", color: C.text, fontFamily: BODY, lineHeight: 1.5 }}>
                            <span style={{ color: C.accent, fontWeight: 600 }}>Insight · </span>
                            {dayNames[dow.indexOf(best)]}s are your strongest day — <span style={{ fontFamily: MONO, fontWeight: 600 }}>{best.v >= 0 ? "+" : ""}{best.v.toFixed(1)}R</span> total.
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* ── Top setups ── */}
                  {Object.entries(stratStats).length > 0 && (
                    <div style={{ borderRadius: "22px", overflow: "hidden", border: `1px solid ${C.border}`, background: C.panel }}>
                      <div style={{ padding: "14px 14px 10px" }}>
                        <div style={{ fontFamily: MONO, fontSize: "10px", fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", color: C.muted }}>Top setups by net R</div>
                      </div>
                      {Object.entries(stratStats)
                        .map(([s, v]) => { const sv = v as { w: number; l: number; be: number; pnl: number; count: number }; return { name: s, count: sv.count, r: sv.pnl, pct: sv.w + sv.l > 0 ? Math.round(sv.w / (sv.w + sv.l) * 100) : 0, win: sv.pnl >= 0 }; })
                        .sort((a, b) => b.r - a.r)
                        .slice(0, 5)
                        .map((s) => (
                          <div key={s.name} style={{ padding: "12px 14px", borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "12px" }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontFamily: DISPLAY, fontSize: "13px", fontWeight: 600, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px" }}>
                                <div style={{ flex: 1, height: "4px", borderRadius: "2px", background: C.border2, overflow: "hidden" }}>
                                  <div style={{ width: `${s.pct}%`, height: "100%", background: s.win ? C.green : C.red, borderRadius: "2px" }} />
                                </div>
                                <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, minWidth: "28px" }}>{s.pct}%</div>
                              </div>
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0 }}>
                              <div style={{ fontFamily: MONO, fontSize: "13px", fontWeight: 600, color: s.win ? C.green : C.red }}>{s.r >= 0 ? "+" : ""}{s.r.toFixed(1)}R</div>
                              <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted }}>{s.count} trades</div>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}

                  {/* ── Compact stat strip ── */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                    {[
                      { label: "Total P&L", value: pnlMode === "$" && hasDollarData ? `${totalPnlDollar >= 0 ? "+" : "−"}$${Math.abs(totalPnlDollar).toFixed(0)}` : `${pnlPos ? "+" : ""}${totalPnL}R`, color: pnlPos ? C.green : C.red },
                      { label: "Avg R:R", value: avgRR === "—" ? "—" : `${avgRR}R`, color: C.text },
                      { label: "Best Streak", value: (() => { let best = 0, cur = 0, last: string | null = null; trades.slice().reverse().forEach((t: Trade) => { if (t.outcome === "Win") { cur = last === "Win" ? cur + 1 : 1; last = "Win"; best = Math.max(best, cur); } else { last = t.outcome; cur = 0; } }); return best > 0 ? `${best}W` : "—"; })(), color: C.text },
                    ].map(stat => (
                      <div key={stat.label} style={{ borderRadius: "16px", padding: "14px", background: C.panel, border: `1px solid ${C.border}` }}>
                        <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.14em", textTransform: "uppercase" }}>{stat.label}</div>
                        <div style={{ fontFamily: DISPLAY, fontSize: "18px", fontWeight: 600, color: stat.color, marginTop: "8px", letterSpacing: "-0.01em", fontVariantNumeric: "tabular-nums" }}>{stat.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* ── Discipline score card ── */}
                  {(() => {
                    const month = new Date().toISOString().slice(0, 7);
                    const monthTrades = trades.filter(t => t.date?.startsWith(month));
                    const tagged = monthTrades.filter(t => t.ruleAdherence !== null && t.ruleAdherence !== undefined);
                    if (tagged.length < 3) return null;
                    const followedPct = Math.round(tagged.filter(t => t.ruleAdherence === true).length / tagged.length * 100);
                    const grade = followedPct >= 80 ? "Excellent" : followedPct >= 60 ? "Good" : followedPct >= 40 ? "Needs work" : "Struggling";
                    const gradeColor = followedPct >= 80 ? C.green : followedPct >= 60 ? C.accent : followedPct >= 40 ? C.warn : C.red;
                    return (
                      <div style={{ borderRadius: "22px", padding: "18px 20px", background: C.panel, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "16px" }}>
                        <div style={{ width: "48px", height: "48px", borderRadius: "50%", border: `3px solid ${gradeColor}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <span style={{ fontFamily: DISPLAY, fontSize: "15px", fontWeight: 700, color: gradeColor }}>{followedPct}%</span>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: "4px" }}>Discipline · This month</div>
                          <div style={{ fontFamily: BODY, fontSize: "13px", color: C.text, lineHeight: 1.5 }}>
                            You followed your rules on <strong style={{ color: gradeColor }}>{followedPct}%</strong> of trades — <span style={{ color: C.muted }}>{grade}.</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Prop firm progress ── */}
                  {profile.propFirmMode && profile.propFirmBalance && (
                    (() => {
                      const bal = profile.propFirmBalance!;
                      const target = profile.propFirmProfitTarget ?? 0;
                      const dailyLimit = profile.propFirmDailyLossLimit ?? 0;
                      const maxDD = profile.propFirmMaxDrawdown ?? 0;
                      const totalPnlDollarNum = trades.reduce((a, t) => a + (parseFloat(t.pnlDollar as string) || 0), 0);
                      const today = new Date().toISOString().split("T")[0];
                      const todayPnl = trades.filter(t => t.date === today).reduce((a, t) => a + (parseFloat(t.pnlDollar as string) || 0), 0);
                      const targetPct = target > 0 ? Math.min(100, Math.round((Math.max(0, totalPnlDollarNum) / target) * 100)) : 0;
                      const ddPct = maxDD > 0 ? Math.min(100, Math.round((Math.abs(Math.min(0, totalPnlDollarNum)) / maxDD) * 100)) : 0;
                      const dailyPct = dailyLimit > 0 ? Math.min(100, Math.round((Math.abs(Math.min(0, todayPnl)) / dailyLimit) * 100)) : 0;
                      return (
                        <div style={{ borderRadius: "22px", padding: "18px 20px", background: C.panel, border: `1px solid ${C.border}` }}>
                          <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: "14px" }}>Eval Account · ${bal.toLocaleString()}</div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                            {target > 0 && (
                              <div>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                                  <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted }}>Profit target</span>
                                  <span style={{ fontFamily: MONO, fontSize: "10px", color: C.green }}>${Math.max(0, totalPnlDollarNum).toFixed(0)} / ${target.toLocaleString()}</span>
                                </div>
                                <div style={{ height: "6px", borderRadius: "3px", background: C.border2, overflow: "hidden" }}>
                                  <div style={{ width: `${targetPct}%`, height: "100%", borderRadius: "3px", background: C.green, transition: "width 0.4s ease" }} />
                                </div>
                              </div>
                            )}
                            {dailyLimit > 0 && (
                              <div>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                                  <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted }}>Daily loss limit</span>
                                  <span style={{ fontFamily: MONO, fontSize: "10px", color: dailyPct > 75 ? C.red : C.muted }}>${Math.abs(Math.min(0, todayPnl)).toFixed(0)} / ${dailyLimit.toLocaleString()}</span>
                                </div>
                                <div style={{ height: "6px", borderRadius: "3px", background: C.border2, overflow: "hidden" }}>
                                  <div style={{ width: `${dailyPct}%`, height: "100%", borderRadius: "3px", background: dailyPct > 75 ? C.red : C.warn, transition: "width 0.4s ease" }} />
                                </div>
                              </div>
                            )}
                            {maxDD > 0 && (
                              <div>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                                  <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted }}>Max drawdown</span>
                                  <span style={{ fontFamily: MONO, fontSize: "10px", color: ddPct > 75 ? C.red : C.muted }}>${Math.abs(Math.min(0, totalPnlDollarNum)).toFixed(0)} / ${maxDD.toLocaleString()}</span>
                                </div>
                                <div style={{ height: "6px", borderRadius: "3px", background: C.border2, overflow: "hidden" }}>
                                  <div style={{ width: `${ddPct}%`, height: "100%", borderRadius: "3px", background: ddPct > 75 ? C.red : C.warn, transition: "width 0.4s ease" }} />
                                </div>
                              </div>
                            )}
                          </div>
                          <button onClick={() => setHomeSection("settings")} style={{ marginTop: "12px", background: "transparent", border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "5px 12px", cursor: "pointer", fontFamily: MONO, fontSize: "9px", letterSpacing: "0.1em", color: C.muted, textTransform: "uppercase" }}>Edit targets</button>
                        </div>
                      );
                    })()
                  )}

                  {/* ── Session breakdown (compact) ── */}
                  {Object.entries(sessionStats).length > 0 && (
                    <div style={{ borderRadius: "22px", overflow: "hidden", border: `1px solid ${C.border}`, background: C.panel }}>
                      <div style={{ padding: "14px 14px 10px" }}>
                        <div style={{ fontFamily: MONO, fontSize: "10px", fontWeight: 500, letterSpacing: "0.16em", textTransform: "uppercase", color: C.muted }}>Session breakdown</div>
                      </div>
                      {Object.entries(sessionStats).map(([session, v], i, arr) => {
                        const wr = v.w + v.l > 0 ? ((v.w / (v.w + v.l)) * 100).toFixed(0) : "0";
                        return (
                          <div key={session} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderTop: `1px solid ${C.border}` }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontFamily: DISPLAY, fontSize: "13px", fontWeight: 600, color: C.text }}>{session}</div>
                              <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginTop: "3px" }}>{v.w + v.l} trades</div>
                            </div>
                            <div style={{ fontFamily: MONO, fontSize: "11px", color: C.text }}>{wr}%</div>
                            <div style={{ fontFamily: MONO, fontSize: "12px", fontWeight: 600, color: v.pnl >= 0 ? C.green : C.red, minWidth: "56px", textAlign: "right" }}>{v.pnl >= 0 ? "+" : ""}{v.pnl.toFixed(1)}R</div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Share button */}
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button onClick={() => { const txt = `${profile.handle||"Trader"} · ${total} trades · ${winRate}% WR · ${pnlPos?"+":""}${totalPnL}R\n\n#Kōda https://kodatrade.co.uk`; window.open(`https://x.com/intent/post?text=${encodeURIComponent(txt)}`, "_blank", "noopener"); }} style={{ display: "flex", alignItems: "center", gap: "6px", background: "transparent", border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "8px 14px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.08em", color: C.muted }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                      Share Stats
                    </button>
                  </div>
                </>
              )}


              {statsTab === "performance" && (
                <div style={{ display:"flex", flexDirection:"column", gap:"20px" }}>
                  {total===0
                    ? <div style={{ textAlign:"center", padding:"60px 0", color:C.muted, fontSize:"13px", fontFamily:MONO }}>LOG TRADES TO SEE PERFORMANCE</div>
                    : <>
                        {/* Free: core statistics cards */}
                        <section>
                          <SectionKicker label="TRADE STATISTICS" C={C}/>
                          <div style={{ marginTop:"14px" }}><TradeStatCards trades={trades} C={C}/></div>
                        </section>
                        <section><AvgStatsCards trades={trades} C={C}/></section>

                        {/* Pro: charts & advanced analysis */}
                        {isPro ? (
                          <>
                            <div style={{ display:"flex", gap:"8px" }}>
                              {(["r","$"] as const).map(m=>(
                                <button key={m} onClick={()=>setPerfPnlMode(m)} style={{ background:perfPnlMode===m?C.text:"transparent", color:perfPnlMode===m?C.bg:C.muted, border:`1px solid ${C.border2}`, borderRadius:"999px", padding:"6px 14px", cursor:"pointer", fontFamily:MONO, fontSize:"10px", letterSpacing:"0.1em", textTransform:"uppercase" }}>
                                  {m==="r"?"R-Multiple":"Dollar"}
                                </button>
                              ))}
                            </div>
                            <section><DailyInsights trades={trades} C={C} useDollar={perfPnlMode==="$"&&hasDollarData}/></section>
                            <section>
                              <SectionKicker label="DAILY P&L" C={C}/>
                              <div style={{ marginTop:"14px", display:"grid", gridTemplateColumns:isDesktop?"1fr 1fr":"1fr", gap:"14px" }}>
                                <DailyCumulativePnLChart trades={trades} C={C} useDollar={perfPnlMode==="$"&&hasDollarData}/>
                                <NetDailyPnLChart trades={trades} C={C} useDollar={perfPnlMode==="$"&&hasDollarData}/>
                              </div>
                            </section>
                            <section>
                              <SectionKicker label="TRADE DURATION ANALYSIS" C={C}/>
                              <div style={{ marginTop:"14px" }}><TradeDurationChart trades={trades} C={C}/></div>
                            </section>
                            <section>
                              <SectionKicker label="DRAWDOWN CURVE" C={C}/>
                              <div style={{ marginTop:"14px" }}><DrawdownCurve trades={trades} C={C}/></div>
                            </section>
                          </>
                        ) : (
                          <ProLock C={C} label="Charts & Advanced Analysis" description="Daily P&L curves, insights, duration analysis, and drawdown — upgrade to unlock." onUpgrade={() => setShowUpgrade(true)} />
                        )}
                      </>
                  }
                </div>
              )}

              {statsTab === "strategies" && (
                <>
                  {Object.keys(stratStats).length === 0 ? (
                    <EmptyState C={C} icon="◆" headline="No strategy data yet." body="Assign a strategy when logging trades to see your edge breakdown here." cta="Log a trade →" onCta={() => navigateTo("log")} />
                  ) : (
                  <>
                  <section>
                    <SectionKicker label="WIN RATE BY STRATEGY" C={C} />
                    <div style={{ marginTop: "20px" }}><WinRateChart trades={trades} C={C} /></div>
                  </section>
                  <section>
                    <SectionKicker label="MONTHLY P&L" C={C} />
                    <div style={{ marginTop: "20px" }}><MonthlyPnLChart trades={trades} C={C} /></div>
                  </section>
                  {Object.entries(stratStats).length > 0 && (
                    <section>
                      <SectionKicker label="STRATEGY DETAIL" C={C} />
                      <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "18px" }}>
                        {Object.entries(stratStats).map(([s, v], idx) => {
                          const wr = v.w + v.l > 0 ? ((v.w / (v.w + v.l)) * 100).toFixed(0) : "0";
                          return (
                            <div key={s}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
                                <div style={{ display: "flex", gap: "10px", alignItems: "baseline" }}>
                                  <span style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.08em" }}>{String(idx + 1).padStart(2, "0")}</span>
                                  <span style={{ fontFamily: MONO, fontSize: "12px", color: C.text, letterSpacing: "0.06em" }}>{stratCode(s)}</span>
                                  <span style={{ fontFamily: BODY, fontSize: "13px", color: C.text2 }}>{stratShort(s)}</span>
                                </div>
                                <div style={{ fontFamily: MONO, fontSize: "11px", color: C.text, letterSpacing: "0.04em" }}>
                                  {v.count}T · {wr}% · <span style={{ color: v.pnl >= 0 ? C.green : C.red }}>{v.pnl >= 0 ? "+" : ""}{v.pnl.toFixed(1)}R</span>
                                </div>
                              </div>
                              <div style={{ height: "1px", background: C.border }}>
                                <div style={{ height: "1px", background: C.text, width: `${Math.min((v.count / total) * 100, 100)}%`, transition: "width 0.5s ease" }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}
                  </>
                  )}
                </>
              )}

              {statsTab === "calendar" && (
                <section>
                  <CalendarView trades={trades} C={C} onDayClick={(key: string) => { const dt = trades.filter(t => t.date === key); setCalDayTrades({ key, trades: dt }); }} />
                  {calDayTrades && (
                    <div style={{ marginTop: "20px", borderTop: `1px solid ${C.border}`, paddingTop: "14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px", alignItems: "baseline" }}>
                        <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.1em" }}>{calDayTrades.key} · {calDayTrades.trades.length} TRADE{calDayTrades.trades.length !== 1 ? "S" : ""}</span>
                        <button onClick={() => setCalDayTrades(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "12px" }}>close</button>
                      </div>
                      {calDayTrades.trades.map((t: Trade) => (
                        <div key={t.id} className="row-hvr" onClick={() => { navigateTo("history"); setExpandedId(t.id); }}
                          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
                          <span style={{ fontFamily: MONO, fontSize: "12px", color: C.text }}>{t.pair}</span>
                          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                            {t.rr && <span style={{ fontFamily: MONO, fontSize: "11px", color: C.text2 }}>{t.rr}R</span>}
                            <span style={{ fontFamily: MONO, fontSize: "11px", color: outcomeColor(t.outcome, C), letterSpacing: "0.06em" }}>{outcomeLetter(t.outcome)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {statsTab === "weekly" && (
                <WeeklyReportCard trades={trades} C={C} userHandle={profile.handle ? `@${profile.handle.replace(/^@/, "")}` : undefined} />
              )}

              {statsTab === "psychology" && (
                isPro ? <section>
                  {/* ── Discipline / Rule adherence stats ── */}
                  {(() => {
                    const tagged = trades.filter(t => t.ruleAdherence !== null && t.ruleAdherence !== undefined);
                    if (!tagged.length) return null;
                    const followed = tagged.filter(t => t.ruleAdherence === true);
                    const broke = tagged.filter(t => t.ruleAdherence === false);
                    const followedPct = Math.round((followed.length / tagged.length) * 100);
                    const wrFollowed = followed.length ? Math.round(followed.filter(t => t.outcome === "Win").length / followed.length * 100) : null;
                    const wrBroke = broke.length ? Math.round(broke.filter(t => t.outcome === "Win").length / broke.length * 100) : null;
                    const avgPnlFollowed = followed.length ? followed.reduce((a, t) => a + (parseFloat(t.pnl as string) || 0), 0) / followed.length : null;
                    const avgPnlBroke = broke.length ? broke.reduce((a, t) => a + (parseFloat(t.pnl as string) || 0), 0) / broke.length : null;
                    const month = new Date().toISOString().slice(0, 7);
                    const monthTagged = tagged.filter(t => t.date?.startsWith(month));
                    const monthPct = monthTagged.length ? Math.round(monthTagged.filter(t => t.ruleAdherence === true).length / monthTagged.length * 100) : null;
                    return (
                      <div style={{ marginBottom: "24px" }}>
                        <SectionKicker label="RULE ADHERENCE" C={C} />
                        {/* Score card */}
                        <div style={{ marginTop: "14px", padding: "18px", borderRadius: "16px", border: `1px solid ${C.border}`, background: `color-mix(in oklch, ${followedPct >= 70 ? C.green : followedPct >= 50 ? C.accent : C.red} 8%, ${C.panel})` }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "6px" }}>
                            <span style={{ fontFamily: DISPLAY, fontSize: "36px", fontWeight: 700, color: followedPct >= 70 ? C.green : followedPct >= 50 ? C.accent : C.red, letterSpacing: "-0.02em" }}>{followedPct}%</span>
                            <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>rules followed · {tagged.length} trades</span>
                          </div>
                          {monthPct !== null && (
                            <div style={{ fontFamily: BODY, fontSize: "13px", color: C.text, lineHeight: 1.5 }}>
                              You followed your rules on <strong>{monthPct}%</strong> of trades this month.
                            </div>
                          )}
                          {/* Progress bar */}
                          <div style={{ height: "4px", borderRadius: "2px", background: C.border2, overflow: "hidden", marginTop: "12px" }}>
                            <div style={{ width: `${followedPct}%`, height: "100%", borderRadius: "2px", background: followedPct >= 70 ? C.green : followedPct >= 50 ? C.accent : C.red, transition: "width 0.4s ease" }} />
                          </div>
                        </div>
                        {/* Followed vs broke comparison */}
                        {followed.length > 0 && broke.length > 0 && (
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginTop: "10px" }}>
                            {[
                              { label: "Rules followed", count: followed.length, wr: wrFollowed, avgPnl: avgPnlFollowed, color: C.green },
                              { label: "Rules broken", count: broke.length, wr: wrBroke, avgPnl: avgPnlBroke, color: C.red },
                            ].map(row => (
                              <div key={row.label} style={{ padding: "14px", borderRadius: "12px", border: `1px solid ${C.border}`, background: C.panel }}>
                                <div style={{ fontFamily: MONO, fontSize: "9px", color: row.color, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px" }}>{row.label}</div>
                                <div style={{ display: "flex", gap: "12px" }}>
                                  <div>
                                    <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "3px" }}>WIN RATE</div>
                                    <div style={{ fontFamily: DISPLAY, fontSize: "20px", fontWeight: 600, color: (row.wr ?? 0) >= 50 ? C.green : C.red }}>{row.wr !== null ? `${row.wr}%` : "—"}</div>
                                  </div>
                                  <div>
                                    <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "3px" }}>AVG R</div>
                                    <div style={{ fontFamily: DISPLAY, fontSize: "20px", fontWeight: 600, color: (row.avgPnl ?? 0) >= 0 ? C.green : C.red }}>{row.avgPnl !== null ? `${row.avgPnl >= 0 ? "+" : ""}${row.avgPnl.toFixed(2)}R` : "—"}</div>
                                  </div>
                                </div>
                                <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginTop: "6px" }}>{row.count} trade{row.count !== 1 ? "s" : ""}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* ── Mistake Breakdown ── */}
                  {(() => {
                    const withMistake = trades.filter(t => t.mistake && t.mistake !== "None");
                    if (!withMistake.length) return null;
                    const counts: Record<string, number> = {};
                    withMistake.forEach(t => { counts[t.mistake!] = (counts[t.mistake!] || 0) + 1; });
                    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
                    return (
                      <div style={{ marginBottom: "24px" }}>
                        <SectionKicker label="MISTAKE FREQUENCY" C={C} />
                        <div style={{ marginTop: "14px", display: "flex", flexDirection: "column", gap: "6px" }}>
                          {sorted.map(([mistake, count]) => {
                            const pct = Math.round((count / trades.length) * 100);
                            return (
                              <div key={mistake} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                <span style={{ fontFamily: MONO, fontSize: "10px", color: C.red, letterSpacing: "0.06em", textTransform: "uppercase", minWidth: "130px" }}>{mistake}</span>
                                <div style={{ flex: 1, height: "4px", borderRadius: "2px", background: C.border2, overflow: "hidden" }}>
                                  <div style={{ width: `${pct}%`, minWidth: "2px", height: "100%", borderRadius: "2px", background: C.red, transition: "width 0.4s ease" }} />
                                </div>
                                <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted }}>{count}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}

                  {/* ── Emotion × Outcome ── */}
                  {(() => {
                    const tagStats = EMOTION_TAGS.map(tag => {
                      const tagged = trades.filter(t => getEmotionTags(t.emotions).includes(tag.id));
                      const wins = tagged.filter(t => t.outcome === "Win").length;
                      const losses = tagged.filter(t => t.outcome === "Loss").length;
                      const wr = tagged.length ? Math.round((wins / tagged.length) * 100) : null;
                      const avgPnl = tagged.length ? tagged.reduce((a, t) => a + (parseFloat(t.pnl as string) || 0), 0) / tagged.length : null;
                      return { ...tag, count: tagged.length, wins, losses, wr, avgPnl };
                    }).filter(t => t.count > 0).sort((a, b) => b.count - a.count);

                    if (!tagStats.length) return (
                      <div style={{ textAlign: "center", padding: "60px 0", color: C.muted, fontSize: "13px", fontStyle: "italic" }}>
                        Tag your emotional state when logging trades to see patterns here.
                      </div>
                    );

                    return (
                      <div>
                        <SectionKicker label="EMOTION × OUTCOME" C={C} />
                        <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "10px" }}>
                          {tagStats.map(tag => (
                            <div key={tag.id} style={{ padding: "14px 16px", border: `1px solid ${C.border}`, borderRadius: "8px", background: tag.color + "0a" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                                <span style={{ fontFamily: MONO, fontSize: "11px", color: tag.color, letterSpacing: "0.08em", textTransform: "uppercase" }}>{tag.label}</span>
                                <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted }}>{tag.count} trade{tag.count !== 1 ? "s" : ""}</span>
                              </div>
                              <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
                                <div>
                                  <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "3px" }}>WIN RATE</div>
                                  <div style={{ fontFamily: DISPLAY, fontSize: "22px", fontWeight: 500, color: (tag.wr ?? 0) >= 50 ? C.green : C.red }}>{tag.wr !== null ? `${tag.wr}%` : "—"}</div>
                                </div>
                                <div>
                                  <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "3px" }}>AVG P&L</div>
                                  <div style={{ fontFamily: DISPLAY, fontSize: "22px", fontWeight: 500, color: (tag.avgPnl ?? 0) >= 0 ? C.green : C.red }}>{tag.avgPnl !== null ? `${tag.avgPnl >= 0 ? "+" : ""}${tag.avgPnl.toFixed(2)}R` : "—"}</div>
                                </div>
                                <div style={{ flex: 1, textAlign: "right" }}>
                                  <span style={{ fontFamily: MONO, fontSize: "10px", color: C.green }}>{tag.wins}W</span>
                                  <span style={{ fontFamily: MONO, fontSize: "10px", color: C.muted }}> / </span>
                                  <span style={{ fontFamily: MONO, fontSize: "10px", color: C.red }}>{tag.losses}L</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </section> : <ProLock C={C} label="Psychology Stats" description="Rule adherence tracking, emotional tagging, and discipline scoring." onUpgrade={() => setShowUpgrade(true)} />
              )}
            </div>
          )}

              {statsTab === "heatmap" && (
                isPro ? (
                  <section style={{ display:"flex", flexDirection:"column", gap:"32px" }}>
                    <div>
                      <SectionKicker label="P&L BY SESSION × DAY" C={C} />
                      <div style={{ marginTop:"14px" }}><SessionHeatmap trades={trades} C={C} /></div>
                    </div>
                    <div>
                      <SectionKicker label="P&L BY DAY OF WEEK" C={C} />
                      <div style={{ marginTop:"14px" }}><DayOfWeekChart trades={trades} C={C} /></div>
                    </div>
                    <div>
                      <SectionKicker label="P&L BY TIME OF DAY" C={C} />
                      <div style={{ fontFamily: MONO, fontSize:"9px", color:C.muted, letterSpacing:"0.1em", margin:"6px 0 14px" }}>REQUIRES ENTRY TIME ON TRADES</div>
                      <TimeOfDayChart trades={trades} C={C} />
                    </div>
                    <div>
                      <SectionKicker label="DRAWDOWN CURVE" C={C} />
                      <div style={{ marginTop: "14px" }}><DrawdownCurve trades={trades} C={C} /></div>
                    </div>
                  </section>
                ) : (
                  <ProLock C={C} label="Session Heatmaps" description="P&L by session, day of week, time of day, and drawdown curve." onUpgrade={() => setShowUpgrade(true)} />
                )
              )}

              {statsTab === "maemfe" && (
                isPro ? (
                  <section>
                    <SectionKicker label="MAE vs MFE — TRADE EFFICIENCY" C={C} />
                    <div style={{ marginTop: "8px", fontFamily: BODY, fontSize: "12px", color: C.muted, lineHeight: 1.6, marginBottom: "16px" }}>
                      MAE = how far price moved against you · MFE = how far it moved in your favour · capture efficiency = P&L ÷ MFE
                    </div>
                    <MAEMFEChart trades={trades} C={C} />
                  </section>
                ) : (
                  <ProLock C={C} label="MAE / MFE Analysis" description="Max adverse excursion, max favorable excursion, and capture efficiency per trade." onUpgrade={() => setShowUpgrade(true)} />
                )
              )}

          {/* ══════════════════════════ CHECKLIST ══════════════════════════ */}
          {view === "checklist" && (
            <div style={{ marginTop: "clamp(16px, 4vw, 28px)", display: "flex", flexDirection: "column", gap: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                <SectionKicker label={`${checklistTab === "rules" ? "RULES" : "PRE-TRADE"} · ${stratShort(activeStrategy).toUpperCase()}`} C={C} />
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <StrategySelect strategies={allStrategyNames} value={activeStrategy} onChange={(s: string) => { setActiveStrategy(s); setEditingCheckItem(null); setEditingRule(null); }} C={C} align="right" />
                  {customStrategies.find((s: StrategyDef & { name: string }) => s.name === activeStrategy) && (
                    <>
                      <button onClick={() => openEditStrategy(customStrategies.find((s: StrategyDef & { name: string }) => s.name === activeStrategy))}
                        style={{ background: "transparent", border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "6px 12px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted }}>
                        Edit
                      </button>
                      <button onClick={() => { if (confirm(`Delete "${activeStrategy}"?`)) deleteCustomStrategy(activeStrategy); }}
                        style={{ background: "transparent", border: `1px solid ${C.border2}`, borderRadius: "999px", padding: "6px 12px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted }}>
                        Del
                      </button>
                    </>
                  )}
                  <button onClick={openNewStrategy}
                    style={{ background: C.text, color: C.bg, border: "none", borderRadius: "999px", padding: "6px 12px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                    + New
                  </button>
                </div>
              </div>

              {showStrategyEditor && (
                <StrategyEditor
                  draft={strategyDraft} setDraft={setStrategyDraft}
                  onSave={saveStrategyDraft} onCancel={() => setShowStrategyEditor(false)}
                  isEdit={!!editingStrategy} C={C} inp={inp} lbl={lbl}
                />
              )}
              {!showStrategyEditor && (
                <div style={{ borderRadius: "22px", padding: "16px 18px", background: C.panel, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: `color-mix(in oklch, ${C.accent} 14%, transparent)`, border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MONO, fontSize: "13px", fontWeight: 600, color: C.accent, flexShrink: 0 }}>
                    {stratShort(activeStrategy)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: DISPLAY, fontSize: "15px", fontWeight: 600, color: C.text }}>{activeStrategy}</div>
                    <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, marginTop: "2px" }}>
                      {checkItems.length} conditions · {ruleItems.length} rules
                    </div>
                  </div>
                </div>
              )}
              {!isDesktop && (
                <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "8px", paddingBottom: "10px", borderBottom: `1px solid ${C.border}`, marginTop: "4px" }}>
                  <SubNavDropdown sections={CHECKLIST_SECTIONS} value={checklistTab} onChange={setChecklistTab} C={C} />
                  <GearButton onClick={() => { setView("home"); setHomeSection("settings"); }} active={false} C={C} />
                </div>
              )}

              {checklistTab === "pretrade" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <ConfluenceTracker
                    checkItems={checkItems} checkedCount={checkedCount} totalItems={totalItems}
                    isChecked={isChecked} activeStrategy={activeStrategy} C={C}
                    stratThresholds={stratThresholds as any} saveStratThresholds={saveStratThresholds as any}
                    inp={inp} pillGhost={pillGhost}
                  />
                  <div style={{ borderRadius: "22px", overflow: "hidden", border: `1px solid ${C.border}`, background: C.panel }}>
                    {checkItems.map((item: { id: number; text: string }, _ci: number) => {
                      const ch = isChecked(item.id);
                      return (
                        <div key={item.id} className="check-row" style={{ borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: "12px", minHeight: "52px", padding: "0 16px" }}>
                          {/* 44×44 touch target wrapping the 20px Kōda circle */}
                          <div onClick={() => toggleCheck(item.id)}
                            style={{ width: "44px", height: "44px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, margin: "0 -6px" }}>
                            <div style={{ width: "20px", height: "20px", borderRadius: "999px", border: `1px solid ${ch ? C.green : C.border2}`, background: ch ? `color-mix(in oklch, ${C.green} 18%, transparent)` : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s", color: ch ? C.green : C.muted, fontSize: "10px" }}>
                              ✓
                            </div>
                          </div>
                          {editingCheckItem === item.id
                            ? <EditInline val={item.text} onSave={(t: string) => saveEditCheck(item.id, t)} onCancel={() => setEditingCheckItem(null)} C={C} />
                            : <>
                              <span onClick={() => toggleCheck(item.id)}
                                style={{ flex: 1, fontSize: "14px", color: ch ? C.muted : C.text, textDecoration: ch ? "line-through" : "none", cursor: "pointer", lineHeight: 1.5, fontFamily: BODY }}>{item.text}</span>
                              <div className="ca" style={{ display: "flex", gap: "4px", opacity: 0, transition: "opacity 0.15s" }}>
                                <button onClick={() => setEditingCheckItem(item.id)} style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "6px", color: C.muted, fontSize: "10px", cursor: "pointer", fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase", padding: "8px 10px", minHeight: "44px" }}>edit</button>
                                <button onClick={() => deleteCheckItem(item.id)} style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "6px", color: C.red, fontSize: "10px", cursor: "pointer", fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase", padding: "8px 10px", minHeight: "44px" }}>rm</button>
                              </div>
                            </>}
                        </div>
                      );
                    })}
                  </div>
                  {addingCheck
                    ? <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                      <input autoFocus value={newCheckText} onChange={e => setNewCheckText(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") addCheckItem(); if (e.key === "Escape") { setAddingCheck(false); setNewCheckText(""); } }}
                        placeholder="New condition..." style={{ ...inp, flex: 1 }} />
                      <button onClick={addCheckItem} style={{ ...pillPrimary(!!newCheckText.trim()), width: "auto", padding: "10px 16px" }}>Add</button>
                      <button aria-label="Cancel" onClick={() => { setAddingCheck(false); setNewCheckText(""); }} style={{ ...pillGhost, padding: "10px 14px" }}>X</button>
                    </div>
                    : <button onClick={() => setAddingCheck(true)} style={{ border: `1px dashed ${C.border2}`, borderRadius: "999px", padding: "14px 22px", textAlign: "center", fontFamily: BODY, fontSize: "13px", fontWeight: 500, color: C.text, background: "none", cursor: "pointer", width: "100%" }}>+ Add condition</button>
                  }
                  {checkedCount > 0 && <button onClick={resetChecklist} style={{ ...pillGhost, alignSelf: "flex-start" }}>↺ RESET CHECKLIST</button>}

                  {/* Calculator shortcut — opens the full modal */}
                  <button
                    onClick={() => { setShowCalc(true); phCapture("calculator_opened"); }}
                    style={{ display: "flex", alignItems: "center", gap: "8px", background: `color-mix(in oklch, ${C.live} 12%, transparent)`, border: `1px solid color-mix(in oklch, ${C.live} 25%, transparent)`, borderRadius: "10px", padding: "12px 16px", cursor: "pointer", color: C.live, fontFamily: MONO, fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", width: "100%", marginTop: "8px" }}>
                    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="10" y1="3" x2="10" y2="17"/><line x1="2" y1="17" x2="18" y2="17"/>
                      <path d="M2 9l4 5 4-5"/><path d="M18 9l-4 5-4-5"/><line x1="6" y1="9" x2="14" y2="9"/>
                    </svg>
                    Open Position Size Calculator
                  </button>
                </div>
              )}

              {checklistTab === "rules" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.16em", textTransform: "uppercase" }}>
                    Hard rules · {stratShort(activeStrategy)} · enforced at save
                  </div>
                  <div style={{ borderRadius: "22px", overflow: "hidden", border: `1px solid ${C.border}`, background: C.panel }}>
                    {ruleItems.map((rule: { id: number; text: string }, idx: number) => (
                      <div key={rule.id} className="check-row" style={{ minHeight: "52px", borderBottom: idx < ruleItems.length - 1 ? `1px solid ${C.border}` : "none", display: "flex", alignItems: "center", gap: "12px", padding: "0 16px" }}>
                        <span style={{ width: "20px", height: "20px", borderRadius: "999px", background: `color-mix(in oklch, ${C.green} 18%, transparent)`, border: `1px solid ${C.green}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.green, fontSize: "10px", flexShrink: 0 }}>✓</span>
                        {editingRule === rule.id
                          ? <EditInline val={rule.text} onSave={(t: string) => saveEditRule(rule.id, t)} onCancel={() => setEditingRule(null)} C={C} />
                          : <>
                            <span style={{ flex: 1, fontSize: "14px", color: C.text, lineHeight: 1.55, fontFamily: BODY }}>{rule.text}</span>
                            <div className="ca" style={{ display: "flex", gap: "4px", opacity: 0, transition: "opacity 0.15s" }}>
                              <button onClick={() => setEditingRule(rule.id)} style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "6px", color: C.muted, fontSize: "10px", cursor: "pointer", fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase", padding: "8px 10px", minHeight: "44px" }}>edit</button>
                              <button onClick={() => deleteRule(rule.id)} style={{ background: "none", border: `1px solid ${C.border2}`, borderRadius: "6px", color: C.red, fontSize: "10px", cursor: "pointer", fontFamily: MONO, letterSpacing: "0.08em", textTransform: "uppercase", padding: "8px 10px", minHeight: "44px" }}>rm</button>
                            </div>
                          </>}
                      </div>
                    ))}
                  </div>
                  {addingRule
                    ? <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                      <input autoFocus value={newRuleText} onChange={e => setNewRuleText(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") addRule(); if (e.key === "Escape") { setAddingRule(false); setNewRuleText(""); } }}
                        placeholder="New rule..." style={{ ...inp, flex: 1 }} />
                      <button onClick={addRule} style={{ ...pillPrimary(!!newRuleText.trim()), width: "auto", padding: "10px 16px" }}>Add</button>
                      <button aria-label="Cancel" onClick={() => { setAddingRule(false); setNewRuleText(""); }} style={{ ...pillGhost, padding: "10px 14px" }}>X</button>
                    </div>
                    : <button onClick={() => setAddingRule(true)} style={{ border: `1px dashed ${C.border2}`, borderRadius: "999px", padding: "14px 22px", textAlign: "center", fontFamily: BODY, fontSize: "13px", fontWeight: 500, color: C.text, background: "none", cursor: "pointer", width: "100%" }}>+ Add rule</button>
                  }
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════ IMPORT ══════════════════════════ */}
          {view === "import" && (() => { setView("history"); setShowCsvImport(true); return null; })()}
          {view === "import_legacy_unused" && (() => {
            return (
              <div style={{ marginTop: "clamp(16px, 4vw, 28px)", display: "flex", flexDirection: "column", gap: "clamp(32px, 5vw, 48px)" }}>
                {!isDesktop && (
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <GearButton onClick={() => { setView("home"); setHomeSection("settings"); }} active={false} C={C} />
                  </div>
                )}

                {/* ── Live connections ── */}
                <section>
                  <div style={{ fontFamily: MONO, fontSize: "11px", color: C.muted, letterSpacing: "0.14em", marginBottom: "20px", display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ flex: "0 0 24px", height: "1px", background: C.border2 }} />
                    LIVE NOW
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

                    {/* Tradovate tile */}
                    <button onClick={() => setShowLiveModal(true)}
                      style={{ width: "100%", background: "transparent", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
                      <div style={{ border: `1px solid ${tradovateSession ? C.green + "66" : C.border}`, padding: "18px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", transition: "border-color 0.2s" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                            <div style={{ fontFamily: DISPLAY, fontSize: "16px", fontWeight: 500, color: C.text, letterSpacing: "-0.01em" }}>Tradovate</div>
                            <span style={{ fontFamily: MONO, fontSize: "9px", letterSpacing: "0.12em", textTransform: "uppercase", padding: "2px 7px", border: `1px solid ${C.border2}`, color: C.muted }}>FUTURES</span>
                          </div>
                          {tradovateSession ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: C.green, flexShrink: 0 }} />
                              <span style={{ fontFamily: MONO, fontSize: "10px", color: C.green, letterSpacing: "0.06em" }}>
                                {tradovateSession.accountName ?? "Connected"} · {tradovateSession.env.toUpperCase()}
                              </span>
                            </div>
                          ) : (
                            <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, lineHeight: 1.5 }}>
                              Live positions + auto-import closed fills
                            </div>
                          )}
                        </div>
                        <div style={{ fontFamily: MONO, fontSize: "10px", color: tradovateSession ? C.text : C.muted, letterSpacing: "0.12em", textTransform: "uppercase", whiteSpace: "nowrap", borderBottom: `1px solid ${tradovateSession ? C.text : C.border2}`, paddingBottom: "2px" }}>
                          {tradovateSession ? "Manage →" : "Connect →"}
                        </div>
                      </div>
                    </button>

                    {/* Rithmic CSV tile */}
                    <button onClick={() => { setView("history"); setShowCsvImport(true); }}
                      style={{ width: "100%", background: "transparent", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
                      <div style={{ border: `1px solid ${C.border}`, padding: "18px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                            <div style={{ fontFamily: DISPLAY, fontSize: "16px", fontWeight: 500, color: C.text, letterSpacing: "-0.01em" }}>Rithmic CSV</div>
                            <span style={{ fontFamily: MONO, fontSize: "9px", letterSpacing: "0.12em", textTransform: "uppercase", padding: "2px 7px", border: `1px solid ${C.border2}`, color: C.muted }}>PROP FIRM</span>
                          </div>
                          <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, lineHeight: 1.5 }}>
                            Apex, TopstepX, Earn2Trade — import your trade statement
                          </div>
                        </div>
                        <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", whiteSpace: "nowrap", borderBottom: `1px solid ${C.border2}`, paddingBottom: "2px" }}>
                          Import →
                        </div>
                      </div>
                    </button>

                    {/* Generic CSV tile */}
                    <button onClick={() => { setView("history"); setShowCsvImport(true); }}
                      style={{ width: "100%", background: "transparent", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}>
                      <div style={{ border: `1px solid ${C.border}`, padding: "18px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px" }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                            <div style={{ fontFamily: DISPLAY, fontSize: "16px", fontWeight: 500, color: C.text, letterSpacing: "-0.01em" }}>CSV Import</div>
                            <span style={{ fontFamily: MONO, fontSize: "9px", letterSpacing: "0.12em", textTransform: "uppercase", padding: "2px 7px", border: `1px solid ${C.border2}`, color: C.muted }}>MT4 / MT5 / TV</span>
                          </div>
                          <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, lineHeight: 1.5 }}>
                            MT4, MT5, TradingView, ThinkorSwim and most broker exports
                          </div>
                        </div>
                        <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", whiteSpace: "nowrap", borderBottom: `1px solid ${C.border2}`, paddingBottom: "2px" }}>
                          Import →
                        </div>
                      </div>
                    </button>
                  </div>
                </section>

                {/* ── Request a broker ── */}
                <section style={{ paddingBottom: "clamp(20px, 4vw, 32px)" }}>
                  <div style={{ border: `1px solid ${C.border}`, padding: "20px 24px", display: "flex", flexDirection: isDesktop ? "row" : "column", justifyContent: "space-between", alignItems: isDesktop ? "center" : "flex-start", gap: "14px" }}>
                    <div>
                      <div style={{ fontFamily: DISPLAY, fontSize: "15px", fontWeight: 500, color: C.text2, letterSpacing: "-0.01em", marginBottom: "4px" }}>Don't see your broker?</div>
                      <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, lineHeight: 1.5 }}>Tell us which one you use and we'll prioritise it.</div>
                    </div>
                    <button onClick={() => setFeedbackOpen(true)}
                      style={{ background: C.text, color: C.bg, border: "none", padding: "12px 20px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", whiteSpace: "nowrap", flexShrink: 0 }}>
                      Request →
                    </button>
                  </div>
                </section>
              </div>
            );
          })()}

          {/* ══════════════════════════ CIRCLES ══════════════════════════ */}
          {view === "circles" && (
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
              totalPnL={totalPnL} pnlPos={pnlPos} weekPnL={weekPnL} weekPnLPos={weekPnLPos} weekPnLStr={weekPnLStr}
              avgRR={avgRR} streak={streak}
              STRATEGY_NAMES={allStrategyNames} C={C} inp={inp} sel={sel} lbl={lbl}
              pillPrimary={pillPrimary} pillGhost={pillGhost}
              following={following} followUser={followUser} unfollowUser={unfollowUser}
              kickMember={kickMember}
              leaveCircle={leaveCircle}
              openProfile={openProfile}
              isJoiningCircle={isJoiningCircle}
              isCreatingCircle={isCreatingCircle}
              totalPnlDollar={totalPnlDollar}
              hasDollarData={hasDollarData}
            />
          )}
          </div>{/* end main */}
        </div>{/* end grid */}

        {/* ── BOTTOM NAV — floating glass pill (mobile only) ── */}
        {!isDesktop && (
          <div style={{ position: "fixed", bottom: "calc(16px + env(safe-area-inset-bottom))", left: "50%", transform: "translateX(-50%)", width: "calc(100% - 32px)", maxWidth: "460px", zIndex: 30 }}>
            <div style={{ display: "flex", alignItems: "center", padding: "5px", background: C.surfaceGlass, backdropFilter: "blur(28px) saturate(180%)", WebkitBackdropFilter: "blur(28px) saturate(180%)", borderRadius: "999px", border: `1px solid ${C.border2}`, boxShadow: `0 16px 40px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.14), inset 0 1px 0 rgba(255,255,255,0.04)` }}>
              {NAV_TABS.map(tab => {
                const active = view === tab.id;
                return (
                  <button key={tab.id} onClick={() => primaryNav(tab.id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3px", padding: "8px 2px", borderRadius: "999px", background: active ? C.text : "transparent", color: active ? C.bg : C.text2, border: "none", cursor: "pointer", transition: "background 0.2s, color 0.2s", minHeight: "48px" }}>
                    <div style={{ position: "relative", display: "flex" }}>
                      <svg width="17" height="17" viewBox="0 0 20 20" fill="none" style={{ flexShrink: 0 }}>
                        <path d={(tab as any).path} stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      {tab.id === "log" && draftCount > 0 && (
                        <span style={{ position: "absolute", top: "-4px", right: "-7px", background: C.green, color: "#0A0A0A", borderRadius: "999px", fontSize: "8px", fontFamily: MONO, fontWeight: 700, minWidth: "14px", height: "14px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", lineHeight: 1 }}>
                          {draftCount > 9 ? "9+" : draftCount}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: "9px", fontFamily: MONO, letterSpacing: "0.06em", fontWeight: active ? 600 : 400 }}>{tab.label}</span>
                  </button>
                );
              })}
              {/* Calculator — pill in mobile nav */}
              <button
                onClick={() => { setShowCalc(true); phCapture("calculator_opened"); }}
                title="Position Size Calculator"
                style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3px", padding: "8px 10px", background: `color-mix(in oklch, ${C.live} 18%, transparent)`, border: `1px solid color-mix(in oklch, ${C.live} 30%, transparent)`, borderRadius: "999px", color: C.live, cursor: "pointer" }}>
                <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="10" y1="3" x2="10" y2="17"/>
                  <line x1="2" y1="17" x2="18" y2="17"/>
                  <path d="M2 9l4 5 4-5"/><path d="M18 9l-4 5-4-5"/>
                  <line x1="6" y1="9" x2="14" y2="9"/>
                </svg>
                <span style={{ fontSize: "9px", fontFamily: MONO, letterSpacing: "0.06em" }}>Size</span>
              </button>
            </div>
          </div>
        )}

        {/* ── Feedback floating button ── */}
        <button
          onClick={() => setFeedbackOpen(true)}
          style={{ position: "fixed", bottom: isDesktop ? "28px" : "calc(44px + env(safe-area-inset-bottom) + 24px)", right: "16px", zIndex: 998, background: C.text, color: C.bg, border: "none", borderRadius: "999px", padding: "12px 20px", minHeight: "44px", cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", boxShadow: "0 2px 12px rgba(0,0,0,0.25)", display: "flex", alignItems: "center" }}>
          Feedback
        </button>

        {/* ── Tradovate connect / live positions sheet ── */}
        {showLiveModal && (
          <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
            onClick={() => setShowLiveModal(false)}>
            <div style={{ background: C.bg, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: "clamp(0px, 100%, min(560px, 92vw))", padding: "10px 24px calc(40px + env(safe-area-inset-bottom))", maxHeight: "92vh", overflowY: "auto" }}
              onClick={e => e.stopPropagation()}>
              <div style={{ width: "36px", height: "4px", background: C.border2, borderRadius: "2px", margin: "14px auto 28px" }} />

              {!tradovateSession ? (
                /* ── Connect form ── */
                <>
                  <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: "10px" }}>Tradovate · Connect Account</div>
                  <div style={{ fontFamily: DISPLAY, fontSize: "22px", fontWeight: 500, color: C.text, letterSpacing: "-0.02em", marginBottom: "6px" }}>Live Positions</div>
                  <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, lineHeight: 1.55, marginBottom: "24px" }}>
                    Connect your Tradovate account to see open positions in real time and auto-import closed fills into your journal.
                  </div>

                  {/* Env toggle */}
                  <div style={{ display: "flex", gap: "8px", marginBottom: "18px" }}>
                    {(["demo", "live"] as const).map(env => (
                      <button key={env} onClick={() => setTradovateForm(f => ({ ...f, env }))}
                        style={{ flex: 1, padding: "10px", border: `1px solid ${tradovateForm.env === env ? C.text : C.border2}`, borderRadius: "6px", background: tradovateForm.env === env ? C.text : "transparent", color: tradovateForm.env === env ? C.bg : C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", transition: "all 0.15s" }}>
                        {env}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "18px" }}>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>Username</div>
                      <input
                        type="text"
                        value={tradovateForm.username}
                        onChange={e => setTradovateForm(f => ({ ...f, username: e.target.value }))}
                        placeholder="Tradovate username"
                        autoComplete="username"
                        style={{ width: "100%", background: C.panel, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "12px 14px", fontFamily: BODY, fontSize: "14px", color: C.text, outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "6px" }}>Password</div>
                      <input
                        type="password"
                        value={tradovateForm.password}
                        onChange={e => setTradovateForm(f => ({ ...f, password: e.target.value }))}
                        onKeyDown={e => { if (e.key === "Enter") connectTradovate(); }}
                        placeholder="••••••••"
                        autoComplete="current-password"
                        style={{ width: "100%", background: C.panel, border: `1px solid ${C.border2}`, borderRadius: "8px", padding: "12px 14px", fontFamily: BODY, fontSize: "14px", color: C.text, outline: "none", boxSizing: "border-box" }}
                      />
                    </div>
                  </div>

                  {tradovateError && (
                    <div style={{ fontFamily: BODY, fontSize: "12px", color: C.red, marginBottom: "14px", padding: "10px 14px", background: C.red + "18", borderRadius: "6px" }}>
                      {tradovateError}
                    </div>
                  )}

                  <div style={{ fontFamily: BODY, fontSize: "11px", color: C.dim, lineHeight: 1.5, marginBottom: "20px" }}>
                    Credentials are sent to your Vercel proxy and never stored in plain text. Only the session token is saved locally.
                  </div>

                  <button
                    onClick={connectTradovate}
                    disabled={tradovateConnecting || !tradovateForm.username.trim() || !tradovateForm.password.trim()}
                    style={{ width: "100%", padding: "14px", border: "none", borderRadius: "8px", background: tradovateConnecting || !tradovateForm.username.trim() || !tradovateForm.password.trim() ? C.border2 : C.text, color: tradovateConnecting || !tradovateForm.username.trim() || !tradovateForm.password.trim() ? C.muted : C.bg, cursor: tradovateConnecting || !tradovateForm.username.trim() || !tradovateForm.password.trim() ? "not-allowed" : "pointer", fontFamily: MONO, fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "12px" }}>
                    {tradovateConnecting ? "Connecting…" : "Connect Tradovate →"}
                  </button>
                  <button onClick={() => setShowLiveModal(false)}
                    style={{ width: "100%", padding: "12px", border: `1px solid ${C.border2}`, borderRadius: "8px", background: "transparent", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    Cancel
                  </button>
                </>
              ) : (
                /* ── Connected state ── */
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
                    <div>
                      <div style={{ fontFamily: MONO, fontSize: "9px", color: C.green, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: C.green }} />
                        Connected
                      </div>
                      <div style={{ fontFamily: DISPLAY, fontSize: "20px", fontWeight: 500, color: C.text, letterSpacing: "-0.02em" }}>
                        {tradovateSession.accountName ?? "Tradovate"}
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.06em", marginTop: "4px" }}>
                        {tradovateSession.env.toUpperCase()} ACCOUNT{tradovateSession.lastSyncTime ? ` · Last sync ${new Date(tradovateSession.lastSyncTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                      </div>
                    </div>
                    <button onClick={syncTradovateFills} disabled={tradovateSyncing}
                      style={{ padding: "10px 18px", border: `1px solid ${C.border2}`, borderRadius: "999px", background: "transparent", color: tradovateSyncing ? C.muted : C.text, cursor: tradovateSyncing ? "not-allowed" : "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.10em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                      {tradovateSyncing ? "Syncing…" : "Sync fills"}
                    </button>
                  </div>

                  {/* Live positions list */}
                  <div style={{ marginBottom: "24px" }}>
                    <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>Open Positions {tradovatePositions.length > 0 && `(${tradovatePositions.length})`}</span>
                      <button onClick={() => refreshTradovatePositions(tradovateSession)} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontFamily: MONO, fontSize: "9px", letterSpacing: "0.1em", textTransform: "uppercase" }}>Refresh</button>
                    </div>
                    {tradovatePositions.length === 0 ? (
                      <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, padding: "20px 0", textAlign: "center", borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
                        No open positions
                      </div>
                    ) : (
                      <div style={{ borderTop: `1px solid ${C.border}` }}>
                        {tradovatePositions.map(pos => (
                          <div key={pos.contractId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
                            <div>
                              <div style={{ fontFamily: MONO, fontSize: "13px", color: C.text, letterSpacing: "0.04em" }}>{pos.symbol}</div>
                              <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginTop: "2px" }}>
                                {pos.netPos > 0 ? "+" : ""}{pos.netPos} contracts · avg {pos.netPrice.toFixed(2)}
                              </div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontFamily: DISPLAY, fontSize: "15px", fontWeight: 500, color: pos.openPnl >= 0 ? C.green : C.red, letterSpacing: "-0.01em" }}>
                                {pos.openPnlStr}
                              </div>
                              <div style={{ fontFamily: MONO, fontSize: "9px", color: C.dim, letterSpacing: "0.06em", textTransform: "uppercase", marginTop: "2px" }}>Open P&L</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <button onClick={disconnectTradovate}
                    style={{ width: "100%", padding: "12px", border: `1px solid ${C.red}55`, borderRadius: "8px", background: "transparent", color: C.red, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    Disconnect Account
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── First-run tour ── */}
        {showTour && <TourOverlay C={C} onDone={() => setShowTour(false)} />}

        {/* ── Feedback modal ── */}
        {feedbackOpen && (
          <div style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
            onClick={() => setFeedbackOpen(false)}>
            <div style={{ background: C.bg, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: "clamp(0px, 100%, min(560px, 92vw))", padding: "10px 24px 40px" }}
              onClick={e => e.stopPropagation()}>
              <div style={{ width: "36px", height: "4px", background: C.border2, borderRadius: "2px", margin: "14px auto 24px" }} />
              <div style={{ fontFamily: DISPLAY, fontSize: "20px", fontWeight: 500, color: C.text, marginBottom: "6px" }}>Send feedback</div>
              <div style={{ fontFamily: BODY, fontSize: "13px", color: C.muted, marginBottom: "20px" }}>Found a bug? Got an idea? Goes straight to Kōda Support.</div>
              <textarea
                value={feedbackText}
                onChange={e => setFeedbackText(e.target.value)}
                placeholder="What's on your mind…"
                rows={5}
                style={{ width: "100%", background: C.panel, border: `1px solid ${C.border2}`, borderRadius: "10px", padding: "14px", fontFamily: BODY, fontSize: "14px", color: C.text, resize: "none", lineHeight: 1.6, outline: "none" }}
              />
              <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
                <button onClick={() => setFeedbackOpen(false)}
                  style={{ flex: 1, padding: "12px", border: `1px solid ${C.border2}`, borderRadius: "8px", background: "transparent", color: C.muted, cursor: "pointer", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  Cancel
                </button>
                <button onClick={submitFeedback}
                  disabled={!feedbackText.trim() || feedbackSending || feedbackSent}
                  style={{ flex: 2, padding: "12px", border: "none", borderRadius: "8px", background: feedbackSent ? C.green : feedbackText.trim() && !feedbackSending ? C.text : C.border2, color: feedbackSent ? C.bg : feedbackText.trim() && !feedbackSending ? C.bg : C.muted, cursor: feedbackText.trim() && !feedbackSending && !feedbackSent ? "pointer" : "not-allowed", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.1em", textTransform: "uppercase", transition: "background 0.2s, color 0.2s" }}>
                  {feedbackSent ? "Sent! ✓" : feedbackSending ? "Sending…" : "Send to Kōda Support"}
                </button>
              </div>
            </div>
          </div>
        )}

        {showUpgrade && (
          <UpgradeModal
            C={C}
            userId={profile.uid ?? ""}
            userEmail={profile.email ?? user?.email ?? ""}
            stripeCustomerId={profile.stripeCustomerId}
            onCustomerId={(cid) => setProfile(p => ({ ...p, stripeCustomerId: cid }))}
            mandatory={mandatoryUpgrade}
            onClose={() => { setShowUpgrade(false); setMandatoryUpgrade(false); }}
          />
        )}


        {viewProfile && (
          <ProfileModal
            handle={viewProfile}
            myCode={getMyCode()}
            following={following}
            followUser={followUser}
            unfollowUser={unfollowUser}
            onClose={() => setViewProfile(null)}
            C={C}
          />
        )}
        {showCalc && (
          <LotSizeCalculator C={C} onClose={() => setShowCalc(false)} />
        )}
        <NotificationsDrawer
          open={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
          draftCount={draftCount}
          onOpenInbox={() => navigateTo("inbox")}
          C={C}
        />
        {toast && <Toast message={toast} onDone={() => setToast(null)} C={C} />}
        {celebration && (
          <CelebrationOverlay
            C={C}
            kind={celebration.kind}
            streakCount={celebration.streakCount}
            tradeStats={celebration.tradeStats}
            onDismiss={dismissCelebration}
            onViewTrade={celebration.kind === "trade" ? () => { dismissCelebration(); navigateTo("history"); } : undefined}
          />
        )}
        {!isOnline && (
          <div role="alert" aria-live="assertive" style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999, background: C.warn, color: "#0A0A0B", fontFamily: MONO, fontSize: 11, letterSpacing: "0.06em", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
            <span>OFFLINE — changes won't sync until you reconnect.</span>
            <button onClick={() => setIsOnline(navigator.onLine)} style={{ background: "transparent", border: "1px solid rgba(0,0,0,0.25)", borderRadius: 999, padding: "2px 10px", cursor: "pointer", fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", color: "#0A0A0B" }}>Retry</button>
          </div>
        )}
        <ToastStack toasts={toastsV2} onDismiss={dismissToast} C={C} />

        {/* ── Circle Share Picker ── */}
        {tradeToShare && (
          <div
            onClick={() => { setTradeToShare(null); setSharingToCircle(null); }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{ width: "100%", maxWidth: 420, background: C.panel, borderRadius: "16px 16px 0 0", padding: "20px 16px 32px", border: `1px solid ${C.border2}`, borderBottom: "none" }}
            >
              <div style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 4 }}>Share Trade</div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: C.muted, marginBottom: 16, letterSpacing: "0.04em" }}>
                {tradeToShare.pair} · {(tradeToShare.direction || "").toUpperCase()} · {tradeToShare.date}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: C.muted, marginBottom: 8, textTransform: "uppercase" }}>Select Circle</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
                {myCircles.filter((c: Circle) => c.code !== KODA_GLOBAL_CODE).map((circle: Circle) => {
                  const selected = sharingToCircle === circle.code;
                  return (
                    <div
                      key={circle.code}
                      onClick={() => setSharingToCircle(selected ? null : circle.code)}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 13px", background: selected ? `${C.text}08` : C.panel, border: `1px solid ${selected ? C.border2 : C.border}`, borderRadius: 9, cursor: "pointer" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 15 }}>{circle.emoji || "◆"}</span>
                        <div>
                          <div style={{ fontFamily: DISPLAY, fontSize: 13, fontWeight: 600, color: C.text }}>{circle.name}</div>
                          <div style={{ fontFamily: MONO, fontSize: 10, color: C.muted }}>{circle.members?.length ?? 0} members</div>
                        </div>
                      </div>
                      <div style={{ width: 16, height: 16, borderRadius: "50%", background: selected ? C.text : "transparent", border: `1px solid ${selected ? C.text : C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {selected && <span style={{ fontSize: 9, color: C.bg }}>✓</span>}
                      </div>
                    </div>
                  );
                })}
                {myCircles.filter((c: Circle) => c.code !== KODA_GLOBAL_CODE).length === 0 && (
                  <div style={{ fontFamily: BODY, fontSize: 13, color: C.muted, textAlign: "center", padding: "16px 0" }}>You haven't joined any circles yet.</div>
                )}
              </div>
              <button
                disabled={!sharingToCircle}
                onClick={async () => {
                  if (!sharingToCircle || !tradeToShare) return;
                  const circleCode = sharingToCircle;
                  setTradeToShare(null);
                  setSharingToCircle(null);
                  const result = await shareTrade(
                    circleCode,
                    { name: profile.name, handle: profile.handle, avatar: profile.avatar, code: getMyCode() },
                    tradeToShare
                  );
                  if (result === "ok") showToast("Shared to circle!");
                  else if (result === "duplicate") showToast("Already shared to this circle");
                  else showToast("Failed to share");
                }}
                style={{ width: "100%", padding: "13px", background: C.text, border: "none", borderRadius: 10, color: C.bg, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: MONO, opacity: sharingToCircle ? 1 : 0.4 }}
              >
                {sharingToCircle
                  ? `Share to ${myCircles.find((c: Circle) => c.code === sharingToCircle)?.name ?? "circle"}`
                  : "Select a circle"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CONFLUENCE TRACKER (editorial) ──────────────────────────────────────────
function ConfluenceTracker({ checkItems, checkedCount, totalItems, isChecked, activeStrategy, C, stratThresholds, saveStratThresholds, inp, pillGhost }: {
  checkItems: { id: number; text: string }[];
  checkedCount: number;
  totalItems: number;
  isChecked: (id: number) => boolean;
  activeStrategy: string;
  C: typeof DARK;
  stratThresholds: Record<string, { minCount: number; required: number[] }>;
  saveStratThresholds: (u: Record<string, { minCount: number; required: number[] }>) => Promise<void>;
  inp: React.CSSProperties;
  pillGhost: React.CSSProperties;
}) {
  const [editMode, setEditMode] = useState(false);
  const thresh = stratThresholds[activeStrategy] || { minCount: Math.ceil(totalItems * 0.75), required: [] };
  const minCount = thresh.minCount || 1;
  const required = thresh.required || [];

  const reqMet = required.every((id: number) => isChecked(id));
  const countMet = checkedCount >= minCount;
  const greenLight = reqMet && countMet;
  const pct = totalItems ? Math.round((checkedCount / totalItems) * 100) : 0;

  const statusCol = greenLight ? C.green : countMet && !reqMet ? C.text2 : C.red;
  const statusText = greenLight ? "CLEAR TO ENTER" : (!countMet) ? `NEED ${minCount - checkedCount} MORE` : "REQUIRED CONFLUENCE MISSING";

  function toggleRequired(id: number) {
    const updated = required.includes(id) ? required.filter((r: number) => r !== id) : [...required, id];
    const u = { ...stratThresholds, [activeStrategy]: { ...thresh, required: updated } };
    saveStratThresholds(u);
  }
  function setMin(val: string) {
    const v = Math.max(1, Math.min(totalItems, parseInt(val) || 1));
    const u = { ...stratThresholds, [activeStrategy]: { ...thresh, minCount: v } };
    saveStratThresholds(u);
  }

  return (
    <div>
      {/* Score — editorial, no card */}
      <div style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, padding: "20px 0", marginBottom: "14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "14px" }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.12em", marginBottom: "6px" }}>CONFLUENCE</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
              <span style={{ fontFamily: DISPLAY, fontSize: "40px", fontWeight: 700, color: C.text, letterSpacing: "-0.03em", lineHeight: 1 }}>{checkedCount}</span>
              <span style={{ fontFamily: DISPLAY, fontSize: "18px", color: C.muted, fontWeight: 500 }}>/ {totalItems}</span>
            </div>
            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, marginTop: "6px", letterSpacing: "0.06em" }}>Min required: <span style={{ color: C.text }}>{minCount}</span></div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: MONO, fontSize: "11px", color: statusCol, letterSpacing: "0.1em", maxWidth: "160px", lineHeight: 1.4 }}>{statusText}</div>
          </div>
        </div>
        {/* Progress bar — 1px hairline */}
        <div style={{ position: "relative", background: C.border, height: "1px", width: "100%" }}>
          <div style={{ background: statusCol, height: "1px", width: `${pct}%`, transition: "width 0.35s ease" }} />
          <div style={{ position: "absolute", top: "-3px", bottom: "-3px", left: `${Math.round((minCount / totalItems) * 100)}%`, width: "1px", background: C.text }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.04em" }}>
          <span>{pct}% MET</span>
          <span>THRESHOLD {Math.round((minCount / totalItems) * 100)}%</span>
        </div>
        {required.length > 0 && (
          <div style={{ marginTop: "14px", paddingTop: "14px", borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontFamily: MONO, fontSize: "9px", color: C.muted, letterSpacing: "0.1em", marginBottom: "8px" }}>MUST-HAVES</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "14px", fontFamily: MONO, fontSize: "10px", letterSpacing: "0.04em" }}>
              {required.map((rid: number) => {
                const item = checkItems.find((i) => i.id === rid);
                if (!item) return null;
                const met = isChecked(rid);
                return (
                  <span key={rid} style={{ color: met ? C.green : C.red }}>
                    {met ? "✓" : "✕"} {stratShort(item.text)}
                  </span>
                );
              })}
            </div>
          </div>
        )}
        <button onClick={() => setEditMode(!editMode)} style={{ ...pillGhost, marginTop: "16px", width: "100%" }}>
          {editMode ? "CLOSE SETTINGS" : "ENTRY RULE SETTINGS"}
        </button>
      </div>

      {editMode && (
        <div style={{ padding: "4px 0 20px", marginBottom: "4px" }}>
          <SectionKicker label={`ENTRY RULES — ${stratShort(activeStrategy).toUpperCase()}`} C={C} />
          <div style={{ marginTop: "18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px", alignItems: "baseline" }}>
              <label style={{ fontFamily: BODY, fontSize: "13px", color: C.text }}>Minimum confluences to enter</label>
              <span style={{ fontFamily: MONO, fontSize: "13px", color: C.text, letterSpacing: "0.04em" }}>{minCount} / {totalItems}</span>
            </div>
            <input type="range" min={1} max={totalItems} value={minCount} onChange={e => setMin(e.target.value)}
              style={{ width: "100%", accentColor: C.text, cursor: "pointer" }} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px", fontFamily: MONO, fontSize: "9px", color: C.dim, letterSpacing: "0.06em" }}>
              <span>1 LENIENT</span>
              <span>{totalItems} STRICT</span>
            </div>
          </div>
          <div style={{ marginTop: "24px" }}>
            <div style={{ fontFamily: MONO, fontSize: "10px", color: C.muted, letterSpacing: "0.1em", marginBottom: "8px" }}>MARK AS REQUIRED</div>
            <div style={{ fontFamily: BODY, fontSize: "12px", color: C.muted, marginBottom: "14px", lineHeight: 1.55 }}>
              Toggle any confluence as required — the clear-to-enter signal only fires if these are checked, regardless of minimum count.
            </div>
            <div style={{ borderTop: `1px solid ${C.border}` }}>
              {checkItems.map((item: { id: number; text: string }) => {
                const isReq = required.includes(item.id);
                return (
                  <div key={item.id} onClick={() => toggleRequired(item.id)}
                    style={{ display: "flex", alignItems: "center", gap: "14px", padding: "12px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
                    <div style={{ width: "16px", height: "16px", borderRadius: "50%", border: `1px solid ${isReq ? C.text : C.border2}`, background: isReq ? C.text : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {isReq && <span style={{ color: C.bg, fontSize: "9px", lineHeight: 1 }}>✓</span>}
                    </div>
                    <span style={{ fontFamily: BODY, fontSize: "13px", color: isReq ? C.text : C.text2, flex: 1, lineHeight: 1.5 }}>{item.text}</span>
                    <span style={{ fontFamily: MONO, fontSize: "10px", color: isReq ? C.text : C.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>{isReq ? "Required" : "Optional"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
