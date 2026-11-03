import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { errnoCode } from "../config/errno-code";
import { RoutesReadError } from "../engine/routes-read-error";

/* What a folder that cannot hold the module answers. */
const NOT_WRITABLE = new Set(["EACCES", "EPERM", "EROFS", "ENOTDIR"]);

/**
 * Write the routes module a bundler takes from disk, when it would change:
 * whole, under a name of its own first, so the bundler never reads it half
 * written, and not at all when it holds the code already, so an unchanged
 * reading builds nothing again.
 *
 * @param file - The module, absolute
 * @param code - Its code
 * @param root - The project's root, for the error
 * @param elsewhere - How the plugin is told to write it elsewhere, for the error
 * @returns Whether the file changed
 * @throws RoutesReadError `ROUTES_NOT_WRITTEN` when its folder cannot hold it
 * @example
 * ```ts
 * writeRoutesFile(file, routesModuleCode(snapshot), "/app", "withCourier(config, { outDir })");
 * ```
 */
export function writeRoutesFile(
  file: string,
  code: string,
  root: string,
  elsewhere: string,
): boolean {
  if (contentOf(file) === code) return false;
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(temporary, code);
    renameSync(temporary, file);
    return true;
  } catch (error) {
    rmSync(temporary, { force: true });
    const reason = errnoCode(error);
    if (reason === undefined || !NOT_WRITABLE.has(reason)) throw error;
    throw new RoutesReadError(
      "ROUTES_NOT_WRITTEN",
      `The routes module cannot be written to ${dirname(file)} (${reason}). Name a folder it can be written to with ${elsewhere}.`,
      { root },
    );
  }
}

function contentOf(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}
