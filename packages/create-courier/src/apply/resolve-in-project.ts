import { createRequire } from "node:module";
import { join } from "node:path";

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
