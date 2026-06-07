import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
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
    port: 6100,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
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
