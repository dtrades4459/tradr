# Kōda UI/UX Audit
_Generated 2026-05-27 — read-only code inspection. No files were modified._

---

## 1. Executive Summary — Top 5 Issues

These are the five findings most damaging to the **in-session behavioural intervention** thesis.

| Rank | Issue | Why it matters |
|------|-------|----------------|
| 1 | **Daily loss limit is not a live UI element** | The limit is a settings field. There is no dashboard widget, no progress bar, no colour escalation, and no warning when the user approaches or breaches it. A prop trader in-session has no way to see their exposure without navigating away from their current screen. |
| 2 | **Discipline score is captured but never shown** | `ruleAdherence` (YES/NO) is stored per trade but never aggregated, never displayed on stats, and never referenced in the UI after submission. The data exists; the product value does not. |
| 3 | **Zero pre-trade friction** | The user can log any trade in 2 taps with no system prompt, no rules check, no max-trades warning, and no checklist confirmation. "In-session intervention" requires at least one checkpoint before a trade is committed. |
| 4 | **Post-loss UX is identical to post-win UX** | The `CelebrationOverlay` fires after every trade regardless of outcome sign. A user who just took their third consecutive loss sees the same neutral overlay as a user who hit a new streak high. No cooldown, no escalation, no acknowledgement that something went wrong. |
| 5 | **Prop Firm Mode has no runtime UI** | `propFirmDailyLossLimit`, `propFirmProfitTarget`, and `propFirmMaxDrawdown` are stored but never rendered as live progress bars. The settings panel captures the numbers but the dashboard never uses them. A trader running an Apex evaluation has no in-app feedback on where they stand. |

---

## 2. Design System Drift

### 2.1 Colour

**Defined tokens (`src/theme.ts` — Dark mode):**

| Token | Value | Role |
|-------|-------|------|
| `bg` | `#0A0A0B` | Page background |
| `panel` | `#131317` | Card surface |
| `panel2` | `#1A1A20` | Elevated surface |
| `text` | `#F2F2EE` | Primary text |
| `text2` | `#A6A6A2` | Secondary text |
| `muted` | `#65655F` | Muted text, disabled |
| `dim` | `#45453F` | Tertiary / metadata |
| `accent` | `oklch(0.74 0.16 250)` | Electric blue — primary accent |
| `live` | `oklch(0.84 0.14 175)` | Mint — live/active indicator |
| `green` | `oklch(0.78 0.18 152)` | Win / positive |
| `red` | `oklch(0.70 0.21 25)` | Loss / negative |
| `warn` | `oklch(0.79 0.16 75)` | Warning / yellow |
| `border` | `rgba(255,255,255,0.07)` | Subtle border |
| `border2` | `rgba(255,255,255,0.12)` | Stronger border |

**Drift findings:**

| File | Issue | Severity |
|------|-------|----------|
| `src/BetaGate.tsx` | Hardcodes `#0A0A0B`, `#131317`, `rgba(255,255,255,0.07)` instead of importing from theme | Med |
| `src/DataSourcesScreen.tsx` | Defines its own `STATUS_COLOR` palette: `#22c55e`, `#f59e0b`, `#ef4444`, `#6b7280` — completely disconnected from theme tokens | Med |
| `src/LotSizeCalculator.tsx` | Mixes hardcoded `#f59e0b18` (amber glow) with theme tokens | Low |
| `src/theme.ts` | `accent` is `oklch(0.74 0.16 250)` (blue-violet); product brief says `#89CFF0` (baby blue). These are different colours. Needs design clarification. | High |

**Contrast risk:**
- `dim` (`#45453F`) on `bg` (`#0A0A0B`) ≈ 2.5:1 — **fails WCAG AA** (4.5:1 required for normal text). `dim` is used for metadata labels; verify this isn't used for body copy.

### 2.2 Typography

**Defined in `src/shared.tsx`:**

