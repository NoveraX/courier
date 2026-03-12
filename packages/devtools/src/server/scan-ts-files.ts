/**
 * Helpers for discovering .ts files on disk for update flow.
 */

import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { getSource } from "../codegen";
import { getProjectRoot, resolveProjectSafe } from "../context";

/** Collect all .ts file paths (relative) from a source's output dir + generated list */
export function scanTsFiles(
  source: NonNullable<ReturnType<typeof getSource>>,
  generated: { path: string }[],
): string[] {
  const effectiveDir = `${source.outputDir.replace(/\/+$/, "")}/${source.options.sourceName}`;
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
