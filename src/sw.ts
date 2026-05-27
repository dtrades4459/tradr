/// <reference lib="webworker" />
// ═══════════════════════════════════════════════════════════════════════════════
// Kōda OS · Service Worker
//
// Strategy summary:
//   Static assets (JS/CSS/fonts/icons) → CacheFirst (versioned, safe to cache)
//   Supabase API calls                 → NetworkFirst (always try fresh, fall back)
//   Google Fonts                       → StaleWhileRevalidate (fast + self-heals)
//   Everything else                    → NetworkFirst
//
// Offline behaviour:
//   - The shell (index.html + JS/CSS) loads from cache instantly.
//   - Supabase reads return cached data when offline, then update on reconnect.
//   - Trade writes queue in IndexedDB via Workbox Background Sync (coming in
//     a future iteration — for now failed writes surface via the existing
//     storage error toast).
// ═══════════════════════════════════════════════════════════════════════════════

import { clientsClaim } from "workbox-core";
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare const self: ServiceWorkerGlobalScope;

// Take control of all open tabs immediately after an update.
clientsClaim();
self.skipWaiting();

// ── Precache ──────────────────────────────────────────────────────────────────
// vite-plugin-pwa injects the list of versioned assets here at build time.
// During `vite dev`, this is an empty array — see devOptions in vite.config.ts.
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ── Supabase API — NetworkFirst ───────────────────────────────────────────────
// Always try the network first so data is fresh. Fall back to the last cached
// response if offline. Cache expires after 1 day to avoid stale leaderboards.
registerRoute(
  ({ url }) => url.hostname.endsWith(".supabase.co"),
  new NetworkFirst({
    cacheName: "supabase-api",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 60 * 60 * 24, // 1 day
      }),
    ],
    networkTimeoutSeconds: 8,
  })
);

// ── Google Fonts — StaleWhileRevalidate ───────────────────────────────────────
registerRoute(
  ({ url }) =>
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com",
  new StaleWhileRevalidate({
    cacheName: "google-fonts",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 20,
        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
      }),
    ],
  })
);

// ── Static assets (JS/CSS/images/icons) — CacheFirst ─────────────────────────
// These are content-addressed (hashed filenames from Vite) so it is safe to
// serve them from cache indefinitely. Cache busting happens automatically when
// Vite produces a new hash on deploy.
registerRoute(
  ({ request }) =>
    request.destination === "script" ||
    request.destination === "style" ||
    request.destination === "image" ||
    request.destination === "font",
  new CacheFirst({
    cacheName: "static-assets",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
      }),
    ],
  })
);

// ── Navigation (HTML pages) — NetworkFirst ────────────────────────────────────
// Serve the app shell from cache when offline so the user lands on a functional
// screen rather than a browser error page.
registerRoute(
  ({ request }) => request.mode === "navigate",
  new NetworkFirst({
    cacheName: "pages",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24, // 1 day
      }),
    ],
    networkTimeoutSeconds: 5,
  })
);

// ── Web push ─────────────────────────────────────────────────────────────────
self.addEventListener("push", (event: PushEvent) => {
  if (!event.data) return;
  const data = event.data.json() as { title: string; body: string; icon?: string };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon ?? "/icon-192.png",
      badge: "/icon-192.png",
    })
  );
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();
  event.waitUntil(
    (self.clients as Clients).matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      if (list.length > 0) return list[0].focus();
      return (self.clients as Clients).openWindow("/");
    })
  );
});
