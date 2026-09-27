/**
 * Helpers for discovering .ts files on disk for update flow.
 */

import { existsSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { ImportLayout } from "../apis/layout";
import { getProjectRoot, resolveProjectSafe } from "../context";

/**
 * Collect the project-relative paths of the .ts files in an import's
 * directory, together with the paths about to be generated. Paths use `/`,
 * as the generator's do, so a file on disk and the file generated for the
 * same place compare equal on every platform. Links are not followed.
 *
 * @param layout - Where the import's files are
 * @param generated - Files about to be written, whether or not they exist yet
 * @returns Every path, once
 */
export function scanTsFiles(layout: ImportLayout, generated: { path: string }[]): string[] {
  const absDir = resolveProjectSafe(layout.dir);
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
    else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(relative(cwd, full).split(sep).join("/"));
    }
  }
}
