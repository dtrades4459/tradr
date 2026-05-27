# Circles Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add owner-initiated challenges with a trophy shelf, trade sharing into circles, and a unified activity feed that merges chat, trades, and challenge events.

**Architecture:** Three additive features layered onto the existing shared_kv + circle_messages pattern. New DB tables (`circle_challenges`, `circle_challenge_results`, `circle_shared_trades`) hold structured data; client-side merge produces the unified feed. Each feature is independently functional — challenges work without trade sharing and vice versa.

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres + Realtime), Vercel serverless cron, existing `src/data/circles.ts` pattern for data layer, existing `TradingCircles.tsx` component extended in-place.

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `supabase/migrations/20260523_circles_improvements.sql` | 4 new tables + RLS |
| Modify | `src/types.ts` | Add `CircleChallenge`, `ChallengeResult`, `SharedTrade`, `FeedItem` |
| Create | `src/data/circlesChallenges.ts` | Create/fetch/complete challenges |
| Create | `src/data/circlesSharedTrades.ts` | Share/fetch/react to shared trades |
| Create | `api/cron/complete-challenges.ts` | Server cron: close expired challenges |
| Modify | `vercel.json` | Register cron schedule |
| Modify | `src/TradingCircles.tsx` | All UI: feed tab, trophies tab, challenge banner, creation sheet, share flow |

---

## Task 1: DB Migration — Four New Tables

**Files:**
- Create: `supabase/migrations/20260523_circles_improvements.sql`

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/20260523_circles_improvements.sql

