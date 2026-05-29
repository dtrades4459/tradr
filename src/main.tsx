import React from "react";
import ReactDOM from "react-dom/client";
import KodaAuth from "./KodaAuth";
import { ErrorBoundary } from "./ErrorBoundary";
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

// Boot PostHog if a key is configured. No-op otherwise — safe to leave on.
initPostHog();

// Capture UTM params before auth redirect so they survive the OAuth round-trip.
captureUtm();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <KodaAuth />
    </ErrorBoundary>
  </React.StrictMode>
);
