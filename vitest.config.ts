import { defineConfig } from "vitest/config";

/**
 * Root harness. Every package carries its own project config, and this file
 * only names them, so `vitest run` here and `vitest run` inside a package
 * resolve the same options — and nothing outside the listed projects, such
 * as an untracked scratch directory, is ever picked up.
 */
export default defineConfig({
  test: {
    projects: [
      "packages/*",
      "packages/studio/ui",
      { test: { name: "scripts", include: ["scripts/**/*.test.mjs"] } },
    ],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts"],
      exclude: ["packages/*/src/index.ts", "packages/*/src/**/types.ts"],
    },
  },
});
