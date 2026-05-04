// ═══════════════════════════════════════════════════════════════════════════════
// TRADR · Sentry init
//
// @sentry/react is installed. initSentry() is a no-op unless VITE_SENTRY_DSN
// is set in the environment.
//
// To enable:
//   echo "VITE_SENTRY_DSN=https://...@sentry.io/..." >> .env
//   # Then redeploy.
// ═══════════════════════════════════════════════════════════════════════════════

import * as Sentry from "@sentry/react";

export async function initSentry(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  try {
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1.0,
    });
    // Expose so lib/log.ts can pick it up without an import dependency.
    (window as any).Sentry = Sentry;
  } catch (e) {
    console.warn("[TRADR][sentry] init failed:", e);
  }
}

// Re-export for use in ErrorBoundary and other components.
export { Sentry };
