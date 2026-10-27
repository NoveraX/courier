/**
 * Tests for `scripts/lint-pr-title.sh`, which checks the header a squash
 * merge of a pull request will write, with this repository's commitlint
 * config.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "scripts", "lint-pr-title.sh");
const LONG_SUBJECT = `fix: 🐛 ${"a".repeat(65)}`;

/**
 * Runs the script as the workflow does: the repository's squash title
 * setting arrives in SQUASH_MERGE_COMMIT_TITLE, and is unknown when left out.
 */
function lintTitle(title, { number = "123", subject = "", squashTitle } = {}) {
  const env = { ...process.env };
  delete env.SQUASH_MERGE_COMMIT_TITLE;
  if (squashTitle !== undefined) env.SQUASH_MERGE_COMMIT_TITLE = squashTitle;
  const result = spawnSync("bash", [SCRIPT, title, number, subject], {
    cwd: ROOT,
    encoding: "utf8",
    env,
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe("lint-pr-title.sh", { timeout: 30_000 }, () => {
  it("accepts a title that still fits once its number is appended", () => {
    expect(lintTitle("feat(core): ✨ add retries").status).toBe(0);
  });

  it("rejects a title that fits alone but not with its number", () => {
    const title = `fix: 🐛 ${"a".repeat(65)}`;

    const result = lintTitle(title);

    expect([...title].length).toBe(72);
    expect(result.output).toContain("[header-max-characters]");
    expect(result.status).toBe(1);
  });

  it("rejects a trailing period that the appended number would hide", () => {
    const result = lintTitle("fix: 🐛 keep the body.");

    expect(result.output).toContain("[subject-full-stop]");
    expect(result.status).toBe(1);
  });

  it("refuses the forms git writes, which later checks skip", () => {
    for (const title of ["fixup! feat: ✨ add retries", "Merge branch 'a' into b"]) {
      const result = lintTitle(title);

      expect(result.output).toContain("is a form git writes");
      expect(result.status).toBe(1);
    }
  });

  it("accepts the title GitHub gives a revert", () => {
    expect(lintTitle('Revert "feat: ✨ add retries"').status).toBe(0);
  });

  it("checks the only commit's subject when the squash title is taken from it", () => {
    const result = lintTitle("fix: 🐛 keep the body", {
      subject: LONG_SUBJECT,
      squashTitle: "COMMIT_OR_PR_TITLE",
    });

    expect(result.output).toContain("[header-max-characters]");
    expect(result.status).toBe(1);
  });

  it("leaves the only commit's subject alone when the squash title is the pull request's", () => {
    const result = lintTitle("fix: 🐛 keep the body", {
      subject: LONG_SUBJECT,
      squashTitle: "PR_TITLE",
    });

    expect(result.output).not.toContain("[header-max-characters]");
    expect(result.status).toBe(0);
  });

  it("still checks the title when the squash title is the pull request's", () => {
    const result = lintTitle(LONG_SUBJECT, {
      subject: "fix: 🐛 keep the body",
      squashTitle: "PR_TITLE",
    });

    expect(result.output).toContain("[header-max-characters]");
    expect(result.status).toBe(1);
  });

  it("checks the only commit's subject when the squash title setting is not known", () => {
    const result = lintTitle("fix: 🐛 keep the body", { subject: LONG_SUBJECT });

    expect(result.output).toContain("squash title setting is not known");
    expect(result.output).toContain("[header-max-characters]");
    expect(result.status).toBe(1);
  });
});
