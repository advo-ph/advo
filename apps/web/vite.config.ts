import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);

const appVersion = process.env.VITE_APP_VERSION || packageJson.version || "0.0.0";
const appCommit =
  process.env.VITE_APP_COMMIT ||
  (() => {
    try {
      return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    } catch {
      return "local";
    }
  })();

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 6447,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: [
        "favicon.ico",
        "advo-logo-black.png",
        "icon-192.png",
        "icon-512.png",
        "icon-512-maskable.png",
        "apple-touch-icon.png",
      ],
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,webmanifest,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
    "import.meta.env.VITE_APP_COMMIT": JSON.stringify(appCommit),
  },
});
