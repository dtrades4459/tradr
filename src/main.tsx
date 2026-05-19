import React from "react";
import ReactDOM from "react-dom/client";
import TradrAuth from "./TradrAuth";
import { ErrorBoundary } from "./ErrorBoundary";
import { installStorage } from "./lib/storage";
import { initSentry } from "./lib/sentry";
import { initPostHog } from "./lib/posthog";
import "./lib/flags"; // side-effect: exposes window.tradrFlags
import "./index.css";

// Install a no-op storage shim immediately so TRADR.tsx never hits an
// undefined `window.storage` during early renders. Once the user signs in,
// TradrAuth re-installs it with the user id so writes hit Supabase.
installStorage(null);

// Boot Sentry if a DSN is configured. No-op otherwise — safe to leave on.
initSentry();

// Boot PostHog if a key is configured. No-op otherwise — safe to leave on.
initPostHog();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <TradrAuth />
    </ErrorBoundary>
  </React.StrictMode>
);