| Constant | Stack |
|----------|-------|
| `MONO` | `'Geist Mono', 'IBM Plex Mono', ui-monospace, monospace` |
| `BODY` | `'Geist', 'Inter', system-ui, sans-serif` |
| `DISPLAY` | `'Geist', 'Inter', system-ui, sans-serif` |

**Findings:**
- `DISPLAY` and `BODY` are identical stacks — the distinction is nominal. If Geist is the primary brand font, this is fine; if IBM Plex Mono is the stated primary, the stacks need reordering.
- `src/BetaGate.tsx` defines its own local `MONO`/`BODY` constants instead of importing from `shared.tsx`.
- All other files import from `shared.tsx`. Typography is otherwise consistent.

### 2.3 Font Size Scale

Distinct sizes in use:

| Range | Values | Assessment |
|-------|--------|------------|
| Micro | `8px`, `9px`, `10px` | Badge labels, metadata |
| Small | `11px`, `12px`, `13px` | Secondary copy, mono labels |
| Body | `14px`, `15px`, `16px` | Primary body |
| Large | `17px`, `18px`, `20px`, `22px`, `24px`, `26px`, `28px` | Headlines, stat values |
| Display | `42px`, `72px`, `80px` | Hero numbers, celebrations |
| Decorative | `200px` | Ghost watermark text |
| Responsive | `clamp(18px, 4vw, 22px)`, `clamp(32px, 8vw, 44px)` | Onboarding headings |

**Finding:** Scale is large (18+ distinct sizes) but purposeful. No obvious one-offs. Could be tightened to a stricter 8-step scale post-launch if desired.

### 2.4 Spacing Scale

Distinct values in use: `2, 3, 4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 60, 80px` plus responsive `clamp()` and `env(safe-area-inset-bottom)` usage.

**Finding:** Dense but consistent. No obvious outliers. Safe area inset is correctly applied to bottom nav.

### 2.5 Border Radius Scale

| Group | Values | Used for |
|-------|--------|---------|
| Tight | `3px`, `4px`, `6px`, `8px` | Badges, small chips |
| Medium | `10px`, `12px`, `14px`, `16px` | Input fields, inline cards |
| Large | `18px`, `22px`, `24px` | Modal panels, large cards |
| Full | `999px` | Pill buttons, avatars, circles |

**Finding:** Consistent hierarchy. No drift.

### 2.6 Shadows

- **System token:** `C.shadow` used for modal/card elevation — correct.
- **Ad-hoc:** Most shadows are inline `0 8px 24px ${C.shadow}` or `0 12px 36px rgba(0,0,0,0.4)`. Not from a token.
- **Glow effects:** `0 0 0 4px color-mix(in oklch, ${color} 25%, transparent)` — ad hoc but consistent pattern.
- **Finding:** Functional but not tokenised. Low priority to fix.

---

## 3. Findings by Section

### Section 2 — Component Variant Sprawl

#### Buttons (~9 distinct patterns)

| Pattern | Location | Issue |
|---------|----------|-------|
| Pill primary (full-width, `C.text` bg) | `shared.tsx`, `LogTradeScreen.tsx` | Main CTA — correct |
| Pill ghost (border only) | `shared.tsx`, `SettingsScreen.tsx` | Secondary CTA — correct |
| Segmented outcome button | `LogTradeScreen.tsx:34` | Win/Loss/BE selector — unique to this use case |
| Text + right-side icon CTA | `LogTradeScreen.tsx:324`, `UpgradeModal.tsx` | Should be a shared `ArrowCTA` component |
| Icon button 36×36 | `shared.tsx:678` | **Below 44px tap target** |
| Delete confirm (conditional red border) | `SettingsScreen.tsx:412` | One-off — acceptable |
| Follow button (profile modal) | `ProfileModal.tsx:117` | Should be extracted to a shared `FollowButton` |
| Gear toggle | `shared.tsx:368` | 44×44 — compliant |
| 9. Tab buttons (sub-nav) | `Koda.tsx` | Multiple inline patterns for the same nav concept |

**Recommendation:** Extract `ArrowCTA`, `FollowButton`, and tab button into shared components. Icon buttons should be 44×44 minimum.

