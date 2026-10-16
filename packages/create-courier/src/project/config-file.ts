import { posix } from "node:path";

import { codeMatches, scanSource } from "../edit/source-scan";
import { aliasedFiles } from "./path-aliases";
import type { Project } from "./read-project";

/** The names a Courier config may have, in the order Studio looks for them. */
const CONFIG_NAMES: readonly string[] = [
  "courier.config.ts",
  "courier.config.mts",
  "courier.config.cts",
  "courier.config.js",
  "courier.config.mjs",
  "courier.config.cjs",
];

const PASS_ON = /\bexport\s*\{\s*default\s*\}\s*from\s*(["'])([^"'\n]+)\1/g;
const EXTENSIONS = ["", ".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"];

/**
 * The project's Courier config, under whichever of its names Studio finds
 * first.
 *
 * @param project - The project
 * @returns Its path, relative to the root, or `undefined` where there is none
 * @example
 * ```ts
 * configFile(project); // "courier.config.mjs"
 * ```
 */
export function configFile(project: Project): string | undefined {
  return CONFIG_NAMES.find((name) => project.exists(name));
}

/* The file of the project's a path names, with its extension: the path itself, or with one of code's. */
function withExtension(project: Project, module: string): string | undefined {
  const bare = module.replace(/\.[cm]?js$/, "");
  return [module, ...EXTENSIONS.map((extension) => `${bare}${extension}`)].find(
    (path) => project.read(path) !== undefined,
  );
}

/* The module a specifier written in the config names, as a file the project has: a relative path, or one of the project's aliases. */
function moduleFile(project: Project, config: string, from: string): string | undefined {
  if (from.startsWith(".")) {
    const module = posix.normalize(posix.join(posix.dirname(config), from));
    return withExtension(project, module) ?? module.replace(/\.[cm]?js$/, "");
  }
  return aliasedFiles(project, from)
    .map((path) => withExtension(project, path))
    .find((path) => path !== undefined);
}

/**
 * The file that holds the config's object: the config itself, or the
 * module its code passes its default export on from — as a server whose
 * TypeScript compiles `src/` alone has it — by a relative path or one of
 * the project's aliases. A pass-on written in a comment does not count.
 *
 * @param project - The project
 * @returns The file, relative to the root; `courier.config.ts` where the project has no config
 * @example
 * ```ts
 * configObjectPath(project); // "src/courier/config.ts" where courier.config.ts passes it on
 * ```
 */
export function configObjectPath(project: Project): string {
  const config = configFile(project);
  if (config === undefined) return "courier.config.ts";
  const scan = scanSource(project.read(config) ?? "");
  const from = scan === undefined ? undefined : codeMatches(scan, PASS_ON)[0]?.[2];
  return (from === undefined ? undefined : moduleFile(project, config, from)) ?? config;
}
