#!/usr/bin/env node
/// <reference types="node" />
/**
 * Hold every command the docs, the site, the READMEs and the tools tell a
 * reader to run to the full name of the package it comes from.
 *
 * npx runs a project's own copy of a command when the project installed
 * it. When it finds none — an editor that starts an MCP server outside the
 * project, a CI job before its install — it takes the word after it for a
 * package's name and runs that package from npm, answering its own question
 * with yes wherever no terminal is open. Under the bare names of Courier's
 * commands npm holds other people's packages, or nothing anyone could not
 * claim: `courier` and `courier-mcp` are not Courier's. `npx
 * @noverax/courier-mcp` runs the project's copy, or Courier's own, never
 * another; so does `bunx` with the full name. `pnpm exec`, `yarn` and a
 * package.json script run only what the project installed, and pass.
 *
 * Exits 1 with each file, line and command.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { argv } from "node:process";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const SOURCES = [
  "*.md",
  "docs/src/**",
  "packages/*/README.md",
  "packages/*/src/**",
  "packages/studio/ui/src/**",
  "examples/**",
  ".github/**",
];
const TEXT = /(\.(md|mdx|ts|tsx|mts|cts|js|jsx|mjs|cjs|json|ya?ml|toml)|Dockerfile)$/;
const LOCKFILE = /(^|\/)package-lock\.json$/;

/* A bare command: the name alone, not the start of a longer one or a path. */
const BARE = String.raw`(courier-studio|courier-mcp|courier-server|courier)(?![\w@/.-])`;
/* What may stand between a runner and the command: spaces, a tag of highlighted code, flags. */
const GAP = String.raw`(?:\s|<\/?[a-zA-Z][^>]*>)+`;
const FLAGS = String.raw`(?:(?:(?!--package\b|-p\b)--?[\w-]+(?:=\S+)?|--)${GAP})*`;
const RUNNER = new RegExp(
  String.raw`\b(?:npx|bunx|npm\s+exec|pnpm\s+dlx|yarn\s+dlx)${GAP}${FLAGS}${BARE}`,
  "g",
);
/* An editor's entry for a server npx starts: its arguments, the command first. */
const ARGS = new RegExp(String.raw`\bargs["']?\s*[:=]\s*\[\s*["']${BARE}["']`, "g");

/**
 * The commands in a text that npx, or another runner that fetches from
 * npm, would look up under a bare name.
 *
 * @param {string} text - A file's text
 * @returns {{ line: number, command: string }[]}
 */
export function bareCommands(text) {
  return text.split("\n").flatMap((content, at) =>
    [...content.matchAll(RUNNER), ...content.matchAll(ARGS)].map((match) => ({
      line: at + 1,
      command: match[1],
    })),
  );
}

/**
 * Every bare command in the files, by file and line.
 *
 * @param {{ path: string, text: string }[]} files
 * @returns {{ path: string, line: number, command: string }[]}
 */
export function findBareCommands(files) {
  return files.flatMap(({ path, text }) => bareCommands(text).map((found) => ({ path, ...found })));
}

function trackedTexts() {
  const listed = execFileSync(
    "git",
    ["ls-files", "-z", "--", ...SOURCES.map((p) => `:(glob)${p}`)],
    { cwd: ROOT, encoding: "utf8" },
  );
  return listed
    .split("\0")
    .filter((path) => TEXT.test(path) && !path.includes("/lib/") && !LOCKFILE.test(path));
}

function main() {
  const files = trackedTexts().map((path) => ({
    path,
    text: readFileSync(join(ROOT, path), "utf8"),
  }));
  const found = findBareCommands(files);
  if (found.length === 0) {
    console.log(`check-npx-commands: every command in ${files.length} files names its package`);
    return;
  }
  console.error("\nCommands run by a bare name, which npx would look up on npm as given:\n");
  for (const { path, line, command } of found) console.error(`  ${path}:${line}  ${command}`);
  console.error("\nName the package in full: npx @noverax/courier-studio, @noverax/courier-mcp.\n");
  process.exit(1);
}

const invokedAsScript = argv[1]?.endsWith("check-npx-commands.mjs");
if (invokedAsScript) main();