#### Cards (~6 patterns)

Reasonable variety for different elevation levels. The `Card` component in `shared.tsx` is the correct base; most one-offs are additive not divergent. No urgent action.

#### Modals (3 patterns)

| Pattern | Used in |
|---------|---------|
| Bottom sheet (`borderRadius: 24px 24px 0 0`) | `ProfileModal.tsx` |
| Centered rise modal | `UpgradeModal.tsx`, `CelebrationOverlay` |
| Bottom drawer | `LotSizeCalculator.tsx` |

**Finding:** Three distinct modal patterns where one or two would suffice. Bottom sheet and bottom drawer are essentially the same pattern — should be unified into a single `BottomSheet` component.

#### Inputs (~7 patterns)

| Pattern | Note |
|---------|------|
| Base (border-bottom only) | Primary form input — correct |
| Select dropdown | Correctly styled with `WebkitAppearance: none` |
| Textarea | Extends base — correct |
| Hidden file input | Correct for image upload |
| Date input | Correctly typed |
| Delete confirm (conditional red) | One-off — acceptable |
| FloatingInput (label + action button) | Should be extracted to component |

No urgent action.

#### Tabs (3 patterns)

| Pattern | Used in | Issue |
|---------|---------|-------|
| Underline tab (mono, uppercase) | `FriendsFeed.tsx:76`, home sub-nav | Primary pattern — correct |
| Pill tabs | `LotSizeCalculator.tsx:196` | Diverges from underline pattern |
| Segment selector (not a real tab) | `TradingCircles.tsx` | Used for Win/Loss filter — correct context |

**Recommendation:** Unify to underline tab as the standard. Pill tabs in the calculator are acceptable in isolation.

---

### Section 3 — Mobile UX Fundamentals

| Issue | File | Line | Severity | Recommendation | Effort |
|-------|------|------|----------|----------------|--------|
| Icon buttons 36×36 (< 44px) | `shared.tsx` | 678 | High | Increase to 44×44 by adding `padding: 4px` | S |
| No `inputMode` on numeric inputs | `LogTradeScreen.tsx`, `LotSizeCalculator.tsx` | — | Med | Add `inputMode="decimal"` to P&L, price, size fields | S |
| No `autoComplete` on login fields | `KodaAuth.tsx` | — | Med | Add `autoComplete="username"` / `"current-password"` | S |
| No `maxLength` on free-text inputs | `LogTradeScreen.tsx`, `SettingsScreen.tsx` | — | Low | Add reasonable limits (notes: 500, bio: 160) | S |
| Horizontal scroll — story strip | `FriendsFeed.tsx` | 223 | Low | Intentional. Verify it has `scroll-snap` and no visual clipping | S |
| Labels are `<div>` not `<label htmlFor>` | All form screens | — | Med | Migrate to semantic `<label htmlFor>` + `id` pairs | M |

---

### Section 4 — State Coverage

| Component | Loading | Empty | Error | Offline | Success |
|-----------|---------|-------|-------|---------|---------|
| LogTradeScreen | ✅ (save disables form) | N/A | ❌ missing | ❌ missing | ✅ CelebrationOverlay |
| TradingCircles | ✅ skeleton | ✅ EmptyCirclesState | ⚠️ stale (no error shown) | ❌ missing | ✅ inline confirm |
| FriendsFeed | ✅ loading text | ✅ with CTA | ✅ inline msg | ❌ missing | ✅ follow confirm |
| SettingsScreen | ⚠️ no visual indicator | N/A | ✅ toast | ❌ missing | ✅ toast |
| OnboardingFlow | ✅ disables next | N/A | ✅ per-step | ❌ missing | ✅ step animation |
| DataSourcesScreen | ✅ spinners | ✅ add CTA | ✅ error cards | ✅ status badge | ✅ toast |
| ProfileModal | ✅ loading text | ✅ "not found" | ⚠️ fallback only | N/A | ✅ renders |
| charts.tsx | ❌ no skeleton | ✅ null/empty msg | ❌ no boundary | N/A | ✅ renders |

