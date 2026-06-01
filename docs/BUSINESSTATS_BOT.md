# Businesstats Bot — Setup Guide

Internal Telegram bot that reports live Kōda metrics on command and posts a daily digest at 07:00 UTC.

---

## Access control

The bot is restricted to three Telegram user IDs and one group chat:

| Person | Telegram ID |
|--------|-------------|
| Dylon  | 7587404723  |
| Bruno  | 1711954101  |
| Dan    | 1918389515  |

The ops group chat ID is **-5275164414**. Commands work in DMs with the bot (for whitelisted users) and in that group chat only.

To add a new person: append their ID to `TELEGRAM_ALLOWED_USER_IDS` (comma-separated) in Vercel env vars and redeploy.

---

## Environment variables

Add all of these in **Vercel → Project → Settings → Environment Variables** (Production + Preview).

### Required

| Variable | How to get it |
|----------|---------------|
| `TELEGRAM_BUSINESSTATS_TOKEN` | Message `@BotFather` → `/mybots` → select `@businesstats_bot` → API Token |
| `TELEGRAM_BUSINESSTATS_SECRET` | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `TELEGRAM_ALLOWED_USER_IDS` | `7587404723,1711954101,1918389515` — already set in `.env.example` |
| `TELEGRAM_OPS_CHAT_ID` | `-5275164414` — already set in `.env.example` |

### Optional (metrics degrade gracefully if missing)

| Variable | How to get it |
|----------|---------------|
| `POSTHOG_PERSONAL_API_KEY` | posthog.com → Settings → Personal API keys → Create key |
| `POSTHOG_PROJECT_ID` | posthog.com → Settings → Project → Project ID (numeric) |
| `SENTRY_AUTH_TOKEN` | sentry.io → Settings → Auth Tokens → Create token (scopes: `project:read`, `org:read`) |
| `SENTRY_ORG` | `koda-tt` |
| `SENTRY_PROJECT` | Your project slug from sentry.io → Settings → Projects |

Stripe and Supabase are already configured — no new vars needed for revenue/user metrics.

---

## Register the webhook

Run this once after deploying. Replace `{TOKEN}` and `{SECRET}` with the real values:

```bash
curl "https://api.telegram.org/bot{TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://kodatrade.co.uk/api/businesstats",
    "secret_token": "{SECRET}",
    "allowed_updates": ["message"]
  }'
```

Expected response: `{"ok":true,"result":true,"description":"Webhook was set"}`

To verify the webhook is set:
```bash
curl "https://api.telegram.org/bot{TOKEN}/getWebhookInfo"
```

---

## Apply the Supabase migration

The bot uses two Postgres RPCs (`get_user_stats`, `get_trade_stats`) that query `auth.users`.
These must be created manually via the Supabase SQL Editor — they cannot be applied by the Vercel deploy.

1. Open **Supabase Dashboard → SQL Editor**
2. Paste the contents of `supabase/migrations/20260601_metrics_fns.sql`
3. Click **Run**

You should see `Success. No rows returned.`

---

## Commands

| Command | Description |
|---------|-------------|
| `/help` | Show command list + integration status |
| `/users` | Signups (total / today / 7d / 30d / active) + waitlist |
| `/trades` | Trade volume (total / today / 7d) + top strategies |
| `/revenue` | MRR, active subs, WoW delta, new/churned this week |
| `/errors` | Top 10 Sentry issues + 24h error count |
| `/analytics` | PostHog DAU/WAU/MAU + pageviews |
| `/health` | Integration status for all data sources |
| `/user @username` or `/user ID` | Per-user card (email, plan, trades, joined) |
| `/digest` | Trigger the full daily digest on demand |

If an integration (Sentry, PostHog, Stripe) is not configured, its command returns a "not configured" message rather than erroring.

---

## Daily digest

Runs at **07:00 UTC** every day via Vercel Cron (`vercel.json`). Posts to `TELEGRAM_OPS_CHAT_ID`.

The digest includes: users, trades, revenue, errors, and analytics — any section that fails is shown as an error line rather than crashing the whole digest.

To test the digest manually: send `/digest` to the bot, or hit the cron endpoint directly with the cron secret.

---

## Deploy

```bash
# Push to main — Vercel deploys automatically
git push origin main
```

After deploy, verify the webhook is still active with `getWebhookInfo`. If Vercel changed the deployment URL (unlikely on custom domains), re-run the `setWebhook` command above.
