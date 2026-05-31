# Changes from Kōda Team Meeting — 31 April 2026
*Bruno + Dylon. Full transcript: `../meeting transcripts/koda-meeting-310426-transcript.md`*

---

## Priority 1 — Do before beta (blocking)

### 1. Disable paywall for all beta users
- Remove/disable pro gate for next 2–3 weeks
- Give Dylon, Bruno, Dan permanent premium accounts hardcoded in the system
- The upgrade-to-pro flow is broken (doesn't unlock features after payment) — turning it off sidesteps this entirely
- Toggle approach: environment variable or single boolean flag so it can be re-enabled later

### 2. Fix `BETA_26` promo code
- Beta code is `BETA_26` (underscore), NOT `BETA26`
- Already noted in `NEXT_SESSION.md §3.2` — confirm committed

---

## Priority 2 — Navigation restructure (main UI change from meeting)

Complete redesign of the left sidebar. Bruno dictated the desired layout:

### New sidebar structure

**Section 1 — first collapsible group:**
| Tab | Notes |
|-----|-------|
| **Home** | Replaces "Overview" — Home IS the overview content. Remove the separate "Overview" tab entirely. |
| **Analytics** | Free tier. Basic P&L, calendar, etc. |
| **Rules & Checklists** | Combine into **one tab / one page**. Currently separate — merge them. |
| **Sync / Log** | Combine into **one tab** named "Sync". User can either sync via CSV or log manually from here. |
| **Journal** | List of journal entries. Will eventually expand to backtesting journal + CSV import sub-nav. |

**Section 2 — Stats collapsible group:**
| Tab | Notes |
|-----|-------|
| **Stats** | Drop-down with: Performance, Strategies, Calendar, Weekly, Psychology, Heat Map, **+ Insights** |
| └ Insights | Rename "Execution" → "Insights". Move it OUT of the top-level nav and INTO the Stats drop-down. This is the AI/pro feature. |

> Stats drop-down must be **collapsible** — clicking Stats again should close it. Currently it doesn't collapse.

**Section 3:**
| Tab | Notes |
|-----|-------|
| **Circles** | Rename tab label to **"Chat" or "Messages"** (since clicking it opens the chat). Keep circles functionality inside. |

### Summary of renames / removals
- Remove top-level "Overview" tab → Home = Overview
- Remove top-level "Execution" tab → becomes "Insights" under Stats
- "Rules" + "Checklists" merge into one tab
- "Sync" + "Log" merge into one tab called "Sync"
- "Circles" tab → rename to "Chat" or "Messages"

---

## Priority 3 — Bug fixes

### MAE/MFE analysis placement
- MAE/MFE analysis block is currently on the Circles page — it shouldn't be there
- The "Upgrade to Pro" banner appears on: Session Heat Maps, MAE/MFE analysis (all three instances)
- Psychology's upgrade-to-pro banner is fine (behaves differently)
- Once paywall is disabled (Priority 1), these banners disappear anyway — but fix placement regardless

### Google sign-in bypass
- Signing in with Google skips the profile setup page and drops straight into the app
- Should route through the profile setup/onboarding flow same as email sign-up

### Stats drop-down doesn't collapse
- Clicking "Stats" opens the drop-down. Clicking "Stats" again should collapse it. Currently it doesn't.

### Chat / Circles not working
- Messages sent in a circle aren't appearing
- Bruno's suggestion: implement a **floating bubble** chat icon (Facebook Messenger-style) so chat is accessible from anywhere without leaving the current screen

---

## Priority 4 — UX / design notes

### Strategy selector → Rules link
- In the Log tab, when you select a strategy (e.g. ICT), it shows a drop-down of setups (OTE, FVG, Supply/Demand, etc.)
- That selection should also surface the relevant **rules and checklists** from the Rules & Checklists tab
- So the workflow is: pick strategy → relevant rules appear inline, not just in a separate tab

### Strategies tab consideration
- "Strategies" as a standalone stats tab may be better as a **"Strategy Breakdown" card inside Performance**
- CSV imports can't determine which strategy was used per trade, so the tab has limited utility for CSV users
- Defer decision but flag for post-beta review

### Mobile parity
- Any desktop nav/layout changes must also work on mobile
- Do not prioritise desktop over mobile — they must ship together
- Bruno specifically called out the **side nav bar on mobile** as needing attention

### Logout button proximity
- Logout and Delete account buttons are very close together in the profile/settings
- Risk of accidental deletion — add more visual separation

### Circles invite code / ID
- The circles ID (long number) used to appear on the overview page but was removed
- Consider surfacing it somewhere accessible (profile page or within Circles/Chat tab)

---

## Deferred / noted for later

- **Advertising:** Start looking at ads when beta opens. Neither has experience — research needed.
- **Company registration:** "Kōda Group Limited" via Companies House. ~£50. Do when Dylon gets paid (~16 June). SIC code: software/FinTech.
- **Landing page:** Bruno suggested showing the "4 pillars" on the landing page hero
- **Marketing automation:** To explore eventually — not with Claude (Dylon's preference)
- **Termly:** For privacy policy / T&Cs generation — already mentioned as a better tool than AI-generated slop
- **Forex:** Decided not to do for now, even though beta users are likely forex traders
- **Import brokerage integration:** Auto-detect funded/eval/demo account type from trade data. Future feature.
- **Ads:** Start planning for when beta opens
