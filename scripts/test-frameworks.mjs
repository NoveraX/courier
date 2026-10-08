#!/usr/bin/env node
/// <reference types="node" />
/**
 * Check the user's session in an application built with each framework
 * version `e2e/frameworks/targets.json` names, or with the ones given: each
 * is installed from npm beside Courier's packages, packed as the registry
 * would ship them, then built, served and driven in Chromium, WebKit and
 * Firefox — or the engines `COURIER_BROWSERS` names — one version
 * after another.
 *
 *   npm run test:frameworks                     every version
 *   npm run test:frameworks -- next-14 nuxt-4   those two
 *   node scripts/test-frameworks.mjs --list     the versions a run would check, as JSON
 *
 * Exits 1 when a version fails, once every one named has run.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { argv, env, exit } from "node:process";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const TARGETS = "e2e/frameworks/targets.json";
const CONFIG = "e2e/frameworks/playwright.config.ts";

/**
 * The ids of the framework versions in the matrix, in its order.
 *
 * @param {unknown} targets - What `targets.json` holds
 * @returns {string[]}
 * @throws {Error} When it is not a list of targets with unique ids
 */
export function idsOf(targets) {
  if (!Array.isArray(targets)) throw new Error(`${TARGETS} is not a list`);
  const ids = targets.map((target) => (typeof target === "object" ? target?.id : undefined));
  const invalid = ids.findIndex((id) => typeof id !== "string" || id === "");
  if (invalid !== -1) throw new Error(`${TARGETS}: entry ${invalid} has no id`);
  const repeated = ids.find((id, at) => ids.indexOf(id) !== at);
  if (repeated !== undefined) throw new Error(`${TARGETS}: ${repeated} is listed twice`);
  return ids;
}

/**
 * The versions a run checks: the ones named, in the matrix's order, or
 * every one when none is named.
 *
 * @param {string[]} ids - Every version in the matrix
 * @param {string[]} named - The versions the command names
 * @returns {string[]}
 * @throws {Error} When a name is not in the matrix
 */
export function selected(ids, named) {
  const unknown = named.filter((id) => !ids.includes(id));
  if (unknown.length > 0) {
    throw new Error(`Not in ${TARGETS}: ${unknown.join(", ")}. It lists: ${ids.join(", ")}`);
  }
  return named.length === 0 ? ids : ids.filter((id) => named.includes(id));
}

function main() {
  const args = argv.slice(2);
  const ids = idsOf(JSON.parse(readFileSync(join(ROOT, TARGETS), "utf8")));
  const list = args.includes("--list");
  const run = selected(
    ids,
    args.filter((arg) => arg !== "--list"),
  );
  if (list) {
    console.log(JSON.stringify(run));
    return;
  }
  const failed = run.filter((id) => !passes(id));
  const passed = run.length - failed.length;
  console.log(`\nFramework versions: ${passed} of ${run.length} passed`);
  if (failed.length === 0) return;
  console.error(`Failed: ${failed.join(", ")}`);
  exit(1);
}

function passes(id) {
  console.log(`\n${id}`);
  const result = spawnSync("npx", ["playwright", "test", "-c", CONFIG], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...env, COURIER_FRAMEWORK: id },
  });
  return result.status === 0;
}

const invokedAsScript = argv[1]?.endsWith("test-frameworks.mjs");
if (invokedAsScript) {
  try {
    main();
  } catch (error) {
    console.error(`test-frameworks: ${error instanceof Error ? error.message : String(error)}`);
    exit(1);
  }
}
