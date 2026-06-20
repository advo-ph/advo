import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // api-wiring + e2e-flow are integration suites that hit a single shared
    // live API/DB and mutate clients (create + delete). Running test files in
    // parallel lets one file's client-delete land between another file's
    // broadcast SELECT-all-clients and its per-client INSERT → FK violation /
    // flaky 500. Run files serially so shared-DB state can't race.
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
