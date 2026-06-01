import React from "react";
import ReactDOM from "react-dom/client";
import KodaAuth from "./KodaAuth";
import { ErrorBoundary } from "./ErrorBoundary";
import { CookieConsent } from "./CookieConsent";
import { installStorage } from "./lib/storage";
import { initSentry } from "./lib/sentry";
import { initPostHog } from "./lib/posthog";
import { captureUtm } from "./lib/utm";
import "./lib/flags"; // side-effect: exposes window.kodaFlags
import "./index.css";

// Install a no-op storage shim immediately so Koda.tsx never hits an
// undefined `window.storage` during early renders. Once the user signs in,
// KodaAuth re-installs it with the user id so writes hit Supabase.
installStorage(null);

// Boot Sentry if a DSN is configured. No-op otherwise — safe to leave on.
initSentry();

// Boot PostHog if a key is configured AND the user has accepted cookies.
// No-op otherwise. The CookieConsent banner calls initPostHog() on Accept.
initPostHog();

// Capture UTM params before auth redirect so they survive the OAuth round-trip.
captureUtm();

// Register service worker explicitly. VitePWA's auto-inject handles updates,
// but an explicit register here ensures it's active even if the inject fails.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <KodaAuth />
      <CookieConsent />
    </ErrorBoundary>
  </React.StrictMode>
);
