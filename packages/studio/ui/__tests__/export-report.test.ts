/**
 * The audit written out as Markdown. A finding's words are plain text on the
 * screen and carry names the app's runtime reported, so in the report they
 * read as written — never as formatting, HTML, a link, a mention, a reference
 * to an issue or math — and a code suggestion stays inside its block whatever
 * backticks it holds.
 */
import { describe, expect, it } from "vitest";

import { exportAsMarkdown } from "@/features/audit/export-report";
import type { AuditItem, AuditResult } from "@/features/audit/types";

const ZWSP = "\u200B";

function reportOf(item: Partial<AuditItem>): string {
  const result: AuditResult = {
    items: [
      {
        id: "finding",
        severity: "warning",
        category: "performance",
        title: "Duplicate requests",
        description: "An endpoint was called again.",
        ...item,
      },
    ],
    score: 95,
    breakdown: { error: 0, warning: 1, hint: 0, pass: 0 },
    timestamp: 0,
  };
  return exportAsMarkdown(result);
}

describe("a finding's words in the report", () => {
  it("escapes HTML and links in the title, the description and the suggestion", () => {
    const lines = reportOf({
      title: "Duplicate <b>requests</b>",
      description: '"api.<img src=x onerror=alert(1)>.list" was called again.',
      suggestion: "Read [the guide](javascript:alert(1)) first.",
    }).split("\n");

    expect(lines).toContain("### 🟡 Duplicate \\<b\\>requests\\</b\\>");
    expect(lines).toContain('"api.\\<img src=x onerror=alert(1)\\>.list" was called again.');
    expect(lines).toContain("> **Suggestion:** Read [the guide\\](javascript:alert(1)) first.");
  });

  it("keeps a mention, a reference to an issue and math in a name from being read as such", () => {
    const lines = reportOf({
      description: '"api.@octocat.list" was called again: see #12 and $x$.',
    }).split("\n");

    expect(lines).toContain(
      `"api.@${ZWSP}octocat.list" was called again: see #${ZWSP}12 and ${ZWSP}\\$x${ZWSP}\\$.`,
    );
  });

  it("writes a description's line breaks as spaces, so a name cannot start a block", () => {
    const lines = reportOf({ description: 'Called "api.x\n# Approved\n- [x] done".' }).split("\n");

    expect(lines).toContain('Called "api.x # Approved - [x] done".');
    expect(lines).not.toContain("# Approved");
  });

  it("keeps a description from beginning a heading, a list or a link's definition", () => {
    const first = (description: string) => reportOf({ description }).split("\n")[8];

    expect(first("# Approved")).toBe("\\# Approved");
    expect(first("- [x] done")).toBe("\\- [x] done");
    expect(first("+ added")).toBe("\\+ added");
    expect(first("12. first")).toBe("12\\. first");
    expect(first("1) first")).toBe("1\\) first");
    expect(first("[x]: https://evil.example")).toBe("\\[x]: https://evil.example");
    expect(first("    indented")).toBe("indented");
  });

  it("leaves a finding's ordinary words as the screen shows them", () => {
    const lines = reportOf({
      title: "HTTP method mismatch",
      description: "A write is sent over GET, whose answers are cached and may be repeated.",
      suggestion: "Declare it with .reads() if it only reads (e.g. 200/201/204).",
    }).split("\n");

    expect(lines).toContain("### 🟡 HTTP method mismatch");
    expect(lines).toContain(
      "A write is sent over GET, whose answers are cached and may be repeated.",
    );
    expect(lines).toContain(
      "> **Suggestion:** Declare it with .reads() if it only reads (e.g. 200/201/204).",
    );
  });
});

describe("a code suggestion in the report", () => {
  it("is fenced with three backticks when it holds none", () => {
    const code = "const items = await client.users.list();";

    expect(reportOf({ codeSuggestion: code })).toContain(["```ts", code, "```"].join("\n"));
  });

  it("is fenced longer than any run of backticks inside it, which then cannot close it", () => {
    const code = "const a = await client.x();\n```\n<img src=x onerror=alert(1)>\n```";

    const lines = reportOf({ codeSuggestion: code }).split("\n");
    const open = lines.indexOf("````ts");

    expect(open).toBeGreaterThan(-1);
    expect(lines.slice(open + 1, open + 5)).toEqual(code.split("\n"));
    expect(lines[open + 5]).toBe("````");
  });

  it("outgrows a run longer than the usual fence", () => {
    const code = "const md = `````;";

    expect(reportOf({ codeSuggestion: code })).toContain(["``````ts", code, "``````"].join("\n"));
  });
});
