/** How a mocks file in the project root imports the config beside it. */
export interface ConfigSpecifiers {
  /** The specifier a new import uses. */
  preferred: string;
  /** Every specifier an existing import may use to be reused. */
  accepted: readonly string[];
}

/* By the config's extension, what follows `./courier.config` in each
   specifier an existing import may use. Each binds the config Studio loads
   under its loader, whose default-export interop hands a CommonJS config's
   `module.exports` to `import x from`. A new import uses the first unless
   the project names extensions; TypeScript resolves it under a bundler's
   resolution, a `.cts` config through the `.cjs` it compiles to and an
   `.mts` one through `.mjs`. */
const SUFFIXES: ReadonlyMap<string, readonly string[]> = new Map([
  [".ts", ["", ".ts", ".js"]],
  [".mts", [".mjs", ".mts"]],
  [".cts", [".cjs", ".cts", ""]],
  [".js", [".js", ""]],
  [".mjs", [".mjs"]],
  [".cjs", [".cjs", ""]],
]);

/* The suffix of the JavaScript file a config runs as: what Node's
   resolution of ES modules asks a relative import for, and what TypeScript
   maps back to the config's source under every resolution. */
const RUNS_AS = /\.[cm]?js$/;

/**
 * The specifiers that import `courier.config.*` from `courier.mocks.*` in the
 * same directory.
 *
 * @param configName - The config file's name, e.g. `courier.config.ts`
 * @param explicitExtensions - Whether the project names the file of a
 *   relative import with its extension, so a new import names the file the
 *   config runs as
 * @returns The specifier a new import uses, and those an existing one may use
 *
 * @example
 * ```ts
 * configSpecifiers("courier.config.ts", true);
 * // → { preferred: "./courier.config.js", accepted: ["./courier.config", "./courier.config.ts", "./courier.config.js"] }
 * configSpecifiers("courier.config.cts", false);
 * // → { preferred: "./courier.config.cjs", accepted: ["./courier.config.cjs", "./courier.config.cts", "./courier.config"] }
 * ```
 */
export function configSpecifiers(
  configName: string,
  explicitExtensions: boolean,
): ConfigSpecifiers {
  const dot = configName.lastIndexOf(".");
  const suffixes = dot === -1 ? undefined : SUFFIXES.get(configName.slice(dot));
  const base = `./${configName.slice(0, dot)}`;
  const accepted = suffixes?.map((suffix) => base + suffix) ?? [`./${configName}`];
  const runsAs = explicitExtensions ? accepted.find((name) => RUNS_AS.test(name)) : undefined;
  return { preferred: runsAs ?? accepted[0] ?? `./${configName}`, accepted };
}
