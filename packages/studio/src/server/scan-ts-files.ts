/**
 * Helpers for discovering .ts files on disk for update flow.
 */

import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { NexusImportEntry } from "@noverax/nexus/config";
import { getProjectRoot, resolveProjectSafe } from "../context";

/**
 * Collect all .ts file paths (relative) from an import's output dir + the
 * generated file list. `name` is the import key and doubles as the source
 * name fallback when the entry omits an explicit `sourceName`.
 */
export function scanTsFiles(
  entry: NexusImportEntry,
  name: string,
  generated: { path: string }[],
): string[] {
  const sourceName = entry.sourceName ?? name;
  const effectiveDir = `${entry.outputDir.replace(/\/+$/, "")}/${sourceName}`;
  const absDir = resolveProjectSafe(effectiveDir);
  const diskPaths = existsSync(absDir) ? collectTsFilesRecursive(absDir) : [];
  return [...new Set([...generated.map((g) => g.path), ...diskPaths])];
}

function collectTsFilesRecursive(dir: string): string[] {
  const cwd = getProjectRoot();
  const paths: string[] = [];
  walkTsFiles(dir, cwd, paths);
  return paths;
}

function walkTsFiles(dir: string, cwd: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkTsFiles(full, cwd, out);
    else if (entry.isFile() && entry.name.endsWith(".ts")) out.push(relative(cwd, full));
  }
}
