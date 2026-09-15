import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Resolved against this file rather than the working directory, so the same
 * setup applies whether the suite is run from the repository root or from
 * inside a package directory.
 */
const coreSetup = fileURLToPath(new URL("./packages/core/vitest.setup.ts", import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    setupFiles: [coreSetup],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["packages/*/src/index.ts", "packages/*/src/**/types.ts"],
    },
  },
});
