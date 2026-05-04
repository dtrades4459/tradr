// ═══════════════════════════════════════════════════════════════════════════════
// TRADR · Sentry init
//
// No-op until VITE_SENTRY_DSN is set in Vercel environment variables AND
// @sentry/react is added to package.json dependencies.
//
// To enable:
//   1. npm install @sentry/react
//   2. Add VITE_SENTRY_DSN=https://...@sentry.io/... in Vercel dashboard
//   3. Replace this file with a static import of @sentry/react
// ═══════════════════════════════════════════════════════════════════════════════

export async function initSentry(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  try {
    // Dynamically import so the build succeeds without the package installed.
    const Sentry = await import(/* @vite-ignore */ "@sentry/react");
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1.0,
    });
    (window as any).Sentry = Sentry;
  } catch (e) {
    // @sentry/react not installed or DSN invalid — silently swallow.
  }
}
