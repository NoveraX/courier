import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { importsOf, type ModuleImport } from "../edit/imports";
import { type SourceScan, scanSource } from "../edit/source-scan";
import type { Project } from "./read-project";

/** A file of the project's code, scanned, with the modules it loads. */
export interface CodeFile {
  /** Relative to the project's root, `/`-separated. */
  readonly path: string;
  readonly scan: SourceScan;
  readonly imports: readonly ModuleImport[];
}

const CODE = /\.(?:[cm]?[jt]s|[jt]sx)$/;
/* Output, dependencies, native projects and tests: none of them is the app's own wiring. */
const SKIPPED = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage",
  "android",
  "ios",
  "public",
  "static",
  "test",
  "tests",
  "__tests__",
  "e2e",
]);
const TEST = /\.(?:test|spec)\.[^.]+$/;
/* Listing a folder is cheap, reading a file less so: many are listed, the likeliest read. */
const MAX_LISTED = 50_000;
const MAX_FILES = 4000;
const MAX_DEPTH = 8;
/* Where a project wires Courier up, by its name or its folder's: these are read first. */
const WIRING =
  /(?:^|\/)(?:instrumentation|middleware|hooks\.server|server|index|main|app|routes?|api|plugins?|courier|[^/]*\.module|[^/]*config)(?:[./]|$)/;
const MAX_BYTES = 512 * 1024;

const cache = new WeakMap<Project, readonly CodeFile[]>();

function walk(root: string, dir: string, depth: number, found: string[]): void {
  if (depth > MAX_DEPTH || found.length >= MAX_LISTED) return;
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const path = dir === "" ? entry.name : `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!entry.name.startsWith(".") && !SKIPPED.has(entry.name))
        walk(root, path, depth + 1, found);
    } else if (
      entry.isFile() &&
      CODE.test(entry.name) &&
      !entry.name.endsWith(".d.ts") &&
      !TEST.test(entry.name)
    ) {
      found.push(path);
      if (found.length >= MAX_LISTED) return;
    }
  }
}

function codeFile(root: string, path: string): CodeFile | undefined {
  const full = join(root, path);
  if (statSync(full).size > MAX_BYTES) return undefined;
  const scan = scanSource(readFileSync(full, "utf8"));
  return scan === undefined ? undefined : { path, scan, imports: importsOf(scan) };
}

/**
 * The project's own code, each file scanned once and kept for the run:
 * what it wires up already decides what the setup still offers. Output
 * folders, dependencies, the native projects of a mobile app, hidden
 * folders and tests are left out, as is a file too large to be the app's
 * own, or one whose brackets do not pair. In a large project the files
 * that wire an app up — by their name or their folder's — and those near
 * its root are read first.
 *
 * @param project - The project
 * @returns Its code files
 * @example
 * ```ts
 * projectCode(project).map((file) => file.path); // ["instrumentation.ts", "app/api/request/route.ts", …]
 * ```
 */
export function projectCode(project: Project): readonly CodeFile[] {
  const known = cache.get(project);
  if (known) return known;
  const paths: string[] = [];
  walk(project.root, "", 0, paths);
  const rank = (path: string) => (WIRING.test(path) ? 0 : 100) + path.split("/").length;
  const read = paths
    .map((path, at) => ({ path, at, rank: rank(path) }))
    .sort((a, b) => a.rank - b.rank || a.at - b.at)
    .slice(0, MAX_FILES);
  const files = read.flatMap(({ path }) => codeFile(project.root, path) ?? []);
  cache.set(project, files);
  return files;
}
