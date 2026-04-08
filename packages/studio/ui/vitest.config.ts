import { defineConfig } from "vitest/config";

/**
 * Vitest harness for `@noverax/nexus-studio-ui`. Kept intentionally minimal
 * (no jsdom, no React plugin) so it never shadows the production
 * `vite.config.ts` build pipeline. When real component tests arrive, this
 * config will gain `environment: "jsdom"` and the React plugin.
 */
export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
