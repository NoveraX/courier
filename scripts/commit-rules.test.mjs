/**
 * Tests for `scripts/commit-rules.cjs`: the rules as plain functions, then
 * the repository's commitlint config through the commitlint CLI — reading a
 * message from stdin, as CI does, and from a message file with `--edit`, as
 * the commit-msg hook does.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { TYPE_EMOJI, bodyNoLabelLines, headerMaxCharacters, isGitWritten, subjectTypeEmoji } =
  require("./commit-rules.cjs");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = require.resolve("@commitlint/cli/cli.js");
const CLI_TIMEOUT_MS = 20_000;
const SCRATCH = mkdtempSync(join(tmpdir(), "commit-rules-"));

afterAll(() => {
  rmSync(SCRATCH, { recursive: true, force: true });
});

function lint(message) {
  const result = spawnSync(process.execPath, [CLI, "-g", "commitlint.config.cjs", "--verbose"], {
    cwd: ROOT,
    input: message,
    encoding: "utf8",
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function lintMessageFile(contents) {
  const file = join(SCRATCH, "COMMIT_EDITMSG");
  writeFileSync(file, contents);
  const args = [CLI, "-g", "commitlint.config.cjs", "--edit", file];
  const result = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8" });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function headerOf(characters, prefix = "fix: 🐛 ") {
  const seen = [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(prefix)].length;
  return prefix + "a".repeat(characters - seen);
}

function releaseMessage(version, notes) {
  const config = JSON.parse(readFileSync(join(ROOT, ".releaserc.json"), "utf8"));
  const git = config.plugins.find((plugin) => plugin[0] === "@semantic-release/git");
  return git[1].message
    .replace("${nextRelease.version}", version)
    .replace("${nextRelease.notes}", notes);
}

describe("headerMaxCharacters", () => {
  it("counts an emoji that takes two UTF-16 units as one character", () => {
    const header = headerOf(72);

    expect(header.length).toBe(73);
    expect(headerMaxCharacters({ header }, "always", 72)[0]).toBe(true);
  });

  it("counts ♻️ with its variation selector as one character", () => {
    const header = headerOf(72, "refactor: ♻️ ");

    expect([...header].length).toBe(73);
    expect(headerMaxCharacters({ header }, "always", 72)[0]).toBe(true);
  });

  it("rejects a header one character over the limit", () => {
    const [valid, message] = headerMaxCharacters({ header: headerOf(73) }, "always", 72);

    expect(valid).toBe(false);
    expect(message).toContain("it has 73");
  });
});

describe("subjectTypeEmoji", () => {
  it("accepts every type with its own emoji", () => {
    for (const [type, emoji] of TYPE_EMOJI) {
      expect(subjectTypeEmoji({ type, subject: `${emoji} add retries` })[0]).toBe(true);
    }
  });

  it("accepts an emoji with or without the variation selector", () => {
    expect(subjectTypeEmoji({ type: "perf", subject: "⚡️ cache the lookup" })[0]).toBe(true);
    expect(subjectTypeEmoji({ type: "refactor", subject: "♻ split the loader" })[0]).toBe(true);
  });

  it("rejects the emoji of another type", () => {
    expect(subjectTypeEmoji({ type: "feat", subject: "🐛 add retries" })[0]).toBe(false);
  });

  it("rejects a subject without an emoji", () => {
    expect(subjectTypeEmoji({ type: "fix", subject: "keep the body" })[0]).toBe(false);
  });

  it("rejects a description that starts in upper case", () => {
    expect(subjectTypeEmoji({ type: "fix", subject: "🐛 Keep the body" })[0]).toBe(false);
  });

  it("rejects an emoji with no description after it", () => {
    expect(subjectTypeEmoji({ type: "fix", subject: "🐛 " })[0]).toBe(false);
  });

  it("leaves a type outside the convention to type-enum", () => {
    expect(subjectTypeEmoji({ type: "constructor", subject: "add x" })[0]).toBe(true);
    expect(subjectTypeEmoji({ type: null, subject: null })[0]).toBe(true);
  });
});

describe("bodyNoLabelLines", () => {
  it("rejects a body line that starts a footer with a colon", () => {
    const [valid, message] = bodyNoLabelLines({ body: "First.\n\nCore: now waits." });

    expect(valid).toBe(false);
    expect(message).toContain('"Core: now waits."');
  });

  it("rejects the footer forms that start with a number or use #", () => {
    expect(bodyNoLabelLines({ body: "404: now returns null." })[0]).toBe(false);
    expect(bodyNoLabelLines({ body: "Issue #12 showed the loop." })[0]).toBe(false);
  });

  it("checks the lines the parser moved into the footer", () => {
    expect(bodyNoLabelLines({ body: "First.", footer: "Core: now waits.\nMore." })[0]).toBe(false);
  });

  it("allows lines that are not footers: a bare label, a path, a URL, an indented pair", () => {
    const body = "Example:\n  key: value\npackages/core/src/a.ts: the loop\nhttps://example.com/a";

    expect(bodyNoLabelLines({ body })[0]).toBe(true);
  });

  it("allows a BREAKING CHANGE footer in either spelling", () => {
    expect(bodyNoLabelLines({ footer: "BREAKING CHANGE: y is gone" })[0]).toBe(true);
    expect(bodyNoLabelLines({ footer: "BREAKING-CHANGE: y is gone" })[0]).toBe(true);
  });

  it("allows git trailers wherever a squash merge's list of commits puts them", () => {
    const body = [
      "* feat: ✨ add retries",
      "",
      "Signed-off-by: A <a@example.com>",
      "",
      "* fix: 🐛 tidy the loop",
      "",
      "Signed-off-by: A <a@example.com>",
      "Change-Id: I1234",
    ].join("\n");
    const footer =
      "---------\n\nCo-authored-by: B <b@example.com>\nCo-developed-by: C <c@example.com>";

    expect(bodyNoLabelLines({ body, footer })[0]).toBe(true);
  });

  it("allows issue references in the forms release notes link", () => {
    for (const footer of ["Closes #12", "fixes #12", "Resolved NoveraX/courier#12", "Refs: #12"]) {
      expect(bodyNoLabelLines({ body: "Details.", footer })[0]).toBe(true);
    }
  });

  it("rejects a breaking-change note not written in capitals", () => {
    const [valid, message] = bodyNoLabelLines({ body: "Breaking change: the parser moved" });

    expect(valid).toBe(false);
    expect(message).toContain('"Breaking change: the parser moved"');
  });

  it("ignores the diff below git's scissors line, whatever the comment string", () => {
    for (const comment of ["#", ";", "//"]) {
      const body = `The body.\n${comment} ------------------------ >8 ------------------------\nCore: diff`;

      expect(bodyNoLabelLines({ body })[0]).toBe(true);
    }
  });

  it("accepts a message with neither body nor footer", () => {
    expect(bodyNoLabelLines({ body: null, footer: null })[0]).toBe(true);
  });
});

describe("isGitWritten", () => {
  it("skips the messages git writes", () => {
    const messages = [
      "Merge branch 'master' into feature",
      "Merge branches 'a' and 'b'",
      "Merge commit '250f0d8'",
      "Merge tag 'v1.0.0'",
      "Merge tags 'v1.0.0' and 'v1.1.0'",
      "Merge remote-tracking branch 'origin/master'",
      "Merge remote-tracking branches 'origin/a' and 'origin/b'",
      "Merge pull request #12 from someone/branch",
      'Revert "feat: ✨ add retries"',
      'Reapply "feat: ✨ add retries"',
      "fixup! feat: ✨ add retries",
      "squash! feat: ✨ add retries",
      "amend! feat: ✨ add retries",
    ];

    for (const message of messages) expect(isGitWritten(message)).toBe(true);
  });

  it("checks a message that only looks like one", () => {
    expect(isGitWritten("revert the retry change")).toBe(false);
    expect(isGitWritten("Merged the loaders")).toBe(false);
    expect(isGitWritten("feat(define)!: ✨ describe endpoints with a builder")).toBe(false);
  });
});

describe("commitlint config", { timeout: CLI_TIMEOUT_MS }, () => {
  it("accepts a breaking change written with ! and a footer", () => {
    const result = lint(
      "feat(core)!: ✨ drop the legacy entry\n\nBREAKING CHANGE: use the new one.",
    );

    expect(result.output).toContain("found 0 problems, 0 warnings");
    expect(result.status).toBe(0);
  });

  it("accepts a 72-character header whose emoji takes two UTF-16 units", () => {
    expect(lint(headerOf(72)).status).toBe(0);
  });

  it("rejects a 73-character header", () => {
    const result = lint(headerOf(73));

    expect(result.status).toBe(1);
    expect(result.output).toContain("[header-max-characters]");
  });

  it("rejects the emoji of another type", () => {
    const result = lint("feat: 🐛 add retries");

    expect(result.status).toBe(1);
    expect(result.output).toContain("[subject-type-emoji]");
  });

  it("rejects a description in upper case, which subject-case misses after an emoji", () => {
    const result = lint("feat: ✨ Add retries");

    expect(result.status).toBe(1);
    expect(result.output).toContain("[subject-type-emoji]");
  });

  it("rejects a type outside the convention", () => {
    const result = lint("revert: ✨ add retries");

    expect(result.status).toBe(1);
    expect(result.output).toContain("[type-enum]");
  });

  it("rejects a body line that starts a footer", () => {
    const result = lint("fix: 🐛 keep the body\n\nFirst paragraph.\n\nCore: now waits.");

    expect(result.status).toBe(1);
    expect(result.output).toContain("[body-no-label-lines]");
  });

  it("accepts a squash merge of signed-off commits with a co-author", () => {
    const message = [
      "feat(core): ✨ add retries (#123)",
      "",
      "* feat(core): ✨ add retries",
      "",
      "Signed-off-by: A <a@example.com>",
      "",
      "* fix(core): 🐛 tidy the loop",
      "",
      "Signed-off-by: A <a@example.com>",
      "",
      "---------",
      "",
      "Co-authored-by: B <b@example.com>",
    ].join("\n");

    expect(lint(message).status).toBe(0);
  });

  it("accepts an issue reference in the footer", () => {
    expect(lint("fix: 🐛 keep the body\n\nThe loop now waits.\n\nCloses #12").status).toBe(0);
  });

  it("checks a lower-case revert that is not git's own", () => {
    const result = lint("revert the retry change because it Broke things.");

    expect(result.status).toBe(1);
    expect(result.output).toContain("[type-empty]");
  });

  it("skips a revert and a fixup written by git", () => {
    expect(lint('Revert "feat: ✨ add retries"\n\nThis reverts commit abc1234.').status).toBe(0);
    expect(lint("fixup! feat: ✨ add retries").status).toBe(0);
  });

  it("accepts the release commit semantic-release writes", () => {
    const notes = [
      "## [1.2.0](https://github.com/NoveraX/courier/compare/v1.1.0...v1.2.0) (2026-09-27)",
      "",
      "### Features",
      "",
      "* **core:** ✨ add retries ([665337c](https://github.com/NoveraX/courier/commit/665337c))",
    ].join("\n");

    const result = lint(releaseMessage("1.2.0", notes));

    expect(result.output).toContain("found 0 problems");
    expect(result.status).toBe(0);
  });

  it("reads a message file whose template comments come before the header", () => {
    const result = lintMessageFile(
      "# Describe the change\n# above it\nfix: 🐛 keep the body\n\nSome body.\n",
    );

    expect(result.output).not.toContain("[body-no-label-lines]");
    expect(result.status).toBe(0);
  });

  it("reads a message file that starts with a blank line", () => {
    const result = lintMessageFile("\nfix: 🐛 keep the body\n\nSome body.\n");

    expect(result.output).not.toContain("[body-no-label-lines]");
    expect(result.status).toBe(0);
  });

  it("reads a message file with the diff commit -v adds", () => {
    const contents = [
      "fix: 🐛 keep the body",
      "",
      "Some body.",
      "# ------------------------ >8 ------------------------",
      "# Do not modify or remove the line above.",
      "diff --git a/x b/x",
      "+Core: now waits",
      "",
    ].join("\n");

    expect(lintMessageFile(contents).status).toBe(0);
  });

  it("rejects a footer-shaped body line in a message file", () => {
    const result = lintMessageFile("fix: 🐛 keep the body\n\nCore: now waits.\n");

    expect(result.status).toBe(1);
    expect(result.output).toContain("[body-no-label-lines]");
  });
});
