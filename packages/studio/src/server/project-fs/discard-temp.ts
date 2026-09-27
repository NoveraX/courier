import { unlinkSync } from "node:fs";
import { createLogger } from "@noverax/courier";
import { retryOnWin32 } from "./retry-on-win32";

const log = createLogger("Studio");

/**
 * Remove the temporary file of a write that failed. The failure is what the
 * caller reports, so a temporary file that cannot be removed is logged for
 * the developer to delete rather than thrown over it.
 *
 * @param tmp - The temporary file
 * @returns `true` when it is gone, `false` when it is left behind
 * @example
 * ```ts
 * try {
 *   renameSync(tmp, path);
 * } catch (error) {
 *   discardTemp(tmp);
 *   throw error;
 * }
 * ```
 */
export function discardTemp(tmp: string): boolean {
  try {
    retryOnWin32(() => unlinkSync(tmp), `Removing ${tmp}`);
    return true;
  } catch (error) {
    log.warn(`Could not remove ${tmp}, left by a write that failed; delete it.`, error);
    return false;
  }
}
