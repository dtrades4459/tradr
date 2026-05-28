import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { sentryVitePlugin } from "@sentry/vite-plugin";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // "injectManifest" lets us write our own service worker so we can add
      // Supabase-specific cache rules. "generateSW" would work too but gives
      // less control over what gets cached.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",

      // Point to the existing manifest -- vite-plugin-pwa will not overwrite it.
      manifest: false,

      // Register the service worker automatically on every page load.
      registerType: "autoUpdate",

      injectManifest: {
        // Only precache compiled JS/CSS/HTML -- never trade data or screenshots.
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest,woff2}"],
        // Exclude large or frequently-changing assets from the precache so the
        // install payload stays small. Exclude .map files — Sentry uploads then
        // deletes them; they should never be precached by the service worker.
        globIgnores: ["**/node_modules/**", "icon-maskable.svg", "**/*.map"],
        // Bump this whenever you want to force a full cache refresh on users.
        injectionPoint: "self.__WB_MANIFEST",
      },

      devOptions: {
        // Show the service worker in dev mode so you can test offline behaviour
        // with Vite dev server. Set to false if it causes confusion.
        enabled: true,
        type: "module",
      },
    }),
    // Upload source maps to Sentry on production builds.
    // Requires SENTRY_AUTH_TOKEN in Vercel env vars (build-time only, no VITE_ prefix).
    // Generate at: sentry.io → Settings → Auth Tokens → project:releases + org:read
    sentryVitePlugin({
      org: process.env.SENTRY_ORG ?? "tradr-tt",
      project: process.env.SENTRY_PROJECT ?? "koda",
      authToken: process.env.SENTRY_AUTH_TOKEN,
      url: "https://de.sentry.io",
      // Only upload during CI/Vercel builds — skip locally when token is absent.
      disable: true,
      sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] },
      telemetry: false,
      // Never let upload failures break the deployment.
      errorHandler: (err) => { console.warn("[sentry] source map upload failed:", err.message); },
    }),
  ],
  test: {
    // Only pick up *.test.ts files inside src/ — exclude Playwright tests in tests/
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["tests/**", "node_modules/**"],
    environment: "jsdom",
    setupFiles: ["@testing-library/jest-dom/vitest"],
  },
  build: {
    target: "es2022",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom") || id.includes("node_modules/scheduler")) {
            return "vendor-react";
          }
          if (id.includes("node_modules/@supabase") || id.includes("node_modules/ws") || id.includes("node_modules/isows")) {
            return "vendor-supabase";
          }
        },
      },
    },
  },
});
