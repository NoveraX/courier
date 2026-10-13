import { afterEach, describe, expect, it } from "vitest";

import { forwardedHeaders } from "../../src/session/forward-headers";
import type { IncomingRequest } from "../../src/session/incoming-request";

function incoming(
  headers: Record<string, string>,
  extra: Partial<IncomingRequest> = {},
): IncomingRequest {
  return { key: {}, method: "GET", headers: new Headers(headers), ...extra };
}

const PARENT = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
const OPEN_TELEMETRY = Symbol.for("opentelemetry.js.api.1");

afterEach(() => {
  Reflect.deleteProperty(globalThis, OPEN_TELEMETRY);
});

describe("forwardedHeaders", () => {
  it("carries the request's own well-formed id", () => {
    const headers = forwardedHeaders(incoming({ "x-request-id": "req-42" }), { requestId: true });

    expect(headers).toEqual([["x-request-id", "req-42"]]);
  });

  it("makes one id for a request that has none, and every call made for it shares it", () => {
    const request = incoming({});

    const first = forwardedHeaders(request, { requestId: true });
    const second = forwardedHeaders(request, { requestId: true });

    expect(first[0]?.[1]).toMatch(/^[\da-f-]{36}$/);
    expect(second).toEqual(first);
  });

  it.each([
    ["nginx's $request_id", "7c1e9a04b2d84f6e9a35c0d1e8f2b6a4"],
    ["a UUID", "3f0c2a4e-8b1d-4c7a-9e2f-6a1b5c3d7e90"],
    ["Kong's correlation id", "3f0c2a4e-8b1d-4c7a-9e2f-6a1b5c3d7e90#12"],
    [
      "an AWS trace id",
      "Root=1-5759e988-bd862e3fe1be46a994272793;Parent=53995c3f42cd8ad8;Sampled=1",
    ],
    ["a Google Cloud trace", "105445aa7843bc8bf206b12000100000/1;o=1"],
    ["a prefixed id", "req_01H8ZK7R2N8YB5W3Q6T9V4XJ2C"],
    ["one of 200 characters", "r".repeat(200)],
  ])("carries %s as the request sent it", (_name, id) => {
    const headers = forwardedHeaders(incoming({ "x-request-id": id }), { requestId: true });

    expect(headers).toEqual([["x-request-id", id]]);
  });

  it.each([
    ["one with a quote", 'req"1'],
    ["one with a backslash", "req\\1"],
    ["one past 200 characters", "r".repeat(201)],
  ])("replaces %s", (_name, id) => {
    const headers = forwardedHeaders(incoming({ "x-request-id": id }), { requestId: true });

    expect(headers[0]?.[1]).toMatch(/^[\da-f-]{36}$/);
  });

  it("replaces an id a log could not hold as one word", () => {
    const headers = forwardedHeaders(incoming({ "x-request-id": "id with spaces\tand tabs" }), {
      requestId: true,
    });

    expect(headers[0]?.[1]).toMatch(/^[\da-f-]{36}$/);
  });

  it("reads the id from the first header that carries one, and sends it under each", () => {
    const headers = forwardedHeaders(incoming({ "x-correlation-id": "c-7" }), {
      requestId: ["x-request-id", "X-Correlation-Id"],
    });

    expect(headers).toEqual([
      ["x-request-id", "c-7"],
      ["x-correlation-id", "c-7"],
    ]);
  });

  it("sends the chain in X-Forwarded-For, and the user's address alone in each header named", () => {
    const request = incoming({}, { clientAddress: "6.6.6.6, 198.51.100.23, 10.0.0.2" });

    expect(forwardedHeaders(request, { clientAddress: true })).toEqual([
      ["x-forwarded-for", "6.6.6.6, 198.51.100.23, 10.0.0.2"],
    ]);
    expect(forwardedHeaders(request, { clientAddress: ["X-Real-IP", "x-client-ip"] })).toEqual([
      ["x-forwarded-for", "6.6.6.6, 198.51.100.23, 10.0.0.2"],
      ["x-real-ip", "198.51.100.23"],
      ["x-client-ip", "198.51.100.23"],
    ]);
  });

  it("sends the address alone in X-Forwarded-For when it is named, and Forwarded as RFC 7239 writes it", () => {
    expect(
      forwardedHeaders(incoming({}, { clientAddress: "198.51.100.23, 10.0.0.2" }), {
        clientAddress: ["x-forwarded-for", "forwarded"],
      }),
    ).toEqual([
      ["x-forwarded-for", "198.51.100.23"],
      ["forwarded", "for=198.51.100.23"],
    ]);
    expect(
      forwardedHeaders(incoming({}, { clientAddress: "2001:db8::7" }), {
        clientAddress: "forwarded",
      }),
    ).toEqual([
      ["x-forwarded-for", "2001:db8::7"],
      ["forwarded", 'for="[2001:db8::7]"'],
    ]);
  });

  it("names no user where nothing recorded an address", () => {
    expect(forwardedHeaders(incoming({}), { clientAddress: ["x-real-ip"] })).toEqual([]);
  });

  it("reads and sends the id under a header the API names", () => {
    const headers = forwardedHeaders(incoming({ "x-correlation-id": "c-1" }), {
      requestId: "x-correlation-id",
    });

    expect(headers).toEqual([["x-correlation-id", "c-1"]]);
  });

  it("carries a valid trace context, and its state with it", () => {
    const headers = forwardedHeaders(incoming({ traceparent: PARENT, tracestate: "vendor=a1" }), {
      trace: true,
    });

    expect(headers).toEqual([
      ["traceparent", PARENT],
      ["tracestate", "vendor=a1"],
    ]);
  });

  it("drops a malformed trace context, and a state without one", () => {
    const zeros = "00-00000000000000000000000000000000-00f067aa0ba902b7-01";

    expect(
      forwardedHeaders(incoming({ traceparent: zeros, tracestate: "a=1" }), { trace: true }),
    ).toEqual([]);
    expect(forwardedHeaders(incoming({ tracestate: "a=1" }), { trace: true })).toEqual([]);
  });

  it("leaves the trace to a tracer that runs in the process", () => {
    Reflect.set(globalThis, OPEN_TELEMETRY, {});

    expect(forwardedHeaders(incoming({ traceparent: PARENT }), { trace: true })).toEqual([]);
  });

  it("carries the address the framework vouches for, never one the request claims", () => {
    const request = incoming({ "x-forwarded-for": "6.6.6.6" }, { clientAddress: "203.0.113.7" });

    expect(forwardedHeaders(request, { clientAddress: true })).toEqual([
      ["x-forwarded-for", "203.0.113.7"],
    ]);
    expect(
      forwardedHeaders(incoming({ "x-forwarded-for": "6.6.6.6" }), { clientAddress: true }),
    ).toEqual([]);
  });

  it("carries the browser, the languages and the headers named", () => {
    const request = incoming({
      "user-agent": "Mozilla/5.0",
      "accept-language": "en-GB,en;q=0.8",
      "x-tenant": "acme",
      "cf-ipcountry": "NL",
    });

    const headers = forwardedHeaders(request, {
      userAgent: true,
      locale: true,
      headers: ["X-Tenant"],
    });

    expect(headers).toEqual([
      ["user-agent", "Mozilla/5.0"],
      ["accept-language", "en-GB,en;q=0.8"],
      ["x-tenant", "acme"],
    ]);
  });

  it("carries nothing it was not asked to", () => {
    const request = incoming({ "x-request-id": "r", "user-agent": "UA", traceparent: PARENT });

    expect(forwardedHeaders(request, {})).toEqual([]);
  });
});