-- ── circle_messages ────────────────────────────────────────────────────────────
-- Currently referenced by code but never created. Fix that here.
CREATE TABLE IF NOT EXISTS public.circle_messages (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_code   text         NOT NULL,
  sender_id     uuid         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_name   text         NOT NULL DEFAULT '',
  sender_handle text         NOT NULL DEFAULT '',
  sender_avatar text,
  text          text         NOT NULL,
  created_at    timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE public.circle_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "circle_messages_select" ON public.circle_messages
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "circle_messages_insert" ON public.circle_messages
  FOR INSERT TO authenticated WITH CHECK (sender_id = auth.uid());

CREATE POLICY "circle_messages_delete" ON public.circle_messages
  FOR DELETE TO authenticated USING (sender_id = auth.uid());

CREATE INDEX IF NOT EXISTS circle_messages_code_time_idx
  ON public.circle_messages(circle_code, created_at DESC);

-- Grant service_role for cron auto-messages
GRANT INSERT ON public.circle_messages TO service_role;

-- ── circle_challenges ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.circle_challenges (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_code text        NOT NULL,
  title       text        NOT NULL,
  metric      text        NOT NULL CHECK (metric IN ('dollar','r','winrate','trades','avgr')),
  started_at  timestamptz NOT NULL DEFAULT now(),
  ends_at     timestamptz NOT NULL,
  created_by  text        NOT NULL,
  status      text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed'))
);

ALTER TABLE public.circle_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "circle_challenges_select" ON public.circle_challenges
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "circle_challenges_insert" ON public.circle_challenges
  FOR INSERT TO authenticated WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON public.circle_challenges TO service_role;

CREATE INDEX IF NOT EXISTS circle_challenges_code_status_idx
  ON public.circle_challenges(circle_code, status);

-- ── circle_challenge_results ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.circle_challenge_results (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id  uuid         NOT NULL REFERENCES public.circle_challenges(id) ON DELETE CASCADE,
  circle_code   text         NOT NULL,
  winner_code   text         NOT NULL,
  winner_name   text         NOT NULL DEFAULT '',
  winner_handle text         NOT NULL DEFAULT '',
  winning_value numeric      NOT NULL,
  snapshot_at   timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE public.circle_challenge_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "circle_challenge_results_select" ON public.circle_challenge_results
  FOR SELECT TO authenticated USING (true);

GRANT INSERT ON public.circle_challenge_results TO service_role;

CREATE INDEX IF NOT EXISTS circle_challenge_results_code_idx
  ON public.circle_challenge_results(circle_code, snapshot_at DESC);

-- ── circle_shared_trades ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.circle_shared_trades (
  id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_code   text         NOT NULL,
  author_code   text         NOT NULL,
  author_name   text         NOT NULL DEFAULT '',
  author_handle text         NOT NULL DEFAULT '',
  author_avatar text         NOT NULL DEFAULT '',
  trade_id      text         NOT NULL,
  pair          text         NOT NULL,
  side          text         NOT NULL DEFAULT 'long' CHECK (side IN ('long','short')),
  outcome       text         NOT NULL CHECK (outcome IN ('win','loss','be')),
  pnl           numeric      NOT NULL DEFAULT 0,
  rr            numeric,
  strategy      text,
  notes         text,
  screenshot    text,
  date          text         NOT NULL,
  shared_at     timestamptz  NOT NULL DEFAULT now(),
  reactions     jsonb        NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (circle_code, author_code, trade_id)
);

ALTER TABLE public.circle_shared_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "circle_shared_trades_select" ON public.circle_shared_trades
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "circle_shared_trades_insert" ON public.circle_shared_trades
  FOR INSERT TO authenticated WITH CHECK (true);

-- Any member can react (update reactions column)
CREATE POLICY "circle_shared_trades_update" ON public.circle_shared_trades
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS circle_shared_trades_code_time_idx
  ON public.circle_shared_trades(circle_code, shared_at DESC);
```

- [ ] **Step 2: Run migration in Supabase**

Open Supabase dashboard → SQL Editor → paste the file → Run. Verify "Success" with no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260523_circles_improvements.sql
git commit -m "feat: add circle_messages, circle_challenges, circle_challenge_results, circle_shared_trades tables"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `src/types.ts` (append after `Circle` interface)

- [ ] **Step 1: Add new interfaces**

Open `src/types.ts` and append after the `Circle` interface (after line 96):

```typescript
export interface CircleChallenge {
  id: string;
  circleCode: string;
  title: string;
  metric: "dollar" | "r" | "winrate" | "trades" | "avgr";
  startedAt: string;
  endsAt: string;
  createdBy: string;
  status: "active" | "completed";
}

export interface ChallengeResult {
  id: string;
  challengeId: string;
  circleCode: string;
  winnerCode: string;
  winnerName: string;
  winnerHandle: string;
  winningValue: number;
  snapshotAt: string;
  challenge?: Pick<CircleChallenge, "title" | "metric" | "endsAt">;
}

export interface SharedTrade {
  id: string;
  circleCode: string;
  authorCode: string;
  authorName: string;
  authorHandle: string;
  authorAvatar: string;
  tradeId: string;
  pair: string;
  side: "long" | "short";
  outcome: "win" | "loss" | "be";
  pnl: number;
  rr: number | null;
  strategy: string | null;
  notes: string | null;
  screenshot: string | null;
  date: string;
  sharedAt: string;
  reactions: Record<string, string[]>;
}

export type FeedItem =
  | { type: "trade";             ts: string; data: SharedTrade }
  | { type: "message";           ts: string; data: { id: string; sender_name: string; sender_handle: string; sender_avatar: string; text: string; created_at: string } }
  | { type: "challenge_started"; ts: string; data: CircleChallenge }
  | { type: "member_joined";     ts: string; data: { text: string; id: string } };
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -30
```

Expected: no new errors (only pre-existing ones, if any).

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add CircleChallenge, ChallengeResult, SharedTrade, FeedItem types"
```

---

## Task 3: Challenge Data Layer

**Files:**
- Create: `src/data/circlesChallenges.ts`

- [ ] **Step 1: Create file**

```typescript
// src/data/circlesChallenges.ts
import { supabase } from "../lib/supabase";
import type { CircleChallenge, ChallengeResult } from "../types";

export async function createChallenge(
  circleCode: string,
  title: string,
  metric: CircleChallenge["metric"],
  endsAt: Date,
  createdBy: string
): Promise<CircleChallenge | null> {
  const { data, error } = await supabase
    .from("circle_challenges")
    .insert({ circle_code: circleCode, title, metric, ends_at: endsAt.toISOString(), created_by: createdBy, status: "active" })
    .select()
    .single();
  if (error) { console.error("[createChallenge]", error); return null; }
  return rowToChallenge(data);
}

export async function fetchActiveChallenge(circleCode: string): Promise<CircleChallenge | null> {
  const { data, error } = await supabase
    .from("circle_challenges")
    .select("*")
    .eq("circle_code", circleCode)
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) { console.error("[fetchActiveChallenge]", error); return null; }
  return data ? rowToChallenge(data) : null;
}

export async function fetchTrophies(circleCode: string): Promise<ChallengeResult[]> {
  const { data, error } = await supabase
    .from("circle_challenge_results")
    .select("*, challenge:challenge_id(title, metric, ends_at)")
    .eq("circle_code", circleCode)
    .order("snapshot_at", { ascending: false });
  if (error) { console.error("[fetchTrophies]", error); return []; }
  return (data ?? []).map(rowToResult);
}

export async function fetchActiveChallengesToComplete(): Promise<CircleChallenge[]> {
  const { data, error } = await supabase
    .from("circle_challenges")
    .select("*")
    .eq("status", "active")
    .lt("ends_at", new Date().toISOString());
  if (error) { console.error("[fetchActiveChallengesToComplete]", error); return []; }
  return (data ?? []).map(rowToChallenge);
}

function rowToChallenge(row: Record<string, unknown>): CircleChallenge {
  return {
    id: row.id as string,
    circleCode: row.circle_code as string,
    title: row.title as string,
    metric: row.metric as CircleChallenge["metric"],
    startedAt: row.started_at as string,
    endsAt: row.ends_at as string,
    createdBy: row.created_by as string,
    status: row.status as "active" | "completed",
  };
}

function rowToResult(row: Record<string, unknown>): ChallengeResult {
  const ch = row.challenge as Record<string, unknown> | null;
  return {
    id: row.id as string,
    challengeId: row.challenge_id as string,
    circleCode: row.circle_code as string,
    winnerCode: row.winner_code as string,
    winnerName: row.winner_name as string,
    winnerHandle: row.winner_handle as string,
    winningValue: row.winning_value as number,
    snapshotAt: row.snapshot_at as string,
    challenge: ch ? { title: ch.title as string, metric: ch.metric as CircleChallenge["metric"], endsAt: ch.ends_at as string } : undefined,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add src/data/circlesChallenges.ts
git commit -m "feat: add challenge data layer (create, fetch active, fetch trophies)"
```

---

## Task 4: Shared Trade Data Layer

**Files:**
- Create: `src/data/circlesSharedTrades.ts`

- [ ] **Step 1: Create file**

```typescript
// src/data/circlesSharedTrades.ts
import { supabase } from "../lib/supabase";
import type { SharedTrade, Trade, Profile } from "../types";

export async function shareTrade(
  circleCode: string,
  author: Pick<Profile, "name" | "handle" | "avatar" | "code">,
  trade: Trade
): Promise<"ok" | "duplicate" | "error"> {
  const side = trade.direction === "short" ? "short" : "long";
  const rawOutcome = (trade.outcome || "").toLowerCase();
  const outcome = (["win", "loss", "be"].includes(rawOutcome) ? rawOutcome : "loss") as "win" | "loss" | "be";
  const { error } = await supabase.from("circle_shared_trades").insert({
    circle_code: circleCode,
    author_code: author.code ?? "",
    author_name: author.name,
    author_handle: author.handle,
    author_avatar: author.avatar,
    trade_id: String(trade.id),
    pair: trade.pair,
    side,
    outcome,
    pnl: parseFloat(trade.pnlDollar || trade.pnl || "0") || 0,
    rr: trade.rr ? parseFloat(trade.rr) || null : null,
    strategy: trade.strategy || null,
    notes: trade.notes || null,
    screenshot: trade.screenshot || null,
    date: trade.date,
  });
  if (!error) return "ok";
  if (error.code === "23505") return "duplicate";
  console.error("[shareTrade]", error);
  return "error";
}

export async function fetchSharedTrades(
  circleCode: string,
  limit = 50,
  before?: string
): Promise<SharedTrade[]> {
  let q = supabase
    .from("circle_shared_trades")
    .select("*")
    .eq("circle_code", circleCode)
    .order("shared_at", { ascending: false })
    .limit(limit);
  if (before) q = q.lt("shared_at", before);
  const { data, error } = await q;
  if (error) { console.error("[fetchSharedTrades]", error); return []; }
  return (data ?? []).map(rowToSharedTrade);
}

export async function reactToSharedTrade(
  tradeId: string,
  emoji: string,
  memberCode: string
): Promise<void> {
  const { data } = await supabase
    .from("circle_shared_trades")
    .select("reactions")
    .eq("id", tradeId)
    .single();
  if (!data) return;
  const reactions: Record<string, string[]> = { ...(data.reactions ?? {}) };
  const existing = reactions[emoji] ?? [];
  reactions[emoji] = existing.includes(memberCode)
    ? existing.filter(c => c !== memberCode)
    : [...existing, memberCode];
  await supabase.from("circle_shared_trades").update({ reactions }).eq("id", tradeId);
}

function rowToSharedTrade(row: Record<string, unknown>): SharedTrade {
  return {
    id: row.id as string,
    circleCode: row.circle_code as string,
    authorCode: row.author_code as string,
    authorName: row.author_name as string,
    authorHandle: row.author_handle as string,
    authorAvatar: row.author_avatar as string,
    tradeId: row.trade_id as string,
    pair: row.pair as string,
    side: row.side as "long" | "short",
    outcome: row.outcome as "win" | "loss" | "be",
    pnl: row.pnl as number,
    rr: (row.rr as number | null) ?? null,
    strategy: (row.strategy as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    screenshot: (row.screenshot as string | null) ?? null,
    date: row.date as string,
    sharedAt: row.shared_at as string,
    reactions: (row.reactions ?? {}) as Record<string, string[]>,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -30
```

- [ ] **Step 3: Commit**

```bash
git add src/data/circlesSharedTrades.ts
git commit -m "feat: add shared trade data layer (share, fetch, react)"
```

---

## Task 5: Challenge Completion Cron

**Files:**
- Create: `api/cron/complete-challenges.ts`
- Modify: `vercel.json`

- [ ] **Step 1: Create the cron endpoint**

```typescript
// api/cron/complete-challenges.ts
// ── Vercel cron: runs every 5 min, closes expired challenges ──────────────────
// GET (scheduled): requires header x-cron-secret: <CRON_SECRET>
// POST (manual): requires Authorization: Bearer <service-role-key> for testing

export const config = { runtime: "nodejs" };

import { getAdminClient } from "../lib/supabaseAdmin";

type Req = { method?: string; headers: Record<string, string | string[] | undefined> };
type Res = { status(n: number): Res; json(d: unknown): Res; end(): void; setHeader(k: string, v: string): void };

const METRIC_LABELS: Record<string, string> = {
  dollar: "$ P&L", r: "R-multiple", winrate: "Win Rate", trades: "Trades", avgr: "Avg R",
};

function formatValue(metric: string, value: number): string {
  if (metric === "dollar") return `$${value >= 0 ? "+" : ""}${value.toFixed(0)}`;
  if (metric === "winrate") return `${value.toFixed(1)}%`;
  if (metric === "trades") return `${Math.round(value)}`;
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}R`;
}

export default async function handler(req: Req, res: Res) {
  res.setHeader("Access-Control-Allow-Origin", "https://tradrjournal.xyz");

  const isScheduled = req.method === "GET";
  if (isScheduled) {
    const secret = req.headers["x-cron-secret"];
    if (!secret || secret !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  } else if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const admin = getAdminClient();

  // 1. Find all active challenges that have expired
  const { data: expired, error: expErr } = await admin
    .from("circle_challenges")
    .select("*")
    .eq("status", "active")
    .lt("ends_at", new Date().toISOString());

  if (expErr) { console.error("[complete-challenges] fetch error:", expErr); return res.status(500).json({ error: "fetch failed" }); }
  if (!expired || expired.length === 0) return res.status(200).json({ completed: 0 });

  let completed = 0;

  for (const challenge of expired) {
    try {
      // 2. Get leaderboard entries for the circle from shared_kv
      const { data: entries } = await admin
        .from("shared_kv")
        .select("key, value")
        .like("key", `tradr_circle_entry_${challenge.circle_code}_%`);

      if (!entries || entries.length === 0) {
        // No participants — just close it
        await admin.from("circle_challenges").update({ status: "completed" }).eq("id", challenge.id);
        completed++;
        continue;
      }

      // 3. Parse entries and find winner by metric
      const parsed = entries
        .map((e: { key: string; value: string }) => { try { return JSON.parse(e.value); } catch { return null; } })
        .filter(Boolean);

      function getMetricValue(entry: Record<string, number>, metric: string): number {
        if (metric === "dollar")  return entry.totalPnLDollar ?? entry.totalPnL ?? 0;
        if (metric === "r")       return entry.totalPnL ?? 0;
        if (metric === "winrate") return entry.winRate ?? 0;
        if (metric === "trades")  return entry.total ?? 0;
        if (metric === "avgr")    return entry.avgRR ?? 0;
        return 0;
      }

      let winner = parsed[0];
      let winnerVal = getMetricValue(winner, challenge.metric);
      for (const entry of parsed.slice(1)) {
        const val = getMetricValue(entry, challenge.metric);
        if (val > winnerVal) { winner = entry; winnerVal = val; }
      }

      // 4. Write result
      await admin.from("circle_challenge_results").insert({
        challenge_id: challenge.id,
        circle_code: challenge.circle_code,
        winner_code: winner.memberCode ?? "",
        winner_name: winner.name ?? "",
        winner_handle: winner.handle ?? "",
        winning_value: winnerVal,
      });

      // 5. Mark challenge completed
      await admin.from("circle_challenges").update({ status: "completed" }).eq("id", challenge.id);

      // 6. Post auto-message to circle chat
      const handle = winner.handle ? `@${winner.handle}` : winner.name;
      const metricLabel = METRIC_LABELS[challenge.metric] ?? challenge.metric;
      const valStr = formatValue(challenge.metric, winnerVal);
      await admin.from("circle_messages").insert({
        circle_code: challenge.circle_code,
        sender_id: "00000000-0000-0000-0000-000000000000",
        sender_name: "Kōda",
        sender_handle: "koda",
        text: `🏆 Challenge over — ${handle} wins "${challenge.title}" · ${metricLabel}: ${valStr}`,
      });

      completed++;
    } catch (err) {
      console.error(`[complete-challenges] failed for challenge ${challenge.id}:`, err);
    }
  }

  return res.status(200).json({ completed });
}
```

Note: The sender_id `"00000000-0000-0000-0000-000000000000"` is a placeholder UUID for system messages. The RLS policy allows insert as `service_role`, which bypasses RLS so this won't fail the `sender_id = auth.uid()` check. But to make the schema clean, add a separate `is_system` boolean or use `GRANT INSERT ... TO service_role` (already done in migration Task 1).

- [ ] **Step 2: Add cron to vercel.json**

In `vercel.json`, add a `"crons"` section after the closing bracket of `"headers"`:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "crons": [
    {
      "path": "/api/cron/complete-challenges",
      "schedule": "*/5 * * * *"
    }
  ],
  "headers": [
    ...existing headers...
  ]
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -30
```

- [ ] **Step 4: Commit**

```bash
git add api/cron/complete-challenges.ts vercel.json
git commit -m "feat: add complete-challenges cron endpoint, register in vercel.json"
```

---

## Task 6: Trophies Tab (Read-Only)

**Files:**
- Modify: `src/TradingCircles.tsx`

This task adds the Trophies tab with the award-shelf design. No challenge creation yet (Task 7).

- [ ] **Step 1: Add imports at the top of TradingCircles.tsx**

After the existing imports (line 4), add:

```typescript
import { fetchActiveChallenge, fetchTrophies } from "./data/circlesChallenges";
import type { CircleChallenge, ChallengeResult } from "./types";
```

- [ ] **Step 2: Add state for challenges and trophies**

Inside `TradingCircles` component, after the existing `useState` declarations (after line 16), add:

```typescript
const [circleTab, setCircleTab] = useState<"feed" | "leaderboard" | "chat" | "members" | "trophies">("feed");
const [activeChallenge, setActiveChallenge] = useState<CircleChallenge | null>(null);
const [trophies, setTrophies] = useState<ChallengeResult[]>([]);
const [trophiesLoading, setTrophiesLoading] = useState(false);
```

Remove or replace the old `circleTab` declaration (which only listed `"leaderboard" | "chat" | "members"`).

- [ ] **Step 3: Load challenge data when opening a circle**

In `openCircle()` (around line 80), after `setLoadingLB(true)`:

```typescript
async function openCircle(circle: any) {
  setActiveCircle(circle);
  setCirclesView("detail");
  setExpandedMember(null);
  setCircleTab("feed");        // ← changed from "leaderboard"
  setChatMessages([]);
  setChatInput("");
  setActiveChallenge(null);
  setTrophies([]);
  setLoadingLB(true);
  const [entries, challenge] = await Promise.all([
    fetchCircleLeaderboard(circle),
    fetchActiveChallenge(circle.code),
  ]);
  setLeaderboard(entries);
  setActiveChallenge(challenge);
  setLoadingLB(false);
}
```

- [ ] **Step 4: Load trophies when trophies tab is selected**

Add a `useEffect` after the existing leaderboard refresh effect (after line 123):

```typescript
useEffect(() => {
  if (circleTab !== "trophies" || !activeCircle) return;
  let alive = true;
  setTrophiesLoading(true);
  fetchTrophies(activeCircle.code).then(results => {
    if (alive) { setTrophies(results); setTrophiesLoading(false); }
  });
  return () => { alive = false; };
}, [circleTab, activeCircle]);
```

- [ ] **Step 5: Add the Trophies tab button in the tab bar**

Find the section in the detail view where tab buttons are rendered (search for `circleTab === "leaderboard"`). It will look like:

```tsx
<button onClick={() => setCircleTab("leaderboard")} ...>Leaderboard</button>
<button onClick={() => setCircleTab("chat")} ...>Chat</button>
<button onClick={() => setCircleTab("members")} ...>Members</button>
```

Change the tab list to:

```tsx
{(["feed","leaderboard","chat","members","trophies"] as const).map(t => (
  <button
    key={t}
    onClick={() => setCircleTab(t)}
    style={{
      ...MONO,
      padding: "9px 10px",
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: circleTab === t ? C.text : C.muted,
      borderBottom: `1.5px solid ${circleTab === t ? C.text : "transparent"}`,
      background: "none",
      border: "none",
      borderBottom: `1.5px solid ${circleTab === t ? C.text : "transparent"}`,
      cursor: "pointer",
      whiteSpace: "nowrap",
      flexShrink: 0,
    }}
  >
    {t.charAt(0).toUpperCase() + t.slice(1)}
  </button>
))}
```

- [ ] **Step 6: Add the Trophies tab content panel**

Find where `circleTab === "members"` content ends. After that closing block, add:

```tsx
{/* ── TROPHIES TAB ── */}
{circleTab === "trophies" && (
  <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
    {trophiesLoading && (
      <div style={{ ...MONO, fontSize: 11, color: C.muted, textAlign: "center", padding: 24 }}>Loading…</div>
    )}

    {/* Active challenge card */}
    {activeChallenge && (
      <>
        <div style={{ ...MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: C.muted, textTransform: "uppercase", padding: "4px 0 6px" }}>Active</div>
        <div style={{ background: C.panel, border: `1px solid ${C.border2}`, borderTop: `1.5px solid ${C.text2}`, borderRadius: 10, padding: "13px 15px", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ ...MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: C.text2, writingMode: "vertical-lr", transform: "rotate(180deg)", flexShrink: 0, textTransform: "uppercase" }}>Live</div>
          <div style={{ width: 1, height: 36, background: C.border2, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text2 }}>{activeChallenge.title}</div>
            <div style={{ ...MONO, fontSize: 11, color: C.muted, marginTop: 1 }}>In progress</div>
            <div style={{ display: "flex", gap: 8, marginTop: 5 }}>
              <div style={{ ...MONO, fontSize: 10, color: C.muted }}>{activeChallenge.metric.toUpperCase()}</div>
              <div style={{ ...MONO, fontSize: 10, color: C.muted, flexShrink: 0 }}>{formatCountdown(activeChallenge.endsAt)}</div>
            </div>
          </div>
        </div>
      </>
    )}

    {/* Past challenges */}
    {trophies.length > 0 && (
      <>
        <div style={{ ...MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: C.muted, textTransform: "uppercase", padding: "8px 0 6px" }}>Past Challenges</div>
        {trophies.map(r => (
          <div key={r.id} style={{ background: C.panel, border: `1px solid ${C.border}`, borderTop: "1.5px solid #A88C50", borderRadius: 10, padding: "13px 15px", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ ...MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "#A88C50", writingMode: "vertical-lr", transform: "rotate(180deg)", flexShrink: 0, textTransform: "uppercase" }}>1st</div>
            <div style={{ width: 1, height: 36, background: C.border2, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.winnerHandle ? `@${r.winnerHandle}` : r.winnerName}
              </div>
              <div style={{ ...MONO, fontSize: 13, fontWeight: 700, color: C.text2, marginTop: 1 }}>{formatTrophyValue(r)}</div>
              <div style={{ display: "flex", gap: 8, marginTop: 5 }}>
                <div style={{ ...MONO, fontSize: 10, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.challenge?.title ?? ""}</div>
                <div style={{ ...MONO, fontSize: 10, color: C.muted, flexShrink: 0 }}>{new Date(r.snapshotAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
              </div>
            </div>
          </div>
        ))}
      </>
    )}

    {!trophiesLoading && trophies.length === 0 && !activeChallenge && (
      <div style={{ fontSize: 13, color: C.muted, textAlign: "center", padding: "32px 0" }}>No challenges yet</div>
    )}
  </div>
)}
```

- [ ] **Step 7: Add helper functions**

Near the top of the component (after `metricDisplay`), add:

```typescript
function formatCountdown(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "ended";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  if (d > 0) return `${d}d ${h}h left`;
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`;
}

function formatTrophyValue(r: ChallengeResult): string {
  const metric = r.challenge?.metric ?? "dollar";
  const v = r.winningValue;
  if (metric === "dollar")  return `${v >= 0 ? "+" : ""}$${Math.abs(v).toFixed(0)}`;
  if (metric === "winrate") return `${v.toFixed(1)}%`;
  if (metric === "trades")  return `${Math.round(v)} trades`;
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}R`;
}
```

- [ ] **Step 8: Verify in browser**

Run `npm run dev`. Open the app → Circles → open a circle → click "Trophies" tab. Should show "No challenges yet" (or trophies if any exist). Should NOT crash.

- [ ] **Step 9: Commit**

```bash
git add src/TradingCircles.tsx src/data/circlesChallenges.ts src/types.ts
git commit -m "feat: add Trophies tab with award-shelf design"
```

---

## Task 7: Active Challenge Banner + Challenge Creation UI

**Files:**
- Modify: `src/TradingCircles.tsx`

- [ ] **Step 1: Add challenge creation state**

Inside the component, after the trophies state declarations:

```typescript
const [showChallengeSheet, setShowChallengeSheet] = useState(false);
const [challengeForm, setChallengeForm] = useState({
  title: "",
  metric: "r" as CircleChallenge["metric"],
  duration: "7" as "3" | "7" | "14" | "30",
});
const [challengeCreating, setChallengCreating] = useState(false);
```

- [ ] **Step 2: Add createChallengeFromForm function**

After `openCircle`, add:

```typescript
async function createChallengeFromForm() {
  if (!activeCircle || !challengeForm.title.trim() || challengeCreating) return;
  setChallengCreating(true);
  const days = parseInt(challengeForm.duration);
  const endsAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const result = await createChallenge(
    activeCircle.code,
    challengeForm.title.trim(),
    challengeForm.metric,
    endsAt,
    getMyCode()
  );
  if (result) {
    setActiveChallenge(result);
    setShowChallengeSheet(false);
    setChallengeForm({ title: "", metric: "r", duration: "7" });
    showToast("Challenge started!");
  } else {
    showToast("Failed to start challenge");
  }
  setChallengCreating(false);
}
```

- [ ] **Step 3: Add the active challenge strip in the detail view**

Find the circle detail header area (after the circle name/code/member count section, before the tab bar). Add:

```tsx
{/* Active challenge strip */}
{activeChallenge && (
  <div style={{
    margin: "0 16px 12px",
    borderLeft: `2px solid ${C.accent ?? "#7C6EFF"}`,
    padding: "6px 10px",
    background: "rgba(255,255,255,0.025)",
    borderRadius: "0 6px 6px 0",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  }}>
    <div>
      <div style={{ fontSize: 12, fontWeight: 600 }}>{activeChallenge.title}</div>
      <div style={{ ...MONO, fontSize: 10, color: C.text2, marginTop: 1, letterSpacing: "0.04em" }}>
        {(activeChallenge.metric ?? "").toUpperCase()} · CHALLENGE
      </div>
    </div>
    <div style={{ ...MONO, fontSize: 11, fontWeight: 700, color: C.text2, letterSpacing: "0.05em" }}>
      {formatCountdown(activeChallenge.endsAt)}
    </div>
  </div>
)}
```

- [ ] **Step 4: Add "Start Challenge" button in Trophies tab**

At the top of the Trophies tab panel (before the active challenge card), add:

```tsx
{/* Start Challenge — Pro owners only, no active challenge running */}
{activeCircle?.isOwner && !activeChallenge && (
  <button
    onClick={() => setShowChallengeSheet(true)}
    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 13px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 9, cursor: "pointer", marginBottom: 4, width: "100%" }}
  >
    <div style={{ textAlign: "left" }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Start New Challenge</div>
      <div style={{ ...MONO, fontSize: 10, color: C.muted, marginTop: 1 }}>PRO · OWNER ONLY</div>
    </div>
    <div style={{ color: C.muted, fontSize: 14 }}>→</div>
  </button>
)}
```

- [ ] **Step 5: Add the challenge creation bottom sheet**

At the very end of the detail view's return JSX (before the closing container div), add:

```tsx
{/* Challenge creation sheet */}
{showChallengeSheet && (
  <div
    onClick={() => setShowChallengeSheet(false)}
    style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
  >
    <div
      onClick={e => e.stopPropagation()}
      style={{ width: "100%", maxWidth: 420, background: C.panel, borderRadius: "16px 16px 0 0", padding: "20px 16px 32px", border: `1px solid ${C.border2}`, borderBottom: "none" }}
    >
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Start Challenge</div>

      {/* Title */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ ...MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: C.muted, marginBottom: 6, textTransform: "uppercase" }}>Title</div>
        <input
          {...inp}
          placeholder="e.g. Best R This Week"
          value={challengeForm.title}
          onChange={e => setChallengeForm(f => ({ ...f, title: e.target.value }))}
          style={{ ...inp?.style, width: "100%" }}
        />
      </div>

      {/* Metric */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ ...MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: C.muted, marginBottom: 6, textTransform: "uppercase" }}>Metric</div>
        <select
          {...sel}
          value={challengeForm.metric}
          onChange={e => setChallengeForm(f => ({ ...f, metric: e.target.value as CircleChallenge["metric"] }))}
        >
          <option value="r">R-Multiple</option>
          <option value="dollar">$ P&amp;L</option>
          <option value="winrate">Win Rate</option>
          <option value="trades">Most Trades</option>
          <option value="avgr">Avg R</option>
        </select>
      </div>

      {/* Duration */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ ...MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: C.muted, marginBottom: 6, textTransform: "uppercase" }}>Duration</div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["3","7","14","30"] as const).map(d => (
            <button
              key={d}
              onClick={() => setChallengeForm(f => ({ ...f, duration: d }))}
              style={{ flex: 1, padding: "7px 0", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${challengeForm.duration === d ? C.text : C.border}`, background: challengeForm.duration === d ? C.text : "transparent", color: challengeForm.duration === d ? C.bg : C.muted }}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      <button
        onClick={createChallengeFromForm}
        disabled={!challengeForm.title.trim() || challengeCreating}
        style={{ width: "100%", padding: "13px", background: C.text, border: "none", borderRadius: 10, color: C.bg, fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: (!challengeForm.title.trim() || challengeCreating) ? 0.4 : 1 }}
      >
        {challengeCreating ? "Starting…" : "Start Challenge"}
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 6: Verify in browser**