**Priority fixes:**
- LogTradeScreen needs an error state for failed submissions (toast is insufficient — user should see their trade data was not saved)
- Charts should render a skeleton or a graceful message while parent is loading
- Offline handling is absent everywhere — a single `useIsOnline` banner at the app shell level would cover all screens

---

### Section 5 — Information Hierarchy

| Screen | Primary element | Assessment |
|--------|----------------|------------|
| Home / overview | Stats triplet (wins, losses, streak) in large DISPLAY font | Correct dominant element |
| P&L display | `28px` DISPLAY weight, tabular-nums | Scannable ✅ |
| Daily loss limit | Not on dashboard | **Missing from information hierarchy** |
| Discipline score | Not on dashboard | **Missing from information hierarchy** |
| Circles leaderboard | Rank + name + metric value | Correct |
| Log trade form | Outcome segmented control at top | Correct — outcome is the primary decision |

---

### Section 6 — Behavioural Design

_(See dedicated Section 4 below for full detail.)_

---

### Section 7 — Onboarding

**Steps (OnboardingFlow.tsx):** `welcome → instruments → strategy → ready` (4 steps)

| Step | Fields | Deferrable? |
|------|--------|-------------|
| Welcome | Avatar, name (required), handle (auto) | Name required; avatar and handle could be deferred |
| Instruments | Multi-select futures list | Deferrable — defaults to "all" for first session |
| Strategy | Single select | Deferrable — default strategy works fine |
| Ready | Summary / CTA | Keep |

| Finding | File | Severity | Recommendation | Effort |
|---------|------|----------|----------------|--------|
| Prop firm context not captured | `OnboardingFlow.tsx` | High | Add step 3.5: "Are you on a prop firm evaluation?" → if yes, capture balance + daily loss limit | M |
| Global circle auto-enrolment is silent | `Koda.tsx:46` | Med | Show "You've been added to the Kōda global circle" on the Ready step | S |
| All 4 steps required | `OnboardingFlow.tsx` | Med | Make instruments + strategy optional, skip directly to app with smart defaults | S |
| No "skip for now" escape | `OnboardingFlow.tsx` | Med | Users who abandon mid-onboarding get locked out of the app | S |

---

### Section 8 — Social Features

| Finding | File | Severity | Recommendation | Effort |
|---------|------|----------|----------------|--------|
| Privacy defaults are private (good) | `Koda.tsx` DEF_PROFILE | ✅ | — | — |
| Leaderboard metric shown, calculation period not shown | `TradingCircles.tsx:54` | Med | Show time window ("This week", "All time") next to metric | S |
| Circle feed has no empty state | `TradingCircles.tsx` | Med | Add "No trades shared yet — be the first" when feed is empty | S |
| Join friction is low (good) | `TradingCircles.tsx` | ✅ | — | — |
| Trophy state loading shows blank area | `TradingCircles.tsx` | Low | Show skeleton or "No trophies yet" during `trophiesLoading` | S |

---

### Section 9 — Copy and Microcopy

| Finding | File | Line | Severity | Recommendation | Effort |
|---------|------|------|----------|----------------|--------|
| `tradrjournal.xyz/@${handle}` in profile share URL | `SettingsScreen.tsx` | 311 | High | Update to new domain (post domain migration) | S |
| `USERNAME_DOMAIN = "users.tradr.app"` visible in signup email | `KodaAuth.tsx` | 44 | Med | Update to new domain | S |
| `LEGACY_GLOBAL_CODE = "TRADRG-HB1U"` visible if user searches | `Koda.tsx` | 46 | Low | Keep for compat but document internally | — |
| `cancel` button label used in StrategyEditor | `Koda.tsx` StrategyEditor | 178 | Low | Acceptable in modal context | — |
| "Saving…" loading label on save button | `LogTradeScreen.tsx` | — | ✅ | Good specific label | — |
| "Let's go →" on onboarding CTA | `OnboardingFlow.tsx` | — | ✅ | Specific and on-brand | — |

---

