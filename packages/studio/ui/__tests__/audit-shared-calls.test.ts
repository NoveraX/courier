/**
 * The audit and the reads another call's request answered: what the code
 * did counts every call — its middleware's and its validation's share of
 * a call's time — and what the API did counts the requests sent: their
 * latency, failures, statuses and sizes, the answers they got, the URLs,
 * bodies and cookies they carried, and the patterns they made on the wire.
 * Each case is one where counting the calls would read otherwise.
 */
import { describe, expect, it } from "vitest";

import { computeEndpointStats } from "@/features/audit/compute-stats";
import { noCachingDetected, validationOverhead } from "@/features/audit/hints-performance";
import { collectDeepPerformance } from "@/features/audit/rules-deep";
import { collectErrors } from "@/features/audit/rules-errors";
import { collectPasses } from "@/features/audit/rules-hints";
import { detectNPlusOne, detectWaterfall } from "@/features/audit/rules-patterns";
import { collectSecurityRules } from "@/features/audit/rules-security";
import { collectWarnings } from "@/features/audit/rules-warnings";
import type { AuditItem } from "@/features/audit/types";
import type { RequestEntry } from "@/store/types";
import { requestEntry } from "./request-entry-fixture";

const MB = 1_048_576;

function timing(total: number, middleware = 0, validation = 0): RequestEntry["timing"] {
  return { total, middleware, fetch: total - middleware - validation, validation };
}

/* A read another call's request answered: it holds that request's answer and sent none. */
function joined(id: string, owner: string, fields: Partial<RequestEntry> = {}): RequestEntry {
  return requestEntry({ id, shared: { by: "flight", with: owner }, ...fields });
}

function found(items: readonly AuditItem[], id: string): AuditItem | undefined {
  return items.find((item) => item.id === id);
}

describe("an endpoint's figures", () => {
  it("count every call, and take the API's latency, failures, statuses and sizes from its requests", () => {
    const failed = { status: "error", statusCode: 502, size: 900 } as const;
    const stats = computeEndpointStats([
      requestEntry({ id: "a", ...failed, timing: timing(400) }),
      joined("b", "a", { ...failed, timing: timing(350) }),
      joined("c", "a", { ...failed, timing: timing(300) }),
      requestEntry({ id: "d", size: 100, timing: timing(100) }),
    ]).get("api:users:list");

    expect(stats).toMatchObject({
      count: 4,
      sent: 2,
      requestIds: ["a", "b", "c", "d"],
      errorRate: 0.5,
      sizes: [900, 100],
      avgSize: 500,
      statusCodes: [502, 200],
      avgDuration: 250,
      p95: 400,
    });
  });

  it("weigh middleware and validation over every call, and the trips to the proxy over the requests", () => {
    const trips = (out: number, back: number, server: number) => ({
      clientToProxy: out,
      proxyToBackend: server,
      backendToProxy: 0,
      proxyToClient: back,
    });
    const stats = computeEndpointStats([
      requestEntry({
        id: "a",
        mode: "proxy",
        timing: timing(100, 10, 10),
        proxyTiming: trips(10, 10, 100),
      }),
      joined("b", "a", {
        mode: "proxy",
        timing: timing(20, 10, 6),
        proxyTiming: trips(30, 30, 20),
      }),
    ]).get("api:users:list");

    expect(stats?.middlewareOverhead).toBeCloseTo((10 / 100 + 10 / 20) / 2);
    expect(stats?.validationOverhead).toBeCloseTo((10 / 100 + 6 / 20) / 2);
    expect(stats?.proxyOverhead).toBeCloseTo(20 / 120);
  });
});

