/**
 * Low-level filesystem utilities for studio server.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

/** Auto-detect whether specUrl is a URL or file path */
export function isUrl(specUrl: string): boolean {
  return specUrl.startsWith("http://") || specUrl.startsWith("https://");
}

/** Build the effective output directory for a source: `outputDir/sourceName` */
export function getEffectiveDir(outputDir: string, sourceName: string): string {
  return `${outputDir.replace(/\/+$/, "")}/${sourceName}`;
}
