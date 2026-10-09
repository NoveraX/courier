import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { isRecord } from "../is-record";

/**
 * A package's file as the project resolves it, from its own
 * `node_modules`: the TypeScript, the Studio the project installed.
 *
 * @param root - The project's folder
 * @param request - The file, by its package's name
 * @returns Its path, or `undefined` when the project does not have it
 * @example
 * ```ts
 * resolveInProject("/work/shop", "typescript/bin/tsc");
 * ```
 */
export function resolveInProject(root: string, request: string): string | undefined {
  try {
    return createRequire(join(root, "package.json")).resolve(request);
  } catch {
    /* Not installed in the project: the step that needs it says so. */
    return undefined;
  }
}

/**
 * A program a package of the project's installs, found through the
 * package's manifest: an exports map — TypeScript 7's — may not let its
 * files be resolved one by one.
 *
 * @param root - The project's folder
 * @param pkg - The package
 * @param bin - The program's name in the manifest's `bin`
 * @returns The program's file, or `undefined` when the project does not have it
 * @example
 * ```ts
 * resolveBin("/work/api", "typescript", "tsc"); // "/work/api/node_modules/typescript/bin/tsc"
 * ```
 */
export function resolveBin(root: string, pkg: string, bin: string): string | undefined {
  const manifest = resolveInProject(root, `${pkg}/package.json`);
  if (manifest === undefined) return undefined;
  const parsed: unknown = JSON.parse(readFileSync(manifest, "utf8"));
  const bins = isRecord(parsed) ? parsed.bin : undefined;
  const file = typeof bins === "string" ? bins : isRecord(bins) ? bins[bin] : undefined;
  return typeof file === "string" ? join(dirname(manifest), file) : undefined;
}
