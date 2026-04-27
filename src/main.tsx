import React from "react";
import ReactDOM from "react-dom/client";
import TradrAuth from "./TradrAuth";
import { ErrorBoundary } from "./ErrorBoundary";
import { installStorage } from "./lib/storage";

// Install a no-op storage shim immediately so TRADR.tsx never hits an
// undefined `window.storage` during early renders. Once the user signs in,
// TradrAuth re-installs it with the user id so writes hit Supabase.
installStorage(null);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <TradrAuth />
    </ErrorBoundary>
  </React.StrictMode>
);
