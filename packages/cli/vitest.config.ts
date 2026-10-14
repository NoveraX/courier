import { defineProject } from "vitest/config";

import { sharedTestOptions } from "../../vitest.shared.ts";

/**
 * Vitest harness for `@noverax/courier-cli`.
 *
 * A routes suite compiles the modules it writes with TypeScript, and the
 * formatting suites start the project's formatters in processes of their
 * own: seconds on a developer's machine, several times that on a CI runner
 * measuring coverage, in a hook as in a test.
 */
export default defineProject({
  test: {
    ...sharedTestOptions,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
