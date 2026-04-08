#!/usr/bin/env node
/// <reference types="node" />
/**
 * Detect file+directory name conflicts inside `packages/* /src` trees.
 *
 * A conflict is `foo.ts` (or `.tsx`) sitting next to a `foo/index.ts`
 * file under the same parent. With `moduleResolution: "bundler"`, both
 * targets resolve from a bare `./foo` import and the winner depends on
 * resolver/tooling order — a silent footgun.
 *
 * Sibling directories WITHOUT an `index.ts` are intentional split points
 * (e.g. `adapter.ts` + `adapter/`, `client.ts` + `client/`) and are not
 * flagged: their contents are imported via explicit subpaths and there
 * is no bare-import ambiguity.
 *
 * Exits 1 with a list of conflicts when found.
 */

import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { argv } from "node:process";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
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
    if (!dirNames.has(baseName)) continue;
    // Only flag when the sibling directory has an index.ts/tsx — that is
    // the actual bare-import resolution-clash pattern. Sibling dirs that
    // expose their files only via explicit subpaths are intentional.
    const hasIndex = SOURCE_EXTENSIONS.some((ext) => {
      try {
        statSync(join(dir, baseName, `index${ext}`));
        return true;
      } catch {
        return false;
      }
    });
    if (hasIndex) {
      conflicts.push({ dir, file: fileName, conflictingDir: baseName });
    }
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
    const srcDir = join(PACKAGES_DIR, pkg.name, "src");
    try {
      statSync(srcDir);
    } catch {
      continue;
    }
    allConflicts.push(...findConflicts(srcDir));
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
    "\nUse the directory form only (delete the .ts file and move its contents into the directory's index.ts).\n",
  );
  process.exit(1);
}

// Only run as CLI when invoked directly (not when imported by the self-test).
const invokedAsScript = argv[1] && argv[1].endsWith("check-name-conflicts.mjs");
if (invokedAsScript) main();
