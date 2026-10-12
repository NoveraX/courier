#!/usr/bin/env node
/// <reference types="node" />
/**
 * Detect file+directory name conflicts inside `packages/* /src` trees.
 *
 * A conflict is `foo.ts` (or `.tsx`) sitting next to a `foo/` directory
 * under the same parent. With an `index.ts` in the directory, a bare `./foo`
 * import resolves to either and the winner depends on the resolver; without
 * one, the module and the directory holding its parts still read as one
 * thing under two names. The directory form is the only one: its `index.ts`
 * re-exports what the file did.
 *
 * Exits 1 with a list of conflicts when found.
 */

import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const PACKAGES_DIR = join(ROOT, "packages");
const SOURCE_EXTENSIONS = [".ts", ".tsx"];
const SKIP_DIRS = new Set(["node_modules", "dist", ".turbo", "coverage"]);

/** Recursively walk a directory and return all conflicts found. */
export function findConflicts(dir) {
  const conflicts = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return conflicts;
  }

  const dirNames = new Set();
  const fileBaseNames = new Map(); // baseName -> filename

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      dirNames.add(entry.name);
      continue;
    }
    if (!entry.isFile()) continue;
    for (const ext of SOURCE_EXTENSIONS) {
      if (entry.name.endsWith(ext)) {
        fileBaseNames.set(entry.name.slice(0, -ext.length), entry.name);
        break;
      }
    }
  }

  for (const [baseName, fileName] of fileBaseNames) {
    if (dirNames.has(baseName)) conflicts.push({ dir, file: fileName, conflictingDir: baseName });
  }

  for (const name of dirNames) {
    conflicts.push(...findConflicts(join(dir, name)));
  }

  return conflicts;
}

function main() {
  let packages;
  try {
    packages = readdirSync(PACKAGES_DIR, { withFileTypes: true });
  } catch {
    console.error(`check-name-conflicts: cannot read ${PACKAGES_DIR}`);
    process.exit(2);
  }

  const allConflicts = [];
  for (const pkg of packages) {
    if (!pkg.isDirectory()) continue;
    /* A package's sources, and the Studio UI's, which sits one level down. */
    for (const srcDir of [
      join(PACKAGES_DIR, pkg.name, "src"),
      join(PACKAGES_DIR, pkg.name, "ui", "src"),
    ]) {
      try {
        statSync(srcDir);
      } catch {
        continue;
      }
      allConflicts.push(...findConflicts(srcDir));
    }
  }

  if (allConflicts.length === 0) {
    console.log("check-name-conflicts: no file+directory name conflicts found");
    return;
  }

  console.error("\nFound file+directory name conflicts:\n");
  for (const c of allConflicts) {
    const rel = c.dir.replace(`${ROOT}/`, "");
    console.error(`  ${rel}/${c.file}  ⚠  conflicts with  ${rel}/${c.conflictingDir}/`);
  }
  console.error(
    "\nUse the directory form only: delete the .ts file and move its contents into the directory's index.ts.\n",
  );
  process.exit(1);
}

// Only run as CLI when invoked directly (not when imported by the self-test).
const invokedAsScript = argv[1]?.endsWith("check-name-conflicts.mjs");
if (invokedAsScript) main();
