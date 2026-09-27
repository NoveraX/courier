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

function lintTitle(title, number = "123", subject = "") {
  const result = spawnSync("bash", [SCRIPT, title, number, subject], {
    cwd: ROOT,
    encoding: "utf8",
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

  it("checks the only commit's subject, which GitHub uses as the header", () => {
    const subject = `fix: 🐛 ${"a".repeat(65)}`;

    const result = lintTitle("fix: 🐛 keep the body", "123", subject);

    expect(result.output).toContain("[header-max-characters]");
    expect(result.status).toBe(1);
  });
});