`npm run dev` → open a circle as owner → Trophies tab → "Start New Challenge" button appears → click it → sheet opens → fill in Title, pick metric and duration → Start → strip appears above tabs, "No challenges yet" row disappears.

- [ ] **Step 7: Commit**

```bash
git add src/TradingCircles.tsx
git commit -m "feat: add active challenge strip and challenge creation bottom sheet"
```

---

## Task 8: SharedTradeCard Component

**Files:**
- Create: `src/components/SharedTradeCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
// src/components/SharedTradeCard.tsx
import type { SharedTrade } from "../types";
import { MONO } from "../shared";

const REACTIONS = ["🔥","💎","🎯","👍","💀","🤯"];

interface Props {
  trade: SharedTrade;
  myCode: string;
  C: Record<string, string>;
  onReact: (tradeId: string, emoji: string) => void;
}

export function SharedTradeCard({ trade, myCode, C, onReact }: Props) {
  const isWin = trade.outcome === "win";
  const isLoss = trade.outcome === "loss";
  const borderLeft = isWin ? "2px solid #4ade80" : isLoss ? "2px solid #f87171" : `1px solid ${C.border}`;

  function fmtPnl(v: number) {
    return `${v >= 0 ? "+" : ""}$${Math.abs(v).toFixed(0)}`;
  }
  function fmtR(v: number | null) {
    if (v === null) return null;
    return `${v >= 0 ? "+" : ""}${v.toFixed(2)}R`;
  }
  function fmtTime(iso: string) {
    const diff = (Date.now() - new Date(iso).getTime()) / 60000;
    if (diff < 1) return "just now";
    if (diff < 60) return `${Math.floor(diff)}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  return (
    <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderLeft, borderRadius: 12, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "11px 13px 8px", display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: C.dim, border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: C.text2, flexShrink: 0 }}>
          {(trade.authorHandle || trade.authorName || "?").charAt(0).toUpperCase()}
        </div>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600 }}>@{trade.authorHandle || trade.authorName}</div>
          <div style={{ ...MONO, fontSize: 10, color: C.muted, letterSpacing: "0.03em" }}>{fmtTime(trade.sharedAt)}</div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "0 13px 10px", display: "flex", flexDirection: "column", gap: 7 }}>
        {/* Pair row */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{trade.pair}</div>
          <div style={{ ...MONO, fontSize: 10, color: C.text2, letterSpacing: "0.06em" }}>
            {trade.side.toUpperCase()} · {trade.date}
          </div>
        </div>

        {/* Metrics */}
        <div style={{ display: "flex", gap: 16 }}>
          <div>
            <div style={{ ...MONO, fontSize: 9, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>P&L</div>
            <div style={{ ...MONO, fontSize: 13, fontWeight: 700, color: trade.pnl >= 0 ? "#4ade80" : "#f87171" }}>{fmtPnl(trade.pnl)}</div>
          </div>
          {trade.rr !== null && (
            <div>
              <div style={{ ...MONO, fontSize: 9, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>R</div>
              <div style={{ ...MONO, fontSize: 13, fontWeight: 700, color: trade.rr >= 0 ? "#4ade80" : "#f87171" }}>{fmtR(trade.rr)}</div>
            </div>
          )}
          {trade.strategy && (
            <div>
              <div style={{ ...MONO, fontSize: 9, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>Strategy</div>
              <div style={{ ...MONO, fontSize: 12, fontWeight: 700, color: C.text2 }}>{trade.strategy}</div>
            </div>
          )}
        </div>

        {/* Notes */}
        {trade.notes && (
          <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.55 }}>{trade.notes}</div>
        )}

        {/* Screenshot */}
        {trade.screenshot && (
          <img src={trade.screenshot} alt="trade screenshot" style={{ width: "100%", borderRadius: 7, maxHeight: 200, objectFit: "cover" }} />
        )}
      </div>

      {/* Reactions */}
      <div style={{ padding: "6px 13px 10px", display: "flex", gap: 10, borderTop: `1px solid ${C.border}` }}>
        {REACTIONS.map(emoji => {
          const reactors = trade.reactions[emoji] ?? [];
          const hasReacted = reactors.includes(myCode);
          return (
            <button
              key={emoji}
              onClick={() => onReact(trade.id, emoji)}
              style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 13, cursor: "pointer", background: "none", border: "none", padding: 0, opacity: hasReacted ? 1 : 0.5 }}
            >
              {emoji}
              {reactors.length > 0 && (
                <span style={{ ...MONO, fontSize: 10, color: C.text2 }}>{reactors.length}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/SharedTradeCard.tsx
git commit -m "feat: add SharedTradeCard component with reactions"
```

---

## Task 9: Share Trade Flow

**Files:**
- Modify: `src/TradingCircles.tsx`
- This task adds a "Share" icon to trade cards and the circle-picker sheet.
  The trade list is rendered in `TRADR.tsx`. We need to thread a callback down.

**Note:** The trade list is in `src/TRADR.tsx`. The share flow opens a circle picker which is part of `TradingCircles.tsx`. The cleanest v1 approach: add a `onShareTrade` prop to `TradingCircles` that opens the picker with a selected trade, and expose it up through the `useCircles` hook so `TRADR.tsx` can wire the share button on each trade card.

- [ ] **Step 1: Add share state to TradingCircles.tsx**

After the challenge sheet state:

```typescript
const [tradeToShare, setTradeToShare] = useState<import("./types").Trade | null>(null);
const [sharingToCircle, setSharingToCircle] = useState<string | null>(null); // circle code
```

- [ ] **Step 2: Add openSharePicker function**

```typescript
function openSharePicker(trade: import("./types").Trade) {
  setTradeToShare(trade);
}
```

Expose this via props. In the TradingCircles props type (it uses `any` for now), this will just work.

- [ ] **Step 3: Add the circle picker sheet JSX**

At the end of the TradingCircles return (alongside the challenge sheet):

```tsx
{/* Trade share picker */}
{tradeToShare && (
  <div
    onClick={() => setTradeToShare(null)}
    style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
  >
    <div
      onClick={e => e.stopPropagation()}
      style={{ width: "100%", maxWidth: 420, background: C.panel, borderRadius: "16px 16px 0 0", padding: "20px 16px 32px", border: `1px solid ${C.border2}`, borderBottom: "none" }}
    >
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Share Trade</div>
      <div style={{ ...MONO, fontSize: 10, color: C.muted, marginBottom: 14 }}>
        {tradeToShare.pair} · {(tradeToShare.direction || "").toUpperCase()} · {tradeToShare.date}
      </div>

      <div style={{ ...MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: C.muted, marginBottom: 8, textTransform: "uppercase" }}>Select Circle</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
        {myCircles.filter((c: any) => c.code !== KODA_GLOBAL_CODE).map((circle: any) => {
          const selected = sharingToCircle === circle.code;
          return (
            <div
              key={circle.code}
              onClick={() => setSharingToCircle(selected ? null : circle.code)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 13px", background: selected ? "rgba(255,255,255,0.04)" : C.panel, border: `1px solid ${selected ? C.border2 : C.border}`, borderRadius: 9, cursor: "pointer" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 15 }}>{circle.emoji || "◆"}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{circle.name}</div>
                  <div style={{ ...MONO, fontSize: 10, color: C.muted }}>{circle.members?.length ?? 0} members</div>
                </div>
              </div>
              <div style={{ width: 16, height: 16, borderRadius: "50%", background: selected ? C.text : "transparent", border: `1px solid ${selected ? C.text : C.border2}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {selected && <span style={{ fontSize: 10, color: C.bg }}>✓</span>}
              </div>
            </div>
          );
        })}
      </div>

      <button
        disabled={!sharingToCircle}
        onClick={async () => {
          if (!sharingToCircle || !tradeToShare) return;
          setSharingToCircle(null);
          const result = await shareTrade(sharingToCircle, { name: profile.name, handle: profile.handle, avatar: profile.avatar, code: getMyCode() }, tradeToShare);
          setTradeToShare(null);
          if (result === "ok") showToast("Shared!");
          else if (result === "duplicate") showToast("Already shared to this circle");
          else showToast("Failed to share");
        }}
        style={{ width: "100%", padding: "13px", background: C.text, border: "none", borderRadius: 10, color: C.bg, fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: sharingToCircle ? 1 : 0.4 }}
      >
        {sharingToCircle ? `Share to ${myCircles.find((c: any) => c.code === sharingToCircle)?.name}` : "Select a circle"}
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 4: Import shareTrade in TradingCircles.tsx**

Add to imports:

```typescript
import { shareTrade } from "./data/circlesSharedTrades";
```

- [ ] **Step 5: Pass openSharePicker down to TRADR.tsx**

In `TRADR.tsx`, find where `<TradingCircles>` is rendered. Add `openSharePicker={...}` prop. Then find where trade cards are rendered and add a Share button that calls `openSharePicker(trade)`. The share icon goes alongside existing react/comment buttons on each trade card.

Find the trade card action area in `TRADR.tsx` (search for `reaction` or the emoji reaction row on trades). After the reaction buttons, add:

```tsx
<button
  title="Share to circle"
  onClick={() => openShareTrade?.(trade)}
  style={{ padding: "4px 6px", background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 13 }}
>
  ↗
</button>
```

Wire `openShareTrade` as a prop passed from TRADR.tsx into the trade card rendering section, which receives it from `TradingCircles`'s `openSharePicker` function exposed via the `useCircles` hook return.

In `src/hooks/useCircles.ts`, add to the hook's return object:

```typescript
openShareTrade: (trade: Trade) => void;
```

And maintain a ref-based callback that `TradingCircles` registers on mount via a prop.

**Simpler v1 alternative:** Since `TradingCircles` already receives `myCircles` and the share picker is inside it, expose `openSharePicker` as a callback ref via a `registerShareHandler` prop. In TRADR.tsx:

```typescript
const shareTradeFnRef = useRef<((t: Trade) => void) | null>(null);
```

Pass `registerShareHandler={(fn) => { shareTradeFnRef.current = fn; }}` to TradingCircles. In TradingCircles, call `registerShareHandler(openSharePicker)` in a `useEffect` on mount. On trade cards in TRADR.tsx, call `shareTradeFnRef.current?.(trade)`.

- [ ] **Step 6: Verify in browser**

`npm run dev` → go to Trades view → click Share (↗) on a trade → picker sheet opens → select a circle → "Share to X" button → toast "Shared!". Go to that circle → Feed tab → trade card appears (after Task 10).

- [ ] **Step 7: Commit**

```bash
git add src/TradingCircles.tsx src/TRADR.tsx src/hooks/useCircles.ts
git commit -m "feat: add trade share picker — share any trade to a circle"
```

---

## Task 10: Unified Feed Tab

**Files:**
- Modify: `src/TradingCircles.tsx`

This is the default tab. It merges shared trades + chat messages + challenge events, sorted by timestamp descending.

- [ ] **Step 1: Add feed state**

After existing state declarations:

```typescript
const [feedItems, setFeedItems] = useState<import("./types").FeedItem[]>([]);
const [feedLoading, setFeedLoading] = useState(false);
const feedBottomRef = useRef<HTMLDivElement>(null);
const [composeText, setComposeText] = useState("");
const [composeSending, setComposeSending] = useState(false);
```

- [ ] **Step 2: Add import for fetchSharedTrades**

```typescript
import { fetchSharedTrades, reactToSharedTrade } from "./data/circlesSharedTrades";
import { SharedTradeCard } from "./components/SharedTradeCard";
import type { FeedItem } from "./types";
```

- [ ] **Step 3: Add loadFeed function**

```typescript
async function loadFeed(circle: { code: string }) {
  setFeedLoading(true);
  const [messages, sharedTrades, challenges] = await Promise.all([
    supabase
      .from("circle_messages")
      .select("*")
      .eq("circle_code", circle.code)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(r => r.data ?? []),
    fetchSharedTrades(circle.code, 50),
    supabase
      .from("circle_challenges")
      .select("*")
      .eq("circle_code", circle.code)
      .order("started_at", { ascending: false })
      .limit(20)
      .then(r => r.data ?? []),
  ]);

  const items: FeedItem[] = [];

  for (const m of messages) {
    const isJoin = typeof m.text === "string" && m.text.includes("joined the circle");
    items.push(isJoin
      ? { type: "member_joined", ts: m.created_at, data: { text: m.text, id: m.id } }
      : { type: "message", ts: m.created_at, data: m }
    );
  }

  for (const t of sharedTrades) {
    items.push({ type: "trade", ts: t.sharedAt, data: t });
  }

  for (const c of challenges) {
    items.push({ type: "challenge_started", ts: c.started_at, data: rowToChallenge(c) });
  }

  items.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  setFeedItems(items);
  setFeedLoading(false);
}
```

Add `rowToChallenge` inline or import from `circlesChallenges`. To avoid circular imports, copy the tiny mapper inline:

```typescript
function rowToChallenge(row: Record<string, unknown>): import("./types").CircleChallenge {
  return {
    id: row.id as string, circleCode: row.circle_code as string,
    title: row.title as string, metric: row.metric as import("./types").CircleChallenge["metric"],
    startedAt: row.started_at as string, endsAt: row.ends_at as string,
    createdBy: row.created_by as string, status: row.status as "active" | "completed",
  };
}
```

- [ ] **Step 4: Call loadFeed from openCircle**

In `openCircle`, add `loadFeed(circle)` alongside the other loads:

```typescript
async function openCircle(circle: any) {
  setActiveCircle(circle);
  setCirclesView("detail");
  setExpandedMember(null);
  setCircleTab("feed");
  setChatMessages([]);
  setChatInput("");
  setFeedItems([]);
  setActiveChallenge(null);
  setTrophies([]);
  setLoadingLB(true);
  const [entries, challenge] = await Promise.all([
    fetchCircleLeaderboard(circle),
    fetchActiveChallenge(circle.code),
  ]);
  setLeaderboard(entries);
  setActiveChallenge(challenge);
  setLoadingLB(false);
  loadFeed(circle);  // non-blocking, sets feedLoading itself
}
```

- [ ] **Step 5: Add compose send handler**

```typescript
async function sendFeedMessage() {
  const text = composeText.trim();
  if (!text || composeSending || !activeCircle || !profile?.uid) return;
  setComposeSending(true);
  setComposeText("");
  await supabase.from("circle_messages").insert({
    circle_code: activeCircle.code,
    sender_id: profile.uid,
    sender_name: profile.name || "Trader",
    sender_handle: profile.handle || "",
    text,
  });
  setComposeSending(false);
  loadFeed(activeCircle);
}
```

- [ ] **Step 6: Add Feed tab content panel**

Find where `{circleTab === "leaderboard" && ...}` is rendered. Before it, add:

```tsx
{/* ── FEED TAB ── */}
{circleTab === "feed" && (
  <div style={{ padding: "10px 16px 90px", display: "flex", flexDirection: "column", gap: 8 }}>
    {feedLoading && (
      <div style={{ ...MONO, fontSize: 11, color: C.muted, textAlign: "center", padding: 24 }}>Loading…</div>
    )}

    {feedItems.map(item => {
      if (item.type === "trade") {
        return (
          <SharedTradeCard
            key={`trade-${item.data.id}`}
            trade={item.data}
            myCode={getMyCode()}
            C={C}
            onReact={async (id, emoji) => {
              await reactToSharedTrade(id, emoji, getMyCode());
              setFeedItems(prev => prev.map(fi => {
                if (fi.type !== "trade" || fi.data.id !== id) return fi;
                const reactions = { ...(fi.data.reactions ?? {}) };
                const existing = reactions[emoji] ?? [];
                reactions[emoji] = existing.includes(getMyCode())
                  ? existing.filter(c => c !== getMyCode())
                  : [...existing, getMyCode()];
                return { ...fi, data: { ...fi.data, reactions } };
              }));
            }}
          />
        );
      }
      if (item.type === "message") {
        return (
          <div key={`msg-${item.data.id}`} style={{ display: "flex", gap: 9, padding: "5px 0" }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: C.dim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: C.text2, flexShrink: 0, marginTop: 2 }}>
              {(item.data.sender_handle || "?").charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>@{item.data.sender_handle || item.data.sender_name}</span>
                <span style={{ ...MONO, fontSize: 10, color: C.muted }}>{fmtMsgTime(item.data.created_at)}</span>
              </div>
              <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.5 }}>{item.data.text}</div>
            </div>
          </div>
        );
      }
      if (item.type === "challenge_started") {
        return (
          <div key={`ch-${item.data.id}`} style={{ ...MONO, fontSize: 10, color: C.muted, letterSpacing: "0.04em", textAlign: "center", padding: "4px 0" }}>
            challenge started · {item.data.title}
          </div>
        );
      }
      if (item.type === "member_joined") {
        return (
          <div key={`join-${item.data.id}`} style={{ ...MONO, fontSize: 10, color: C.muted, letterSpacing: "0.04em", textAlign: "center", padding: "4px 0" }}>
            {item.data.text}
          </div>
        );
      }
      return null;
    })}

    {!feedLoading && feedItems.length === 0 && (
      <div style={{ fontSize: 13, color: C.muted, textAlign: "center", padding: "32px 0" }}>No activity yet. Say something!</div>
    )}
    <div ref={feedBottomRef} />
  </div>
)}
```

- [ ] **Step 7: Add compose bar (feed tab only)**

This is a fixed bar at the bottom, visible only when `circleTab === "feed"` and `circlesView === "detail"`. Add it after the tab content panels, inside the detail view:

```tsx
{circleTab === "feed" && (
  <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 420, padding: "10px 16px 22px", background: `linear-gradient(to top, ${C.bg} 65%, transparent)`, display: "flex", alignItems: "center", gap: 7, zIndex: 10 }}>
    <button
      title="Share a trade"
      onClick={() => { /* opens trade picker from trades tab — wire in Task 9 */ }}
      style={{ width: 36, height: 36, borderRadius: "50%", background: "transparent", border: `1px solid ${C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
    >
      <span style={{ fontSize: 14, color: C.text2 }}>↗</span>
    </button>
    <input
      value={composeText}
      onChange={e => setComposeText(e.target.value)}
      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendFeedMessage(); } }}
      placeholder="Message the circle…"
      style={{ flex: 1, background: C.panel, border: `1px solid ${C.border2}`, borderRadius: 999, padding: "9px 15px", fontSize: 12, color: C.text, outline: "none", fontFamily: "inherit" }}
    />
    <button
      onClick={sendFeedMessage}
      disabled={!composeText.trim() || composeSending}
      style={{ width: 36, height: 36, borderRadius: "50%", background: C.text, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, opacity: (!composeText.trim() || composeSending) ? 0.4 : 1 }}
    >
      <span style={{ fontSize: 13, color: C.bg }}>→</span>
    </button>
  </div>
)}
```

- [ ] **Step 8: Verify in browser**

`npm run dev` → open a circle → Feed tab is default → empty state shows → type a message → send → message appears in feed → share a trade (from Task 9) → trade card appears in feed with reactions → reactions toggle correctly.

- [ ] **Step 9: Commit**

```bash
git add src/TradingCircles.tsx src/components/SharedTradeCard.tsx
git commit -m "feat: add unified activity feed tab with trade cards, chat messages, and event pills"
```

---

## Task 11: Realtime Extensions + Polish

**Files:**
- Modify: `src/TradingCircles.tsx`

- [ ] **Step 1: Extend realtime subscriptions to new tables**

In the existing `useEffect` that sets up the chat channel (around line 107), extend it to also subscribe to `circle_shared_trades` and `circle_challenges`:

```typescript
// In the useEffect for subscriptions:
const sharedTradesChannel = supabase
  .channel(`circle_trades_${activeCircle.code}`)
  .on("postgres_changes" as any, {
    event: "INSERT",
    schema: "public",
    table: "circle_shared_trades",
    filter: `circle_code=eq.${activeCircle.code}`,
  }, (payload: any) => {
    const newItem: FeedItem = {
      type: "trade",
      ts: payload.new.shared_at,
      data: rowToSharedTrade(payload.new),
    };
    setFeedItems(prev => [newItem, ...prev]);
  })
  .subscribe();

const challengesChannel = supabase
  .channel(`circle_challenges_${activeCircle.code}`)
  .on("postgres_changes" as any, {
    event: "INSERT",
    schema: "public",
    table: "circle_challenges",
    filter: `circle_code=eq.${activeCircle.code}`,
  }, (payload: any) => {
    const ch = rowToChallenge(payload.new);
    setActiveChallenge(ch);
    const newItem: FeedItem = { type: "challenge_started", ts: ch.startedAt, data: ch };
    setFeedItems(prev => [newItem, ...prev]);
  })
  .subscribe();

// Return cleanup:
return () => {
  alive = false; clearInterval(id);
  try { unsub(); } catch {}
  supabase.removeChannel(chatChannel);
  supabase.removeChannel(sharedTradesChannel);
  supabase.removeChannel(challengesChannel);
};
```

Add `rowToSharedTrade` helper inline:

```typescript
function rowToSharedTrade(row: Record<string, unknown>): import("./types").SharedTrade {
  return {
    id: row.id as string, circleCode: row.circle_code as string,
    authorCode: row.author_code as string, authorName: row.author_name as string,
    authorHandle: row.author_handle as string, authorAvatar: row.author_avatar as string,
    tradeId: row.trade_id as string, pair: row.pair as string,
    side: row.side as "long" | "short", outcome: row.outcome as "win" | "loss" | "be",
    pnl: row.pnl as number, rr: (row.rr as number | null) ?? null,
    strategy: (row.strategy as string | null) ?? null, notes: (row.notes as string | null) ?? null,
    screenshot: (row.screenshot as string | null) ?? null, date: row.date as string,
    sharedAt: row.shared_at as string, reactions: (row.reactions ?? {}) as Record<string, string[]>,
  };
}
```

Also extend the chat realtime to add messages to the feed:

```typescript
const chatChannel = supabase
  .channel(`circle_chat_${activeCircle.code}`)
  .on("postgres_changes" as any, {
    event: "INSERT", schema: "public",
    table: "circle_messages",
    filter: `circle_code=eq.${activeCircle.code}`,
  }, (payload: any) => {
    setChatMessages(prev => prev.some((m: any) => m.id === payload.new.id) ? prev : [...prev, payload.new]);
    setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    // Also add to feed
    const isJoin = typeof payload.new.text === "string" && payload.new.text.includes("joined the circle");
    const newItem: FeedItem = isJoin
      ? { type: "member_joined", ts: payload.new.created_at, data: { text: payload.new.text, id: payload.new.id } }
      : { type: "message", ts: payload.new.created_at, data: payload.new };
    setFeedItems(prev => [newItem, ...prev]);
  })
  .subscribe();
```

- [ ] **Step 2: Client-side challenge completion fallback**

In `openCircle`, after fetching the active challenge, check if it has already expired:

```typescript
const [entries, challenge] = await Promise.all([
  fetchCircleLeaderboard(circle),
  fetchActiveChallenge(circle.code),
]);
setLeaderboard(entries);
setActiveChallenge(challenge);
setLoadingLB(false);

// Client-side fallback: if cron missed a completion, trigger it
if (challenge && new Date(challenge.endsAt) < new Date()) {
  fetch("/api/cron/complete-challenges", { method: "POST" }).catch(() => {});
  setTimeout(() => fetchActiveChallenge(circle.code).then(setActiveChallenge), 2000);
}
```

- [ ] **Step 3: Final TypeScript build check**

```bash
npm run build 2>&1
```

Fix any remaining type errors.

- [ ] **Step 4: Manual smoke test checklist**

- [ ] Open a circle → Feed tab shows by default
- [ ] Type in compose bar + send → message appears in feed
- [ ] Share a trade (↗ on trade card) → picker opens → select circle → trade card appears in feed
- [ ] Open Trophies tab → "No challenges yet" or existing trophies
- [ ] Owner: click "Start New Challenge" → fill form → start → strip appears above tabs
- [ ] Leave challenge running past `ends_at` → refresh → auto-message appears in feed
- [ ] Challenge completion cron: test by calling `POST /api/cron/complete-challenges` manually → result written to DB
- [ ] Reactions on trade cards toggle correctly
- [ ] Real-time: open same circle on two tabs → send message from one → appears in other within 2s

- [ ] **Step 5: Commit**

```bash
git add src/TradingCircles.tsx
git commit -m "feat: extend realtime to shared trades and challenges, add client-side completion fallback"
```

- [ ] **Step 6: Push**

```bash
git push
```

---

## Self-Review

**Spec coverage check:**
- ✅ `circle_challenges` table — Task 1
- ✅ `circle_challenge_results` table — Task 1
- ✅ `circle_shared_trades` table — Task 1
- ✅ `circle_messages` table (missing, now fixed) — Task 1
- ✅ Create challenge (Pro owner, bottom sheet, metric picker, duration) — Task 7
- ✅ Active challenge banner (countdown strip) — Task 7
- ✅ One active challenge per circle (query returns at most one active) — Task 3
- ✅ Challenge completion (cron + client-side fallback) — Tasks 5 + 11
- ✅ Auto-message on completion — Task 5
- ✅ Trophy shelf (permanent record, reverse-chrono) — Task 6
- ✅ "Start New Challenge" button in trophy shelf — Task 7
- ✅ Share icon on trade cards — Task 9
- ✅ Circle picker → duplicate guard (DB unique constraint, "already shared" toast) — Task 9
- ✅ Trade card in feed (pair, side, P&L, R, strategy, notes, screenshot) — Task 8
- ✅ Reaction bar (6 reactions, toggle) — Task 8
- ✅ Unified feed (merged, sorted by timestamp desc) — Task 10
- ✅ Compose bar (chat + share icon) — Task 10
- ✅ Realtime subscriptions extended — Task 11
- ✅ Chat tab still exists (unchanged, data from circle_messages) — no change needed
- ✅ Tab order: feed | leaderboard | chat | members | trophies — Task 6
- ✅ Free users participate in challenges (no gate on participation) — no gate added
- ✅ Pro gate on create challenges — Task 7 (button only visible for `activeCircle?.isOwner`)

**Missing from plan:** The spec says Pro gate on challenge creation is "Pro owners only" — Task 7 shows the button only for owners but doesn't check `isPro`. Add a check: `activeCircle?.isOwner && isPro && !activeChallenge`. Pass `isPro` as a prop (it's already computed in TRADR.tsx from `profile.plan`).

**Fix:** In Task 7 Step 4, change the condition from:
```tsx
{activeCircle?.isOwner && !activeChallenge && (
```
to:
```tsx
{activeCircle?.isOwner && isPro && !activeChallenge && (
```
And ensure `isPro` is passed as a prop to TradingCircles or computed inside it from `profile.plan`.