describe("the rules about the API", () => {
  it("find a high error rate where the requests fail, and say how many calls and requests there were", () => {
    const rare = [
      requestEntry({ id: "f", status: "error", statusCode: 502 }),
      ...[1, 2, 3, 4].map((i) => requestEntry({ id: `ok${i}` })),
      ...[1, 2, 3].map((i) => joined(`j${i}`, "f", { status: "error", statusCode: 502 })),
    ];
    const flaky = [
      requestEntry({ id: "a", status: "error", statusCode: 502 }),
      joined("b", "a", { status: "error", statusCode: 502 }),
      joined("c", "a", { status: "error", statusCode: 502 }),
      requestEntry({ id: "d" }),
    ];

    const high = (calls: RequestEntry[]) =>
      found(collectErrors(computeEndpointStats(calls), {}, []), "err-high-error-rate");

    expect(high(rare)).toBeUndefined();
    expect(high(flaky)?.endpoints?.[0]?.detail).toBe("50% errors (4 calls · 2 requests)");
  });

  it("weigh an endpoint's answers once each, however many reads one answered", () => {
    const large = [
      requestEntry({ id: "a", size: 1.5 * MB }),
      ...[1, 2, 3].map((i) => joined(`j${i}`, "a", { size: 1.5 * MB })),
      requestEntry({ id: "b", size: 0.2 * MB }),
      requestEntry({ id: "c", size: 0.2 * MB }),
    ];
    const varied = [
      requestEntry({ id: "a", size: 10 }),
      joined("b", "a", { size: 10 }),
      joined("c", "a", { size: 10 }),
      requestEntry({ id: "d", size: 10_000 }),
    ];

    expect(
      found(collectErrors(computeEndpointStats(large), {}, []), "err-oversize"),
    ).toBeUndefined();
    expect(
      found(collectWarnings(computeEndpointStats(varied), {}, []), "warn-inconsistent-size"),
    ).toBeUndefined();
  });

  it("take an endpoint's P95 from its requests: the reads that waited on a slow one are not slow requests", () => {
    const calls = [
      ...Array.from({ length: 20 }, (_, i) => requestEntry({ id: `f${i}`, timing: timing(100) })),
      requestEntry({ id: "slow", timing: timing(1_500) }),
      ...Array.from({ length: 5 }, (_, i) => joined(`j${i}`, "slow", { timing: timing(1_400) })),
    ];

    expect(
      found(collectWarnings(computeEndpointStats(calls), {}, []), "warn-slow"),
    ).toBeUndefined();
  });

  it("tell a read to cache only once three requests were answered, and an endpoint healthy only on three", () => {
    const checked = { hasValidation: { variables: true, response: true } };
    const twice = [
      requestEntry({ id: "a", ...checked }),
      joined("a1", "a", checked),
      joined("a2", "a", checked),
      requestEntry({ id: "b", ...checked }),
      joined("b1", "b", checked),
    ];
    const thrice = [...twice, requestEntry({ id: "c", ...checked })];

    expect(noCachingDetected(computeEndpointStats(twice))).toEqual([]);
    expect(collectPasses(computeEndpointStats(twice))).toEqual([]);
    expect(noCachingDetected(computeEndpointStats(thrice)).map((item) => item.id)).toEqual([
      "hint-no-caching",
    ]);
    expect(collectPasses(computeEndpointStats(thrice)).map((item) => item.id)).toEqual([
      "pass-healthy",
    ]);
  });

  it("count a validation failure once for the answer that caused it", () => {
    const failing = (id: string, fields: Partial<RequestEntry> = {}) =>
      requestEntry({
        id,
        status: "validation_error",
        error: {
          type: "validation",
          message: "Validation failed: 1 issue(s)",
          validationIssues: [{ path: "total", message: "Expected a number" }],
        },
        ...fields,
      });
    const once = [failing("a"), failing("b", { shared: { by: "flight", with: "a" } })];
    const repeated = (calls: RequestEntry[]) =>
      found(collectWarnings(computeEndpointStats(calls), {}, calls), "warn-repeated-validation");

    expect(repeated(once)).toBeUndefined();
    expect(repeated([...once, failing("c")])?.endpoints?.[0]).toMatchObject({
      detail: "2x",
      requestIds: ["a", "c"],
    });
  });

  it("name the answers, bodies, URLs and cookies the requests carried, and no read that only shared them", () => {
    const owner = requestEntry({
      id: "a",
      mode: "proxy",
      data: [],
      variables: { notes: "x".repeat(110_000) },
      url: "http://localhost:5173/api/users?token=fictional-token",
      headers: { server: "nginx/1.25.3" },
      requestHeaders: { cookie: "sid=fictional" },
    });
    const { id: _, ...copy } = owner;
    const calls = [owner, joined("b", "a", copy), joined("c", "a", copy)];
    const stats = computeEndpointStats(calls);
    const deep = collectDeepPerformance(calls);
    const security = collectSecurityRules(calls, {});

    expect(found(deep, "deep-empty-response")?.endpoints?.[0]?.detail).toBe("1x empty");
    expect(found(deep, "deep-large-request")?.endpoints?.map((e) => e.key)).toEqual(["a"]);
    expect(found(collectErrors(stats, {}, calls), "err-sensitive-url")?.requestIds).toEqual(["a"]);
    expect(found(security, "sec-server-leak")?.requestIds).toEqual(["a"]);
    expect(found(security, "sec-cookie-forwarding")?.requestIds).toEqual(["a"]);
  });
});

