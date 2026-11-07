import type { ModuleRecord } from "./module-records";

/* A tool's config, which Node runs as the tool builds, tests, checks or styles the code: a bundler's, a test runner's, a linter's, a framework's own. */
const TOOL_CONFIG =
  /(?:^|\/)(?:vite|vitest|vitepress|rsbuild|rspack|webpack|rollup|rolldown|tsup|tsdown|esbuild|eslint|prettier|stylelint|postcss|tailwind|babel|jest|playwright|cypress|unocss|uno|commitlint|lint-staged|knip|drizzle|astro|nuxt|next|svelte|react-router|remix)\.(?:config|workspace)(?:\.[\w-]+)?\.[cm]?[jt]s$/;

/**
 * Whether a file is a tool's config — `vite.config.ts`, `vitest.config.*`,
 * `rsbuild.config.*`, `tsup.config.*`, `eslint.config.*`, a framework's
 * own and the like — which Node runs as the tool builds, tests, checks
 * or styles the code: no page's bundle and no server runs it, so it is
 * the root of neither side, and what it names takes no side from it.
 * Its entry and its aliases are read from it apart, as data.
 *
 * @param path - The file, relative to the workspace's root or its package's
 * @returns Whether it is one
 * @example
 * ```ts
 * isToolConfig("apps/web/vite.config.ts"); // true
 * ```
 */
export function isToolConfig(path: string): boolean {
  return TOOL_CONFIG.test(path);
}

/**
 * A tool's config as the graph of imports reads it: one piece that
 * loads nothing, so no side reaches past it.
 *
 * @param path - The file, relative to the workspace's root
 * @returns Its record
 * @example
 * ```ts
 * toolRecord("vite.config.ts").pieces[0]?.imports; // []
 * ```
 */
export function toolRecord(path: string): ModuleRecord {
  const piece = {
    kind: "module" as const,
    directive: undefined,
    exportsDefault: true,
    exports: ["default"],
    imports: [],
    requires: [],
    madeUp: [],
    defaultAlone: [],
    globs: [],
    unreadGlobs: [],
  };
  return { path, pieces: [piece] };
}
