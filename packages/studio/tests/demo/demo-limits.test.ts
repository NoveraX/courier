/**
 * A public demo counts what its visitors do in windows of ten seconds, for
 * each page, for each address and for every visitor together, and forgets
 * a page that left: opening more pages does not widen a visitor's share,
 * and one address cannot use every visitor's.
 */
import { describe, expect, it } from "vitest";

import {
  createDemoLimits,
  DEMO_LIMITS,
  DEMO_WINDOW_MS,
  type DemoVisitor,
} from "../../src/server/demo/demo-limits";
import { demoVisitors } from "../../src/server/demo/demo-visitors";

const AT = 1_000_000;
const SEND_PAGE = 10;
const SEND_ADDRESS = 20;
const SEND_ALL = 60;

function takeMany(
  limits: ReturnType<typeof createDemoLimits>,
  visitor: DemoVisitor,
  times: number,
): Array<string | null> {
  return Array.from({ length: times }, () => limits.take(visitor, "send", AT));
}

describe("the demo's limits", () => {
  it("give an address more than a page, and every visitor more than an address", () => {
    expect(DEMO_LIMITS.send).toEqual({ page: SEND_PAGE, address: SEND_ADDRESS, all: SEND_ALL });
  });
});

describe("the demo's counts", () => {
  it("refuse a page one call past its share, and say how many it takes", () => {
    const limits = createDemoLimits();

    const taken = takeMany(limits, { page: "a", address: "1.1.1.1" }, SEND_PAGE + 1);

    expect(taken.slice(0, -1).every((refusal) => refusal === null)).toBe(true);
    expect(taken.at(-1)).toBe(
      "The demo takes up to 10 Playground calls every 10 s from one page. Try again in a moment.",
    );
  });

  it("refuse an address its pages together take past its share", () => {
    const limits = createDemoLimits();
    takeMany(limits, { page: "a", address: "1.1.1.1" }, SEND_PAGE);
    takeMany(limits, { page: "b", address: "1.1.1.1" }, SEND_PAGE);

    expect(limits.take({ page: "c", address: "1.1.1.1" }, "send", AT)).toBe(
      "The demo takes up to 20 Playground calls every 10 s from one address. Try again in a moment.",
    );
    expect(limits.take({ page: "d", address: "2.2.2.2" }, "send", AT)).toBeNull();
  });

  it("refuse every visitor once all of them together reach the limit", () => {
    const limits = createDemoLimits();
    for (let n = 0; n < SEND_ALL / SEND_PAGE; n++) {
      takeMany(limits, { page: `p${n}`, address: `10.0.0.${n}` }, SEND_PAGE);
    }

    expect(limits.take({ page: "new", address: "3.3.3.3" }, "send", AT)).toBe(
      "The demo takes up to 60 Playground calls every 10 s from all its visitors. Try again in a moment.",
    );
  });

  it("do not count a call they refused toward the address's or everyone's count", () => {
    const limits = createDemoLimits();
    takeMany(limits, { page: "a", address: "1.1.1.1" }, SEND_PAGE + 5);

    const sameAddress = takeMany(limits, { page: "b", address: "1.1.1.1" }, SEND_PAGE);

    expect(sameAddress).toEqual(Array.from({ length: SEND_PAGE }, () => null));
  });

  it("start a page afresh once its window has passed", () => {
    const limits = createDemoLimits();
    const visitor = { page: "a", address: "1.1.1.1" };
    takeMany(limits, visitor, SEND_PAGE);

    expect(limits.take(visitor, "send", AT + DEMO_WINDOW_MS - 1)).not.toBeNull();
    expect(limits.take(visitor, "send", AT + DEMO_WINDOW_MS)).toBeNull();
  });

  it("count each kind of action apart", () => {
    const limits = createDemoLimits();
    const visitor = { page: "a", address: "1.1.1.1" };
    takeMany(limits, visitor, SEND_PAGE);

    expect(limits.take(visitor, "command", AT)).toBeNull();
    expect(limits.take(visitor, "lifecycle", AT)).toBeNull();
  });

  it("forget a page that left", () => {
    const limits = createDemoLimits();
    takeMany(limits, { page: "a", address: "1.1.1.1" }, SEND_PAGE);

    limits.forget("a");

    expect(limits.take({ page: "a", address: "1.1.1.1" }, "send", AT)).toBeNull();
  });

  it("count a request no page sent toward its address and everyone", () => {
    const limits = createDemoLimits();

    const taken = Array.from({ length: DEMO_LIMITS.rest.address + 1 }, () =>
      limits.take({ address: "1.1.1.1" }, "rest", AT),
    );

    expect(taken.filter((refusal) => refusal === null)).toHaveLength(DEMO_LIMITS.rest.address);
    expect(taken.at(-1)).toContain("from one address");
  });

  it("let go of an address once its window has passed, however many came", () => {
    const limits = createDemoLimits();
    for (let n = 0; n < 12_000; n++) limits.take({ address: `198.51.100.${n}` }, "http", AT);

    const later = AT + DEMO_WINDOW_MS;
    for (let n = 0; n < 12_000; n++) limits.take({ address: `203.0.113.${n}` }, "http", later);

    expect(limits.take({ address: "198.51.100.1" }, "http", later + DEMO_WINDOW_MS)).toBeNull();
  });
});

describe("a demo visitor's asks for whole bodies", () => {
  it("are counted, and refused past ten a page in a window", () => {
    const visitors = demoVisitors({ callsInFlight: () => 0 });
    const ask = { serverId: "shop", requestId: "r1", part: "response" };
    const visitor = { page: "page-1", address: "1.1.1.1" };

    const decisions = Array.from({ length: 11 }, (_, index) =>
      visitors.decide(visitor, index % 2 === 0 ? "mock:body" : "request:body", [ask]),
    );

    expect(decisions.slice(0, 10).every((d) => d.kind === "run")).toBe(true);
    expect(decisions[10]).toMatchObject({
      kind: "refuse",
      reason: expect.stringContaining("whole bodies"),
    });
  });
});

describe("a demo visitor's asks for a mock's records", () => {
  it("are counted, and refused past ten a page in a window", () => {
    const visitors = demoVisitors({ callsInFlight: () => 0 });
    const visitor = { page: "page-1", address: "1.1.1.1" };

    const decisions = Array.from({ length: 11 }, () =>
      visitors.decide(visitor, "mock:store:get", [{ serverId: "shop" }]),
    );

    expect(decisions.slice(0, 10).every((d) => d.kind === "run")).toBe(true);
    expect(decisions[10]).toMatchObject({
      kind: "refuse",
      reason:
        "The demo takes up to 10 requests for a mock's records every 10 s from one page. Try again in a moment.",
    });
  });
});
