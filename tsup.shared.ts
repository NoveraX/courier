/**
 * Compiler options for the declaration build only.
 *
 * tsup sets `baseUrl` on its own declaration program whatever the tsconfig
 * says, and TypeScript 6 reports that option as deprecated. Silencing it here
 * rather than in `tsconfig.base.json` keeps the same suppression away from
 * ordinary type checking, where it would also switch off the grammar error for
 * the replaced `assert { type: … }` import syntax.
 */
export const dtsCompilerOptions = {
  ignoreDeprecations: "6.0",
} as const;
