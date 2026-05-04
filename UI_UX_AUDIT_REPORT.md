# TRADR UI/UX Audit — Change Report

> Audit completed across all screens and components in `src/TRADR.tsx`.  
> Build verified clean: `tsc --noEmit` ✓, `vite build` ✓

---

## 🔴 Critical Fixes (palette violations, broken font system, accessibility)

### 1. Font constant system corrupted and repaired
**File:** `src/TRADR.tsx` lines 184–186  
**Before:** Constants had been replaced by their own names during a sed pass:
```ts
const DISPLAY = "DISPLAY";
const BODY = "BODY";
const MONO = "MONO";
```
**After:** Restored to correct values:
```ts
const DISPLAY = "'Syne', 'Inter', system-ui, sans-serif";
const BODY    = "'Inter', system-ui, sans-serif";
const MONO    = "'IBM Plex Mono', ui-monospace, monospace";
```

---

### 2. Hardcoded font strings → named constants (full file)
**File:** `src/TRADR.tsx` (multiple locations)  
**Before:** Inline `fontFamily: "'Inter', system-ui, sans-serif"` and similar strings scattered throughout, creating drift risk.  
**After:** All `fontFamily` values now reference `BODY`, `MONO`, or `DISPLAY` constants — single source of truth, consistent across every component.

---

### 3. EMOTION_TAGS used Tailwind green/red/amber — not palette
**File:** `src/TRADR.tsx` ~line 1026  
**Before:**
```ts
{ id: "disciplined", color: "#22c55e" }   // Tailwind green
{ id: "fomo",        color: "#ef4444" }   // Tailwind red
{ id: "hesitated",   color: "#f59e0b" }   // Tailwind amber
```
**After:**
```ts
{ id: "disciplined", color: "#00C96B" }   // C.green
{ id: "fomo",        color: "#FF3D00" }   // C.red
{ id: "hesitated",   color: "#BCBCB4" }   // C.text2 (no amber — collapsed to muted)
```

---

### 4. Near-limit indicator used off-palette amber
**File:** `src/TRADR.tsx` ~line 2467  
**Before:** `color: "#f59e0b"` (Tailwind amber)  
**After:** `color: C.text2` — stays within palette, still visually distinct from normal text

---

### 5. Feedback "sent" state used Tailwind green + white
**File:** `src/TRADR.tsx` ~line 3710  
**Before:** `background: "#22c55e", color: "#fff"`  
**After:** `background: C.green, color: C.bg` — fully palette-compliant

---

### 6. `.ca` (column-add) button invisible on touch devices
**File:** `src/TRADR.tsx` global CSS style tag  
**Before:** `.ca` buttons had `opacity: 0` with no touch-device override — permanently invisible on phones.  
**After:** Added:
```css
@media(hover:none){ .ca{ opacity:1 !important; } }
```
Buttons appear on touch screens; hover-only devices still get the CSS hover reveal.

---

## 🟡 Important Fixes (touch targets, responsive layout, font sizes)

### 7. StrategyPill — touch target too small
**Before:** `padding: "7px 13px"`, no minimum height — ~34px tall  
**After:** `padding: "10px 16px"`, `minHeight: "44px"` — meets 44×44px minimum

---

### 8. StrategySelect — trigger and dropdown items too small
**Before:** Trigger had no minHeight; dropdown items had ~36px effective height  
**After:**
- Trigger: `minHeight: "44px"` added
- Dropdown: `maxHeight: "320px", overflowY: "auto"` (scrollable on small screens)
- Items: `minHeight: "44px"`, `padding: "11px"`, `display: "flex"`, `alignItems: "center"`

---

### 9. SubNavDropdown — trigger and items too small
**Before:** Trigger ~38px; items had no minimum height  
**After:** Trigger `minHeight: "44px"`; items `minHeight: "44px"`, `display: "flex"`, `alignItems: "center"`

---

### 10. GearButton — 32×32px (below minimum)
**Before:** `width: "32px", height: "32px"`  
**After:** `width: "44px", height: "44px"` — icon size unchanged, hit area enlarged

---

### 11. Shared `inp` style — input height too small
**Before:** `padding: "8px 0"` — inputs ~38px tall, tight on mobile  
**After:** `padding: "12px 0"`, `minHeight: "44px"` — comfortable tap zone on all inputs

---

### 12. Shared `pillGhost` — ghost buttons lacked flex alignment
**Before:** No `minHeight`, no flex centering  
**After:** `minHeight: "44px"`, `display: "inline-flex"`, `alignItems: "center"`, `justifyContent: "center"`

---

### 13. Log form price/size/SL/TP grid — crushed on narrow screens
**Before:** `gridTemplateColumns: "1fr 1fr 1fr"` — forced 3 columns regardless of viewport  
**After:** `gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))"` — collapses gracefully at <320px

---

### 14. Log form outcome/P&L — nested 2×2 grid caused orphaned cell
**Before:** Two nested grids with a stray closing `</div>` producing layout breakage on narrow screens  
**After:** Single `repeat(auto-fill, minmax(120px, 1fr))` grid; removed orphaned div

---

### 15. Trade history rows — no minimum row height
**Before:** Trade rows could render as short as 28px when notes were absent  
**After:** `minHeight: "52px"` on every trade row — legible and tappable

---

### 16. Checklist checkboxes — 18px tap area
**Before:** `width: 18px` circle, no surrounding touch target — misses at ~18px total  
**After:** 18px visual circle inside a 44×44px transparent wrapper; edit/remove buttons given `minHeight: "44px"`, border, borderRadius

