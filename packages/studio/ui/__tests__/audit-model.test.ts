/**
 * The Audit page's reckoning: the score of a set of findings and of each
 * category, what a score is called, the filters kept in the address, a
 * finding's line and its endpoints as the page shows them, and which lines
 * of a suggested fix are the fix.
 */
import { describe, expect, it } from "vitest";

import { auditScore, categoryScores, gradeOf } from "@/features/audit/audit-score";
import { validateAuditSearch } from "@/features/audit/audit-search";
import { isFixLine } from "@/features/audit/code-focus";
import { categoryTally, matchesFinding, severityCounts } from "@/features/audit/finding-filter";
import { findingEndpoints, summaryOf } from "@/features/audit/finding-view";
import type { AuditItem } from "@/features/audit/types";
import { requestEntry } from "./request-entry-fixture";

function finding(fields: Partial<AuditItem> & Pick<AuditItem, "id" | "severity">): AuditItem {
  return { category: "performance", title: fields.id, description: "", ...fields };
}

const ITEMS: AuditItem[] = [
  finding({ id: "e1", severity: "error", category: "reliability", title: "High error rate" }),
  finding({ id: "w1", severity: "warning", title: "Slow endpoints" }),
  finding({ id: "w2", severity: "warning", title: "Duplicate requests" }),
  finding({ id: "h1", severity: "hint", category: "security", title: "No response validation" }),
  finding({ id: "p1", severity: "pass", category: "best-practices", title: "Healthy endpoints" }),
];

describe("the score", () => {
  it("takes 15 an error, 5 a warning and 2 a hint, gives a point a pass, and stays within 0 and 100", () => {
    expect(auditScore(ITEMS)).toBe(100 - 15 - 10 - 2 + 1);
    expect(auditScore(Array.from({ length: 9 }, () => ({ severity: "error" as const })))).toBe(40);
    expect(auditScore([{ severity: "pass" }])).toBe(100);
  });

  it("reckons each category over its own findings, an empty one reading 100", () => {
    expect(categoryScores(ITEMS)).toEqual({
      performance: 90,
      reliability: 85,
      security: 98,
      "best-practices": 100,
    });
  });

  it("is called excellent, good, needing attention or at risk", () => {
    expect([95, 85, 75, 40].map((score) => gradeOf(score))).toEqual([
      { label: "Excellent", tone: "ok" },
      { label: "Good", tone: "warn" },
      { label: "Needs attention", tone: "warn" },
      { label: "At risk", tone: "err" },
    ]);
  });
});

describe("the filters", () => {
  it("keep only a real severity and category from the address, and the search as typed", () => {
    expect(validateAuditSearch({ sev: "warning", cat: "security", q: "slow " })).toEqual({
      sev: "warning",
      cat: "security",
      q: "slow ",
    });
    expect(validateAuditSearch({ sev: "fatal", cat: "style", q: "" })).toEqual({});
  });

  it("match by severity, category and the search in the title or summary", () => {
    const shown = (search: Parameters<typeof matchesFinding>[1]) =>
      ITEMS.filter((item) => matchesFinding(item, search)).map((item) => item.id);

    expect(shown({ sev: "warning" })).toEqual(["w1", "w2"]);
    expect(shown({ cat: "security" })).toEqual(["h1"]);
    expect(shown({ q: "  DUPLICATE " })).toEqual(["w2"]);
  });

  it("count each severity and each category's open findings and passes", () => {
    expect(severityCounts(ITEMS)).toEqual({ all: 5, error: 1, warning: 2, hint: 1, pass: 1 });
    expect(categoryTally(ITEMS, "performance")).toEqual({ open: 2, passed: 0 });
    expect(categoryTally(ITEMS, "best-practices")).toEqual({ open: 0, passed: 1 });
  });
});

describe("a finding as the page shows it", () => {
  const item = finding({
    id: "e2",
    severity: "error",
    description: "These endpoints fail more than 20% of the time.",
    endpoints: [
      {
        key: "a",
        label: "billing.invoices.list",
        detail: "28% errors (39 requests)",
        requestIds: ["r1"],
      },
      { key: "b", label: "Expected a number", detail: "4x", requestIds: ["r2"] },
    ],
  });

  it("sums up its first endpoint and how many more, or else its description", () => {
    expect(summaryOf(item)).toBe("billing.invoices.list — 28% errors (39 requests) · 1 more");
    expect(summaryOf({ description: "No responses are compressed." })).toBe(
      "No responses are compressed.",
    );
  });

  it("lists its endpoints with the method of their first call and where their calls are", () => {
    const byId = new Map([["r1", requestEntry({ id: "r1", httpMethod: "post" })]]);

    expect(findingEndpoints(item, byId)).toEqual([
      {
        key: "a",
        method: "POST",
        prefix: "billing.",
        name: "invoices.list",
        detail: "28% errors (39 requests)",
        timelineQuery: "billing.invoices.list",
        firstRequestId: "r1",
      },
      {
        key: "b",
        method: null,
        prefix: "",
        name: "Expected a number",
        detail: "4x",
        timelineQuery: null,
        firstRequestId: "r2",
      },
    ]);
  });

  it("lists the endpoints a finding's calls reached when it names calls, not endpoints", () => {
    const burst = finding({ id: "n1", severity: "error", requestIds: ["l", "d1", "d2"] });
    const byId = new Map([
      ["l", requestEntry({ id: "l", method: "list" })],
      ["d1", requestEntry({ id: "d1", method: "get" })],
      ["d2", requestEntry({ id: "d2", method: "get" })],
    ]);

    expect(
      findingEndpoints(burst, byId).map((e) => [e.prefix, e.name, e.detail, e.timelineQuery]),
    ).toEqual([
      ["api.", "users.list", "1 request", "api.users.list"],
      ["api.", "users.get", "2 requests", "api.users.get"],
    ]);
  });

  it("counts the calls and the requests they sent where a read another call's request answered is among them", () => {
    const burst = finding({ id: "n2", severity: "warning", requestIds: ["a", "b", "c"] });
    const byId = new Map([
      ["a", requestEntry({ id: "a" })],
      ["b", requestEntry({ id: "b", shared: { by: "flight", with: "a" } })],
      ["c", requestEntry({ id: "c" })],
    ]);

    expect(findingEndpoints(burst, byId).map((e) => e.detail)).toEqual(["3 calls · 2 requests"]);
  });

  it("draws out the lines of a suggested fix that make the fix", () => {
    expect(isFixLine("  .timeout(5_000)")).toBe(true);
    expect(isFixLine('  .use(cacheMiddleware({ scope: "public", ttl: 60_000 }))')).toBe(true);
    expect(isFixLine('import { courier } from "@noverax/courier/define";')).toBe(false);
  });
});
