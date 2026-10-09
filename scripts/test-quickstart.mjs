#!/usr/bin/env node
/// <reference types="node" />
/**
 * Check the one-command setup with each framework `e2e/quickstart/targets.json`
 * names, or with the ones given: Courier's packages, built, are served as
 * the `@noverax` scope's registry, a new project is created with
 * `npx @noverax/create-courier` and built for production, and
 * Studio and the app are started and the page the setup added is used in
 * Chromium — one framework after another.
 *
 *   npm run test:quickstart                  every framework
 *   npm run test:quickstart -- next hono     those two
 *   node scripts/test-quickstart.mjs --list  the frameworks a run would check, as JSON
 *
 * Exits 1 when a framework fails, once every one named has run.
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { argv, env, exit } from "node:process";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const TARGETS = "e2e/quickstart/targets.json";
const CONFIG = "e2e/quickstart/playwright.config.ts";

/**
 * The frameworks a run checks: the ones named, in the list's order, or
 * every one when none is named.
 *
 * @param {unknown} targets - What `targets.json` holds
 * @param {string[]} named - The frameworks the command names
 * @returns {string[]}
 * @throws {Error} When the list is not one of targets with ids, or a name is not in it
 */
export function quickstartIds(targets, named) {
  if (!Array.isArray(targets)) throw new Error(`${TARGETS} is not a list`);
  const ids = targets.map((target) => (typeof target === "object" ? target?.id : undefined));
  if (ids.some((id) => typeof id !== "string" || id === "")) {
    throw new Error(`${TARGETS}: every entry needs an id`);
  }
  const unknown = named.filter((id) => !ids.includes(id));
  if (unknown.length > 0) {
    throw new Error(`Not in ${TARGETS}: ${unknown.join(", ")}. It lists: ${ids.join(", ")}`);
  }
  return named.length === 0 ? ids : ids.filter((id) => named.includes(id));
}

function passes(id) {
  console.log(`\n${id}`);
  const result = spawnSync("npx", ["playwright", "test", "-c", CONFIG], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...env, COURIER_QUICKSTART: id },
  });
  return result.status === 0;
}

function main() {
  const args = argv.slice(2);
  const run = quickstartIds(
    JSON.parse(readFileSync(join(ROOT, TARGETS), "utf8")),
    args.filter((arg) => arg !== "--list"),
  );
  if (args.includes("--list")) {
    console.log(JSON.stringify(run));
    return;
  }
  const failed = run.filter((id) => !passes(id));
  console.log(`\nQuick start: ${run.length - failed.length} of ${run.length} passed`);
  if (failed.length === 0) return;
  console.error(`Failed: ${failed.join(", ")}`);
  exit(1);
}

if (argv[1]?.endsWith("test-quickstart.mjs")) {
  try {
    main();
  } catch (error) {
    console.error(`test-quickstart: ${error instanceof Error ? error.message : String(error)}`);
    exit(1);
  }
}
