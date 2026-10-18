/**
 * The audit counts a check as passed once it had something to check and
 * found nothing: a category with no finding reads "All checks passed" with
 * the checks it passed behind it, never "0 passed".
 */
import { describe, expect, it } from "vitest";
import { passedChecks } from "@/features/audit/passed-checks";
import { runAudit } from "@/features/audit/run-audit";
import type { AuditItem } from "@/features/audit/types";
import type { RequestEntry } from "@/store/types";

function request(method: string, fields: Partial<RequestEntry> = {}): RequestEntry {
  return {
    id: method,
    source: "api",
    group: "users",
    method,
    variables: undefined,
    mode: "direct",
    status: "success",
    middlewareCount: 0,
    middlewareEntries: [],
    hasValidation: { variables: true, response: true },
    startedAt: 1,
    sessionId: "s",
    ...fields,
  };
}

const NPLUSONE: AuditItem = {
  id: "err-n-plus-one-users",
  severity: "error",
  category: "performance",
  title: "N+1 request pattern",
  description: "List call followed by detail calls.",
};

describe("the checks the audit passed", () => {
  it("are the checks that found nothing, never one whose rule found something", () => {
    const passed = passedChecks([request("getAll")], [NPLUSONE]).map((item) => item.id);

    expect(passed).not.toContain("pass-n-plus-one");
    expect(passed).toContain("pass-waterfall");
    expect(passed).toContain("pass-sensitive-url");
  });

  it("count a check of mutations only once a mutation was made", () => {
    const queries = passedChecks([request("getAll")], []).map((item) => item.id);
    const withMutation = passedChecks(
      [
        request("getAll"),
        request("create", { type: "mutation", requestHeaders: { authorization: "Bearer t" } }),
      ],
      [],
    ).map((item) => item.id);

    expect(queries).not.toContain("pass-mutation-auth");
    expect(withMutation).toContain("pass-mutation-auth");
  });

  it("are none without a request to check", () => {
    expect(passedChecks([], [])).toEqual([]);
  });
});

describe("an audit with no reliability finding", () => {
  it("passes the reliability checks, as passed items of the category", () => {
    const result = runAudit(
      [request("getAll"), request("getById")],
      {},
      { browserSessions: new Set() },
    );

    const reliability = result.items.filter((item) => item.category === "reliability");
    expect(reliability.length).toBeGreaterThan(0);
    expect(reliability.every((item) => item.severity === "pass")).toBe(true);
    expect(result.breakdown.pass).toBeGreaterThan(0);
  });
});

describe("the duplicate check, passed", () => {
  it("says how many identical reads another call's request answered, when any did", () => {
    const shared = runAudit(
      [
        request("getAll", { id: "a", startedAt: 1_000, timing: timing(300) }),
        request("getAll", {
          id: "b",
          startedAt: 1_100,
          timing: timing(200),
          shared: { by: "flight", with: "a" },
        }),
      ],
      {},
      { browserSessions: new Set() },
    ).items.find((item) => item.id === "pass-duplicates");
    const alone = passedChecks([request("getAll")], []).find(
      (item) => item.id === "pass-duplicates",
    );

    expect(shared?.description).toBe(
      "No request was sent again with the same input right after the first. 1 identical read got its answer from a request another call made — in flight, or earlier in the render — and sent none of its own.",
    );
    expect(alone?.description).toBe(
      "No request was sent again with the same input right after the first.",
    );
  });
});

function timing(total: number): RequestEntry["timing"] {
  return { total, middleware: 0, fetch: total, validation: 0 };
}
