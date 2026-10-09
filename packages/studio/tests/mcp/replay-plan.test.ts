import { describe, expect, it } from "vitest";
import type { RequestEntry } from "@/store/types-request";
import { replayPlan } from "../../src/server/mcp/replay-plan";

function request(overrides: Partial<RequestEntry>): RequestEntry {
  return {
    id: "r1",
    source: "shop",
    group: "orders",
    method: "list",
    variables: {},
    mode: "direct",
    status: "success",
    middlewareCount: 0,
    middlewareEntries: [],
    hasValidation: { variables: false, response: false },
    startedAt: 1,
    sessionId: "app",
    ...overrides,
  };
}

describe("what a replay sends again", () => {
  it("reads when the endpoint is a query, whatever verb it uses", () => {
    const plan = replayPlan([request({ type: "query", httpMethod: "POST" })], "r1");

    expect(plan).toMatchObject({ kind: "read", call: "POST shop.orders.list" });
  });

  it("writes when the endpoint is a mutation, whatever verb it uses", () => {
    expect(replayPlan([request({ type: "mutation", httpMethod: "GET" })], "r1")).toMatchObject({
      kind: "write",
    });
  });

  it("reads by the verb when the endpoint says neither, and writes when it says nothing at all", () => {
    expect(replayPlan([request({ httpMethod: "get" })], "r1")).toMatchObject({ kind: "read" });
    expect(replayPlan([request({ httpMethod: "DELETE" })], "r1")).toMatchObject({ kind: "write" });
    expect(replayPlan([request({})], "r1")).toMatchObject({
      kind: "write",
      call: "shop.orders.list",
    });
  });

  it("names an endpoint outside any group by its source and method", () => {
    const plan = replayPlan(
      [request({ group: undefined, method: "health", httpMethod: "GET" })],
      "r1",
    );

    expect(plan).toMatchObject({ call: "GET shop.health" });
  });
});

describe("what a replay refuses", () => {
  it("a request Studio does not have", () => {
    expect(replayPlan([request({})], "r9")).toEqual({
      refusal: "Studio has no request r9: list them with requests",
    });
  });

  it("a webhook, a CSRF token and a stream, each saying what to do instead", () => {
    const refusal = (overrides: Partial<RequestEntry>) => {
      const plan = replayPlan([request(overrides)], "r1");
      return "refusal" in plan ? plan.refusal : undefined;
    };

    expect(refusal({ mode: "webhook" })).toContain(
      "deliver it again from Studio's inspector (Deliver again), which has the app sign it afresh",
    );
    expect(refusal({ purpose: "csrf-token" })).toContain(
      "asked for again with the write that needs it",
    );
    expect(refusal({ transport: "sse" })).toContain("reconnect it from Studio's inspector");
    expect(refusal({ transport: "ws" })).toContain("reconnect it from Studio's inspector");
    expect(refusal({ transport: "http" })).toBeUndefined();
  });
});
