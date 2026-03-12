/**
 * File discovery — finds TypeScript files matching nexus patterns.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const TS_EXTENSIONS = new Set([".ts", ".tsx"]);

/** Recursively discover .ts/.tsx files in a directory */
export function discoverFiles(dir: string, ignore: string[]): string[] {
  const files: string[] = [];
  walkDir(dir, ignore, files);
  return files;
}

/** Read file content as UTF-8, returns null on error */
export function readFileSafe(filePath: string): string | null {
  try {
    return readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

/** Get relative path from project root */
export function toRelative(filePath: string, root: string): string {
  return relative(root, filePath);
}

function walkDir(dir: string, ignore: string[], result: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (ignore.includes(entry) || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    try {
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walkDir(full, ignore, result);
      } else if (stat.isFile() && TS_EXTENSIONS.has(extname(entry))) {
        result.push(full);
      }
    } catch {
      /* skip unreadable entries */
    }
  }
}
