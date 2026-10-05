import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineProject } from "vitest/config";

import { sharedTestOptions } from "../../../vitest.shared.ts";

/**
 * Vitest harness for `@noverax/courier-studio-ui`.
 *
 * Runs in `node` by default; a component test opts into `jsdom` with a
 * `@vitest-environment jsdom` comment at its top and renders with React
 * Testing Library.
 *
 * Components are compiled with the React Compiler, as `vite.config.ts`
 * builds them: its memoization decides when a component reads a value
 * again, so a test without it can pass on code the shipped UI never
 * re-renders.
 *
 * The `@/*` alias mirrors `vite.config.ts` so test files can import from
 * `@/socket/...` exactly like production code.
 */
export default defineProject({
  plugins: [react({ compiler: true })],
  test: {
    ...sharedTestOptions,
    include: ["__tests__/**/*.test.{ts,tsx}"],
    setupFiles: [...sharedTestOptions.setupFiles, "./vitest.setup.ts"],
    environment: "node",
    /* A component test renders a whole view. In a full run, sharing the
       machine with every other suite, one that takes a quarter of a second
       alone ran past the default five. */
    testTimeout: 15_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
