import { posix } from "node:path";

import { codeMatches, scanSource } from "../edit/source-scan";
import type { Project } from "./read-project";

/** The names a Courier config may have, in the order Studio looks for them. */
export const CONFIG_NAMES: readonly string[] = [
  "courier.config.ts",
  "courier.config.mts",
  "courier.config.cts",
  "courier.config.js",
  "courier.config.mjs",
  "courier.config.cjs",
];

const PASS_ON = /\bexport\s*\{\s*default\s*\}\s*from\s*(["'])(\.{1,2}\/[^"'\n]+)\1/g;
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

/* The module a specifier written in the config names, as a file the project has. */
function moduleFile(project: Project, config: string, from: string): string {
  const module = posix.normalize(posix.join(posix.dirname(config), from));
  const bare = module.replace(/\.[cm]?js$/, "");
  const found = [module, ...EXTENSIONS.map((extension) => `${bare}${extension}`)].find(
    (path) => project.read(path) !== undefined,
  );
  return found ?? bare;
}

/**
 * The file that holds the config's object: the config itself, or the
 * module its code passes its default export on from — as a server whose
 * TypeScript compiles `src/` alone has it. A pass-on written in a comment
 * does not count.
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
  return from === undefined ? config : moduleFile(project, config, from);
}
