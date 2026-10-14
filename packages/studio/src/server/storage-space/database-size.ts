import { statSync } from "node:fs";
import { join } from "node:path";
import { errnoCode } from "@noverax/courier-cli/devkit";
import { COURIER_DIR } from "../courier-dir";
import { DATABASE_FILE } from "../storage/studio-db";

const sizeOf = (path: string): number => {
  try {
    return statSync(path).size;
  } catch (error) {
    if (errnoCode(error) === "ENOENT") return 0;
    throw error;
  }
};

/**
 * The room Studio's database takes on disk: the file with its write-ahead
 * log and index. Nothing for a database kept in memory.
 *
 * @param root - The project Studio serves
 * @param persistent - Whether the database is on disk
 * @returns The bytes
 * @example
 * ```ts
 * databaseOnDisk(root, storage.persistent); // 214_958_080
 * ```
 */
export function databaseOnDisk(root: string, persistent: boolean): number {
  if (!persistent) return 0;
  const file = join(root, COURIER_DIR, DATABASE_FILE);
  return sizeOf(file) + sizeOf(`${file}-wal`) + sizeOf(`${file}-shm`);
}
