import { renameSync } from "node:fs";
import { dirname } from "node:path";
import { hashFile } from "../hash-file";
import { discardTemp } from "../project-fs/discard-temp";
import { retryOnWin32 } from "../project-fs/retry-on-win32";
import { syncDirectory } from "../project-fs/sync-directory";
import { writeTempBeside } from "../project-fs/write-temp-beside";
import { ConfigEditRefusal } from "./config-edit-refusal";

const CONFIG_TEMP_PREFIX = ".courier.config";

/**
 * Replace the config with new text in one step: written beside it, then
 * renamed over it only while it still holds the bytes the change was
 * planned against, so a save made meanwhile is never overwritten. The file
 * keeps its permission bits.
 *
 * @param path - The config's absolute path
 * @param text - Its new text
 * @param options - Its permission bits, and the sha256 it must still have
 * @throws {ConfigEditRefusal} `CONFIG_CHANGED` when the config no longer has that hash
 * @example
 * ```ts
 * replaceConfigFile("/app/courier.config.ts", plan.text, { mode: 0o644, expectedHash });
 * ```
 */
export function replaceConfigFile(
  path: string,
  text: string,
  { mode, expectedHash }: { mode: number; expectedHash: string },
): void {
  const tmp = writeTempBeside(path, text, mode, CONFIG_TEMP_PREFIX);
  try {
    if (hashFile(path) !== expectedHash) {
      throw new ConfigEditRefusal("CONFIG_CHANGED", `${path} changed after Studio read it.`);
    }
    retryOnWin32(() => renameSync(tmp, path), `Renaming ${tmp} to ${path}`);
  } catch (error) {
    discardTemp(tmp);
    throw error;
  }
  syncDirectory(dirname(path));
}
