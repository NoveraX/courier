import path from "node:path";

import { defineProject } from "vitest/config";

import { sharedTestOptions } from "../../../vitest.shared.ts";

/**
 * Vitest harness for `@noverax/courier-studio-ui`.
 *
 * Runs in `node` by default; a component test opts into `jsdom` with a
 * `@vitest-environment jsdom` comment at its top and renders with React
 * Testing Library.
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
