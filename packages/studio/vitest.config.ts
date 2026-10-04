import path from "node:path";

import { defineProject } from "vitest/config";

import { sharedTestOptions } from "../../vitest.shared.ts";

/**
 * Vitest harness for `@noverax/courier-studio`.
 *
 * Some suites put what the server sends through the UI's own guards and
 * reducers, which import one another as `@/...`: the alias mirrors the UI's
 * `vite.config.ts`, so they load here as they do in the UI's build.
 */
export default defineProject({
  test: { ...sharedTestOptions },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./ui/src"),
    },
  },
});