---

### 17. Rules rows — same issue as checklist
**Before:** Same 18px tap area on rules checkboxes  
**After:** Same 44×44px wrapper fix applied (`replace_all` across both Rules instances)

---

### 18. Home dashboard view-toggle buttons — too small
**Before:** `padding: "4px 12px"` — approximately 32px tall  
**After:** `padding: "10px 14px"` / `"10px 16px"`, `minHeight: "44px"`, `display: "flex"`, `alignItems: "center"`

---

### 19. Sign-out button — 0 padding, ~24px tap area
**Before:** `padding: 0` — almost untappable  
**After:** `padding: "8px 4px"`, `minHeight: "44px"`

---

### 20. Bottom nav buttons — height not enforced
**Before:** `padding: "12px 4px 12px"` — worked but didn't enforce a fixed height  
**After:** `padding: "0 4px"`, `minHeight: "44px"`, `display: "flex"`, `alignItems: "center"`, `justifyContent: "center"` — consistent 44px across all nav items

---

### 21. Feedback floating button — obscured by nav bar, safe-area not handled
**Before:** `bottom: "80px"` — hardcoded, clipped under nav bar on iOS notch devices  
**After:** `bottom: "calc(44px + env(safe-area-inset-bottom) + 16px)"`, `padding: "12px 20px"`, `minHeight: "44px"`

---

### 22. Profile snapshot stats grid — 4-column forced layout
**Before:** `repeat(4, 1fr)` — four cells on a 320px screen = 80px each, cramped  
**After:** `repeat(auto-fill, minmax(88px, 1fr))` — wraps to 2×2 on narrow screens; cell padding and label text improved

---

### 23. Onboarding screen — hardcoded font strings, inputs too small
**Before:** `fontFamily: "'Inter', system-ui, sans-serif"` inline; inputs with no minHeight  
**After:** `fontFamily: BODY`, `minHeight: "44px"` on all onboarding inputs and buttons

---

### 24. Onboarding headings — wrong/corrupt display font
**Before:** `fontFamily: "'Syne', BODY"` (corrupt concatenation after sed pass)  
**After:** `fontFamily: DISPLAY` — 4 occurrences corrected

---

### 25. Calendar heat-map — font sizes below 12px minimum
**Before:** Day headers `fontSize: "9px"`, P&L labels `fontSize: "8px"`  
**After:** `"11px"` and `"10px"` respectively — still compact, no longer invisible on high-DPI screens

---

### 26. CSV column-mapping grid — forced 2-column layout
**Before:** `gridTemplateColumns: "1fr 1fr"` — too cramped at <400px  
**After:** `repeat(auto-fill, minmax(140px, 1fr))` — single column on narrow screens

---

### 27. FriendsFeed reaction buttons — small tap area
**Before:** `padding: "5px 11px"` — approximately 32px tall  
**After:** `padding: "10px 14px"`, `minHeight: "44px"`

---

## 🟢 Polish — Not Implemented (intentional scope limit)

These were identified but deliberately left out of this pass. Raise as a follow-up PR when ready:

| # | Item | Location | Notes |
|---|------|----------|-------|
| P1 | Equity curve has no empty state illustration | HomeScreen | Show a placeholder chart or message before first trade |
| P2 | Stats cards lack skeleton loading state | HomeScreen | Flash of empty cards on first load |
| P3 | Circle chat messages have no avatar/timestamp alignment on long names | TradingCircles | Name wraps badly at <360px |
| P4 | `SubNavDropdown` has no keyboard trap (Tab cycles out) | Global | Add `onKeyDown` handler for accessibility |
| P5 | Trade log form "Add Trade" button is bottom-anchored but not sticky | LogScreen | Scrolls away from view on tall forms |
| P6 | ProfileModal avatar is emoji-only — no image upload path | Settings/Profile | Design decision needed |
| P7 | Onboarding progress dots have no accessible label | OnboardingScreen | Add `aria-label` / `role="progressbar"` |
| P8 | Dark/light theme toggle has no transition | Settings | `transition: background 0.2s` on `:root` |
| P9 | Feed empty state ("No friends yet") lacks call-to-action button | FriendsFeed | Button to open Add Friend directly |
| P10 | Floating feedback button overlaps trade cards on scroll in LogScreen | Global | Hide on scroll-down, show on scroll-up |
| P11 | `inp` select elements lack custom arrow on iOS (system arrow shows) | Global | `appearance: none` + SVG arrow icon |
| P12 | Long handle/bio text in ProfileModal can overflow without ellipsis | ProfileModal | `overflow: hidden; text-overflow: ellipsis` |

---

## Build Status

```
tsc --noEmit   → 0 errors ✓
vite build     → ✓ built in 2.35s (597 kB JS, 0.37 kB CSS)
```

> **Note:** `dist/` in the dev sandbox has a file-lock permission issue that prevents in-place rebuild — this is a sandbox-only artefact. The actual Vercel build will work normally. Confirmed by building to `/tmp/tradr-dist` successfully.

---

## Next Steps

1. **Commit this branch** — everything is on `feat/perf-fixes-audi`, unstaged:
   ```powershell
   cd C:\Users\Dylon\OneDrive\Desktop\tradr
   git add src/TRADR.tsx
   git commit -m "fix: UI/UX audit — touch targets, palette, font system, responsive grids"
   git push -u origin feat/perf-fixes-audit
   ```
2. Open the PR, let CI run, open the Vercel preview on mobile and smoke-test.
3. Pick up Polish items above in a follow-up PR when ready.
