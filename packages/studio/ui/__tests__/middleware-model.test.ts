/**
 * The Middleware page's reckoning from the runs Studio captured: where a
 * middleware works, the calls that ran through middleware, what the
 * session's middleware comes to, the endpoints it weighs on most, a call
 * traced as an onion, and the page's address.
 */
import { describe, expect, it } from "vitest";

import { traceOf } from "@/features/middleware/chain-trace";
import { endpointImpact } from "@/features/middleware/endpoint-impact";
import { phaseOf } from "@/features/middleware/middleware-phase";
import { validateMiddlewareSearch } from "@/features/middleware/middleware-search";
import { middlewareOverview, traced } from "@/features/middleware/middleware-stats";
import type { MiddlewareEntry, RequestEntry } from "@/store/types";
import { requestEntry } from "./request-entry-fixture";

function run(name: string, index: number, fields: Partial<MiddlewareEntry> = {}): MiddlewareEntry {
  return { requestId: "r", name, index, startedAt: 0, duration: 2, status: "completed", ...fields };
}

function call(
  id: string,
  entries: MiddlewareEntry[],
  fields: Partial<RequestEntry> = {},
): RequestEntry {
  return requestEntry({
    id,
    middlewareEntries: entries,
    middlewareCount: entries.length,
    timing: { total: 100, middleware: 10, fetch: 85, validation: 5 },
    ...fields,
  });
}

describe("where a middleware works", () => {
  it("is the phase it declares, else the one its timing shows", () => {
    expect(phaseOf({ phase: "after" })).toBe("after");
    expect(phaseOf({ beforeDuration: 1.2, afterDuration: 0 })).toBe("before");
    expect(phaseOf({ beforeDuration: 0, afterDuration: 3 })).toBe("after");
    expect(phaseOf({ beforeDuration: 1, afterDuration: 1 })).toBe("wrap");
  });
});

describe("the session's middleware", () => {
  const calls = traced([
    call("a", [
      run("auth", 0, { duration: 3, headersAdded: ["authorization"] }),
      run("log", 1, { duration: 1 }),
    ]),
    call(
      "b",
      [
        run("auth", 0, { duration: 5, status: "error", error: "401" }),
        run("log", 1, { duration: 1 }),
      ],
      {
        timing: { total: 300, middleware: 30, fetch: 260, validation: 10 },
      },
    ),
    call("c", []),
    call("d", [run("auth", 0)], { status: "pending" }),
  ]);

  it("counts only the finished calls that ran through middleware", () => {
    expect(calls.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("comes to the share of those calls' time, the time a call, and each middleware in chain order", () => {
    const overview = middlewareOverview(calls);

    expect(overview).toMatchObject({ traced: 2, overhead: 10, perCall: 20, errors: 1 });
    expect(overview.stats.map((s) => [s.name, s.calls, s.avg, s.errors, s.headersAdded])).toEqual([
      ["auth", 2, 4, 1, ["authorization"]],
      ["log", 2, 1, 0, []],
    ]);
    expect(overview.stats[0]?.share).toBeCloseTo(0.8);
  });
});

describe("the endpoints middleware weighs on", () => {
  it("rank by middleware time a call, with the share of their time and each middleware's part", () => {
    const calls = [
      call("u1", [run("auth", 0, { duration: 6 })], {
        method: "get",
        timing: { total: 40, middleware: 8, fetch: 30, validation: 2 },
      }),
      call("l1", [run("auth", 0, { duration: 2 })], { method: "list" }),
      call("l2", [run("auth", 0, { duration: 4 })], { method: "list" }),
    ];

    const [first, second] = endpointImpact(calls);

    expect(first).toMatchObject({
      key: "api.users.list",
      calls: 2,
      perCall: 10,
      share: 10,
      newestId: "l1",
    });
    expect(first?.parts).toEqual([{ name: "auth", ms: 3 }]);
    expect(second).toMatchObject({ key: "api.users.get", perCall: 8, share: 20 });
  });
});

describe("a call traced", () => {
  it("lays each middleware's time before the fetch in chain order and after it in reverse, around the fetch", () => {
    const r = call(
      "t",
      [
        run("auth", 0, { duration: 4, beforeDuration: 3, afterDuration: 1 }),
        run("log", 1, { duration: 2, beforeDuration: 1, afterDuration: 1 }),
      ],
      { timing: { total: 100, middleware: 6, fetch: 90, validation: 4 } },
    );

    const trace = traceOf(r);

    expect(trace.span).toBe(100);
    expect(trace.lanes.map((l) => l.name)).toEqual(["auth", "log", "fetch"]);
    expect(trace.lanes[0]?.spans).toEqual([
      { start: 0, width: 0.03 },
      { start: 0.95, width: 0.01 },
    ]);
    expect(trace.lanes[1]?.spans).toEqual([
      { start: 0.03, width: 0.01 },
      { start: 0.94, width: 0.01 },
    ]);
    expect(trace.lanes[2]?.spans).toEqual([{ start: 0.04, width: 0.9 }]);
  });

  it("has no fetch when a middleware stopped the call before it fetched, and one once it did", () => {
    const stopped = call("s", [run("auth", 0, { status: "error", error: "no token" })], {
      status: "error",
      statusCode: undefined,
      url: undefined,
      timing: { total: 3, middleware: 3, fetch: 0, validation: 0 },
    });

    const trace = traceOf(stopped);
    const reached = traceOf({ ...stopped, url: "http://upstream.test/faults", statusCode: 404 });

    expect(trace.reachedFetch).toBe(false);
    expect(trace.lanes.map((l) => l.name)).toEqual(["auth"]);
    expect(reached.lanes.map((l) => l.name)).toEqual(["auth", "fetch"]);
  });

  it("puts a run with no measured split on the side its phase says", () => {
    const r = call("u", [
      run("log", 0, { duration: 5, phase: "after" }),
      run("auth", 1, { duration: 5, phase: "before" }),
    ]);

    const [log, auth] = traceOf(r).steps;

    expect([log?.before, log?.after]).toEqual([0, 5]);
    expect([auth?.before, auth?.after]).toEqual([5, 0]);
  });
});

describe("the page's address", () => {
  it("keeps the chain view and the call it traces, named apart from the inspector's", () => {
    expect(validateMiddlewareSearch({ view: "chain", trace: "r1", req: "r2" })).toEqual({
      view: "chain",
      trace: "r1",
    });
    expect(validateMiddlewareSearch({ view: "overview", trace: "" })).toEqual({});
  });
});
