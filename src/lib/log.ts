// ═══════════════════════════════════════════════════════════════════════════════
// Kōda · centralized logger
//
// Tiny wrapper that:
//   • always console.* (so dev experience stays the same)
//   • forwards to Sentry if it's been initialized (see lib/sentry.ts)
//   • lets every call site tag a `scope` so production logs are searchable
//
// Use this instead of bare console.error inside data modules and effects so
// silent failures stop being silent.
// ═══════════════════════════════════════════════════════════════════════════════

type Ctx = Record<string, unknown> | undefined;

function getSentry(): any | null {
  // Sentry is loaded lazily and may or may not be present. We never import it
  // statically so the bundle stays small if it's not configured.
  const w = (typeof window !== "undefined" ? (window as any) : null);
  return w?.Sentry ?? null;
}

export const log = {
  info(scope: string, msg: string, ctx?: Ctx) {
    console.log(`[KODA][${scope}]`, msg, ctx ?? "");
  },

  warn(scope: string, msg: string, ctx?: Ctx) {
    console.warn(`[KODA][${scope}]`, msg, ctx ?? "");
    getSentry()?.captureMessage?.(msg, {
      level: "warning",
      tags: { scope },
      extra: ctx,
    });
  },

  error(scope: string, err: unknown, ctx?: Ctx) {
    console.error(`[KODA][${scope}]`, err, ctx ?? "");
    const sentry = getSentry();
    if (!sentry) return;
    if (err instanceof Error) {
      sentry.captureException?.(err, { tags: { scope }, extra: ctx });
    } else {
      sentry.captureMessage?.(String(err), {
        level: "error",
        tags: { scope },
        extra: ctx,
      });
    }
  },
};

/**
 * Wrap an async function so any thrown error is logged with a scope and a
 * fallback value is returned. Use at the boundary of effects so a single
 * failed read doesn't crash a whole screen.
 */
export async function safe<T>(scope: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    log.error(scope, e);
    return fallback;
  }
}
