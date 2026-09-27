import { closeSync, copyFileSync, fsyncSync, linkSync, openSync } from "node:fs";
import { dirname } from "node:path";
import { errnoCode } from "../errno-code";
import { ensureDirectory } from "../project-fs/ensure-directory";
import type { ProjectRoot } from "../project-fs/project-root";
import { syncDirectory } from "../project-fs/sync-directory";
import { backupPath } from "./backup-path";

/**
 * Keep a copy of files an apply is about to replace, in its backup folder,
 * and make every copy durable before any file is replaced: a hard link costs
 * nothing, and a file system without them gets a copy, flushed with the
 * folder that names it, so a power loss cannot leave the journal naming a
 * copy that is empty or missing.
 *
 * @param root - The project
 * @param backupDir - The apply's backup folder, project-relative
 * @param files - Each file's project-relative path and absolute path
 * @throws The file system's error when a copy cannot be made or flushed
 * @example
 * ```ts
 * backUp(root, ".courier/backups/1759000000000-0a1b2c3d", [{ path, absolute }]);
 * ```
 */
export function backUp(
  root: ProjectRoot,
  backupDir: string,
  files: ReadonlyArray<{ path: string; absolute: string }>,
): void {
  const folders = new Set<string>();
  for (const { path, absolute } of files) {
    const copy = backupPath(root, backupDir, path);
    ensureDirectory(root, dirname(copy));
    if (!linked(absolute, copy)) {
      copyFileSync(absolute, copy);
      flush(copy);
    }
    folders.add(dirname(copy));
  }
  for (const folder of folders) syncDirectory(folder);
}

function linked(absolute: string, copy: string): boolean {
  try {
    linkSync(absolute, copy);
    return true;
  } catch (error) {
    const code = errnoCode(error);
    if (code === "EXDEV" || code === "EPERM" || code === "ENOTSUP" || code === "EMLINK")
      return false;
    throw error;
  }
}

function flush(path: string): void {
  const fd = openSync(path, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
