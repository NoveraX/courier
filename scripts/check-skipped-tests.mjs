#!/usr/bin/env node
/// <reference types="node" />
/**
 * Hold the tests a run skipped to the ones this platform is known to skip.
 *
 * A test is skipped on purpose by a condition of its own — a behaviour only
 * another platform has, a service the run has none of — and each one a
 * platform skips is named, under that platform, in
 * `scripts/skipped-tests.json`. A run that skipped a test the list does not
 * name, or ran one it does, fails: no test is left out without anyone
 * seeing it, and the list never names a test that runs.
 *
 * Reads the JSON report Vitest writes with `--reporter=json
 * --outputFile.json=<file>`. On GitHub Actions the tests skipped are written
 * to the job's summary too.
 *
 * Exits 1 with the difference, and the whole list to put in its place.
 */

import { appendFileSync, readFileSync } from "node:fs";
import * as nodePath from "node:path";
import { resolve } from "node:path";
import { argv, env, platform } from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const LIST = resolve(ROOT, "scripts/skipped-tests.json");
const SKIPPED = new Set(["skipped", "pending", "todo"]);

/**
 * The tests a Vitest JSON report skipped, each named `file > describe > test`
 * from the repository's root with `/` separators, in order.
 *
 * @param {{ testResults?: Array<{ name: string, assertionResults?: Array<{ status: string, title: string, ancestorTitles?: string[] }> }> }} report
 * @param {string} [root] - The directory the files are named from
 * @param {Pick<typeof nodePath, "relative">} [paths] - The path rules the report's files are written in; the platform's by default
 * @returns {string[]} The names, sorted
 */
export function skippedTests(report, root = ROOT, paths = nodePath) {
  const names = [];
  for (const file of report.testResults ?? []) {
    const path = paths.relative(root, file.name).replaceAll("\\", "/");
    for (const test of file.assertionResults ?? []) {
      if (!SKIPPED.has(test.status)) continue;
      names.push([path, ...(test.ancestorTitles ?? []), test.title].join(" > "));
    }
  }
  return names.sort();
}

/* Each name with how many times it occurs: two tests may share one. */
function counted(names) {
  const counts = new Map();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
  return counts;
}

/* The names `names` holds more often than `others` does, once for each time more. */
function beyond(names, others) {
  const extra = [];
  const theirs = counted(others);
  for (const [name, count] of counted(names)) {
    for (let n = theirs.get(name) ?? 0; n < count; n++) extra.push(name);
  }
  return extra;
}

/**
 * What sets the tests skipped apart from the ones expected: a test skipped
 * the list does not name, and one the list names that ran.
 *
 * @param {string[]} skipped - The tests the run skipped
 * @param {string[]} expected - The tests the platform's list names
 * @returns {{ unexpected: string[], ran: string[] }} Both, empty when the two agree
 */
export function compareSkipped(skipped, expected) {
  return { unexpected: beyond(skipped, expected), ran: beyond(expected, skipped) };
}

function summarize(skipped) {
  if (!env.GITHUB_STEP_SUMMARY) return;
  const lines = [`### Tests skipped on ${platform}: ${skipped.length}`, ""];
  for (const name of skipped) lines.push(`- ${name}`);
  appendFileSync(env.GITHUB_STEP_SUMMARY, `${lines.join("\n")}\n`);
}

function main() {
  const reportPath = argv[2];
  if (!reportPath) {
    console.error("Usage: node scripts/check-skipped-tests.mjs <vitest-json-report>");
    process.exit(2);
  }
  const skipped = skippedTests(JSON.parse(readFileSync(reportPath, "utf8")));
  summarize(skipped);
  const expected = JSON.parse(readFileSync(LIST, "utf8"))[platform];
  if (!Array.isArray(expected)) {
    console.error(
      `\nscripts/skipped-tests.json names no tests for ${platform}. This run skipped:\n`,
    );
    console.error(JSON.stringify({ [platform]: skipped }, null, 2));
    process.exit(1);
  }
  const { unexpected, ran } = compareSkipped(skipped, expected);
  if (unexpected.length === 0 && ran.length === 0) {
    console.log(
      `check-skipped-tests: the ${skipped.length} tests skipped on ${platform} are the ones listed`,
    );
    return;
  }
  if (unexpected.length > 0)
    console.error(`\nSkipped, but not listed for ${platform}:\n  ${unexpected.join("\n  ")}`);
  if (ran.length > 0) console.error(`\nListed for ${platform}, but run:\n  ${ran.join("\n  ")}`);
  console.error(
    `\nA test skipped on purpose goes in scripts/skipped-tests.json under ${platform}; this run's list:\n`,
  );
  console.error(JSON.stringify(skipped, null, 2));
  process.exit(1);
}

// Only run as CLI when invoked directly (not when imported by the self-test).
const invokedAsScript = argv[1]?.endsWith("check-skipped-tests.mjs");
if (invokedAsScript) main();
