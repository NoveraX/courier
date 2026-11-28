import { defineProject } from "vitest/config";

import { sharedTestOptions } from "../../vitest.shared.ts";

/**
 * Tests run as Jest runs a test file: in a context of its own, its globals
 * copied in from Node's, where an error Node makes — a file system's, a
 * socket's, fetch's — is no instance of the context's `Error`. A mock is
 * started from such a file.
 */
export default defineProject({
  test: {
    ...sharedTestOptions,
    name: "@noverax/courier-mock (vm context)",
    include: ["tests/vm-context/**/*.test.ts"],
    pool: "vmThreads",
  },
});
