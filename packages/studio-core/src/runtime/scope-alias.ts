/**
 * An alias for a whole scope, `@acme/*`, in the shape the module loader takes.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";

import { createLogger } from "@noverax/courier";

import { errnoCode } from "./errno-code";
import type { InstalledPackages } from "./installed-packages";

const log = createLogger("Config");

/* The extensions a module name drops: `button.tsx` is imported as `button`. */
const MODULE_EXTENSION = /\.(d\.ts|[cm]?[jt]sx?|json)$/;

/**
 * The scope's name, `@acme`, when `prefix` is an alias's text before the
 * wildcard of a pattern for a whole scope, `@acme/*`.
 *
 * @param prefix - An alias's text before its wildcard
 * @returns The scope, or `undefined` for any other prefix
 * @example
 * ```ts
 * scopeOf("@acme/"); // "@acme"
 * ```
 */
export function scopeOf(prefix: string): string | undefined {
  return /^(@[^/]+)\/$/.exec(prefix)?.[1];
}

/**
 * One loader alias per name a scope alias leads to, leaving out the names of
 * installed packages. The loader follows an alias whatever it finds there,
 * where TypeScript takes an installed package past it: `@acme/*` to
 * `./src/*` keeps `@acme/utils` on `src/utils` while `@acme/ui`, installed,
 * loads the build it ships.
 *
 * @param scope - The scope, `@acme`
 * @param directory - The directory the alias's `*` stands in, absolute
 * @param installed - The packages the project installed
 * @returns Prefix → absolute target, for each name the directory holds
 * @example
 * ```ts
 * scopeAliases("@acme", "/app/src", installed); // { "@acme/utils": "/app/src/utils" }
 * ```
 */
export function scopeAliases(
  scope: string,
  directory: string,
  installed: InstalledPackages,
): Record<string, string> {
  const alias: Record<string, string> = {};
  for (const entry of entriesOf(directory)) {
    const name = entry.replace(MODULE_EXTENSION, "");
    if (!installed.has(`${scope}/${name}`)) alias[`${scope}/${name}`] = join(directory, name);
  }
  return alias;
}

/* A directory that is not there yet leads nowhere; the next read sees it. */
function entriesOf(directory: string): string[] {
  try {
    return readdirSync(directory);
  } catch (error) {
    const code = errnoCode(error);
    if (code !== "ENOENT" && code !== "ENOTDIR") {
      log.warn(`Could not list ${directory} for a path alias; the alias leads nowhere`, error);
    }
    return [];
  }
}
