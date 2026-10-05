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
      "docs",
      { test: { name: "scripts", include: ["scripts/**/*.test.mjs"] } },
    ],
    coverage: {
      provider: "v8",
      /* Anchored at the repository root, which is where a full run resolves
         them. A run narrowed with --project resolves against that project
         instead and reports nothing; the only glob that covers both also
         sweeps in the docs site and any untracked app in the working tree,
         which is the worse trade. */
      include: ["packages/*/src/**/*.{ts,tsx}", "packages/studio/ui/src/**/*.{ts,tsx}"],
      exclude: [
        "packages/*/src/index.ts",
        "packages/*/src/**/types.ts",
        "packages/studio/ui/src/routeTree.gen.ts",
      ],
      /* Just below what the suite covers today, so a change that drops
         coverage fails CI instead of passing unnoticed. Raise them as it
         grows. */
      thresholds: { lines: 79, statements: 76, functions: 72, branches: 67 },
    },
  },
});
