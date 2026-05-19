import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

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
        // install payload stays small.
        globIgnores: ["**/node_modules/**", "icon-maskable.svg"],
        // Bump this whenever you want to force a full cache refresh on users.
        injectionPoint: "self.__WB_MANIFEST",
      },

      devOptions: {
        // Show the service worker in dev mode so you can test offline behaviour
        // with Vite's dev server. Set to false if it causes confusion.
        enabled: true,
        type: "module",
      },
    }),
  ],
  build: {
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
