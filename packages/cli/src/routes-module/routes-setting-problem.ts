import { posix } from "node:path";
import { projectPathProblem } from "../project-fs/resolve-project-path";
import { describeValue } from "../util/describe-value";

/** The files a routes module may be: an ES module, with its types or without. */
export const ROUTES_MODULE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".ts",
  ".mts",
  ".js",
  ".mjs",
]);

/* Folders whose files are a package's or Courier's own, never the project's code. */
const NOT_THE_PROJECTS = new Set(["node_modules", ".courier"]);

/* The files Courier reads the project from, which the module must not take the place of. */
const COURIER_READS = /^courier\.(config|mocks)\.[cm]?[jt]s$/;

/**
 * What is wrong with `studio.routes` in a config, if anything: it is
 * `false`, or a path in the project, from its root, to a module that is not
 * one Courier reads the project from nor inside `node_modules` or `.courier`.
 *
 * @param value - The setting, as the config evaluated it
 * @param named - How the problem names the setting: `--out`, for the command's own
 * @returns Why the setting is refused, or `null` when it is absent or usable
 * @example
 * ```ts
 * routesSettingProblem("src/courier.routes.ts"); // → null
 * routesSettingProblem("../web/routes.ts");
 * // → 'courier.config.studio.routes is "../web/routes.ts", not a path in the project: it leaves the project'
 * ```
 */
export function routesSettingProblem(
  value: unknown,
  named = "courier.config.studio.routes",
): string | null {
  if (value === undefined || value === false) return null;
  if (typeof value !== "string") {
    const shown =
      typeof value === "number" || value === true ? String(value) : describeValue(value);
    return `${named} is ${shown}, not a path or false`;
  }
  const outside = projectPathProblem(value);
  if (outside !== null) {
    return `${named} is ${JSON.stringify(value)}, not a path in the project: ${outside}`;
  }
  const path = posix.normalize(value.replaceAll("\\", "/"));
  if (!ROUTES_MODULE_EXTENSIONS.has(posix.extname(path))) {
    return `${named} is ${JSON.stringify(value)}, not a .ts, .mts, .js or .mjs module`;
  }
  const folder = path.split("/").find((name) => NOT_THE_PROJECTS.has(name));
  if (folder !== undefined) {
    return `${named} is ${JSON.stringify(value)}, inside ${folder}, which is not the project's own code`;
  }
  if (COURIER_READS.test(path)) {
    return `${named} is ${JSON.stringify(value)}, a file Courier reads the project from`;
  }
  return null;
}
