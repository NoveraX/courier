import { renameSync, statSync } from "node:fs";
import { dirname } from "node:path";
import {
  discardTemp,
  retryOnWin32,
  syncDirectory,
  writeTempBeside,
} from "@noverax/courier-cli/devkit";
import { hashFile } from "../../hash-file";

const TEMP_PREFIX = ".courier-schema";

/**
 * Replace a source file's text, whole or not at all: the new text is
 * written beside it and renamed over it, keeping its permissions, only
 * while it still holds what Studio read.
 *
 * @param path - The file
 * @param text - Its new text
 * @param expectedHash - The sha256 of the bytes Studio read
 * @returns Whether it was replaced: `false` when it changed since Studio read it
 * @throws The file system's error when it cannot be written
 * @example
 * ```ts
 * if (!replaceSourceFile(path, after, sha256Hex(before))) return stale();
 * ```
 */
export function replaceSourceFile(path: string, text: string, expectedHash: string): boolean {
  const mode = statSync(path).mode & 0o777;
  const tmp = writeTempBeside(path, text, mode, TEMP_PREFIX);
  try {
    if (hashFile(path) !== expectedHash) {
      discardTemp(tmp);
      return false;
    }
    retryOnWin32(() => renameSync(tmp, path), `Renaming ${tmp} to ${path}`);
  } catch (error) {
    discardTemp(tmp);
    throw error;
  }
  syncDirectory(dirname(path));
  return true;
}
