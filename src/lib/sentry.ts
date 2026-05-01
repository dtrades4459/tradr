// ═══════════════════════════════════════════════════════════════════════════════
// TRADR · Sentry init (optional)
//
// initSentry() does NOTHING unless:
//   1. VITE_SENTRY_DSN is set in your env, AND
//   2. @sentry/react is installed.
//
// This means it is safe to call from main.tsx today — the build will not
// fail if you haven't installed Sentry yet. To enable it later:
//
//   npm install @sentry/react
//   echo "VITE_SENTRY_DSN=https://...@sentry.io/..." >> .env
//
// Then redeploy. Sentry exposes itself on window.Sentry so lib/log.ts picks
// it up automatically.
// ═══════════════════════════════════════════════════════════════════════════════

export async function initSentry(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  try {
    // Dynamic import so a missing dependency does not break the build.
    // The /* @vite-ignore */ comment lets Vite skip resolving this at build
    // time when @sentry/react isn't installed yet.
    const mod = await import(/* @vite-ignore */ "@sentry/react").catch(() => null);
    if (!mod) {
      console.warn("[TRADR][sentry] DSN set but @sentry/react not installed — run: npm install @sentry/react");
      return;
    }
    mod.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1.0,
    });
    // Expose so lib/log.ts can pick it up without an import dependency.
    (window as any).Sentry = mod;
  } catch (e) {
    console.warn("[TRADR][sentry] init failed:", e);
  }
}
