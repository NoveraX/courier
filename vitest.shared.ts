import { fileURLToPath } from "node:url";

import type { UserWorkspaceConfig } from "vitest/config";

/**
 * Test options every package shares.
 *
 * Paths resolve against this file rather than the working directory, so a
 * suite behaves identically whether it is started from the repository root
 * or from inside a package. `globals` is what puts `afterEach` on
 * `globalThis`, which is the condition React Testing Library checks before
 * it registers automatic cleanup between tests.
 */
export const sharedTestOptions = {
  globals: true,
  include: ["tests/**/*.test.{ts,tsx}"],
  setupFiles: [fileURLToPath(new URL("./packages/core/vitest.setup.ts", import.meta.url))],
} satisfies UserWorkspaceConfig["test"];
