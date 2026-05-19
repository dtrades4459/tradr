// ─── PostHog analytics wrapper ────────────────────────────────────────────────
// Safe no-op if VITE_POSTHOG_KEY is not set (local dev, CI).
// Import `ph` and call ph.capture() anywhere in the app.

import posthog from "posthog-js";

const KEY  = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST = import.meta.env.VITE_POSTHOG_HOST as string | undefined ?? "https://us.i.posthog.com";

export function initPostHog() {
  if (!KEY) return;
  posthog.init(KEY, {
    api_host:                HOST,
    person_profiles:         "identified_only",
    capture_pageview:        true,
    capture_pageleave:       true,
    autocapture:             true,
    session_recording: {
      maskAllInputs:    false,
      maskInputOptions: { password: true },
    },
  });
}

/** Identify the user so events are tied to their account. */
export function phIdentify(userId: string, props?: Record<string, unknown>) {
  if (!KEY) return;
  posthog.identify(userId, props);
}

/** Reset identity on sign-out. */
export function phReset() {
  if (!KEY) return;
  posthog.reset();
}

/** Capture a named event with optional properties. */
export function phCapture(event: string, props?: Record<string, unknown>) {
  if (!KEY) return;
  posthog.capture(event, props);
}
