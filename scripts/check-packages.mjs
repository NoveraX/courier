#!/usr/bin/env node
/// <reference types="node" />
/**
 * Fail when a package's tarball would lack a file its manifest points at, or
 * carry one it must not.
 *
 * Every other check reads the packages through workspace links, which see the
 * whole directory: a `files` list that leaves out an entry's chunk, a
 * declaration or the Studio's built UI passed all of them, and the published
 * package would fail on install. This one reads the list `npm pack` would
 * publish.
 *
 * With `--release`, run after the release's `prepare`, each package must also
 * carry the licence that step copies beside it.
 *
 * Exits 1 with a list of problems when found.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { argv, exit } from "node:process";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");

/** Files a package needs at run time that no manifest field names. */
const RUNTIME_FILES = new Map([["@noverax/courier-studio", ["ui/dist/index.html"]]]);

/* Paths no tarball carries: sources, tests, local state and editor files. */
const FORBIDDEN =
  /^(src|tests?|__tests__|scratch|\.courier)\/|\.test\.|\.spec\.|(^|\/)\.env|(^|\/)\.DS_Store$|^tsconfig/;

/**
 * What is wrong with one package's tarball.
 *
 * @param {{ name: string, main?: string, types?: string, bin?: string | Record<string, string>, exports?: unknown }} manifest - The package's package.json
 * @param {readonly string[]} files - The paths `npm pack` would publish
 * @param {{ release?: boolean }} [options] - `release` when the licence must already be there
 * @returns {string[]} One line per problem
 * @example
 * packageProblems({ name: "a", exports: { ".": "./lib/index.js" } }, ["package.json"]);
 * // → ["a: ./lib/index.js, which its manifest points at, is not in the tarball"]
 */
export function packageProblems(manifest, files, { release = false } = {}) {
  const present = new Set(files);
  const problems = [];
  const required = [
    ...targetsOf(manifest.exports),
    manifest.main,
    manifest.types,
    ...(typeof manifest.bin === "string" ? [manifest.bin] : Object.values(manifest.bin ?? {})),
  ].filter((target) => typeof target === "string");
  for (const target of new Set(required.map((path) => path.replace(/^\.\//, "")))) {
    if (!present.has(target))
      problems.push(
        `${manifest.name}: ./${target}, which its manifest points at, is not in the tarball`,
      );
  }
  for (const needed of [
    ...(RUNTIME_FILES.get(manifest.name) ?? []),
    "README.md",
    ...(release ? ["LICENSE"] : []),
  ]) {
    if (!present.has(needed)) problems.push(`${manifest.name}: ${needed} is not in the tarball`);
  }
  for (const file of files) {
    if (FORBIDDEN.test(file)) problems.push(`${manifest.name}: ${file} must not be published`);
  }
  return problems;
}

/* Every path an `exports` map leads to, through its conditions; patterns are skipped. */
function targetsOf(exportsField) {
  if (typeof exportsField === "string") return exportsField.includes("*") ? [] : [exportsField];
  if (exportsField === null || typeof exportsField !== "object") return [];
  return Object.values(exportsField).flatMap(targetsOf);
}

/* The paths `npm pack` would publish for a package directory. */
function packedFiles(dir) {
  const output = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: dir,
    encoding: "utf8",
  });
  const [report] = JSON.parse(output);
  return report.files.map((file) => file.path);
}

function main() {
  const release = argv.includes("--release");
  const problems = [];
  let checked = 0;
  for (const name of readdirSync(join(ROOT, "packages"))) {
    const dir = join(ROOT, "packages", name);
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    } catch {
      continue;
    }
    if (manifest.private) continue;
    checked++;
    problems.push(...packageProblems(manifest, packedFiles(dir), { release }));
  }
  if (problems.length === 0) {
    console.log(`check-packages: ${checked} tarballs carry what their manifests promise`);
    return;
  }
  console.error(`check-packages: ${problems.length} problem(s)\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  exit(1);
}

if (argv[1] && resolve(argv[1]) === resolve(new URL(import.meta.url).pathname)) main();
