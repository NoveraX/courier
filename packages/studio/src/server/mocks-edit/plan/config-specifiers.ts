/** How a mocks file in the project root imports the config beside it. */
export interface ConfigSpecifiers {
  /** The specifier a new import uses. */
  preferred: string;
  /** Every specifier an existing import may use to be reused. */
  accepted: readonly string[];
}

/* By the config's extension, what follows `./courier.config` in the
   specifier a new import uses, then in each one an existing import may use.
   Each binds the config Studio loads under its loader, whose default-export
   interop hands a CommonJS config's `module.exports` to `import x from`. The
   preferred one is also the one TypeScript resolves: a `.cts` config through
   the `.cjs` it compiles to, an `.mts` one through `.mjs`. */
const SUFFIXES: ReadonlyMap<string, readonly string[]> = new Map([
  [".ts", ["", ".ts", ".js"]],
  [".mts", [".mjs", ".mts"]],
  [".cts", [".cjs", ".cts", ""]],
  [".js", [".js", ""]],
  [".mjs", [".mjs"]],
  [".cjs", [".cjs", ""]],
]);

/**
 * The specifiers that import `courier.config.*` from `courier.mocks.*` in the
 * same directory.
 *
 * @param configName - The config file's name, e.g. `courier.config.ts`
 * @returns The specifier a new import uses, and those an existing one may use
 *
 * @example
 * ```ts
 * configSpecifiers("courier.config.cts");
 * // → { preferred: "./courier.config.cjs", accepted: ["./courier.config.cjs", "./courier.config.cts", "./courier.config"] }
 * ```
 */
export function configSpecifiers(configName: string): ConfigSpecifiers {
  const dot = configName.lastIndexOf(".");
  const suffixes = dot === -1 ? undefined : SUFFIXES.get(configName.slice(dot));
  const base = `./${configName.slice(0, dot)}`;
  const accepted = suffixes?.map((suffix) => base + suffix) ?? [`./${configName}`];
  return { preferred: accepted[0] ?? `./${configName}`, accepted };
}
