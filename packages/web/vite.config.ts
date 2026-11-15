import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Local development split:
 *   Browser -> Vite (5173) -> proxy /api/* -> Worker (wrangler dev, 8787)
 *
 * In production the same split is:
 *   Browser -> Cloudflare Pages static bundle -> Pages proxy rule in public/_redirects
 *            -> edgedesk-api Worker (/api/*)
 * The React app never needs a separate origin, so the HttpOnly session cookie stays
 * same-site in both environments.
 */
const apiProxy = {
  "/api": {
    target: "http://127.0.0.1:8787",
    changeOrigin: false,
    secure: false,
  },
} as const;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: apiProxy,
  },
  preview: {
    port: 4173,
    proxy: apiProxy,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
