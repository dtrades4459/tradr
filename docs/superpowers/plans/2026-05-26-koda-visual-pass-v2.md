# Kōda Visual Pass v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the full Kōda v2 visual system to every screen, add launch-ready surfaces (celebrations, empty/error states, web push, email, static pages, icons), and complete the remaining features from the design handoff README.

**Architecture:** Inline styles + existing `src/index.css` global keyframes + design atoms from `src/shared.tsx`. No new CSS-in-JS libraries. New server features land in `api/`. No feature flags unless a change could break existing flows.

**Tech Stack:** React 19 + TypeScript + Vite + Supabase + Vercel. Email via Resend (`resend` npm package). Web push via `web-push` npm. Design tokens in `src/theme.ts`, atoms in `src/shared.tsx`.

**Design reference:** `/tmp/design_extracted/kodaos/project/design_handoff_koda_redesign/` — `koda-screens.jsx`, `koda-mobile2.jsx`, `koda-mobile3.jsx`, `koda-web.jsx`, `koda-marketing.jsx`, `koda-launch.jsx`, `koda-launch2.jsx`.

**Status at plan creation (2026-05-26):**
Already done — skip these in execution:
- Phase A (tokens + atoms), Phase B (brand strings), Phase C (TabBar + draftCount badge)
- F1 partial (kSlideIn/kShake/kSpin/kSpin exist; missing 9 design-spec names)
- F2 (ToastV2 system — ToastItem/ToastKind/ToastStack/showToastV2 all present)
- F4a (mistake field + chip picker), F4b (prop firm toggle in SettingsScreen)
- F13 (prefers-reduced-motion CSS), F14 (4-tier useViewport)
- manifest background_color = #0A0A0B ✅

---

## File Map

| File | Change type |
|---|---|
| `src/index.css` | Add 9 missing keyframes |
| `src/Koda.tsx` | Celebrations (F3), empty/skeleton states (F4), ErrorOffline shell, online/offline listener, History tab rename copy |
| `src/shared.tsx` | Add `CelebrationOverlay`, `SkeletonBar`, `SkeletonCard`, `EmptyTrades`, `EmptyCircles`, `EmptyInbox`, `EmptyStats`, `ErrorOffline`, `ErrorSyncFailed` |
| `src/TradingCircles.tsx` | Circle cards visual pass — conic-gradient CornerGlow, Kicker headers |
| `src/LogTradeScreen.tsx` | FloatingInput on all fields, emotion + rule adherence pills visual |
| `src/SettingsScreen.tsx` | Card sections with Kicker headers, glass card wrapping |
| `src/KodaAuth.tsx` | Landing hero + sign-in card visual pass (marketing screens) |
| `src/DataSourcesScreen.tsx` | Broker card layout per koda-mobile3 BrokersScreen |
| `src/ProfileModal.tsx` | Visual pass per koda-mobile2 ProfileScreen |
| `src/UpgradeModal.tsx` | Pro upgrade screen visual pass |
| `src/EvalAccountScreen.tsx` | Large stat block, progress bar colors, Kicker headers |
| `src/ReviewInboxScreen.tsx` | Mint dot + draft pill row pattern |
| `src/LotSizeCalculator.tsx` | Glass header, kDrawer bottom-sheet animation |
| `src/OnboardingFlow.tsx` | MONO step labels, DISPLAY title |
| `src/sw.ts` | Web push `push` + `notificationclick` event handlers |
| `api/push/subscribe.ts` | New — saves push subscription to Supabase |
| `api/push/send.ts` | New — sends a web push to a user |
| `api/cron/weekly-recap.ts` | New — Sunday 20:00 UTC recap email |
| `api/lib/email.ts` | New — Resend helper + HTML templates (WeeklyRecap, Receipt) |
| `api/stripe-webhook.ts` | Wire `invoice.paid` to email.ts receipt template |
| `vercel.json` | Add weekly-recap cron + push domain CSP allowlist |
| `public/og-image.svg` | Regenerate from design spec (OGCard) |
| `public/icon.svg` | Regenerate — 4-chevron mark, no "tr", bg #0A0A0B |
| `public/favicon.svg` | Regenerate — 4-chevron mark |
| `public/apple-touch-icon.svg` | Regenerate — rounded square, rx=22.5%, bg #0A0A0B |
| `public/icon-maskable.svg` | Regenerate |
| `public/manifest.webmanifest` | Already correct; verify only |
| `public/faq.html` | New static page |
| `public/changelog.html` | New static page |
| `public/404.html` | New static page |
| `index.html` | Update og:image → og-image.svg (already done); add push VAPID meta |
| `supabase/migrations/20260526_push_subscriptions.sql` | New — notification_subscriptions table |
| `.env.example` | Add RESEND_API_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL |

---

## Task 1 — Complete the motion keyframe set (F1)

**Files:**
- Modify: `src/index.css:22-36`

The README specifies 12 named keyframes. Current `index.css` has generically-named ones (kSlideIn, kShake, kSpin). Add the 9 that are missing from the design spec inside the existing `@media (prefers-reduced-motion: no-preference)` block.

- [ ] **Step 1: Add the 9 missing keyframes**

In `src/index.css`, inside the `@media (prefers-reduced-motion: no-preference)` block after the last existing `@keyframes kConfetti` line, add:

```css
  @keyframes kRise        { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:none } }
  @keyframes kCount       { from { opacity:0; transform:scale(0.8) } to { opacity:1; transform:none } }
  @keyframes kStreakGlow  { 0%,100% { filter:drop-shadow(0 0 6px currentColor) opacity(1) } 50% { filter:drop-shadow(0 0 22px currentColor) opacity(0.8) } }
  @keyframes kTick        { from { stroke-dashoffset:30 } to { stroke-dashoffset:0 } }
  @keyframes kDrawer      { from { opacity:0; transform:translateY(100%) } to { opacity:1; transform:none } }
  @keyframes kRipple      { from { transform:scale(0); opacity:0.6 } to { transform:scale(2.8); opacity:0 } }
  @keyframes kShimmer     { from { background-position:-600px 0 } to { background-position:600px 0 } }
  @keyframes kConfettiA   { 0% { opacity:1; transform:translate(-50%,-50%) translateY(0) rotate(0deg) } 100% { opacity:0; transform:translate(-50%,-50%) translateY(220px) rotate(540deg) } }
  @keyframes kSheen       { 0% { left:-60% } 100% { left:120% } }
```

- [ ] **Step 2: Build**

```
npm run build
```
Expected: no errors.

- [ ] **Step 3: Commit**

```
git add src/index.css
git commit -m "feat: add 9 missing design-spec keyframes to motion system"
```

---

## Task 2 — Empty, skeleton, and offline states in shared.tsx (F4)

**Files:**
- Modify: `src/shared.tsx` (append new exports after line ~735)

- [ ] **Step 1: Add skeleton + empty + error components**

At the end of `src/shared.tsx` (before the final closing), add:

```tsx
// ── Skeleton bar ─────────────────────────────────────────────────────────────
export function SkeletonBar({ w = "100%", h = 14, C }: { w?: string | number; h?: number; C: Theme }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: 6,
      background: `linear-gradient(90deg, ${C.panel} 0%, ${C.border2} 50%, ${C.panel} 100%)`,
      backgroundSize: "600px 100%",
      animation: "kShimmer 1.4s linear infinite",
    }} />
  );
}

// ── Empty: no trades ─────────────────────────────────────────────────────────
export function EmptyTradesState({ C, onLog, onSync }: { C: Theme; onLog: () => void; onSync: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 18, padding: "60px 24px 40px" }}>
      <svg width="80" height="80" viewBox="0 0 80 80" fill="none" style={{ opacity: 0.7 }}>
        <rect x="14" y="14" width="52" height="62" rx="6" stroke={C.border2} strokeWidth="1.4"/>
        <path d="M22 28h36M22 38h36M22 48h28M22 58h22" stroke={C.border2} strokeWidth="1.4" strokeLinecap="round" strokeDasharray="2 4"/>
        <circle cx="62" cy="20" r="10" fill={C.live} opacity="0.18"/>
        <path d="M58 20l3 3 5-6" stroke={C.live} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
      <div>
        <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, color: C.text, letterSpacing: "-0.01em" }}>Your journal awaits.</div>
        <div style={{ fontSize: 13, color: C.text2, marginTop: 8, maxWidth: 260, lineHeight: 1.6 }}>
          Log a trade to start seeing your win rate, average R, and edge patterns.
        </div>
      </div>
      <button onClick={onLog} style={{
        marginTop: 4, padding: "13px 28px", borderRadius: 999,
        background: C.text, color: C.bg, border: "none",
        fontFamily: MONO, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase" as const, fontWeight: 600, cursor: "pointer",
      }}>Log first trade</button>
      <div style={{ fontFamily: MONO, fontSize: 10, color: C.muted, letterSpacing: "0.12em", marginTop: 4 }}>
        OR <span onClick={onSync} style={{ color: C.live, cursor: "pointer" }}>connect Tradovate</span> · <span onClick={onSync} style={{ color: C.accent, cursor: "pointer" }}>import CSV</span>
      </div>
    </div>
  );
}

// ── Empty: no circles ────────────────────────────────────────────────────────
export function EmptyCirclesState({ C, onDiscover, onJoin }: { C: Theme; onDiscover: () => void; onJoin: () => void }) {
  const colors = [C.accent, C.live, C.green];
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 18, padding: "60px 24px 40px" }}>
      <div style={{ position: "relative", width: 110, height: 90 }}>
        {colors.map((c, i) => (
          <div key={i} style={{
            position: "absolute", width: 56, height: 56, borderRadius: "50%",
            border: `1.5px solid ${C.border2}`,
            left: i * 24, top: i % 2 === 0 ? 0 : 28,
            background: `radial-gradient(circle, ${c}30 0%, transparent 70%)`,
          }} />
        ))}
      </div>
      <div>
        <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, color: C.text }}>Don't trade alone.</div>
        <div style={{ fontSize: 13, color: C.text2, marginTop: 8, maxWidth: 270, lineHeight: 1.6 }}>
          Join the Kōda Global circle, find a niche group, or create your own with friends.
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button onClick={onDiscover} style={{ padding: "11px 18px", borderRadius: 999, background: C.live, color: "#0A0A0A", border: "none", fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const, cursor: "pointer" }}>Discover</button>
        <button onClick={onJoin} style={{ padding: "11px 18px", borderRadius: 999, background: "transparent", color: C.text, border: `1px solid ${C.border2}`, fontFamily: MONO, fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase" as const, cursor: "pointer" }}>Join by code</button>
      </div>
    </div>
  );
}

// ── Empty: inbox zero ────────────────────────────────────────────────────────
export function EmptyInboxState({ C }: { C: Theme }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 18, padding: "80px 24px 40px" }}>
      <div style={{ width: 76, height: 76, borderRadius: "50%", background: C.border, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${C.border2}` }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
          <path d="M4 12h6l2 4 2-8 2 4h4" stroke={C.live} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div>
        <div style={{ fontFamily: DISPLAY, fontSize: 22, fontWeight: 600, color: C.text }}>All clear.</div>
        <div style={{ fontSize: 13, color: C.text2, marginTop: 8, maxWidth: 260, lineHeight: 1.6 }}>
          New circle activity, follower pings, and Kōda AI insights will land here.
        </div>
      </div>
    </div>
  );
}

