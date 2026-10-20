/**
 * Tests for `scripts/check-page-dates.mjs`, the check CI runs on the docs
 * pages' dates. Each test builds a throwaway repository in `os.tmpdir()`
 * with commits written on chosen days.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkPageDates, localToday } from "./check-page-dates.mjs";

const PAGE = "docs/src/content/docs/guide.mdx";

let repo;

function git(args, day = "2026-10-01") {
  const date = `${day}T12:00:00+03:00`;
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@example.invalid",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@example.invalid",
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
    },
  }).trim();
}

function page(text, updated) {
  return `export const metadata = { title: "Guide", description: "How", updated: "${updated}" }\n\n${text}\n`;
}

function commit(path, contents, day) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), contents);
  git(["add", path], day);
  git(["commit", "-q", "-m", "change"], day);
  return git(["rev-parse", "HEAD"]);
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "check-page-dates-"));
  git(["init", "-q", "-b", "master"]);
  commit(PAGE, page("First text.", "2026-10-01"), "2026-10-01");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("checkPageDates", () => {
  it("refuses a page whose text changed under an older date", () => {
    const base = git(["rev-parse", "HEAD"]);
    const head = commit(PAGE, page("New text.", "2026-10-01"), "2026-10-19");

    expect(checkPageDates({ repo, base, head, today: "2026-10-19" })).toEqual([
      { path: PAGE, problem: 'says updated: "2026-10-01", but its text changed on 2026-10-19' },
    ]);
  });

  it("passes a page whose date moved with its text", () => {
    const base = git(["rev-parse", "HEAD"]);
    const head = commit(PAGE, page("New text.", "2026-10-19"), "2026-10-19");

    expect(checkPageDates({ repo, base, head, today: "2026-10-19" })).toEqual([]);
  });

  it("passes a change of the date alone, and a page the change left alone", () => {
    const base = git(["rev-parse", "HEAD"]);
    commit(PAGE, page("First text.", "2026-09-30"), "2026-10-19");
    const head = commit("docs/README.md", "Readme\n", "2026-10-19");

    expect(checkPageDates({ repo, base, head, today: "2026-10-19" })).toEqual([]);
  });

  it("dates a change by the commit that wrote the text, not a later one that moved the date", () => {
    const base = git(["rev-parse", "HEAD"]);
    commit(PAGE, page("New text.", "2026-10-01"), "2026-10-10");
    const head = commit(PAGE, page("New text.", "2026-10-09"), "2026-10-19");

    expect(checkPageDates({ repo, base, head, today: "2026-10-19" })).toEqual([]);
  });

  it("asks a new page for its date too", () => {
    const base = git(["rev-parse", "HEAD"]);
    const head = commit("docs/src/content/docs/new.mdx", page("Text.", "2026-09-01"), "2026-10-19");

    expect(checkPageDates({ repo, base, head, today: "2026-10-19" })).toHaveLength(1);
  });

  it("asks a legal page for its date as well", () => {
    const base = git(["rev-parse", "HEAD"]);
    const head = commit(
      "docs/src/content/legal/privacy.mdx",
      page("Terms.", "2026-09-01"),
      "2026-10-19",
    );

    const problems = checkPageDates({ repo, base, head, today: "2026-10-20" });

    expect(problems.map(({ path }) => path)).toEqual(["docs/src/content/legal/privacy.mdx"]);
  });

  it("writes today's date into a page changed in the working tree, with --fix", () => {
    const base = git(["rev-parse", "HEAD"]);
    writeFileSync(join(repo, PAGE), page("Edited, not committed.", "2026-10-01"));

    expect(checkPageDates({ repo, base, today: "2026-10-19" })).toHaveLength(1);
    expect(checkPageDates({ repo, base, today: "2026-10-19", fix: true })).toEqual([]);
    expect(readFileSync(join(repo, PAGE), "utf8")).toContain('updated: "2026-10-19"');
  });
});

describe("a base the branch cannot be compared with", () => {
  it("is named in the error, with the way to name another", () => {
    expect(() => checkPageDates({ repo, base: "no-such-branch", today: "2026-10-19" })).toThrow(
      /no-such-branch is no commit that shares history with HEAD/,
    );
  });
});

describe("localToday", () => {
  it("writes the machine's own day as YYYY-MM-DD", () => {
    expect(localToday(new Date(2026, 9, 9, 23, 30))).toBe("2026-10-09");
  });
});