### Section 10 — Accessibility

| Finding | File | Line | Severity | Recommendation | Effort |
|---------|------|------|----------|----------------|--------|
| `AvatarCircle` uses `alt="av"` | `shared.tsx` | 221 | Med | Change to `alt={name \|\| "avatar"}` | S |
| Icon buttons have no `aria-label` | `shared.tsx` | 678 | Med | Add `aria-label` to all icon-only buttons | S |
| All form labels are `<div>` not `<label htmlFor>` | All forms | — | Med | Migrate to `<label htmlFor>` + input `id` pairs | M |
| `dim` text (`#45453F`) on `bg` (`#0A0A0B`) — ~2.5:1 | `theme.ts` | — | Low | Use only for purely decorative text; do not use for meaningful labels | S |
| No `prefers-reduced-motion` on animations | `src/index.css` | — | Low | Add `@media (prefers-reduced-motion)` guard on `kRise`, `kDrawer` | S |

---

### Section 11 — Performance-Felt UX

| Finding | File | Severity | Recommendation | Effort |
|---------|------|----------|----------------|--------|
| No optimistic updates anywhere | All | Med | Implement for: trade reactions, follow/unfollow, public trades toggle | M |
| Skeleton loader component defined but unused | `shared.tsx` | Med | Use `SkeletonBar` in ProfileModal, charts container, circle leaderboard | S |
| ProfileModal blocks on "Loading profile…" text | `ProfileModal.tsx:91` | Low | Replace with skeleton of avatar + name + 3 stat rows | S |
| Settings saves have no loading indicator | `SettingsScreen.tsx` | Low | Disable the save button and show "Saving…" during async profile save | S |

---

## 4. Behavioural Design Gaps

_This section audits against the product thesis: in-session intervention for prop firm futures traders._

### Gap 1 — Daily Loss Limit (Critical)

**Current state:** `propFirmDailyLossLimit` is a number field in Settings. It is stored but never:
- Displayed on the dashboard
- Calculated against the day's realised losses
- Used to trigger any UI change

**What should happen:**
- Home screen: persistent mini-widget showing today's P&L vs. limit (e.g. `−$280 / −$500`)
- Colour escalation: green (safe) → yellow (>50% of limit) → red (>80%) → pulsing red (breached)
- Pre-submission check: if logging a loss would breach the limit, show a modal: "This trade would put you at $520 loss — your daily limit is $500. Continue?"
- Hard stop option (configurable): block submission entirely when limit is hit

**Files to touch:** `Koda.tsx`, `LogTradeScreen.tsx`, new `DailyLossWidget.tsx`

---

### Gap 2 — Discipline Score (Critical)

**Current state:** `ruleAdherence: boolean` is captured per trade (YES/NO in LogTradeScreen). It is never aggregated or shown back to the user.

**What should happen:**
- Stats screen: "Discipline score: 72%" (trades where rules were followed / total trades × 100)
- Post-submission feedback: "You've followed your rules on 7 of your last 10 trades."
- Pre-trade nudge: if last 3 trades all had `ruleAdherence = false`, show "Your last 3 trades broke your rules. Take a breath before continuing."

**Files to touch:** `src/charts.tsx` (add DisciplineScoreCard), `Koda.tsx` (add nudge logic)

---

### Gap 3 — Pre-Trade Friction (Critical)

**Current state:** The user taps "Log" → fills form → taps "Save Trade". No checkpoint. No system prompt. A user in a revenge-trading spiral can log 10 trades in 10 minutes with zero friction.

**What should happen (3 lightweight interventions, not paywalled):**

1. **Max-trades warning:** If `trades_today >= profile.maxTradesPerDay`, show inline warning: "You've hit your max trades for today (${maxTradesPerDay}). Still want to log this?" — with a deliberate confirmation tap required.

2. **Consecutive loss nudge:** If last 2 trades were losses, show yellow banner at top of LogTradeScreen: "You're on a 2-trade losing streak. Are you still following your plan?"