// ── Error: offline ────────────────────────────────────────────────────────────
export function ErrorOfflineState({ C, onRetry }: { C: Theme; onRetry: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 18, padding: "80px 24px 40px" }}>
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
        <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" stroke={C.red} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <div>
        <div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 600, color: C.text }}>You're offline.</div>
        <div style={{ fontSize: 13, color: C.text2, marginTop: 8, maxWidth: 260, lineHeight: 1.6 }}>
          Your trades are safe locally. Kōda will sync when the connection returns.
        </div>
      </div>
      <button onClick={onRetry} style={{ padding: "11px 22px", borderRadius: 999, background: C.panel, color: C.text, border: `1px solid ${C.border2}`, fontFamily: MONO, fontSize: 11, letterSpacing: "0.10em", textTransform: "uppercase" as const, cursor: "pointer" }}>Retry</button>
    </div>
  );
}

// ── Error: sync failed ────────────────────────────────────────────────────────
export function ErrorSyncFailedState({ C, broker, onRetry }: { C: Theme; broker: string; onRetry: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "20px 0" }}>
      <div style={{ padding: "16px 18px", borderRadius: 14, background: `${C.red}18`, border: `1px solid ${C.red}40`, display: "flex", alignItems: "center", gap: 12 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke={C.red} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.08em", color: C.red, textTransform: "uppercase" as const }}>Sync error · {broker}</div>
          <div style={{ fontSize: 12, color: C.text2, marginTop: 3 }}>Last attempt failed. Check your connection or re-authenticate.</div>
        </div>
        <button onClick={onRetry} style={{ marginLeft: "auto", padding: "8px 14px", borderRadius: 999, background: "transparent", border: `1px solid ${C.red}60`, color: C.red, fontFamily: MONO, fontSize: 10, letterSpacing: "0.08em", cursor: "pointer", flexShrink: 0 }}>Retry</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build and type-check**

```
npm run build && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```
git add src/shared.tsx
git commit -m "feat: add empty/skeleton/error state components to shared.tsx"
```

---

## Task 3 — Wire empty states into Koda.tsx + offline detection (F4)

**Files:**
- Modify: `src/Koda.tsx`

- [ ] **Step 1: Add imports**

In the import line ~L20 in `src/Koda.tsx`, add to the existing `shared` import:
```tsx
EmptyTradesState, EmptyCirclesState, EmptyInboxState, ErrorOfflineState,
```

- [ ] **Step 2: Add offline state**

After the `const [loading, setLoading] = useState(true);` line (~L278), add:
```tsx
const [isOnline, setIsOnline] = useState(() => navigator.onLine);
useEffect(() => {
  const up = () => setIsOnline(true);
  const dn = () => setIsOnline(false);
  window.addEventListener("online", up);
  window.addEventListener("offline", dn);
  return () => { window.removeEventListener("online", up); window.removeEventListener("offline", dn); };
}, []);
```

- [ ] **Step 3: Add offline overlay above the ToastStack**

In the render near where `<ToastStack>` renders (~L1445 area), wrap with:
```tsx
{!isOnline && (
  <div style={{ position: "fixed", inset: 0, zIndex: 9000, background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
    <ErrorOfflineState C={C} onRetry={() => setIsOnline(navigator.onLine)} />
  </div>
)}
```

- [ ] **Step 4: Replace the history tab empty state**

Find the current history-empty block (~L2564): `Every edge starts with data. Log your first trade.`

Replace that entire empty-trades fallback with:
```tsx
{trades.length === 0 && (
  <EmptyTradesState C={C} onLog={() => navigateTo("log")} onSync={() => setHomeSection("sync")} />
)}
```

- [ ] **Step 5: Build**

```
npm run build
```

- [ ] **Step 6: Commit**

```
git add src/Koda.tsx
git commit -m "feat: offline detection + empty states wired in Koda.tsx"
```

---

## Task 4 — Wire EmptyCircles into TradingCircles.tsx

**Files:**
- Modify: `src/TradingCircles.tsx`

- [ ] **Step 1: Import and use**

At top of `src/TradingCircles.tsx`, add `EmptyCirclesState` to the shared import.

Find where circles renders when `myCircles.length === 0` (search `no circles` or the current empty fallback). Replace the fallback with:
```tsx
<EmptyCirclesState C={C} onDiscover={() => setDiscoverOpen(true)} onJoin={() => setJoinOpen(true)} />
```
(Use the actual state-setter names from the file — search for the discover/join modal setters already there.)

- [ ] **Step 2: Visual pass — circle cards with CornerGlow**

Find where circle cards are rendered (`myCircles.map`). Wrap each card's outer div to use:
```tsx
style={{
  position: "relative", borderRadius: 20, overflow: "hidden",
  background: (C as any).surfaceGlass ?? C.panel,
  backdropFilter: "blur(20px) saturate(160%)", WebkitBackdropFilter: "blur(20px) saturate(160%)",
  border: `1px solid ${C.border2}`, padding: "18px 20px",
  animation: "kRise 0.42s ease-out backwards",
}}
```
Add a `<CornerGlow C={C} />` as the first child inside each card.

- [ ] **Step 3: Build**

```
npm run build
```

- [ ] **Step 4: Commit**

```
git add src/TradingCircles.tsx
git commit -m "feat: empty circles state + CornerGlow visual pass on circle cards"
```

---

## Task 5 — Celebration overlays (F3)

**Files:**
- Modify: `src/shared.tsx`, `src/Koda.tsx`

- [ ] **Step 1: Add CelebrationOverlay to shared.tsx**

Append to `src/shared.tsx`:
```tsx
// ── Celebration overlays ─────────────────────────────────────────────────────
type CelebrationKind = "trade" | "streak" | "pro";

interface CelebrationProps {
  C: Theme;
  kind: CelebrationKind;
  streakCount?: number;
  tradeStats?: { winRate: number; avgR: number; streak: number };
  onDismiss: () => void;
  onViewTrade?: () => void;
}

export function CelebrationOverlay({ C, kind, streakCount, tradeStats, onDismiss, onViewTrade }: CelebrationProps) {
  const live = C.live;
  const confettiColors = [live, C.accent, C.green, (C as any).orb1 ?? live, (C as any).orb3 ?? C.green];

  // Auto-dismiss trade/pro after 2.5s; streak requires tap
  useEffect(() => {
    if (kind === "trade") {
      const t = setTimeout(onDismiss, 2500);
      return () => clearTimeout(t);
    }
  }, [kind, onDismiss]);

  return (
    <div
      onClick={kind === "streak" ? undefined : onDismiss}
      style={{
        position: "fixed", inset: 0, zIndex: 8000,
        background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center",
        animation: "kFadeIn 0.25s ease-out",
      }}
    >
      {kind === "trade" && (
        <div style={{ position: "relative", width: "min(360px, 92vw)", padding: "36px 24px 28px", borderRadius: 24, background: C.panel, border: `1px solid ${C.border2}`, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 14, animation: "kRise 0.42s ease-out" }}>
          {/* confetti burst */}
          <div style={{ position: "absolute", top: 120, left: "50%", width: 1, height: 1, pointerEvents: "none" }}>
            {Array.from({ length: 20 }).map((_, i) => {
              const angle = (i / 20) * 360;
              return <span key={i} style={{ position: "absolute", top: 0, left: 0, width: 6, height: 11, borderRadius: 1, background: confettiColors[i % confettiColors.length], transform: `translate(-50%,-50%) rotate(${angle}deg)`, animation: `kConfettiA 2s ${i * 0.05}s ease-out forwards` }} />;
            })}
          </div>
          {/* checkmark ring */}
          <div style={{ width: 80, height: 80, borderRadius: "50%", background: `${live}20`, border: `1.5px solid ${live}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
              <path d="M5 12.5l4 4L19 7" stroke={live} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="30" style={{ animation: "kTick 0.7s ease-out forwards" }} />
            </svg>
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 600, color: C.text, letterSpacing: "-0.02em" }}>Trade logged.</div>
          {tradeStats && (
            <div style={{ width: "100%", padding: "14px 16px", borderRadius: 14, background: C.bg, border: `1px solid ${C.border}`, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              {[
                { l: "Win rate", v: `${tradeStats.winRate}%` },
                { l: "Avg R", v: tradeStats.avgR > 0 ? `+${tradeStats.avgR.toFixed(1)}` : tradeStats.avgR.toFixed(1) },
                { l: "Streak", v: tradeStats.streak > 0 ? `${tradeStats.streak}W` : "—" },
              ].map(s => (
                <div key={s.l} style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: "0.14em", color: C.muted, textTransform: "uppercase" as const }}>{s.l}</div>
                  <div style={{ fontFamily: DISPLAY, fontSize: 17, fontWeight: 600, color: C.text, marginTop: 4 }}>{s.v}</div>
                </div>
              ))}
            </div>
          )}
          {onViewTrade && (
            <button onClick={onViewTrade} style={{ padding: "11px 24px", borderRadius: 999, background: C.text, color: C.bg, border: "none", fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" as const, cursor: "pointer" }}>View trade →</button>
          )}
        </div>
      )}

      {kind === "streak" && (
        <div style={{ width: "min(360px, 92vw)", padding: "36px 24px 28px", borderRadius: 24, background: C.panel, border: `1px solid ${C.border2}`, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 12, animation: "kRise 0.42s ease-out" }}>
          <div style={{ color: live, animation: "kStreakGlow 1.6s ease-in-out infinite" }}>
            <svg width="72" height="72" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1.5 4 6 5 6 10a6 6 0 0 1-12 0c0-3 2-4 2-7 2 1 3 3 4 4 0-3 0-5 0-7z"/></svg>
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 72, fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1, background: `linear-gradient(180deg, ${C.text}, ${live})`, WebkitBackgroundClip: "text", backgroundClip: "text", WebkitTextFillColor: "transparent" }}>{streakCount}</div>
          <div style={{ fontFamily: DISPLAY, fontSize: 20, fontWeight: 500, color: C.text, fontStyle: "italic" }}>green days in a row.</div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={onDismiss} style={{ padding: "11px 20px", borderRadius: 999, background: live, color: "#0A0A0A", border: "none", fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const, cursor: "pointer" }}>Keep going</button>
          </div>
        </div>
      )}

      {kind === "pro" && (
        <div style={{ width: "min(380px, 92vw)", padding: "36px 24px 28px", borderRadius: 24, background: C.panel, border: `1px solid ${C.border2}`, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 14, position: "relative", overflow: "hidden", animation: "kRise 0.42s ease-out" }}>
          <div style={{ position: "absolute", top: 60, left: "50%", transform: "translateX(-50%)", width: 320, height: 320, borderRadius: "50%", background: `conic-gradient(from 180deg, ${(C as any).orb1 ?? C.accent}, ${(C as any).orb3 ?? C.green}, ${live}, ${(C as any).orb1 ?? C.accent})`, filter: "blur(80px)", opacity: 0.35, pointerEvents: "none" }} />
          <div style={{ position: "relative", padding: "12px 28px", borderRadius: 999, background: `linear-gradient(135deg, ${live}, ${C.accent})`, color: "#0A0A0A", overflow: "hidden", fontFamily: DISPLAY, fontSize: 20, fontWeight: 700, letterSpacing: "0.16em" }}>
            PRO
            <div style={{ position: "absolute", top: 0, left: 0, width: "40%", height: "100%", background: "rgba(255,255,255,0.45)", animation: "kSheen 2.8s linear infinite" }} />
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 26, fontWeight: 600, color: C.text, letterSpacing: "-0.02em", position: "relative" }}>You're in.</div>
          <div style={{ fontSize: 13, color: C.text2, maxWidth: 270, lineHeight: 1.5, position: "relative" }}>Auto-import, unlimited circles, prop firm tracker, and Kōda AI are now active.</div>
          <button onClick={onDismiss} style={{ marginTop: 8, padding: "12px 28px", borderRadius: 999, background: C.text, color: C.bg, border: "none", fontFamily: MONO, fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase" as const, cursor: "pointer", position: "relative" }}>Start trading →</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire in Koda.tsx**

Import `CelebrationOverlay` in `src/Koda.tsx`.

After the `toastsV2` state (~L304), add:
```tsx
const [celebration, setCelebration] = useState<{ kind: "trade" | "streak" | "pro"; streakCount?: number; tradeStats?: { winRate: number; avgR: number; streak: number } } | null>(null);
```

In the `saveTrade` success callback (search `showToast("Trade saved")`), after that line add:
```tsx
const wr = Math.round(wins / Math.max(updatedTrades.length, 1) * 100);
const avgR = updatedTrades.reduce((s, t) => s + (t.rr ?? 0), 0) / Math.max(updatedTrades.length, 1);
setCelebration({ kind: "trade", tradeStats: { winRate: wr, avgR: parseFloat(avgR.toFixed(1)), streak: streak.count } });
```
(Use the actual variables already in scope at that point — `wins`, `updatedTrades`, `streak`.)

For streak: find where `streakCount` increments. After it, add:
```tsx
const STREAK_MILESTONES = [3, 7, 14, 30, 100];
if (STREAK_MILESTONES.includes(newStreakCount)) {
  const celebKey = `koda_streak_celebrated_${newStreakCount}`;
  const alreadyCelebrated = await supabase.from("user_kv").select("key").eq("user_id", user.id).eq("key", celebKey).maybeSingle();
  if (!alreadyCelebrated.data) {
    await supabase.from("user_kv").upsert({ user_id: user.id, key: celebKey, value: { v: true } });
    setCelebration({ kind: "streak", streakCount: newStreakCount });
  }
}
```

For Pro: in the URL-check `useEffect` that handles `?upgraded=1` (search `upgraded=1`), replace the `showToast` call with:
```tsx
setCelebration({ kind: "pro" });
```

Add the overlay to the render (above `<ToastStack>`):
```tsx
{celebration && (
  <CelebrationOverlay
    C={C}
    kind={celebration.kind}
    streakCount={celebration.streakCount}
    tradeStats={celebration.tradeStats}
    onDismiss={() => setCelebration(null)}
    onViewTrade={celebration.kind === "trade" ? () => { setCelebration(null); navigateTo("history"); } : undefined}
  />
)}
```

- [ ] **Step 3: Build**

```
npm run build && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```
git add src/shared.tsx src/Koda.tsx
git commit -m "feat: trade/streak/pro celebration overlays (F3)"
```

---

## Task 6 — EvalAccountScreen visual pass

**Files:**
- Modify: `src/EvalAccountScreen.tsx`

- [ ] **Step 1: Import design atoms**

Add to the existing import from `./shared`:
```tsx
import { Kicker, Card, GlassOrb, MONO, DISPLAY, BODY } from "./shared";
```

- [ ] **Step 2: Apply visual system**

The screen currently has inline styles that don't use `DISPLAY` or `Kicker`. Do a targeted pass:

1. All section headers (`"PROFIT TARGET"`, `"DAILY LOSS"`, `"MAX DRAWDOWN"`) → wrap in `<Kicker C={C}>...</Kicker>`
2. The big account balance number → `fontFamily: DISPLAY, fontSize: 44, fontWeight: 600, letterSpacing: "-0.03em"`
3. The progress bars: verify the color logic uses `t.green` when <75% usage, `t.red` when ≥75%. Update:
```tsx
const barColor = (used: number, limit: number) => {
  const pct = used / limit;
  return pct >= 0.75 ? C.red : pct >= 0.5 ? "#f59e0b" : C.green;
};
```
4. Wrap the whole screen in a `<GlassOrb>` ambient bloom behind the hero block.
5. Status badge: confirm PASSING/AT_RISK/FAILED use `C.green / #f59e0b / C.red` respectively.

- [ ] **Step 3: Build**

```
npm run build
```

- [ ] **Step 4: Commit**

```
git add src/EvalAccountScreen.tsx
git commit -m "feat: EvalAccountScreen visual pass — Kicker headers, progress bar colors, DISPLAY numerics"
```

---

## Task 7 — LotSizeCalculator polish (F11)

**Files:**
- Modify: `src/LotSizeCalculator.tsx`

- [ ] **Step 1: Import design atoms**

```tsx
import { Kicker, MONO, DISPLAY, BODY } from "./shared";
```
Also import `DARK` from `./theme` if not already.

- [ ] **Step 2: Apply kDrawer animation + glass header**

Find the outer wrapper div (the modal/sheet container). Apply:
```tsx
style={{
  position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
  width: "min(480px, 100vw)", maxHeight: "90dvh",
  background: C.panel, borderRadius: "24px 24px 0 0",
  border: `1px solid ${C.border2}`, borderBottom: "none",
  overflow: "hidden", display: "flex", flexDirection: "column",
  animation: "kDrawer 0.32s cubic-bezier(.2,.8,.2,1)",
  boxShadow: "0 -16px 40px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.04)",
}}
```

Find the header bar (the drag handle / title row). Apply glass treatment:
```tsx
style={{
  padding: "14px 20px 12px",
  background: (C as any).surfaceGlass ?? C.panel,
  backdropFilter: "blur(20px) saturate(160%)",
  WebkitBackdropFilter: "blur(20px) saturate(160%)",
  borderBottom: `1px solid ${C.border}`,
  display: "flex", alignItems: "center", justifyContent: "space-between",
}}
```

Add drag handle pill:
```tsx
<div style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", width: 36, height: 4, borderRadius: 999, background: C.border2 }} />
```

- [ ] **Step 3: Apply MONO + DISPLAY to numbers**

Result display (contracts, risk $, stop ticks) → `fontFamily: DISPLAY, fontSize: 28, fontWeight: 600`
All labels → `fontFamily: MONO, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase"`

- [ ] **Step 4: Build**

```
npm run build
```

- [ ] **Step 5: Commit**

```
git add src/LotSizeCalculator.tsx
git commit -m "feat: LotSizeCalculator glass header + kDrawer animation (F11)"
```

---

## Task 8 — ReviewInboxScreen visual pass (F12)

**Files:**
- Modify: `src/ReviewInboxScreen.tsx`

- [ ] **Step 1: Import atoms**

```tsx
import { Kicker, MONO, DISPLAY } from "./shared";
```

- [ ] **Step 2: Apply row pattern from koda-mobile2 HistoryScreen**

Find the trade row render. Apply:
```tsx
// Outer row
style={{
  display: "flex", alignItems: "center", gap: 12, padding: "13px 16px",
  borderBottom: `1px solid ${C.border}`,
  cursor: "pointer",
  transition: "background 0.15s",
}}

// Mint dot (draft/pending indicator)
<div style={{ width: 7, height: 7, borderRadius: "50%", background: C.live, flexShrink: 0 }} />

// Draft pill
<div style={{ padding: "2px 8px", borderRadius: 999, background: `${C.live}20`, border: `1px solid ${C.live}40`, fontFamily: MONO, fontSize: 9, letterSpacing: "0.10em", color: C.live, textTransform: "uppercase" as const }}>DRAFT</div>
```

- [ ] **Step 3: Build**

```
npm run build
```

- [ ] **Step 4: Commit**

```
git add src/ReviewInboxScreen.tsx
git commit -m "feat: ReviewInboxScreen visual pass — mint dot + draft pill rows"
```

---

## Task 9 — LogTradeScreen visual pass

**Files:**
- Modify: `src/LogTradeScreen.tsx`

- [ ] **Step 1: Add FloatingInput import**

Confirm `FloatingInput` is already imported from `./shared`. If not, add it.

- [ ] **Step 2: Apply FloatingInput to all text/number fields**

Find `<input>` and `<textarea>` elements that use basic styling. Wrap them in `<FloatingInput>` where a floating label is appropriate (pair/symbol, entry price, stop loss, take profit, notes). For the select dropdowns, keep native `<select>` but style consistently:
```tsx
style={{
  background: C.panel, color: C.text, border: `1px solid ${C.border2}`,
  borderRadius: 12, padding: "11px 14px",
  fontFamily: MONO, fontSize: 13, width: "100%",
  WebkitAppearance: "none" as const,
}}
```

- [ ] **Step 3: Style emotion chips**

Find the emotion chip group. Apply the `<Pill>` atom for each tag:
```tsx
<div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
  {EMOTION_TAGS.map(tag => (
    <Pill
      key={tag.id}
      C={C}
      active={form.emotions?.includes(tag.id) ?? false}
      onClick={() => toggleEmotion(tag.id)}
    >{tag.label}</Pill>
  ))}
</div>
```

- [ ] **Step 4: Style rule adherence toggle**

Find the rule adherence control. Replace with a two-pill row:
```tsx
<div style={{ display: "flex", gap: 6 }}>
  <button
    onClick={() => setForm(f => ({ ...f, ruleAdherence: f.ruleAdherence === true ? null : true }))}
    style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1px solid ${form.ruleAdherence === true ? C.green : C.border2}`, background: form.ruleAdherence === true ? `${C.green}18` : "transparent", color: form.ruleAdherence === true ? C.green : C.text2, fontFamily: MONO, fontSize: 11, letterSpacing: "0.06em", cursor: "pointer" }}
  >Followed rules</button>
  <button
    onClick={() => setForm(f => ({ ...f, ruleAdherence: f.ruleAdherence === false ? null : false }))}
    style={{ flex: 1, padding: "10px", borderRadius: 10, border: `1px solid ${form.ruleAdherence === false ? C.red : C.border2}`, background: form.ruleAdherence === false ? `${C.red}18` : "transparent", color: form.ruleAdherence === false ? C.red : C.text2, fontFamily: MONO, fontSize: 11, letterSpacing: "0.06em", cursor: "pointer" }}
  >Broke rules</button>
</div>
```

- [ ] **Step 5: Build**

```
npm run build
```

- [ ] **Step 6: Commit**

```
git add src/LogTradeScreen.tsx
git commit -m "feat: LogTradeScreen visual pass — FloatingInput, emotion/rule pills"
```

---

## Task 10 — SettingsScreen visual pass

**Files:**
- Modify: `src/SettingsScreen.tsx`

- [ ] **Step 1: Import atoms**

```tsx
import { Kicker, Card, MONO, DISPLAY } from "./shared";
```

- [ ] **Step 2: Wrap section groups in Cards with Kicker headers**

Each logical group (Account, Appearance, Notifications, Pro, Data, etc.) should follow this pattern:
```tsx
<div style={{ marginBottom: 20 }}>
  <Kicker C={C} style={{ marginBottom: 8 }}>Account</Kicker>
  <div style={{ borderRadius: 18, background: C.panel, border: `1px solid ${C.border}`, overflow: "hidden" }}>
    {/* rows */}
  </div>
</div>
```

- [ ] **Step 3: Style setting rows**

Each row inside a card section:
```tsx
style={{
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "14px 16px", borderBottom: `1px solid ${C.border}`,
  fontFamily: BODY, fontSize: 14, color: C.text,
}}
```
Remove `borderBottom` from the last row in each group.

- [ ] **Step 4: Build**

```
npm run build
```

- [ ] **Step 5: Commit**

```
git add src/SettingsScreen.tsx
git commit -m "feat: SettingsScreen visual pass — Kicker section headers, Card grouping"
```

---

## Task 11 — KodaAuth.tsx marketing screen visual pass (Phase F)

**Files:**
- Modify: `src/KodaAuth.tsx`

- [ ] **Step 1: Verify import list**

KodaAuth already imports `KodaMark, FloatingInput, TealArrowBtn, MONO, BODY`. Add `GlassOrb, GhostWord, Kicker, DISPLAY` to the import.

- [ ] **Step 2: Apply landing hero design (koda-marketing.jsx LandingHero)**

Find the outer landing wrapper (the non-form state rendered before the user starts signing in). Apply:

```tsx
// Outer container
style={{
  minHeight: "100dvh", background: C.bg, display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center", padding: "40px 24px",
  position: "relative", overflow: "hidden",
}}

// Ambient orbs (add as first children)
<GlassOrb C={C as any} top={-80} left={-60} size={400} color={(C as any).orb1 ?? C.accent} opacity={0.45} />
<GlassOrb C={C as any} top={300} right={-80} size={280} color={(C as any).orb3 ?? C.green} opacity={0.3} />

// Ghost word backdrop
<GhostWord C={C as any} word="KŌDA" style={{ fontSize: 160, top: "50%", left: "50%", transform: "translate(-50%, -50%)", opacity: 0.04 }} />

// Hero content — centered lockup
<div style={{ position: "relative", zIndex: 2, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 16 }}>
  <KodaMark size={40} color={C.text} />
  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
    <span style={{ fontFamily: DISPLAY, fontSize: 36, fontWeight: 600, letterSpacing: "0.22em", color: C.text }}>Kōda</span>
    <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.16em", border: `1px solid ${C.border2}`, borderRadius: 5, padding: "2px 6px", color: C.text2 }}>OS</span>
  </div>
  <div style={{ fontFamily: DISPLAY, fontSize: 15, color: C.text2, letterSpacing: "0.04em", maxWidth: 280, lineHeight: 1.6 }}>
    The trading journal built for <em style={{ color: C.live, fontStyle: "italic" }}>edge</em>, not just entries.
  </div>
</div>
```

- [ ] **Step 3: Apply sign-in card design (koda-marketing.jsx SignInCard)**

Find the auth form container card. Apply:
```tsx
style={{
  width: "min(400px, 92vw)", borderRadius: 24,
  background: (C as any).surfaceGlass ?? C.panel,
  backdropFilter: "blur(28px) saturate(180%)",
  WebkitBackdropFilter: "blur(28px) saturate(180%)",
  border: `1px solid ${C.border2}`,
  padding: "28px 24px 24px",
  boxShadow: "0 16px 40px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.04)",
  animation: "kRise 0.42s ease-out",
  position: "relative", zIndex: 2,
}}
```

Add kicker above form title:
```tsx
<Kicker C={C as any} style={{ marginBottom: 6 }}>Sign in to Kōda</Kicker>
```

- [ ] **Step 4: Build**

```
npm run build
```

- [ ] **Step 5: Commit**

```
git add src/KodaAuth.tsx
git commit -m "feat: KodaAuth landing hero + sign-in card visual pass (Phase F)"
```

---

## Task 12 — DataSourcesScreen visual pass (Sync tab)

**Files:**
- Modify: `src/DataSourcesScreen.tsx`

- [ ] **Step 1: Import atoms**

```tsx
import { Kicker, Card, MONO, DISPLAY, ErrorSyncFailedState } from "./shared";
```

- [ ] **Step 2: Apply broker card layout (koda-mobile3 BrokersScreen)**

Find where each broker connection is rendered. Replace with:
```tsx
<div style={{
  borderRadius: 18, border: `1px solid ${C.border2}`,
  background: C.panel, padding: "16px 18px",
  display: "flex", alignItems: "center", gap: 14, marginBottom: 10,
}}>
  {/* broker logo placeholder */}
  <div style={{ width: 44, height: 44, borderRadius: 12, background: C.panel2, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
    <span style={{ fontFamily: MONO, fontSize: 10, color: C.text2, letterSpacing: "0.06em" }}>{broker.name.slice(0,3).toUpperCase()}</span>
  </div>
  <div style={{ flex: 1, minWidth: 0 }}>
    <div style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 600, color: C.text }}>{broker.name}</div>
    <div style={{ fontFamily: MONO, fontSize: 10, color: broker.sync_status === "error" ? C.red : broker.sync_status === "ok" ? C.green : C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2 }}>
      {broker.sync_status === "ok" ? "● Syncing" : broker.sync_status === "error" ? "● Error" : "○ Not connected"}
    </div>
  </div>
  {/* action button */}
</div>
```

For brokers with `sync_status === "error"`, render `<ErrorSyncFailedState>` below the card.

- [ ] **Step 3: Apply CSV preset grid**

Find the CSV import presets. Wrap in a grid:
```tsx
<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 8, marginBottom: 20 }}>
  {PRESETS.map(p => (
    <button key={p.id} onClick={() => selectPreset(p)} style={{
      padding: "12px 14px", borderRadius: 14, background: selected === p.id ? `${C.live}18` : C.panel,
      border: `1px solid ${selected === p.id ? C.live : C.border2}`,
      fontFamily: MONO, fontSize: 11, color: selected === p.id ? C.live : C.text2,
      letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer", textAlign: "left",
    }}>{p.label}</button>
  ))}
</div>
```

- [ ] **Step 4: Build**

```
npm run build
```

- [ ] **Step 5: Commit**

```
git add src/DataSourcesScreen.tsx
git commit -m "feat: DataSourcesScreen broker card layout + CSV preset grid visual pass"
```

---

## Task 13 — App icon set regeneration (F10)

**Files:**
- Modify: `public/icon.svg`, `public/favicon.svg`, `public/apple-touch-icon.svg`, `public/icon-maskable.svg`, `public/manifest.webmanifest`

Canonical recipe from README §3.5:
- Mark: 4 chevrons, stroked, `viewBox="0 0 100 80"`, x positions 8/28/48/68, y span 8–72
- Stroke: `#F2F2EE` (t.ink dark), width 1.6 in-app / 3.0 on launcher icons
- Launcher icons: rounded square, rx=22.5% of side (= `rx="22.5"`on 100×100), bg `#0A0A0B`
- No "tr" letters anywhere

- [ ] **Step 1: Regenerate icon.svg (in-app, no background)**

Replace `public/icon.svg` with:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 80" width="100" height="80" fill="none">
  <polyline points="8,8 22,40 8,72" stroke="#F2F2EE" stroke-width="1.6" stroke-linejoin="miter" fill="none"/>
  <polyline points="28,8 42,40 28,72" stroke="#F2F2EE" stroke-width="1.6" stroke-linejoin="miter" fill="none"/>
  <polyline points="48,8 62,40 48,72" stroke="#F2F2EE" stroke-width="1.6" stroke-linejoin="miter" fill="none"/>
  <polyline points="68,8 82,40 68,72" stroke="#F2F2EE" stroke-width="1.6" stroke-linejoin="miter" fill="none"/>
</svg>
```

- [ ] **Step 2: Regenerate favicon.svg (with rounded square bg for readability at 16px)**

Replace `public/favicon.svg` with:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="32" height="32">
  <rect width="100" height="100" rx="22.5" fill="#0A0A0B"/>
  <polyline points="12,14 24,50 12,86" stroke="#F2F2EE" stroke-width="3" stroke-linejoin="miter" fill="none"/>
  <polyline points="29,14 41,50 29,86" stroke="#F2F2EE" stroke-width="3" stroke-linejoin="miter" fill="none"/>
  <polyline points="46,14 58,50 46,86" stroke="#F2F2EE" stroke-width="3" stroke-linejoin="miter" fill="none"/>
  <polyline points="63,14 75,50 63,86" stroke="#F2F2EE" stroke-width="3" stroke-linejoin="miter" fill="none"/>
</svg>
```

- [ ] **Step 3: Regenerate apple-touch-icon.svg**

Replace `public/apple-touch-icon.svg` with the same rounded-square recipe as favicon, width/height="180".

- [ ] **Step 4: Regenerate icon-maskable.svg**

Replace `public/icon-maskable.svg` with the rounded-square recipe, width/height="512", ensuring safe-zone margins (~10% on each side).

- [ ] **Step 5: Commit**

```
git add public/icon.svg public/favicon.svg public/apple-touch-icon.svg public/icon-maskable.svg
git commit -m "feat: regenerate all icons to 4-chevron mark, no 'tr' letters (F10)"
```

---

## Task 14 — OG share card (F9)

**Files:**
- Modify: `public/og-image.svg`

- [ ] **Step 1: Regenerate og-image.svg from OGCard design**

Replace `public/og-image.svg` with (1200×630, dark variant, "TRADE SMARTER." tagline):
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <radialGradient id="orb1" cx="20%" cy="40%" r="50%"><stop offset="0%" stop-color="oklch(0.55 0.22 252)" stop-opacity="0.5"/><stop offset="100%" stop-color="transparent"/></radialGradient>
    <radialGradient id="orb2" cx="80%" cy="60%" r="40%"><stop offset="0%" stop-color="oklch(0.68 0.18 175)" stop-opacity="0.35"/><stop offset="100%" stop-color="transparent"/></radialGradient>
  </defs>
  <!-- Background -->
  <rect width="1200" height="630" fill="#0A0A0B"/>
  <!-- Ambient orbs -->
  <rect width="1200" height="630" fill="url(#orb1)"/>
  <rect width="1200" height="630" fill="url(#orb2)"/>
  <!-- 4-chevron mark, large -->
  <g transform="translate(96, 215) scale(1.8)" stroke="#F2F2EE" stroke-width="1.6" stroke-linejoin="miter" fill="none">
    <polyline points="8,8 22,40 8,72"/>
    <polyline points="28,8 42,40 28,72"/>
    <polyline points="48,8 62,40 48,72"/>
    <polyline points="68,8 82,40 68,72"/>
  </g>
  <!-- Wordmark -->
  <text x="96" y="430" font-family="Geist, Inter, system-ui, sans-serif" font-size="72" font-weight="600" letter-spacing="14" fill="#F2F2EE">Kōda</text>
  <!-- OS badge outline -->
  <rect x="98" y="446" width="54" height="22" rx="4" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="1"/>
  <text x="125" y="461" font-family="'Geist Mono', monospace" font-size="11" font-weight="500" letter-spacing="2" fill="#A6A6A2" text-anchor="middle">OS</text>
  <!-- Tagline -->
  <text x="96" y="540" font-family="'Geist Mono', monospace" font-size="22" font-weight="500" letter-spacing="6" fill="oklch(0.84 0.14 175)">TRADE SMARTER.</text>
  <!-- Ghost word -->
  <text x="680" y="540" font-family="Geist, sans-serif" font-size="320" font-weight="700" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="1" letter-spacing="-10">EDGE</text>
</svg>
```

- [ ] **Step 2: Commit**

```
git add public/og-image.svg
git commit -m "feat: regenerate og-image.svg from OGCard design spec (F9)"
```

---

## Task 15 — Static marketing pages (F8)

**Files:**
- Create: `public/faq.html`, `public/changelog.html`, `public/404.html`

- [ ] **Step 1: Create public/faq.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FAQ · Kōda</title>
  <link rel="icon" href="/favicon.svg" />
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0A0A0B;color:#F2F2EE;font-family:'Geist',system-ui,sans-serif;min-height:100dvh;padding:48px 24px 80px;max-width:720px;margin:0 auto}
    a{color:oklch(0.84 0.14 175);text-decoration:none}
    a:hover{text-decoration:underline}
    .kicker{font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#65655F;margin-bottom:8px}
    h1{font-size:40px;font-weight:600;letter-spacing:-0.02em;margin-bottom:8px}
    .sub{font-size:15px;color:#A6A6A2;margin-bottom:48px;line-height:1.6}
    .q{font-size:16px;font-weight:600;color:#F2F2EE;margin:32px 0 8px}
    .a{font-size:14px;color:#A6A6A2;line-height:1.7}
    .back{display:inline-flex;align-items:center;gap:6px;font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:0.10em;text-transform:uppercase;color:#A6A6A2;margin-bottom:40px}
    hr{border:none;border-top:1px solid rgba(255,255,255,0.07);margin:48px 0}
  </style>
</head>
<body>
  <a class="back" href="/">← Back to Kōda</a>
  <p class="kicker">FAQ</p>
  <h1>Frequently asked questions.</h1>
  <p class="sub">Everything you need to know about Kōda.</p>

  <div class="q">What is Kōda?</div>
  <div class="a">Kōda is an AI-powered trading journal for serious traders. It tracks your P&amp;L, win rate, R-multiples, and discipline so you can find your edge — not just your entries.</div>

  <div class="q">Is my trade data private?</div>
  <div class="a">Yes. Your trade data is stored in your private Supabase database and is never shared or sold. Row-level security ensures only you can read your trades.</div>

  <div class="q">What's the difference between Free and Pro?</div>
  <div class="a">Free gives you unlimited manual trade logging, basic stats, and one circle. Pro adds auto-import via Tradovate, unlimited circles, the prop firm tracker, Kōda AI insights, and priority support.</div>

  <div class="q">How do I import trades from my broker?</div>
  <div class="a">Go to Home → Sync. You can connect Tradovate for live auto-import, or upload a CSV export from any platform — Kōda auto-detects the format.</div>

  <div class="q">Does Kōda support futures?</div>
  <div class="a">Yes. The Lot Size Calculator includes full specs for ES, NQ, MES, MNQ, CL, GC, and more. The journal tracks R-multiples and P&amp;L for both futures and forex.</div>

  <div class="q">How do Circles work?</div>
  <div class="a">Circles are private groups where traders share journals, run challenges, and compare stats. You can join by code or discover public circles. Free users get one circle; Pro unlocks unlimited.</div>

  <div class="q">Can I cancel my Pro subscription?</div>
  <div class="a">Yes, any time from Settings → Billing. Your Pro access continues until the end of the billing period.</div>

  <hr/>
  <p style="font-family:'Geist Mono',monospace;font-size:11px;color:#45453F;letter-spacing:0.10em">Still have questions? <a href="mailto:dnyland420@gmail.com">Email us</a></p>
</body>
</html>
```

- [ ] **Step 2: Create public/changelog.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Changelog · Kōda</title>
  <link rel="icon" href="/favicon.svg" />
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0A0A0B;color:#F2F2EE;font-family:'Geist',system-ui,sans-serif;min-height:100dvh;padding:48px 24px 80px;max-width:720px;margin:0 auto}
    a{color:oklch(0.84 0.14 175);text-decoration:none}
    .kicker{font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#65655F;margin-bottom:8px}
    h1{font-size:40px;font-weight:600;letter-spacing:-0.02em;margin-bottom:8px}
    .sub{font-size:15px;color:#A6A6A2;margin-bottom:48px;line-height:1.6}
    .entry{margin-bottom:48px}
    .entry-date{font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#65655F;margin-bottom:6px}
    .entry-title{font-size:22px;font-weight:600;letter-spacing:-0.01em;margin-bottom:12px}
    .entry ul{list-style:none;padding:0;display:flex;flex-direction:column;gap:8px}
    .entry li{font-size:14px;color:#A6A6A2;line-height:1.6;padding-left:18px;position:relative}
    .entry li::before{content:"→";position:absolute;left:0;color:oklch(0.84 0.14 175)}
    .tag{display:inline-block;padding:2px 8px;border-radius:999px;font-family:'Geist Mono',monospace;font-size:9px;letter-spacing:0.10em;text-transform:uppercase;border:1px solid;margin-right:6px;vertical-align:middle}
    .tag.new{color:oklch(0.84 0.14 175);border-color:oklch(0.84 0.14 175 / 0.4)}
    .tag.fix{color:#f59e0b;border-color:rgba(245,158,11,0.4)}
    .tag.improved{color:oklch(0.74 0.16 250);border-color:oklch(0.74 0.16 250 / 0.4)}
    .back{display:inline-flex;align-items:center;gap:6px;font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:0.10em;text-transform:uppercase;color:#A6A6A2;margin-bottom:40px}
    hr{border:none;border-top:1px solid rgba(255,255,255,0.07);margin:0 0 48px}
  </style>
</head>
<body>
  <a class="back" href="/">← Back to Kōda</a>
  <p class="kicker">Changelog</p>
  <h1>What's new.</h1>
  <p class="sub">Every update, shipped by one founder at 2am.</p>

  <div class="entry">
    <div class="entry-date">May 2026</div>
    <div class="entry-title">Kōda v2 — The visual pass</div>
    <hr/>
    <ul>
      <li><span class="tag new">New</span> Full Kōda visual system — OKLCH palette, Geist type, glass surfaces, orb blooms</li>
      <li><span class="tag new">New</span> Mistake tag field — log what went wrong, get monthly rollups</li>
      <li><span class="tag new">New</span> Prop firm mode — balance, profit target, daily loss, and drawdown tracker</li>
      <li><span class="tag new">New</span> Circles improvements — challenges, shared trades, chat</li>
      <li><span class="tag new">New</span> Desktop layout — 4-tier responsive scaling</li>
      <li><span class="tag improved">Improved</span> Trade celebrations — confetti on log, streak milestones, Pro upgrade</li>
      <li><span class="tag improved">Improved</span> Empty states — every screen has a proper empty/loading/error treatment</li>
      <li><span class="tag fix">Fix</span> Kōda rebrand complete — all user-visible TRADR strings updated</li>
    </ul>
  </div>

  <div class="entry">
    <div class="entry-date">April 2026</div>
    <div class="entry-title">Circles + live sync</div>
    <hr/>
    <ul>
      <li><span class="tag new">New</span> Trading Circles — share journals, run challenges, post trades</li>
      <li><span class="tag new">New</span> Tradovate live sync — real-time trade import</li>
      <li><span class="tag new">New</span> Rule engine — define and track your trading rules</li>
      <li><span class="tag new">New</span> Emotional state tags — log how you felt on each trade</li>
      <li><span class="tag improved">Improved</span> CSV parser — supports Tradovate, Rithmic, TopstepX, FTMO</li>
    </ul>
  </div>
</body>
</html>
```

- [ ] **Step 3: Create public/404.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>404 · Kōda</title>
  <link rel="icon" href="/favicon.svg" />
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0A0A0B;color:#F2F2EE;font-family:'Geist',system-ui,sans-serif;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px 24px;position:relative;overflow:hidden}
    .orb{position:absolute;border-radius:50%;pointer-events:none}
    .kicker{font-family:'Geist Mono',monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#65655F;margin-bottom:12px}
    .ghost{position:absolute;font-size:320px;font-weight:700;color:transparent;-webkit-text-stroke:1px rgba(255,255,255,0.03);letter-spacing:-0.04em;font-family:'Geist',sans-serif;user-select:none;pointer-events:none}
    h1{font-size:64px;font-weight:700;letter-spacing:-0.04em;line-height:1;margin-bottom:16px}
    p{font-size:15px;color:#A6A6A2;max-width:320px;line-height:1.6;margin-bottom:32px}
    a{display:inline-block;padding:13px 28px;border-radius:999px;background:#F2F2EE;color:#0A0A0B;font-family:'Geist Mono',monospace;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none}
  </style>
</head>
<body>
  <div class="orb" style="width:400px;height:400px;top:-80px;left:-100px;background:radial-gradient(circle,oklch(0.55 0.22 252 / 0.35),transparent)"></div>
  <div class="orb" style="width:300px;height:300px;bottom:-60px;right:-80px;background:radial-gradient(circle,oklch(0.68 0.18 175 / 0.25),transparent)"></div>
  <div class="ghost">404</div>
  <p class="kicker">Page not found</p>
  <h1>404</h1>
  <p>This page doesn't exist or has moved. Head back to start trading.</p>
  <a href="/">Go to Kōda →</a>
</body>
</html>
```

- [ ] **Step 4: Commit**

```
git add public/faq.html public/changelog.html public/404.html
git commit -m "feat: add /faq, /changelog, /404 static pages (F8)"
```

---

## Task 16 — Email helper + weekly recap cron (F6)

**Files:**
- Create: `api/lib/email.ts`, `api/cron/weekly-recap.ts`
- Modify: `vercel.json`, `.env.example`

- [ ] **Step 1: Create api/lib/email.ts**

```ts
// api/lib/email.ts
// Resend-based email helper for Kōda transactional emails.

const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
const FROM = "Kōda <noreply@tradrjournal.xyz>";

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not set");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
  return res.json();
}

export function weeklyRecapHtml({
  name, netR, winRate, bestSetup, tradeCount, weekLabel,
}: { name: string; netR: number; winRate: number; bestSetup: string; tradeCount: number; weekLabel: string }) {
  const positive = netR >= 0;
  const color = positive ? "oklch(0.78 0.18 152)" : "oklch(0.70 0.21 25)";
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Kōda Weekly Recap</title></head>
<body style="margin:0;padding:0;background:#0A0A0B;font-family:system-ui,sans-serif;color:#F2F2EE">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:40px 24px">
    <tr><td>
      <p style="font-family:monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#65655F;margin:0 0 8px">${weekLabel} · Weekly Recap</p>
      <p style="font-size:28px;font-weight:600;letter-spacing:-0.02em;margin:0 0 32px">Your week in review, ${name}.</p>
      <table width="100%" cellpadding="16" style="background:#131317;border-radius:16px;border:1px solid rgba(255,255,255,0.07);margin-bottom:24px">
        <tr>
          <td style="text-align:center;border-right:1px solid rgba(255,255,255,0.07)">
            <p style="font-family:monospace;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#65655F;margin:0 0 6px">Net R</p>
            <p style="font-size:32px;font-weight:600;color:${color};margin:0">${positive ? "+" : ""}${netR.toFixed(1)}R</p>
          </td>
          <td style="text-align:center;border-right:1px solid rgba(255,255,255,0.07)">
            <p style="font-family:monospace;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#65655F;margin:0 0 6px">Win Rate</p>
            <p style="font-size:32px;font-weight:600;color:#F2F2EE;margin:0">${winRate}%</p>
          </td>
          <td style="text-align:center">
            <p style="font-family:monospace;font-size:9px;letter-spacing:0.14em;text-transform:uppercase;color:#65655F;margin:0 0 6px">Trades</p>
            <p style="font-size:32px;font-weight:600;color:#F2F2EE;margin:0">${tradeCount}</p>
          </td>
        </tr>
      </table>
      ${bestSetup ? `<p style="font-size:13px;color:#A6A6A2;margin:0 0 32px">Best setup this week: <strong style="color:#F2F2EE">${bestSetup}</strong></p>` : ""}
      <a href="https://tradrjournal.xyz" style="display:inline-block;padding:12px 26px;border-radius:999px;background:#F2F2EE;color:#0A0A0B;font-family:monospace;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none">Open Kōda →</a>
      <p style="font-size:11px;color:#45453F;margin-top:40px">You're receiving this because weekly recaps are on in your settings. <a href="https://tradrjournal.xyz" style="color:#65655F">Unsubscribe</a></p>
    </td></tr>
  </table>
</body></html>`;
}

export function receiptHtml({ name, plan, amount, date }: { name: string; plan: string; amount: string; date: string }) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><title>Receipt · Kōda</title></head>
<body style="margin:0;padding:0;background:#0A0A0B;font-family:system-ui,sans-serif;color:#F2F2EE">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;padding:40px 24px">
    <tr><td>
      <p style="font-family:monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#65655F;margin:0 0 8px">Payment receipt</p>
      <p style="font-size:26px;font-weight:600;letter-spacing:-0.02em;margin:0 0 32px">Thanks, ${name}.</p>
      <table width="100%" cellpadding="14" style="background:#131317;border-radius:14px;border:1px solid rgba(255,255,255,0.07);margin-bottom:24px">
        <tr><td style="font-size:13px;color:#A6A6A2;border-bottom:1px solid rgba(255,255,255,0.07)">Plan</td><td style="font-size:13px;color:#F2F2EE;text-align:right;border-bottom:1px solid rgba(255,255,255,0.07)">Kōda ${plan}</td></tr>
        <tr><td style="font-size:13px;color:#A6A6A2;border-bottom:1px solid rgba(255,255,255,0.07)">Amount</td><td style="font-size:13px;color:#F2F2EE;text-align:right;border-bottom:1px solid rgba(255,255,255,0.07)">${amount}</td></tr>
        <tr><td style="font-size:13px;color:#A6A6A2">Date</td><td style="font-size:13px;color:#F2F2EE;text-align:right">${date}</td></tr>
      </table>
      <a href="https://tradrjournal.xyz" style="display:inline-block;padding:12px 26px;border-radius:999px;background:#F2F2EE;color:#0A0A0B;font-family:monospace;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none">Open Kōda →</a>
    </td></tr>
  </table>
</body></html>`;
}
```

- [ ] **Step 2: Create api/cron/weekly-recap.ts**

```ts
// api/cron/weekly-recap.ts
// Runs Sunday 20:00 UTC — sends weekly recap email to each user with trades this week.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { sendEmail, weeklyRecapHtml } from "../lib/email";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  // Get the ISO week label (e.g. "Week 22")
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  const weekLabel = `${startOfWeek.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${endOfWeek.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  // Query all users who have weekly recap enabled (default true)
  const { data: profiles, error } = await supabase
    .from("user_kv")
    .select("user_id, value")
    .eq("key", "koda_profile")
    .not("value->>email", "is", null);

  if (error) return res.status(500).json({ error: error.message });

  let sent = 0;
  for (const row of profiles ?? []) {
    const profile = row.value as Record<string, any>;
    if (profile.email_weekly_recap === false) continue;
    if (!profile.email) continue;

    // Get this user's trades from the past 7 days
    const since = startOfWeek.toISOString().slice(0, 10);
    const { data: trades } = await supabase
      .from("user_kv")
      .select("value")
      .eq("user_id", row.user_id)
      .eq("key", "koda_trades")
      .maybeSingle();

    const allTrades: any[] = trades?.value ?? [];
    const weekTrades = allTrades.filter((t: any) => t.date >= since);
    if (weekTrades.length === 0) continue;

    const wins = weekTrades.filter((t: any) => t.outcome === "win").length;
    const winRate = Math.round((wins / weekTrades.length) * 100);
    const netR = weekTrades.reduce((s: number, t: any) => s + (t.rr ?? 0), 0);

    // Best setup by frequency
    const setupCounts: Record<string, number> = {};
    weekTrades.forEach((t: any) => { if (t.setup) setupCounts[t.setup] = (setupCounts[t.setup] ?? 0) + 1; });
    const bestSetup = Object.entries(setupCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

    try {
      await sendEmail({
        to: profile.email,
        subject: `Your Kōda recap: ${netR >= 0 ? "+" : ""}${netR.toFixed(1)}R this week`,
        html: weeklyRecapHtml({
          name: profile.name?.split(" ")[0] ?? "Trader",
          netR: parseFloat(netR.toFixed(1)),
          winRate,
          bestSetup,
          tradeCount: weekTrades.length,
          weekLabel,
        }),
      });
      sent++;
    } catch (e) {
      console.error("Email send failed for user", row.user_id, e);
    }
  }

  return res.status(200).json({ sent });
}
```

- [ ] **Step 3: Add weekly-recap to vercel.json**

In `vercel.json`, in the `"crons"` array, add:
```json
{
  "path": "/api/cron/weekly-recap",
  "schedule": "0 20 * * 0"
}
```

- [ ] **Step 4: Update .env.example**

Create or update `.env.example` (add the Resend key):
```
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- [ ] **Step 5: Build**

```
npm run build && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```
git add api/lib/email.ts api/cron/weekly-recap.ts vercel.json
git commit -m "feat: weekly recap email cron via Resend (F6)"
```

---

## Task 17 — Receipt email via Stripe webhook (F7)

**Files:**
- Modify: `api/stripe-webhook.ts`

- [ ] **Step 1: Import email helper**

At the top of `api/stripe-webhook.ts`, add:
```ts
import { sendEmail, receiptHtml } from "./lib/email";
```

- [ ] **Step 2: Handle invoice.paid event**

In the webhook switch/if block that handles Stripe events, add a case for `invoice.paid`:
```ts
if (event.type === "invoice.paid") {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId = invoice.customer as string;

  // Look up user by Stripe customer ID in user_kv
  const { data: kvRow } = await supabaseAdmin
    .from("user_kv")
    .select("user_id, value")
    .eq("key", "koda_stripe_customer")
    .eq("value->>customerId", customerId)
    .maybeSingle();

  if (kvRow) {
    const { data: profileRow } = await supabaseAdmin
      .from("user_kv")
      .select("value")
      .eq("user_id", kvRow.user_id)
      .eq("key", "koda_profile")
      .maybeSingle();

    const profile = profileRow?.value as Record<string, any> | undefined;
    if (profile?.email) {
      const amount = `$${(invoice.amount_paid / 100).toFixed(2)}`;
      const date = new Date(invoice.created * 1000).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
      const plan = profile.plan === "elite" ? "Elite" : "Pro";
      await sendEmail({
        to: profile.email,
        subject: `Receipt from Kōda — ${amount}`,
        html: receiptHtml({ name: profile.name?.split(" ")[0] ?? "Trader", plan, amount, date }),
      });
    }
  }
}
```

- [ ] **Step 3: Build**

```
npm run build && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```
git add api/stripe-webhook.ts
git commit -m "feat: receipt email on invoice.paid via Resend (F7)"
```

---

## Task 18 — Web push notifications (F5)

**Files:**
- Create: `api/push/subscribe.ts`, `api/push/send.ts`, `supabase/migrations/20260526_push_subscriptions.sql`
- Modify: `src/sw.ts`, `src/SettingsScreen.tsx`, `vercel.json`

This feature requires `web-push` as a dependency. Install it:
```
npm install web-push
npm install --save-dev @types/web-push
```

And generate VAPID keys (run once, save to Vercel env vars):
```
npx web-push generate-vapid-keys
```

- [ ] **Step 1: Create Supabase migration**

Create `supabase/migrations/20260526_push_subscriptions.sql`:
```sql
CREATE TABLE IF NOT EXISTS public.notification_subscriptions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    text        NOT NULL,
  p256dh      text        NOT NULL,
  auth_key    text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

ALTER TABLE public.notification_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_sub_select" ON public.notification_subscriptions;
CREATE POLICY "push_sub_select" ON public.notification_subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "push_sub_insert" ON public.notification_subscriptions;
CREATE POLICY "push_sub_insert" ON public.notification_subscriptions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "push_sub_delete" ON public.notification_subscriptions;
CREATE POLICY "push_sub_delete" ON public.notification_subscriptions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

GRANT SELECT, INSERT, DELETE ON public.notification_subscriptions TO service_role;
```

- [ ] **Step 2: Create api/push/subscribe.ts**

```ts
// api/push/subscribe.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "No token" });

  const { data: { user }, error: authErr } = await createClient(
    process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!
  ).auth.getUser(auth.slice(7));
  if (authErr || !user) return res.status(401).json({ error: "Invalid token" });

  const { endpoint, keys } = req.body as { endpoint: string; keys: { p256dh: string; auth: string } };
  if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ error: "Invalid subscription" });

  const { error } = await supabase.from("notification_subscriptions").upsert({
    user_id: user.id, endpoint, p256dh: keys.p256dh, auth_key: keys.auth,
  }, { onConflict: "user_id,endpoint" });

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}
```

- [ ] **Step 3: Create api/push/send.ts**

```ts
// api/push/send.ts — send a push to a specific user (called internally)
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

webpush.setVapidDetails(
  `mailto:${process.env.VAPID_EMAIL}`,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function sendPushToUser(userId: string, payload: { title: string; body: string; icon?: string }) {
  const { data: subs } = await supabase
    .from("notification_subscriptions")
    .select("endpoint, p256dh, auth_key")
    .eq("user_id", userId);

  if (!subs?.length) return;

  await Promise.allSettled(subs.map(sub =>
    webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
      JSON.stringify({ ...payload, icon: payload.icon ?? "/icon-192.png" })
    )
  ));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const { userId, title, body } = req.body as { userId: string; title: string; body: string };
  if (!userId || !title) return res.status(400).json({ error: "Missing fields" });
  await sendPushToUser(userId, { title, body });
  return res.status(200).json({ ok: true });
}
```

- [ ] **Step 4: Add push handlers to sw.ts**

At the end of `src/sw.ts`, before the closing comment if any, add:
```ts
// ── Web push ────────────────────────────────────────────────────────────────
declare const self: ServiceWorkerGlobalScope;

self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;
  const data = event.data.json() as { title: string; body: string; icon?: string };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon ?? "/icon-192.png",
      badge: "/icon-192.png",
    })
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  event.waitUntil(
    (self.clients as Clients).matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      if (list.length > 0) return list[0].focus();
      return (self.clients as Clients).openWindow("/");
    })
  );
});
```

- [ ] **Step 5: Add subscription UI to SettingsScreen.tsx**

Find the Notifications section in `src/SettingsScreen.tsx`. Add a push subscription toggle row:
```tsx
{/* Push notifications toggle */}
{("serviceWorker" in navigator && "PushManager" in window) && (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
    <div>
      <div style={{ fontFamily: BODY, fontSize: 14, color: C.text }}>Push notifications</div>
      <div style={{ fontFamily: MONO, fontSize: 10, color: C.muted, letterSpacing: "0.08em", marginTop: 2 }}>New circle activity, AI insights</div>
    </div>
    <button
      onClick={async () => {
        if (!session?.access_token) return;
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
        });
        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify(sub.toJSON()),
        });
        showToast("Push notifications enabled");
      }}
      style={{ padding: "8px 14px", borderRadius: 999, background: C.live, color: "#0A0A0A", border: "none", fontFamily: MONO, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" as const, cursor: "pointer" }}
    >Enable</button>
  </div>
)}
```

- [ ] **Step 6: Add VAPID public key to index.html meta (optional, for clarity)**

In `index.html`, add:
```html
<meta name="vapid-public-key" content="" />
```
(Leave empty — the actual key is set via `VITE_VAPID_PUBLIC_KEY` env var at build time.)

Update `.env.example`:
```
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_EMAIL=mailto:dnyland420@gmail.com
VITE_VAPID_PUBLIC_KEY=your_vapid_public_key
```

- [ ] **Step 7: Build**

```
npm run build && npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```
git add api/push/ src/sw.ts src/SettingsScreen.tsx supabase/migrations/20260526_push_subscriptions.sql vercel.json
git commit -m "feat: web push notifications — subscribe endpoint, sw handlers, settings toggle (F5)"
```

---

## Task 19 — ProfileModal, UpgradeModal, OnboardingFlow visual pass

**Files:**
- Modify: `src/ProfileModal.tsx`, `src/UpgradeModal.tsx`, `src/OnboardingFlow.tsx`

- [ ] **Step 1: ProfileModal — import atoms and apply**

In `src/ProfileModal.tsx`, import `Kicker, MONO, DISPLAY, GlassOrb` from `./shared`.

Apply to the modal wrapper:
```tsx
style={{
  borderRadius: 24, background: C.panel, border: `1px solid ${C.border2}`,
  padding: "28px 22px", position: "relative", overflow: "hidden",
  animation: "kRise 0.42s ease-out",
}}
```

Add `<GlassOrb>` ambient bloom and use `DISPLAY` for the user's name, `MONO` for their handle/stats.

- [ ] **Step 2: UpgradeModal — apply Pro upgrade screen design**

In `src/UpgradeModal.tsx`, confirm `KŌDA OS · PRO` kicker is present (it is — line 104). Apply the sheen animation to the PRO badge. The outer modal uses glass surface:
```tsx
style={{
  borderRadius: 24, background: (C as any).surfaceGlass ?? C.panel,
  backdropFilter: "blur(28px) saturate(180%)", WebkitBackdropFilter: "blur(28px) saturate(180%)",
  border: `1px solid ${C.border2}`, position: "relative", overflow: "hidden",
  animation: "kRise 0.42s ease-out",
}}
```

Add conic-gradient orb bloom behind the Pro badge:
```tsx
<div style={{ position: "absolute", top: 40, left: "50%", transform: "translateX(-50%)", width: 300, height: 300, borderRadius: "50%", background: `conic-gradient(from 180deg, ${orb1}, ${live}, ${orb3}, ${orb1})`, filter: "blur(80px)", opacity: 0.35, pointerEvents: "none" }} />
```

- [ ] **Step 3: OnboardingFlow — verify MONO + DISPLAY**

Open `src/OnboardingFlow.tsx`. Find the step label (e.g., "Step 1 of 2") and ensure it uses `MONO`:
```tsx
<div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: C.muted }}>Step {step + 1} of {totalSteps}</div>
```

Find the step title and ensure it uses `DISPLAY`:
```tsx
<div style={{ fontFamily: DISPLAY, fontSize: 26, fontWeight: 600, letterSpacing: "-0.02em" }}>...</div>
```

- [ ] **Step 4: Build**

```
npm run build
```

- [ ] **Step 5: Commit**

```
git add src/ProfileModal.tsx src/UpgradeModal.tsx src/OnboardingFlow.tsx
git commit -m "feat: ProfileModal/UpgradeModal/OnboardingFlow visual passes"
```

---

## Task 20 — Sanity pass (Phase I)

**Files:**
- All (read-only audit + fixes)

- [ ] **Step 1: TypeScript check**

```
npx tsc --noEmit
```
Fix any new type errors before continuing.

- [ ] **Step 2: Lint**

```
npm run lint
```
Fix errors; ignore style-only warnings.

- [ ] **Step 3: Full build**

```
npm run build
```
Must produce zero errors and zero warnings about missing exports.

- [ ] **Step 4: Smoke test checklist**

Open the preview URL on mobile (iPhone or DevTools mobile emulation). Check:
- [ ] Home → hero card renders with GlassOrb bloom, GhostWord "EDGE"
- [ ] Log tab → emotion chips render, rule adherence two-pill control works
- [ ] History tab with 0 trades → `EmptyTradesState` renders, not blank
- [ ] Stats tab with 0 trades → existing `EmptyState` renders
- [ ] Circles with 0 circles → `EmptyCirclesState` renders
- [ ] Save a trade → `CelebrationOverlay` `kind="trade"` fires and auto-dismisses in 2.5s
- [ ] Disconnect WiFi in DevTools → `ErrorOfflineState` overlay appears; reconnect → dismisses
- [ ] Open LotSizeCalculator → `kDrawer` slide-up animation plays
- [ ] Resize from 375px → 1440px → no horizontal scroll, no layout breaks
- [ ] Bottom nav pill stays above iOS home indicator (safe-area-inset-bottom)
- [ ] `/faq` and `/changelog` and `/404` load without app JS

- [ ] **Step 5: Commit any sanity fixes**

```
git add -p
git commit -m "fix: sanity pass corrections"
```

---

## Task 21 — PR (Phase J)

- [ ] **Step 1: Final build + type check**

```
npm run build && npx tsc --noEmit
```

- [ ] **Step 2: Push branch**

```
git push -u origin feat/koda-visual-pass-v2
```

- [ ] **Step 3: Open PR**

Title: `feat: Kōda visual pass v2 + launch-ready surfaces`

Body:
```
## Summary
- Visual system applied to all screens (glass surfaces, OKLCH palette, Geist type, orb blooms, ghost words)
- 9 design-spec keyframes added (kRise, kCount, kStreakGlow, kTick, kDrawer, kRipple, kShimmer, kConfettiA, kSheen)
- Trade/streak/Pro celebration overlays
- Empty + skeleton + error states for all screens; offline detection shell
- Weekly recap email (Resend, Sundays 20:00 UTC) + receipt email on invoice.paid
- Web push: service worker handlers, subscribe endpoint, settings toggle
- App icon set regenerated — 4-chevron mark, no "tr" letters
- OG card regenerated from design spec
- /faq, /changelog, /404 static pages
- LotSizeCalculator kDrawer animation + glass header
- ReviewInboxScreen mint-dot + draft-pill rows
- KodaAuth landing hero + sign-in card visual pass

## Notes
- RESEND_API_KEY + VAPID_* must be added to Vercel env before email/push features activate
- `notification_subscriptions` migration must be run in Supabase SQL Editor
- Stripe "Send email receipts" should be disabled in the Stripe dashboard after this deploys (custom receipts now handled by api/stripe-webhook.ts)

References: design handoff README 2026-05-21
```

---

*Plan created 2026-05-26. Design source: `/tmp/design_extracted/kodaos/project/design_handoff_koda_redesign/README.md`.*
