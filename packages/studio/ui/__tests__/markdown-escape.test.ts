/**
 * A finding placed in the audit's Markdown table so it shows as written: a
 * detail with every formatting character escaped and nothing GitHub would
 * link or typeset, an endpoint's label as a code span with only what would
 * end it or split the cell.
 */
import { describe, expect, it } from "vitest";

import { exportAsMarkdown } from "@/features/audit/export-report";
import type { AuditResult } from "@/features/audit/types";
import { markdownCode, markdownText } from "@/lib/markdown-escape";

const ZWSP = "\u200B";

describe("markdownText", () => {
  it("escapes what Markdown reads as formatting, a backslash first", () => {
    expect(markdownText("Array<string> | null")).toBe("Array\\<string\\> \\| null");
    expect(markdownText("a\\|b *c*")).toBe("a\\\\\\|b \\*c\\*");
  });

  it("writes its line breaks as spaces", () => {
    expect(markdownText("one\ntwo")).toBe("one two");
  });

  /** GitHub links these in the text a backslash leaves, so a zero-width space parts them. */
  it("keeps a mention, a reference to an issue and math from being read as such", () => {
    expect(markdownText("@octocat on #12, acme/shop#3 and GH-4 costs $5$")).toBe(
      `@${ZWSP}octocat on #${ZWSP}12, acme/shop#${ZWSP}3 and GH-${ZWSP}4 costs ${ZWSP}\\$5${ZWSP}\\$`,
    );
  });
});

describe("markdownCode", () => {
  it("escapes a pipe, writes a backtick as a quote, and leaves a backslash", () => {
    expect(markdownCode("GET /search|all `q` C:\\x")).toBe("GET /search\\|all 'q' C:\\x");
  });

  /** Read as an escaped backslash outside GitHub, two of them would let the pipe end the cell. */
  it("parts a backslash from the pipe after it", () => {
    expect(markdownCode("x\\|<img src=x onerror=alert(1)>")).toBe(
      `x\\${ZWSP}\\|<img src=x onerror=alert(1)>`,
    );
  });
});

describe("the audit's Markdown export", () => {
  it("keeps each affected endpoint in its row, whatever its label and detail hold", () => {
    const result: AuditResult = {
      items: [
        {
          id: "slow",
          severity: "warning",
          category: "performance",
          title: "Slow endpoints",
          description: "Two endpoints answer slowly.",
          endpoints: [{ key: "a", label: "api search|all", detail: "p95 900 ms | <b>slow</b>" }],
        },
      ],
      score: 90,
      breakdown: { error: 0, warning: 1, hint: 0, pass: 0 },
      timestamp: 0,
    };

    const rows = exportAsMarkdown(result)
      .split("\n")
      .filter((line) => line.startsWith("| `"));

    expect(rows).toEqual(["| `api search\\|all` | p95 900 ms \\| \\<b\\>slow\\</b\\> |"]);
  });
});