3. **Rules check gate:** If user marks `ruleAdherence = NO`, before submission show a 1-second interstitial: "Rules were broken on this trade. That's useful data — are you sure you want to log it?" with a confirm button. Low friction but intentional pause.

**Files to touch:** `LogTradeScreen.tsx`, `Koda.tsx` (pass `trades` to screen)

---

### Gap 4 — Post-Loss Differentiation (Critical)

**Current state:** `CelebrationOverlay` fires after every trade submission. It is identical for wins and losses. The overlay shows stats (win rate, avg R, streak) regardless of what the trade was.

**What should happen:**

- **Win / streak:** Current behaviour is correct — show streak, celebrate.
- **Small loss (within plan):** Show neutral overlay: "Trade logged. Keep following the plan." No fanfare.
- **Large loss (>50% of daily limit):** Show cautionary overlay with yellow/amber tone: "Tough one. Daily loss is now −$280. Check your rules before the next trade."
- **Consecutive loss (streak ≥ 3):** Show a step-back screen: "3 losses in a row. Consider pausing for 15 minutes." with a "Continue anyway" option.

**Files to touch:** `Koda.tsx` (CelebrationOverlay logic, add `kind: "loss" | "big-loss" | "streak-loss"`)

---

### Gap 5 — Prop Firm Progress Dashboard (High)

**Current state:** `propFirmProfitTarget`, `propFirmDailyLossLimit`, `propFirmMaxDrawdown`, `propFirmBalance` are stored in profile. The home screen does not show any of these values.

**What should happen:** When `propFirmMode = true`, the home screen should show an evaluation panel above the stats:

```
APEX EVALUATION  ·  Day 8 / 30
Profit target   [$1,450 / $3,000]  ████░░░░░░  48%
Daily loss      [−$0 / −$500]      ░░░░░░░░░░  0%
Max drawdown    [−$1,200 / −$2,500] ████░░░░░░  48%
```

- Progress bars for each metric
- Colour escalation on each bar (green → yellow → red as it approaches limit)
- Tappable to expand into full evaluation detail

**Files to touch:** New `PropFirmPanel.tsx`, `Koda.tsx` (inject above stats on home)

---

### Gap 6 — Missed Intervention Moments Summary

| Moment | Current behaviour | What should happen |
|--------|------------------|-------------------|
| User opens app during session | Home screen shows historical stats | Show today's P&L + daily loss limit widget prominently |
| 2nd consecutive loss logged | Neutral celebration overlay | Yellow "streak caution" banner on next log screen open |
| 3rd consecutive loss | Same | Step-back modal before allowing next submission |
| Trade logged with `ruleAdherence = NO` | Saved silently | 1-tap confirmation gate |
| Daily loss limit hit | Nothing | Red banner + soft block on LogTradeScreen |
| Max trades per day hit | Nothing | Warning before 3rd+ trade |
| Session P&L goes negative overall | Nothing | "You're down today — check your rules" on home |
| User hasn't logged in 3+ days | Nothing | Re-engagement nudge on app open |

---

## 5. Suggested Sequencing

### Sprint 1 — In-Session Intervention Foundation (3 days)
_Directly addresses the product thesis. All high-impact, manageable scope._

**Day 1 — Daily loss tracking on home screen**
1. Calculate today's realised P&L from `trades` (filter by today's date)
2. Build `DailyLossWidget` — compact bar showing `today_pnl / limit` with 3-colour state
3. Inject widget above stats on home screen when `propFirmMode = true`
4. Add prop firm capture to onboarding (step 3.5)

**Day 2 — Pre-trade friction**
1. Max-trades warning in `LogTradeScreen`
2. Consecutive loss streak nudge (yellow banner)
3. `ruleAdherence = NO` confirmation gate before submission
4. Daily loss limit pre-submission check (soft block modal)

**Day 3 — Post-loss UX + discipline score**
1. Differentiate `CelebrationOverlay` by outcome type (win / loss / big-loss / streak-loss)
2. Add `DisciplineScoreCard` to stats — aggregate `ruleAdherence` over last 30 trades
3. Post-trade discipline message ("7 of your last 10 trades followed your rules")

