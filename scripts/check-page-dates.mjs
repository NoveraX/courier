#!/usr/bin/env node
/// <reference types="node" />
/**
 * Check that every docs page whose text changed says when. A page under
 * docs/src/content/docs that a change rewrote, beyond its own date, must
 * write an `updated` date no older than the day the change was written:
 * the site shows the date on the page and hands it to search engines.
 *
 *   node scripts/check-page-dates.mjs [--fix] [<base>] [<head>]
 *
 * <base> defaults to origin/master, <head> to the working tree. CI passes
 * a pull request's base and head.
 * --fix writes today's date into every page that needs one. Exits 1 with
 * each page and the day its text changed.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { argv } from "node:process";
import { fileURLToPath } from "node:url";

import { dateProblem, pageDate, pageText, withPageDate } from "./page-dates.mjs";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const PAGES = "docs/src/content/docs";

function git(repo, ...args) {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function fileAt(repo, revision, path) {
  try {
    return git(repo, "show", `${revision}:${path}`);
  } catch {
    return null;
  }
}

/** Today in the machine's own time zone, `YYYY-MM-DD`: the day a date written now names. */
export function localToday(now = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Where a branch left base: the commit both histories share. */
function mergeBase(repo, base, head) {
  try {
    return git(repo, "merge-base", base, head).trim();
  } catch (cause) {
    throw new Error(
      `${base} is no commit that shares history with ${head}: name the one to compare with, as in\n  npm run check:page-dates -- origin/master`,
      { cause },
    );
  }
}

/** The pages a change touched, each with the path it had before a rename. */
function changedPages(repo, base, head) {
  const diff = git(repo, "diff", "--name-status", "-M", base, ...(head ? [head] : []), "--", PAGES);
  const pages = diff
    .split("\n")
    .filter((line) => line.endsWith(".mdx"))
    .map((line) => line.split("\t"))
    .filter(([status]) => !status.startsWith("D"))
    .map(([status, from, to]) =>
      to ? { path: to, before: from } : { path: from, before: status === "A" ? null : from },
    );
  if (head) return pages;
  const untracked = git(repo, "ls-files", "--others", "--exclude-standard", "--", PAGES);
  const added = untracked.split("\n").filter((path) => path.endsWith(".mdx"));
  return [...pages, ...added.map((path) => ({ path, before: null }))];
}

/** The day a page's text last changed after base: today for a change not yet committed. */
function changedOn(repo, base, head, page, today) {
  if (!head) {
    const committed = fileAt(repo, "HEAD", page.path);
    const current = readFileSync(join(repo, page.path), "utf8");
    if (committed === null || pageText(committed) !== pageText(current)) return today;
  }
  const paths = [page.path, ...(page.before && page.before !== page.path ? [page.before] : [])];
  const log = git(repo, "log", "--format=%H %as", `${base}..${head ?? "HEAD"}`, "--", ...paths);
  for (const [sha, date] of log
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split(" "))) {
    const after = paths.map((path) => fileAt(repo, sha, path)).find((text) => text !== null);
    const before = paths.map((path) => fileAt(repo, `${sha}^`, path)).find((text) => text !== null);
    if (after === undefined) continue;
    if (before === undefined || pageText(before) !== pageText(after)) return date;
  }
  return today;
}

/**
 * The docs pages whose text changed after base without their date saying
 * so — written with today's date instead when `fix` is set.
 *
 * @param {{ repo?: string, base?: string, head?: string, today?: string, fix?: boolean }} options
 * @returns {{ path: string, problem: string }[]} The pages left wrong
 */
export function checkPageDates({
  repo = ROOT,
  base = "origin/master",
  head,
  today = localToday(),
  fix = false,
} = {}) {
  const from = mergeBase(repo, base, head ?? "HEAD");
  const problems = [];
  for (const page of changedPages(repo, from, head)) {
    const text = head ? fileAt(repo, head, page.path) : readFileSync(join(repo, page.path), "utf8");
    const was = page.before ? fileAt(repo, from, page.before) : null;
    if (text === null || (was !== null && pageText(was) === pageText(text))) continue;
    const problem = dateProblem(pageDate(text), changedOn(repo, from, head, page, today), today);
    if (problem && fix && !head) writeFileSync(join(repo, page.path), withPageDate(text, today));
    else if (problem) problems.push({ path: page.path, problem });
  }
  return problems;
}

function main() {
  const fix = argv.includes("--fix");
  const [base, head] = argv.slice(2).filter((arg) => arg !== "--fix");
  let problems;
  try {
    problems = checkPageDates({ base: base || undefined, head: head || undefined, fix });
  } catch (error) {
    console.error(`check-page-dates: ${error instanceof Error ? error.message : error}`);
    process.exit(2);
  }
  if (problems.length === 0) {
    console.log("check-page-dates: every docs page whose text changed says when");
    return;
  }
  console.error("\nThese docs pages changed without saying when:\n");
  for (const { path, problem } of problems) console.error(`  ${path} ${problem}`);
  console.error(
    '\nSet each page\'s `updated: "YYYY-MM-DD"` to the day you changed it, or run\n  npm run check:page-dates -- --fix\n',
  );
  process.exit(1);
}

// Only run as CLI when invoked directly (not when imported by the self-test).
const invokedAsScript = argv[1]?.endsWith("check-page-dates.mjs");
if (invokedAsScript) main();