describe("the rules about the code", () => {
  it("weigh middleware's share of the time of every call, a read another call's request answered among them", () => {
    const calls = [
      requestEntry({ id: "a", timing: timing(100, 10) }),
      joined("b", "a", { timing: timing(30, 25) }),
    ];

    const item = found(
      collectWarnings(computeEndpointStats(calls), {}, []),
      "warn-middleware-overhead",
    );

    expect(item?.endpoints?.[0]?.detail).toBe("47% overhead");
    expect(item?.description).toBe("Middleware takes more than 30% of these calls' time.");
  });

  it("weigh validation's share of the time of every call", () => {
    const calls = [
      requestEntry({ id: "a", timing: timing(100, 0, 10) }),
      joined("b", "a", { timing: timing(30, 0, 15) }),
    ];

    const [item] = validationOverhead(computeEndpointStats(calls));

    expect(item?.endpoints?.[0]?.detail).toBe("30% of call time");
  });
});

describe("the patterns on the wire", () => {
  const list = requestEntry({
    id: "list",
    startedAt: 1_000,
    data: [{ id: 1 }, { id: 2 }],
    timing: timing(20),
  });
  const detail = (id: string, startedAt: number, fields: Partial<RequestEntry> = {}) =>
    requestEntry({ id, method: "byId", startedAt, timing: timing(20), ...fields });

  it("find N+1 in the requests sent, and name them requests", () => {
    const [item] = detectNPlusOne([list, detail("d1", 1_030), detail("d2", 1_060)]);
    const sharing = detectNPlusOne([
      list,
      detail("d1", 1_030),
      detail("d2", 1_035, { shared: { by: "flight", with: "d1" } }),
    ]);

    expect(item?.description).toBe(
      'A list request to "api.users.list" was followed by 2 detail requests to "api.users.byId", one after another.',
    );
    expect(sharing).toEqual([]);
  });

  it("find no chain in series through a read another call's request answered", () => {
    const step = (id: string, method: string, startedAt: number) =>
      requestEntry({ id, method, startedAt, timing: timing(1_000) });
    const first = step("a", "first", 0);
    const second = step("b", "second", 1_010);
    const third = step("c", "third", 2_015);

    expect(detectWaterfall([first, second, third]).map((item) => item.requestIds)).toEqual([
      ["a", "b", "c"],
    ]);
    expect(
      detectWaterfall([first, { ...second, shared: { by: "flight", with: "x" } }, third]),
    ).toEqual([]);
  });
});
