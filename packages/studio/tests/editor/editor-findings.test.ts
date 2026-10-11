/**
 * The findings an editor places at the calls they concern: Studio's own
 * audit of the requests it recorded, kept to the findings that concern
 * endpoints — those they name, or those their requests called — each named
 * as a call in the code names it.
 */
import { describe, expect, it } from "vitest";

import { editorFindings } from "../../src/server/editor/editor-findings";

const read = (id: string, method: string, at: number, data: unknown) => [
  {
    type: "request:start",
    id,
    sessionId: "app",
    source: "shop",
    group: "products",
    method,
    httpMethod: "GET",
    endpointType: "query",
    mode: "proxy",
    variables: {},
    middlewareCount: 0,
    hasValidation: { variables: true, response: true },
    timestamp: at,
  },
  {
    type: "request:end",
    id: `${id}-end`,
    sessionId: "app",
    requestId: id,
    status: 200,
    data,
    timing: { total: 10, middleware: 0, fetch: 10, validation: 0 },
    size: 20,
    timestamp: at + 10,
  },
];

const call = (id: string, at: number, total: number) => [
  {
    type: "request:start",
    id,
    sessionId: "app",
    source: "shop",
    group: "orders",
    method: "place",
    httpMethod: "POST",
    endpointType: "mutation",
    mode: "proxy",
    variables: { sku: "A" },
    middlewareCount: 0,
    hasValidation: { variables: true, response: true },
    timestamp: at,
  },
  {
    type: "request:end",
    id: `${id}-end`,
    sessionId: "app",
    requestId: id,
    status: 201,
    data: { id: "o1" },
    timing: { total, middleware: 0, fetch: total, validation: 0 },
    size: 20,
    timestamp: at + total,
  },
];

const EVENTS = [...call("r1", 1, 6_200), ...call("r2", 2, 6_400), ...call("r3", 3, 6_100)];

describe("the audit's findings, for an editor", () => {
  const findings = editorFindings({
    requestLog: { events: () => EVENTS },
    declared: () => [],
    runtimes: () => [],
  });

  it("names each endpoint a finding concerns as a call names it, with what was seen at it", () => {
    const timeout = findings.find((finding) => finding.id === "err-timeout");

    expect(timeout).toMatchObject({
      severity: "error",
      category: "performance",
      title: "Timeout risk",
      endpoints: [{ source: "shop", endpoint: "orders.place", detail: "P95 = 6.4s" }],
    });
  });

  it("places a pattern its requests show at the endpoints they called: an N+1's list and detail", () => {
    const grid = [
      ...read("l1", "list", 100_000, [{ id: "p1" }, { id: "p2" }, { id: "p3" }]),
      ...read("d1", "get", 100_020, { id: "p1" }),
      ...read("d2", "get", 100_040, { id: "p2" }),
      ...read("d3", "get", 100_060, { id: "p3" }),
    ];
    const found = editorFindings({
      requestLog: { events: () => grid },
      declared: () => [],
      runtimes: () => [],
    });

    expect(found.find((finding) => finding.title === "N+1 request pattern")).toMatchObject({
      severity: "error",
      endpoints: [
        { source: "shop", endpoint: "products.list" },
        { source: "shop", endpoint: "products.get" },
      ],
    });
  });

  it("leaves out the checks that passed, and findings that concern no endpoint", () => {
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every((finding) => finding.severity !== ("pass" as string))).toBe(true);
    expect(findings.every((finding) => finding.endpoints.length > 0)).toBe(true);
  });
});
