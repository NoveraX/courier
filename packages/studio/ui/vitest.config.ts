import path from "node:path";

import { defineProject } from "vitest/config";

import { sharedTestOptions } from "../../../vitest.shared.ts";

/**
 * Vitest harness for `@noverax/courier-studio-ui`.
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
export default defineProject({
  test: {
    ...sharedTestOptions,
    include: ["__tests__/**/*.test.{ts,tsx}"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
