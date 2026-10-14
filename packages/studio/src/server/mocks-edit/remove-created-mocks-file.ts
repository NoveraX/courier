import { unlinkSync } from "node:fs";
import { dirname } from "node:path";
import { retryOnWin32, syncDirectory } from "@noverax/courier-cli/devkit";
import { hashMocksFile } from "./hash-mocks-file";
import { MocksFileChangedError } from "./mocks-file-changed-error";

/**
 * Remove a mocks file Studio created, undoing the creation, but only while it
 * is still exactly what Studio wrote.
 *
 * The check reads the file without following a link and without blocking,
 * so a link, a FIFO or anything else put at its name counts as a change and
 * is left in place; removing the name never touches what a link points to.
 *
 * @param path - The file Studio created
 * @param expectedHash - sha256 of what Studio wrote there
 * @throws {MocksFileChangedError} When the file changed or is gone
 * @throws The file system's error when the file cannot be removed
 * @example
 * ```ts
 * removeCreatedMocksFile(target.path, planDigest);
 * ```
 */
export function removeCreatedMocksFile(path: string, expectedHash: string): void {
  if (hashMocksFile(path) !== expectedHash) throw new MocksFileChangedError(path);
  retryOnWin32(() => unlinkSync(path), `Removing ${path}`);
  syncDirectory(dirname(path));
}
