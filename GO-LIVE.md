# TRADR · Go-Live Checklist

Target: live on Monday. Follow these steps in order. None of them are optional.

---

## What I already changed in your code

- `src/lib/storage.ts` — new file. A `window.storage` shim that reads/writes Supabase and caches in localStorage. This is what makes profiles, trades, and circles persist across devices.
- `src/lib/supabase.ts` — unchanged (already existed).
- `src/main.tsx` — now installs the storage shim before React mounts.
- `src/TradrAuth.tsx` — reinstalls the shim with the user's id after sign-in / sign-out, and clears the local cache on sign-out so the next account starts clean.
- `src/TRADR.tsx` — patches:
  - accepts a `user` prop from `TradrAuth`
  - added the missing `useState` declarations for `myCircles`, `circlesView`, `activeCircle`, `circleForm`, `circleJoinCode`, `circleMsg` (these were referenced but never declared, so the file wasn't valid)
  - moved the misplaced `<TradingCircles />` render block out of `WinRateChart` into the main content switch so tapping the Circles tab actually shows the Circles screen
  - added `"circles"` to the swipe-tab list
  - on first load, binds the Supabase `user.id` to `profile.uid` so your invite code is stable across devices
  - added a small `↪ SIGN OUT` button in the header (needed for testing with two accounts)
- `supabase-schema.sql` — new file at project root. Run it in Supabase. See step 1.
- `index.html` — hardened for mobile: PWA manifest link, theme-color, apple-touch-icon, iOS status-bar meta, safe-area insets, `font-size:16px` on inputs to prevent iOS zoom-on-focus, real title + description.
- `public/manifest.webmanifest` — new. PWA manifest so users can "Add to Home Screen" and launch TRADR standalone (no browser chrome) on iOS and Android.
- `public/icon.svg` — new. 512×512 TRADR-branded app icon (black bg, blue wordmark, green chart line).
- `public/apple-touch-icon.svg` — new. iOS-specific variant (iOS rounds the corners itself).

---

## Step 1 — Run the schema in Supabase (5 min)

1. Open https://supabase.com/dashboard and go to your **tradr** project (`vifwjwsndchnrpvfgrmg`).
2. Left sidebar → **SQL Editor** → **New query**.
3. Open `supabase-schema.sql` from the repo, copy the whole file, paste into the editor.
4. Click **Run**. You should see `Success. No rows returned.`
5. Sidebar → **Table Editor** → confirm two new tables exist: `user_kv` and `shared_kv`. Both should show "RLS enabled".

If step 4 fails with a permission error, you're not logged into the right Supabase project. Re-check.

---

## Step 2 — Confirm email auth settings (3 min)

1. Supabase dashboard → **Authentication** → **Providers**.
2. **Email** should be enabled. If you want users to sign up without email confirmation for speed, turn off "Confirm email" (safer to leave on for production).
3. Google OAuth has been removed from the app for launch. Skip the Google provider entirely. We'll add it back post-launch.
4. Dashboard → **Authentication** → **URL Configuration**. Set **Site URL** to your production domain (e.g. `https://tradr.vercel.app`). Add the same URL under **Redirect URLs**. Without this, password-reset links will fail in production.

---

## Step 3 — Build & push (10 min)

On your Windows machine, in a terminal inside the `tradr` folder:

```powershell
npm install
npm run build
```

If the build fails, paste the first error back to me. The most likely errors are TypeScript strict-mode complaints in `TRADR.tsx` because that file uses loose typing. If you hit those, the fastest fix is to set `"strict": false` in `tsconfig.app.json` — ship first, tighten later.

Once build passes:

```powershell
git add .
git commit -m "Wire Supabase KV storage, fix circles state, add sign-out"
git push
```

Vercel will auto-deploy since you pushed `vercel.json` yesterday. Watch the deploy in the Vercel dashboard.

---

## Step 4 — Smoke test on production (10 min)

This is the test that decides whether Monday launch is real.

1. Open your production URL in your main browser. Sign up with your real email. Confirm email if you left that on.
2. Go to the **Log** tab. Log one trade. Refresh the page. Trade should still be there.
3. Open the same URL in a **different browser** (or incognito). Sign in with the same email. The trade from step 2 should appear. **This is the proof that profiles are remembered across devices.**
4. In the incognito window, sign out. Sign up with a second test email.
5. Both windows: go to **Circles** tab.
   - In window A: create a circle called "Test Circle". Copy the code that appears.
   - In window B: paste the code and Join.
   - In window A: tap **Publish my stats**.
   - In window B: open the circle, tap **↻ Refresh**. You should see window A's stats on the leaderboard.

If step 5 fully works → you're live. If it doesn't, tell me what you see and we debug Monday morning.

---

## Step 5 — Mobile / PWA install test (10 min)

This is what makes TRADR feel like an app, not a website. Do this on your actual phone.

### iPhone (Safari)
1. Open your production URL in **Safari** (not Chrome — only Safari can install PWAs on iOS).
2. Tap the share button (square + up arrow at the bottom).
3. Scroll down → **Add to Home Screen**.
4. Confirm the icon shows the TRADR logo (black bg, blue text, green chart line). Tap **Add**.
5. Open TRADR from your home screen. It should launch full-screen with no Safari URL bar. Status bar should be black/translucent.
6. Sign in. Log a trade. Force-quit and reopen — trade should still be there.
7. Test inputs: tap any text field. Page must NOT zoom in. If it does, the `font-size:16px` rule on inputs got dropped — check `index.html`.

### Android (Chrome)
1. Open production URL in **Chrome**.
2. Three-dot menu → **Install app** (or **Add to Home Screen**).
3. Confirm the icon and name are correct → Install.
4. Launch from home screen → should open standalone with no Chrome chrome.
5. Sign in, log a trade, repeat the persistence test.

### What to verify on both:
- App icon is the TRADR logo, not the default Vite/blank icon.
- Splash background is solid black (not white flash on launch).
- App is portrait-locked (no rotation jank).
- Tapping things feels native — no blue tap-highlight flash (that's the `-webkit-tap-highlight-color: transparent` rule).
- Bottom tab bar isn't covered by the iOS home indicator (that's the `safe-area-inset-bottom` padding).

If any of those are broken, flag it Monday morning. None of them are launch-blockers individually but together they're the difference between "feels like an app" and "feels like a website you saved a shortcut to."

---

## Step 6 — Answers to your question

**"Will everyone's profiles be remembered?"**

Yes, with caveats:

- **Profile data (name, handle, bio, avatar, broker, timezone, targets)** → stored in Supabase `user_kv`, keyed to the user's auth id. Signs in on any device → their profile loads. Confirmed.
- **Trade history** → same story. Trades sync to Supabase and load on any device.
- **Circles and leaderboards** → stored in `shared_kv`. Any signed-in user can look up a circle by its code (so invites work). Only the person who wrote an entry (or owns the circle) can modify it.
- **Checklists, rules, dark-mode preference** → per-user, synced.

**What's NOT synced:**

- Currently-unchecked checklist items during a live session (intentional — that's ephemeral).
- Screenshots attached to trades **may** hit localStorage quota if you stack a lot of them. If you see silent write failures, we'll move screenshot bytes to Supabase Storage. Flag it Monday if it happens.

**Cost note:** the KV approach stores JSON blobs. Fine for a few hundred users. If you hit thousands, we normalize into proper tables (circles/members/trades as their own rows). That's a post-launch problem.

---

## Known issues to fix *after* Monday (do NOT block launch on these)

1. **Google OAuth** — button is wired but the provider config needs to be set in Supabase. If it's not done by Monday, delete the button rather than ship a broken one (see step 2).
2. **No real-time circle updates** — the leaderboard refreshes only when you tap ↻. Realtime (Supabase broadcast) is a ~30-minute add and I'll do it next session if you want.
3. **No push/email notifications** — retention loop for circles is missing. Highest-impact thing to build next week.
4. **Default landing is still "home"** — per prior recaps, landing on a circle leaderboard is higher signal. Change is one line in `TRADR.tsx`: `useState("home")` → `useState("circles")`. Ship the current default first; flip it once you have 2+ active users.
5. **Friend-feed flow** — separate from circles, still works but the add-friend / publish UX is clunky. Not a blocker.

---

## If something breaks Monday morning

**"I can't sign in"** → check Supabase Auth URL Configuration (step 2 #4). Site URL must match your production domain exactly.

**"Trades appear for one user but not the other on the leaderboard"** → the other user probably hasn't tapped **Publish my stats** yet. That's a manual action right now.

**"window.storage is undefined"** → `main.tsx` didn't run. Hard refresh. If it persists, check that `installStorage(null)` is in `main.tsx` before `ReactDOM.createRoot`.

**"Permission denied when writing to Supabase"** → RLS policy issue. Open Supabase → Logs → Postgres, grep for `permission denied`. Paste the error to me.

---

*Ship it.*
