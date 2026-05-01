# TRADR — KV → v2 Data Migration Plan

This is the longer-horizon plan for moving live data off `user_kv` /
`shared_kv` and onto the relational tables created by migration 002.

**Do not run this migration until phase 1 (DEPLOYMENT.md) is fully shipped
and the v2 tables are confirmed empty in prod.**

---

## Why a migration is needed

The current KV pattern stores every user's full trade history as one JSON
blob in `user_kv`. As users add trades, every save round-trips the entire
blob. At ~1KB per trade, an active user with 2000 trades writes 2MB on
every edit. This will eventually break either localStorage quota, Supabase
bandwidth, or both.

The v2 schema stores one row per trade. Saves become point-writes. Queries
become possible.

---

## Migration strategy: dual-write, gradual cutover

Each resource follows the same pattern:

1. **Stage 1 — write both ways.** When the user saves a trade, write the
   old `user_kv.tradr_trades` blob AND a row in `public.trades`. Reads
   still come from KV. Risk: doubled write load, no behavior change.
2. **Stage 2 — backfill.** A one-shot script reads every user's KV blob
   and inserts missing rows into `public.trades`, idempotent via `client_id`.
3. **Stage 3 — read from v2 behind a flag.** Set `tradr_flags = "newTrades"`
   on your own account. Compare what you see vs. what KV says.
4. **Stage 4 — flip the flag default.** New behavior becomes default. Old
   path stays dark for one week as an escape hatch.
5. **Stage 5 — delete the old code path and the KV row.**

---

## Per-resource order

Do them in this order. Smaller blast radius first.

| # | Resource | Why this order |
|---|---|---|
| 1 | profile | One row per user. Tiny. Read-heavy, write-rare. |
| 2 | follows | Edges already per-row. Easy to map. |
| 3 | circles + circle_members | Already per-row in shared_kv. Schema match is straightforward. |
| 4 | trades | Highest volume, biggest payoff, biggest risk. Do it last. |
| 5 | feed | Derive from trades + follows; delete the `tradr_feed_*` rows. |

---

## Backfill script template

Sketch — not yet written. When you're ready to do trades, this is the shape:

```ts
// scripts/backfill-trades.ts
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
// Service role bypasses RLS — required for cross-user backfill.

async function main() {
  const { data: rows } = await sb
    .from("user_kv")
    .select("user_id, value")
    .eq("key", "tradr_trades");

  for (const r of rows ?? []) {
    const trades = (r.value as any[]) ?? [];
    for (const t of trades) {
      await sb.from("trades").upsert({
        user_id: r.user_id,
        client_id: String(t.id),
        pair: t.pair,
        date: t.date,
        outcome: t.outcome,
        pnl: Number(t.pnl) || 0,
        rr: t.rr ?? null,
        strategy: t.strategy ?? "",
        setup: t.setup ?? null,
        notes: t.notes ?? null,
        session: t.session ?? null,
        entry_price: t.entryPrice ?? null,
        sl_price: t.slPrice ?? null,
        tp_price: t.tpPrice ?? null,
        screenshots: Array.isArray(t.screenshots) ? t.screenshots : [],
        reactions: t.reactions || {},
        created_at: t.createdAt ?? new Date(t.id).toISOString(),
      }, { onConflict: "user_id,client_id" });
    }
  }
}

main().catch(console.error);
```

Run with: `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/backfill-trades.ts`.

The service role key is only available in the Supabase dashboard → Project
Settings → API. **Never** commit it. **Never** ship it to the browser. Use
it once from your laptop, then forget it.

---

## Stop conditions

If at any stage you see:

- More than 1% of users with mismatched data between KV and v2,
- Increased error rate in Sentry tied to data modules,
- Confused user reports ("my trades disappeared"),

**Halt.** Turn the flag back off. Investigate before resuming.

---

## When to delete `user_kv` and `shared_kv`

Only after:

- All v2 reads have been at default-on for 14 days with no rollbacks,
- The `tradr_*` row count in KV is stable (no app code is still writing),
- You've taken a Supabase snapshot (Project → Database → Backups).

Then:

```sql
-- Final cleanup. Irreversible — verify backups first.
drop table if exists public.user_kv cascade;
drop table if exists public.shared_kv cascade;
```
