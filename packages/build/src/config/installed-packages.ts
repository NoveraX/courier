/**
 * Which packages a project has installed, for the path aliases to stop at.
 */

import { createRequire } from "node:module";
import { resolve } from "node:path";

import { errnoCode } from "./errno-code";

/** The packages installed where a project resolves them. */
export interface InstalledPackages {
  /** Whether the package `name` — `left-pad`, `@acme/ui` — is installed. */
  has(name: string): boolean;
}

/**
 * The packages installed where `projectRoot` resolves them, each looked up
 * once.
 *
 * @param projectRoot - Directory holding the project's `tsconfig.json`
 * @returns The lookup
 * @example
 * ```ts
 * installedPackages("/app").has("@acme/ui"); // true once it is in node_modules
 * ```
 */
export function installedPackages(projectRoot: string): InstalledPackages {
  const require = createRequire(resolve(projectRoot, "tsconfig.json"));
  const known = new Map<string, boolean>();
  return {
    has(name) {
      let installed = known.get(name);
      if (installed === undefined) {
        installed = resolves(require, name);
        known.set(name, installed);
      }
      return installed;
    },
  };
}

/**
 * The package a specifier or an alias prefix names: `@scope/name`, or its
 * first segment; `null` when it names none, as `@scope/` does.
 *
 * @param specifier - A specifier, or an alias's text before its wildcard
 * @returns The package's name, or `null`
 * @example
 * ```ts
 * packageNameOf("@acme/ui/button"); // "@acme/ui"
 * ```
 */
export function packageNameOf(specifier: string): string | null {
  const segments = specifier.split("/");
  const wanted = specifier.startsWith("@") ? 2 : 1;
  if (segments.length < wanted) return null;
  const name = segments.slice(0, wanted);
  return name.every((segment) => segment.length > 0) ? name.join("/") : null;
}

function resolves(require: NodeJS.Require, name: string): boolean {
  try {
    require.resolve(name);
    return true;
  } catch (error) {
    /* Any other code means the package is installed but declines this
       entry point — still a package, so an alias still shadows it. */
    return errnoCode(error) !== "MODULE_NOT_FOUND";
  }
}
