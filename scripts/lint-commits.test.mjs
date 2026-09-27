/**
 * Tests for `scripts/lint-commits.sh`, the commit check CI runs. Each test
 * builds a throwaway repository in `os.tmpdir()` and points the script at it
 * through `GIT_DIR`, while commitlint runs with this repository's config.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "scripts", "lint-commits.sh");
const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
};

let repo;

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

function git(...args) {
  return execFileSync("git", ["-C", repo, ...args], { env: GIT_ENV, encoding: "utf8" }).trim();
}

function createRepo() {
  repo = mkdtempSync(join(tmpdir(), "lint-commits-"));
  git("init", "-q", "-b", "master");
}

function commit(message) {
  git("commit", "-q", "--allow-empty", "-m", message);
  return git("rev-parse", "HEAD");
}

function lintCommits(head, prBase = "") {
  const env = { ...GIT_ENV, GIT_DIR: join(repo, ".git") };
  const result = spawnSync("bash", [SCRIPT, head, prBase], { cwd: ROOT, env, encoding: "utf8" });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe("lint-commits.sh", { timeout: 30_000 }, () => {
  it("checks every commit since the last release tag, not only the newest", () => {
    createRepo();
    git("tag", "v1.0.0", commit("feat: ✨ start"));
    commit("feat: 🐛 add retries");
    const head = commit("fix: 🐛 keep the body");

    const result = lintCommits(head);

    expect(result.output).toContain("Checking 2 commits");
    expect(result.output).toContain("[subject-type-emoji]");
    expect(result.status).toBe(1);
  });

  it("reaches past a prerelease tag to the last release", () => {
    createRepo();
    git("tag", "v1.0.0", commit("feat: ✨ start"));
    git("tag", "v1.1.0-beta.1", commit("feat: 🐛 add retries"));
    const head = commit("fix: 🐛 keep the body");

    const result = lintCommits(head);

    expect(result.output).toContain("Checking 2 commits");
    expect(result.status).toBe(1);
  });

  it("checks the whole history, root commit included, before the first release", () => {
    createRepo();
    commit("Initial commit");
    const head = commit("fix: 🐛 keep the body");

    const result = lintCommits(head);

    expect(result.output).toContain("Checking the root commit");
    expect(result.output).toContain("[type-empty]");
    expect(result.status).toBe(1);
  });

  it("passes when nothing came after the last release", () => {
    createRepo();
    commit("feat: ✨ start");
    const head = commit("fix: 🐛 keep the body");
    git("tag", "v1.0.0", head);

    const result = lintCommits(head);

    expect(result.output).toContain("Checking 0 commits");
    expect(result.status).toBe(0);
  });

  it("ignores a release tag the head does not descend from", () => {
    createRepo();
    git("tag", "v1.0.0", commit("feat: ✨ start"));
    git("checkout", "-q", "--orphan", "rewritten");
    commit("feat: ✨ start again");
    const head = commit("fix: 🐛 keep the body");

    const result = lintCommits(head);

    expect(result.output).toContain("Checking the root commit");
    expect(result.output).toContain("Checking 1 commits");
    expect(result.status).toBe(0);
  });

  it("checks only a pull request's own commits", () => {
    createRepo();
    commit("feat: ✨ start");
    const base = commit("feat: 🐛 already on master");
    git("checkout", "-q", "-b", "change");
    const good = commit("fix: 🐛 keep the body");

    expect(lintCommits(good, base).status).toBe(0);

    const bad = commit("fix: keep the rest");
    const result = lintCommits(bad, base);

    expect(result.output).toContain("Checking 2 commits");
    expect(result.status).toBe(1);
  });

  it("checks the whole history when a pull request shares none with its base", () => {
    createRepo();
    const base = commit("feat: ✨ start");
    git("checkout", "-q", "--orphan", "unrelated");
    const head = commit("feat: ✨ start elsewhere");

    const result = lintCommits(head, base);

    expect(result.output).toContain("Checking the root commit");
    expect(result.status).toBe(0);
  });

  it("refuses a fixup commit that was never folded in", () => {
    createRepo();
    git("tag", "v1.0.0", commit("feat: ✨ start"));
    const head = commit("fixup! feat: ✨ start");

    const result = lintCommits(head);

    expect(result.output).toContain("Fold these commits into the ones they amend");
    expect(result.status).toBe(1);
  });
});
