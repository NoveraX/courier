#!/usr/bin/env node
/// <reference types="node" />
/**
 * Hold every source file to 150 lines of code.
 *
 * A line of code is a non-blank line with something outside a comment on it,
 * so JSDoc and comments cost nothing; the parser finds the comments, so a
 * `/*` inside a string is not taken for one. A file that declares only types
 * emits no JavaScript and is held to nothing, as a type-heavy file may run
 * long. Only the files git tracks are read: a working copy's own files are
 * not this check's to judge.
 *
 * Exits 1 with each file over the limit and its count.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";
import { parseSync } from "oxc-parser";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const LIMIT = 150;
const SOURCES = [
  "packages/*/src/**",
  "packages/studio/ui/src/**",
  "examples/*/src/**",
  "docs/src/**",
  "docs/server/**",
];
const SOURCE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;

/* Statements that emit nothing: types, type-only imports and exports, ambient declarations. */
const TYPE_STATEMENTS = new Set(["TSTypeAliasDeclaration", "TSInterfaceDeclaration"]);

function emitsNothing(statement) {
  if (TYPE_STATEMENTS.has(statement.type) || statement.declare === true) return true;
  if (statement.type === "ImportDeclaration") return statement.importKind === "type";
  if (statement.type === "ExportNamedDeclaration") {
    return (
      statement.exportKind === "type" ||
      (statement.declaration && emitsNothing(statement.declaration))
    );
  }
  return false;
}

/**
 * A file's lines of code and whether it declares only types.
 *
 * @param {string} path - The file's name, whose extension says how to parse it
 * @param {string} text - Its source
 * @returns {{ lines: number, typesOnly: boolean }}
 */
export function measure(path, text) {
  const { program, comments } = parseSync(path, text);
  let code = text;
  for (const { start, end } of comments) {
    code = code.slice(0, start) + text.slice(start, end).replace(/[^\n]/g, " ") + code.slice(end);
  }
  const lines = code.split("\n").filter((line) => line.trim() !== "").length;
  return { lines, typesOnly: program.body.length > 0 && program.body.every(emitsNothing) };
}

/**
 * The files over the limit, with their lines of code; a file of types alone is never one.
 *
 * @param {{ path: string, text: string }[]} files
 * @returns {{ path: string, lines: number }[]}
 */
export function overLimit(files) {
  return files.flatMap(({ path, text }) => {
    const { lines, typesOnly } = measure(path, text);
    return !typesOnly && lines > LIMIT ? [{ path, lines }] : [];
  });
}

function trackedSources() {
  const listed = execFileSync(
    "git",
    ["ls-files", "-z", "--", ...SOURCES.map((p) => `:(glob)${p}`)],
    {
      cwd: ROOT,
      encoding: "utf8",
    },
  );
  return listed.split("\0").filter((path) => SOURCE.test(path));
}

function main() {
  const files = trackedSources().map((path) => ({
    path,
    text: readFileSync(join(ROOT, path), "utf8"),
  }));
  const over = overLimit(files);
  if (over.length === 0) {
    console.log(`check-file-lines: all ${files.length} source files within ${LIMIT} lines of code`);
    return;
  }
  console.error(
    `\nSource files over ${LIMIT} lines of code (comments and blank lines not counted):\n`,
  );
  for (const { path, lines } of over) console.error(`  ${path}  ${lines}`);
  console.error("\nSplit each into smaller files, grouped by what they do.\n");
  process.exit(1);
}

const invokedAsScript = argv[1]?.endsWith("check-file-lines.mjs");
if (invokedAsScript) main();
