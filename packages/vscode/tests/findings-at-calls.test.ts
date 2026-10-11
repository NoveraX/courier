/**
 * Studio's audit findings placed at the calls they concern in a file: each
 * at every call to an endpoint it names, with what was seen there, and an
 * audit error marked as a warning — the code compiles; its traffic needs a
 * look. Findings of one kind at one call make one mark.
 */
import { describe, expect, it } from "vitest";

import { findingsAtCalls } from "../src/audit/findings-at-calls";
import type { EndpointCall, Finding } from "../src/studio/studio-types";

const call = (line: number, endpoint: string): EndpointCall => ({
  line,
  column: 9,
  endLine: line,
  endColumn: 30,
  endpoints: [{ source: "shop", endpoint }],
});

const FINDINGS: Finding[] = [
  {
    id: "err-timeout",
    severity: "error",
    title: "Timeout risk",
    description: "P95 response time exceeds 5 seconds.",
    suggestion: "Add a timeout option or optimize the backend endpoint.",
    endpoints: [{ source: "shop", endpoint: "orders.place", detail: "P95 = 6.4s" }],
  },
  {
    id: "hint-empty",
    severity: "hint",
    title: "Empty array responses",
    description: "An endpoint answered [].",
    endpoints: [{ source: "shop", endpoint: "products.list" }],
  },
  {
    id: "warn-dup",
    severity: "warning",
    title: "Duplicate requests",
    description: "The same call within 2 s.",
    endpoints: [{ source: "billing", endpoint: "orders.place" }],
  },
];

describe("audit findings at the calls in a file", () => {
  const placed = findingsAtCalls([call(4, "orders.place"), call(9, "products.list")], FINDINGS);

  it("marks every call to an endpoint a finding names, with what was seen there and the advice", () => {
    expect(placed).toEqual([
      {
        line: 4,
        column: 9,
        endLine: 4,
        endColumn: 30,
        severity: "warning",
        message:
          "Timeout risk — P95 = 6.4s. Add a timeout option or optimize the backend endpoint.",
        finding: "err-timeout",
      },
      {
        line: 9,
        column: 9,
        endLine: 9,
        endColumn: 30,
        severity: "hint",
        message: "Empty array responses — An endpoint answered [].",
        finding: "hint-empty",
      },
    ]);
  });

  it("leaves a call alone when the finding names its endpoint in another source", () => {
    expect(placed.some((finding) => finding.finding === "warn-dup")).toBe(false);
  });

  it("makes one mark of the findings of one kind at a call, at the gravest of them", () => {
    const duplicate = (id: string, severity: Finding["severity"], seen: string): Finding => ({
      id,
      severity,
      title: "Duplicate requests",
      description: seen,
      suggestion: "Deduplicate with caching.",
      endpoints: [{ source: "shop", endpoint: "products.get" }],
    });
    const marks = findingsAtCalls(
      [call(12, "products.get")],
      [
        duplicate("warn-dup-1", "hint", "Called again with sku A."),
        duplicate("warn-dup-2", "warning", "Called again with sku B."),
        duplicate("warn-dup-3", "hint", "Called again with sku C."),
      ],
    );

    expect(marks).toEqual([
      expect.objectContaining({
        severity: "information",
        message:
          "Duplicate requests — Called again with sku B, and 2 more like it. Deduplicate with caching.",
        finding: "warn-dup-2",
      }),
    ]);
  });
});
