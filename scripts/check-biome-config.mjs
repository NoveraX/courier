#!/usr/bin/env node
/// <reference types="node" />
/**
 * Keep Biome's configuration as current as the Biome the repository installs.
 *
 * Each config names the schema of the installed version, and `biome migrate`
 * finds nothing left to change: a field the installed Biome has deprecated
 * would otherwise pass unnoticed, as Biome reports one only as a note.
 *
 * Exits 1 with what is out of date.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { argv } from "node:process";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const CONFIGS = ["biome.json", "docs/biome.json"];

/**
 * The configs that name another version's schema than the installed one.
 *
 * @param {string} version - The installed Biome's version
 * @param {{ path: string, schema: unknown }[]} configs - Each config and its `$schema`
 * @returns {string[]} What is out of date, a line each
 */
export function staleSchemas(version, configs) {
  const expected = `https://biomejs.dev/schemas/${version}/schema.json`;
  return configs
    .filter(({ schema }) => schema !== expected)
    .map(({ path, schema }) => `${path} names ${schema ?? "no schema"}, not ${expected}`);
}

/**
 * Whether `biome migrate`, run without writing, found a config to change.
 *
 * @param {string} output - What it printed
 * @returns {boolean}
 */
export function migrationPending(output) {
  return /can be updated/i.test(output);
}

function main() {
  const require = createRequire(import.meta.url);
  const { version } = require("@biomejs/biome/package.json");
  const configs = CONFIGS.map((path) => ({
    path,
    schema: JSON.parse(readFileSync(join(ROOT, path), "utf8")).$schema,
  }));
  const problems = staleSchemas(version, configs);
  const migrate = spawnSync("npx", ["--no-install", "biome", "migrate"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (migrate.status !== 0) problems.push(`biome migrate failed: ${migrate.stderr.trim()}`);
  else if (migrationPending(`${migrate.stdout}${migrate.stderr}`)) {
    problems.push("biome migrate would change the configuration: run `npx biome migrate --write`");
  }
  if (problems.length === 0) {
    console.log(`check-biome-config: ${CONFIGS.join(" and ")} current with Biome ${version}`);
    return;
  }
  console.error(`\nBiome's configuration is behind Biome ${version}:\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  console.error("");
  process.exit(1);
}

const invokedAsScript = argv[1]?.endsWith("check-biome-config.mjs");
if (invokedAsScript) main();
