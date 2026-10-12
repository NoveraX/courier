/**
 * A finding placed in the audit's Markdown table so it shows as written: a
 * detail with every formatting character escaped, an endpoint's label as a
 * code span with only what would end it or split the cell.
 */
import { describe, expect, it } from "vitest";

import { exportAsMarkdown } from "@/features/audit/export-report";
import type { AuditResult } from "@/features/audit/types";
import { markdownCode, markdownText } from "@/lib/markdown-escape";

describe("markdownText", () => {
  it("escapes what Markdown reads as formatting, a backslash first", () => {
    expect(markdownText("Array<string> | null")).toBe("Array\\<string\\> \\| null");
    expect(markdownText("a\\|b *c*")).toBe("a\\\\\\|b \\*c\\*");
  });

  it("writes its line breaks as spaces", () => {
    expect(markdownText("one\ntwo")).toBe("one two");
  });
});

describe("markdownCode", () => {
  it("escapes a pipe, writes a backtick as a quote, and leaves a backslash", () => {
    expect(markdownCode("GET /search|all `q` C:\\x")).toBe("GET /search\\|all 'q' C:\\x");
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
