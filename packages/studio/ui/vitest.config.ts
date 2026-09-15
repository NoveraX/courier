import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Vitest harness for `@noverax/nexus-studio-ui`.
 *
 * Kept intentionally light: `node` environment is enough for the wire-
 * boundary type guards and toast helpers covered here. Component-level
 * rendering tests would need `jsdom` + React Testing Library, which would
 * pull a heavier dep set than the unit-level coverage in this directory
 * currently warrants. Add jsdom + RTL when the first real component test
 * arrives — until then, keeping the harness in node mode keeps the studio
 * test runner identical across both projects.
 *
 * The `@/*` alias mirrors `vite.config.ts` so test files can import from
 * `@/socket/...` exactly like production code.
 */
export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.{ts,tsx}"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
