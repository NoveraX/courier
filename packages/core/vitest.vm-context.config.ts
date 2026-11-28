import { fileURLToPath } from "node:url";

import { defineProject } from "vitest/config";

import { sharedTestOptions } from "../../vitest.shared.ts";

/**
 * Tests run as Jest runs a test file: in a context of its own, its globals
 * copied in from Node's, as jest-expo runs a React Native app's tests. There
 * the global classes of web streams are Metro's polyfill, while `fetch`,
 * `Response` and the bodies they make stay Node's, and an error Node makes
 * is no instance of the context's `Error`.
 */
export default defineProject({
  test: {
    ...sharedTestOptions,
    name: "@noverax/courier (vm context)",
    include: ["tests/vm-context/**/*.test.ts"],
    pool: "vmThreads",
    setupFiles: [
      ...sharedTestOptions.setupFiles,
      fileURLToPath(new URL("./tests/vm-context/foreign-streams.ts", import.meta.url)),
    ],
  },
});
