import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createLogger } from "@noverax/courier";
import { readManifest } from "./formatter-configs";

const log = createLogger("Project");

/** A package as a project installed it. */
export interface InstalledPackage {
  /** Its version. */
  version: string;
  /** Its folder. */
  dir: string;
  /** Its manifest. */
  manifest: Record<string, unknown>;
}

/**
 * Find a package as the project installed it, resolved the way the
 * project's own code resolves it: from the project's root.
 *
 * @param root - The project root
 * @param name - The package
 * @returns The package, or `null` when it does not resolve or has no version
 * @example
 * ```ts
 * installedPackage("/app", "prettier")?.version; // "3.6.2"
 * ```
 */
export function installedPackage(root: string, name: string): InstalledPackage | null {
  let manifestPath: string;
  try {
    manifestPath = createRequire(join(root, "package.json")).resolve(`${name}/package.json`);
  } catch (error) {
    log.debug(`${name} does not resolve from ${root}`, error);
    return null;
  }
  const manifest = readManifest(manifestPath);
  if (typeof manifest?.version !== "string") return null;
  return { version: manifest.version, dir: dirname(manifestPath), manifest };
}

/**
 * The module a package's code is loaded from, resolved from the project's
 * root as the project's own code resolves it.
 *
 * @param root - The project root
 * @param name - The package's name
 * @returns The module's path, or `null` when it does not resolve
 * @example
 * ```ts
 * packageEntry("/app", "eslint"); // "/app/node_modules/eslint/lib/api.js"
 * ```
 */
export function packageEntry(root: string, name: string): string | null {
  try {
    return createRequire(join(root, "package.json")).resolve(name);
  } catch (error) {
    log.debug(`${name} has no entry Node resolves from ${root}`, error);
    return null;
  }
}
