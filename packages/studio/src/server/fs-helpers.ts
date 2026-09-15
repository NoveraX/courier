/**
 * Low-level filesystem utilities for studio server.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { resolveProjectSafe } from "../context";

/** Extract error message from unknown error */
export function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/** Read files from disk, keyed by relative path */
export function readFilesFromDisk(paths: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const filePath of paths) {
    const absPath = resolveProjectSafe(filePath);
    if (existsSync(absPath)) {
      result[filePath] = readFileSync(absPath, "utf-8");
    }
  }
  return result;
}

/** Write file, creating parent directories as needed */
export function writeFileWithDirs(filePath: string, content: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, content, "utf-8");
}

/**
 * Write a file atomically: stage to a sibling `.tmp.<rand>` and rename over
 * the destination. The rename is atomic on POSIX and atomic-ish on Windows
 * NTFS, so concurrent readers always observe either the previous or the next
 * full payload — never a partial write.
 */
export function writeFileAtomic(filePath: string, content: string): void {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  writeFileSync(tmpPath, content, "utf-8");
  try {
    renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      unlinkSync(tmpPath);
    } catch {
      // best-effort cleanup; surface the original rename error
    }
    throw err;
  }
}

/** Auto-detect whether specUrl is a URL or file path */
export function isUrl(specUrl: string): boolean {
  return specUrl.startsWith("http://") || specUrl.startsWith("https://");
}

/** Build the effective output directory for a source: `outputDir/sourceName` */
export function getEffectiveDir(outputDir: string, sourceName: string): string {
  return `${outputDir.replace(/\/+$/, "")}/${sourceName}`;
}
