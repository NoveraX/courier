import path from "node:path";

import { defineProject } from "vitest/config";

import { sharedTestOptions } from "../../vitest.shared.ts";

/**
 * Vitest harness for `@noverax/courier-studio`.
 *
 * The server folds the requests it recorded and audits them with the UI's
 * own modules, so an agent reads what a page shows; some suites put what the
 * server sends through the UI's guards and reducers too. Those modules
 * import one another as `@/...`: the alias mirrors the UI's
 * `vite.config.ts`, so they load here as they do in the UI's build — and
 * the server's build resolves them by the same path in `tsconfig.json`.
 */
export default defineProject({
  test: {
    ...sharedTestOptions,
    /* A generator suite compiles the code it generates with TypeScript, and
       a CLI suite starts Studio's command: seconds on a developer's machine,
       several times that on a CI runner measuring coverage. */
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./ui/src"),
    },
  },
});
