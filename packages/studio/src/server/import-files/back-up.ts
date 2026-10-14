import { copyFileSync, linkSync } from "node:fs";
import { dirname } from "node:path";
import type { ProjectRoot } from "@noverax/courier-cli/devkit";
import {
  ensureDirectory,
  errnoCode,
  flushDirectories,
  flushFiles,
} from "@noverax/courier-cli/devkit";
import { backupPath } from "./backup-path";

/**
 * Keep a copy of files an apply is about to replace, in its backup folder,
 * and make every copy durable before any file is replaced: a hard link costs
 * nothing, and a file system without them gets a copy, flushed with the
 * folder that names it, so a power loss cannot leave the journal naming a
 * copy that is empty or missing. The flushes run together, off the thread
 * that serves requests.
 *
 * @param root - The project
 * @param backupDir - The apply's backup folder, project-relative
 * @param files - Each file's project-relative path and absolute path
 * @returns Once every copy is on disk
 * @throws The file system's error when a copy cannot be made or flushed
 * @example
 * ```ts
 * await backUp(root, ".courier/backups/1759000000000-0a1b2c3d", [{ path, absolute }]);
 * ```
 */
export async function backUp(
  root: ProjectRoot,
  backupDir: string,
  files: ReadonlyArray<{ path: string; absolute: string }>,
): Promise<void> {
  const folders = new Set<string>();
  const copied: string[] = [];
  for (const { path, absolute } of files) {
    const copy = backupPath(root, backupDir, path);
    ensureDirectory(root, dirname(copy));
    if (!linked(absolute, copy)) {
      copyFileSync(absolute, copy);
      copied.push(copy);
    }
    folders.add(dirname(copy));
  }
  await flushFiles(copied);
  await flushDirectories(folders);
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
