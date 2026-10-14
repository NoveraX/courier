import { extname, posix } from "node:path";

/* The module beside courier.config: an ES module in the config's own language. */
const BESIDE_CONFIG: Readonly<Record<string, string>> = {
  ".ts": "courier.routes.ts",
  ".mts": "courier.routes.mts",
  ".cts": "courier.routes.ts",
  ".js": "courier.routes.js",
  ".mjs": "courier.routes.mjs",
  ".cjs": "courier.routes.mjs",
};

/**
 * Where a project's routes module goes, from the project root: the path
 * `studio.routes` names, else `courier.routes` beside courier.config, in
 * the config's language.
 *
 * @param configFile - The config's path
 * @param setting - `studio.routes`, as the config holds it once it loaded
 * @returns The module's path from the root, with `/` separators; `null` when the setting is `false`
 * @example
 * ```ts
 * routesModulePath("/app/courier.config.ts", undefined); // → "courier.routes.ts"
 * routesModulePath("/app/courier.config.ts", "src\\lib\\routes.ts"); // → "src/lib/routes.ts"
 * ```
 */
export function routesModulePath(
  configFile: string,
  setting: string | false | undefined,
): string | null {
  if (setting === false) return null;
  if (setting !== undefined) return posix.normalize(setting.replaceAll("\\", "/"));
  return BESIDE_CONFIG[extname(configFile)] ?? "courier.routes.ts";
}
