/**
 * Minimal, scoped vitest setup for apps/api.
 *
 * Added by the visitor-analytics plan (process/general-plans/active/
 * visitor-analytics_PLAN_09-10-26.md §5.1) because the new geo/IP-resolution logic is
 * pure, server-only, and has nothing to mock against in the web workspace — the API
 * previously had no way to unit-test code without booting the full server.
 *
 * Node environment (not jsdom): this is backend code, never a browser DOM. Does not
 * change what `npm test` or `npm run test:local` run at the repo root — both stay
 * web-workspace-scoped; this is additive-only, run via `npm --workspace apps/api run test`
 * or the root `npm run test:api`.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