---

### Sprint 2 — Prop Firm Progress Dashboard (2 days)
_Visualises the evaluation data that's already being captured._

**Day 4**
1. Build `PropFirmPanel.tsx` with progress bars for profit target, daily loss, max drawdown
2. Inject on home screen above stats when prop firm mode is on
3. Add evaluation target visualisation to SettingsScreen (preview of panel)

**Day 5**
1. Add colour escalation to each progress bar
2. Add tappable detail expand
3. Step-back modal for 3-consecutive-loss scenario

---

### Sprint 3 — Polish and accessibility (1–2 days)
_Low-risk, high-professionalism improvements._

1. Icon buttons → 44×44 minimum (`shared.tsx`)
2. `inputMode="decimal"` on all numeric inputs
3. `aria-label` on all icon-only buttons
4. Migrate form labels to `<label htmlFor>` + `id` pairs
5. Add `prefers-reduced-motion` guards on CSS animations
6. Use `SkeletonBar` in ProfileModal, chart containers, leaderboard
7. Optimistic update for public-trades toggle and follow/unfollow
8. Offline banner at app shell level

---

### Sprint 4 — Design system cleanup (1 day)
_Post-launch housekeeping._

1. Centralise `STATUS_COLOR` in `DataSourcesScreen` to use `C.green`, `C.warn`, `C.red`
2. Move `BetaGate` local constants to shared theme import
3. Verify `accent` token matches `#89CFF0` design spec (or update spec)
4. Unify bottom-sheet and drawer modal patterns into single `BottomSheet` component

---

## 6. Questions for Dylon

1. **Accent colour mismatch** — `theme.ts` accent is `oklch(0.74 0.16 250)` which renders as blue-violet. The product brief says `#89CFF0` (baby blue). Are these intentionally different, or has the accent drifted from spec? A device screenshot would confirm.

2. **Font stack intent** — `MONO = 'Geist Mono', 'IBM Plex Mono'`. In production, Geist Mono loads from CDN and IBM Plex Mono never renders. Is Geist Mono the intended primary, or should IBM Plex Mono be primary per the original design brief?

3. **Prop Firm Mode paywall** — `propFirmMode` is behind PRO. Should the daily loss limit widget (Sprint 1, Day 1) also be PRO-only, or should a free-tier version exist (e.g. shows the number but no colour escalation)? The intervention is more valuable if it's in front of every user.

4. **CelebrationOverlay on loss** — Does the current neutral overlay after a loss feel wrong on a real device? This is hard to judge from code. A quick test: log a bad trade and observe the emotional friction of seeing a celebratory overlay. If it feels tone-deaf, Sprint 1 Day 3 is higher priority.

5. **Max trades per day enforcement** — Is the intent for `maxTradesPerDay` to be a hard block (cannot submit) or a soft nudge (warning but can proceed)? Hard blocks are more powerful but might frustrate users who genuinely need to log a hedge or close.

6. **Onboarding prop firm step** — Would adding a prop firm step to onboarding gate too many new users? Alternative: show a "Set up Prop Firm Mode" card on the home screen for the first 3 sessions if no prop firm data is set.

7. **`dim` text contrast** — `#45453F` on `#0A0A0B` is ~2.5:1, failing WCAG AA. Is `dim` used for any meaningful labels (not purely decorative)? If yes, we should bump the value to at least `#706F69` to pass.

8. **Circle feed empty state** — When a user joins a new circle and no one has shared a trade yet, what should they see? Options: "Be the first to share", a tutorial prompt, or nothing. Needs product call.

9. **Step-back modal for consecutive losses** — Is a 3-loss threshold correct for the target user (prop firm traders on 5–10% drawdown rules)? Some traders have rules for 2 consecutive losses. Should this be user-configurable?

10. **`USERNAME_DOMAIN = "users.tradr.app"`** — Is `tradr.app` still the auth domain, or does this need to change with the rebrand? This appears in the synthetic email address shown to users at signup.
